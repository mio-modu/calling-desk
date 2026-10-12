'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { EVIDENCE_TYPES, type EvidenceType } from '@/lib/domain'
import { clampForLlm, extractText, isSupported } from '@/lib/extract'
import { extractCandidates, LlmUnavailableError } from '@/lib/llm'
import { putFile } from '@/lib/storage'
import {
  createEvidence, deleteEvidence, updateEvidence, type EvidenceInput,
} from '@/lib/repo/evidence'
import {
  acceptCandidates, createUpload, deleteUpload, markAnalysisFailed,
  rejectCandidates, saveCandidates, type CandidateApproval,
} from '@/lib/repo/uploads'
import { syncQuestions } from '@/lib/repo/coach'
import { refreshAllReadiness } from '@/lib/repo/docs'

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

function assertType(v: unknown): EvidenceType {
  if (typeof v === 'string' && (EVIDENCE_TYPES as readonly string[]).includes(v)) {
    return v as EvidenceType
  }
  throw new Error('알 수 없는 조각 타입입니다.')
}

function parseTags(v: unknown): string[] {
  return String(v ?? '')
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 20)
}

function nullableDate(v: unknown): string | null {
  const s = String(v ?? '').trim()
  return s || null
}

function readEvidenceForm(formData: FormData): EvidenceInput {
  const title = String(formData.get('title') ?? '').trim()
  if (!title) throw new Error('제목을 적어주세요.')
  const strength = Number(formData.get('strength') ?? 3)
  return {
    type: assertType(formData.get('type')),
    title,
    body: String(formData.get('body') ?? '').trim(),
    periodFrom: nullableDate(formData.get('periodFrom')),
    periodTo: nullableDate(formData.get('periodTo')),
    tags: parseTags(formData.get('tags')),
    strength: Number.isFinite(strength) ? Math.min(5, Math.max(1, strength)) : 3,
    verified: formData.get('verified') === 'on',
  }
}

/** 자산이 바뀌면 서류 점수와 코칭 질문이 같이 움직여야 한다. */
async function afterEvidenceChange(): Promise<void> {
  await refreshAllReadiness()
  await syncQuestions()
  revalidatePath('/evidence')
  revalidatePath('/coach')
  revalidatePath('/docs')
  revalidatePath('/')
}

export async function addEvidence(formData: FormData): Promise<void> {
  await createEvidence(readEvidenceForm(formData))
  await afterEvidenceChange()
}

export async function editEvidence(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '')
  if (!id) throw new Error('조각을 찾을 수 없습니다.')
  await updateEvidence(id, readEvidenceForm(formData))
  await afterEvidenceChange()
}

export async function removeEvidence(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '')
  await deleteEvidence(id)
  await afterEvidenceChange()
}

/**
 * 과거 서류 업로드 → 텍스트 추출 → 조각 **후보** 생성.
 * 후보는 evidence_candidate 에만 들어간다. 저장은 사람이 승인해야 한다.
 */
export async function uploadDocument(formData: FormData): Promise<void> {
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) throw new Error('파일을 선택하세요.')
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('10MB 이하의 파일만 올려주세요.')
  if (!isSupported(file.name)) {
    throw new Error('.md / .txt / .docx / .pdf 만 지원합니다.')
  }

  const buf = Buffer.from(await file.arrayBuffer())
  const storagePath = await putFile(
    `imports/${Date.now()}-${file.name}`,
    buf,
    file.type || 'application/octet-stream',
  ).catch(() => null)

  const extracted = await extractText(file.name, buf)

  const upload = await createUpload({
    filename: file.name,
    mime: file.type || null,
    byteSize: file.size,
    storagePath,
    extractedText: extracted.ok ? extracted.text : '',
    extractStatus: extracted.ok ? 'extracted' : 'failed',
    extractError: extracted.ok ? null : extracted.error,
  })

  if (!extracted.ok) {
    revalidatePath('/evidence')
    redirect(`/evidence/uploads/${upload.id}`)
  }

  const { text, truncated } = clampForLlm(extracted.text)
  try {
    const candidates = await extractCandidates(text)
    await saveCandidates(upload.id, candidates)
    if (truncated) {
      await markAnalysisFailed(
        upload.id,
        '문서가 길어 앞부분만 분석했습니다. 뒷부분은 나눠서 다시 올려주세요.',
      )
    }
  } catch (err) {
    await markAnalysisFailed(
      upload.id,
      err instanceof LlmUnavailableError
        ? err.message
        : `분해 실패: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  revalidatePath('/evidence')
  redirect(`/evidence/uploads/${upload.id}`)
}

/** 체크된 후보만 승격한다. verified 는 승격 시 항상 false 로 들어간다. */
export async function approveCandidates(formData: FormData): Promise<void> {
  const uploadId = String(formData.get('uploadId') ?? '')
  const chosen = formData.getAll('chosen').map(String)

  const approvals: CandidateApproval[] = chosen.map((id) => {
    const strength = Number(formData.get(`strength:${id}`) ?? 3)
    return {
      id,
      type: assertType(formData.get(`type:${id}`)),
      title: String(formData.get(`title:${id}`) ?? '').trim(),
      body: String(formData.get(`body:${id}`) ?? '').trim(),
      periodFrom: nullableDate(formData.get(`periodFrom:${id}`)),
      periodTo: nullableDate(formData.get(`periodTo:${id}`)),
      tags: parseTags(formData.get(`tags:${id}`)),
      strength: Number.isFinite(strength) ? Math.min(5, Math.max(1, strength)) : 3,
    }
  }).filter((a) => a.title)

  const rejected = formData.getAll('allIds').map(String).filter((id) => !chosen.includes(id))

  await acceptCandidates(uploadId, approvals)
  await rejectCandidates(uploadId, rejected)
  await afterEvidenceChange()
  revalidatePath(`/evidence/uploads/${uploadId}`)
}

export async function removeUpload(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '')
  await deleteUpload(id)
  revalidatePath('/evidence')
  redirect('/evidence')
}
