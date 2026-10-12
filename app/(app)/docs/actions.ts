'use server'

import { revalidatePath } from 'next/cache'
import { DOC_TYPES, DOC_TYPE_META, type DocType } from '@/lib/domain'
import { addDays } from '@/lib/date'
import { buildOutline } from '@/lib/outline'
import { polish as llmPolish, LlmUnavailableError } from '@/lib/llm'
import {
  createVersion, getActiveDoc, linkEvidence, refreshReadiness, unlinkEvidence,
} from '@/lib/repo/docs'
import { syncQuestions } from '@/lib/repo/coach'

function assertDocType(v: unknown): DocType {
  if (typeof v === 'string' && (DOC_TYPES as readonly string[]).includes(v)) return v as DocType
  throw new Error('알 수 없는 서류 종류입니다.')
}

export async function saveVersion(formData: FormData): Promise<void> {
  const docType = assertDocType(formData.get('docType'))
  const meta = DOC_TYPE_META[docType]

  const contentMd = String(formData.get('contentMd') ?? '')
  const title = String(formData.get('title') ?? '').trim() || meta.label
  const note = String(formData.get('note') ?? '').trim()
  if (!note) throw new Error('변경 이유를 적어주세요. 나중에 버전별 성과를 비교할 때 이게 라벨이 됩니다.')

  // 영상 서류는 촬영일로부터 신선도 기한을 역산해 저장한다.
  let validUntil: string | null = null
  if (meta.kind === 'media') {
    const shot = String(formData.get('shotOn') ?? '').trim()
    if (shot) validUntil = addDays(shot, meta.freshnessDays ?? 180)
  }

  const created = await createVersion(docType, { title, contentMd, note, validUntil })
  await refreshReadiness(created)
  await syncQuestions()

  revalidatePath(`/docs/${docType}`)
  revalidatePath('/docs')
  revalidatePath('/')
}

/** 빈 서류에 목차만 세운다. 내용은 비운다 (lib/outline.ts — LLM 미사용). */
export async function createOutline(formData: FormData): Promise<void> {
  const docType = assertDocType(formData.get('docType'))
  const existing = await getActiveDoc(docType)
  if (existing && existing.contentMd.trim()) {
    throw new Error('이미 내용이 있습니다. 뼈대는 빈 서류에만 세울 수 있습니다.')
  }

  const created = await createVersion(docType, {
    title: DOC_TYPE_META[docType].label,
    contentMd: buildOutline(docType),
    note: '뼈대 생성 (목차만, 내용 없음)',
    validUntil: existing?.validUntil ?? null,
  })
  await refreshReadiness(created)

  revalidatePath(`/docs/${docType}`)
  revalidatePath('/docs')
  revalidatePath('/')
}

export async function addLink(formData: FormData): Promise<void> {
  const docId = String(formData.get('docId') ?? '')
  const evidenceId = String(formData.get('evidenceId') ?? '')
  const section = String(formData.get('section') ?? '')
  const docType = assertDocType(formData.get('docType'))
  if (!docId || !evidenceId) throw new Error('연결할 조각을 선택하세요.')

  await linkEvidence(docId, evidenceId, section)
  const doc = await getActiveDoc(docType)
  if (doc) await refreshReadiness(doc)

  revalidatePath(`/docs/${docType}`)
  revalidatePath('/')
}

export async function removeLink(formData: FormData): Promise<void> {
  const linkId = String(formData.get('linkId') ?? '')
  const docType = assertDocType(formData.get('docType'))
  await unlinkEvidence(linkId)
  const doc = await getActiveDoc(docType)
  if (doc) await refreshReadiness(doc)

  revalidatePath(`/docs/${docType}`)
  revalidatePath('/')
}

export type PolishState = {
  original: string
  result?: string
  safe?: boolean
  warning?: string
  error?: string
}

/**
 * 문장 다듬기. 기획서 2장이 허용한 두 예외 중 하나다.
 * **결과를 본문에 자동 반영하지 않는다.** 비교해 보고 직접 옮겨 쓰게 한다.
 */
export async function polishText(_prev: PolishState, formData: FormData): Promise<PolishState> {
  const original = String(formData.get('original') ?? '').trim()
  if (!original) return { original: '', error: '다듬을 문장을 넣어주세요.' }
  if (original.length > 4000) {
    return { original, error: '한 번에 4,000자까지만 다듬습니다. 문단 단위로 나눠주세요.' }
  }

  try {
    const r = await llmPolish(original)
    return { original, result: r.text, safe: r.safe, warning: r.warning }
  } catch (err) {
    if (err instanceof LlmUnavailableError) return { original, error: err.message }
    return { original, error: err instanceof Error ? err.message : String(err) }
  }
}
