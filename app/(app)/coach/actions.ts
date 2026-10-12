'use server'

import { revalidatePath } from 'next/cache'
import { EVIDENCE_TYPES, type EvidenceType } from '@/lib/domain'
import { createEvidence } from '@/lib/repo/evidence'
import { dismissQuestion, getQuestion, markAnswered, syncQuestions } from '@/lib/repo/coach'
import { refreshAllReadiness } from '@/lib/repo/docs'

function assertType(v: unknown): EvidenceType {
  if (typeof v === 'string' && (EVIDENCE_TYPES as readonly string[]).includes(v)) {
    return v as EvidenceType
  }
  throw new Error('알 수 없는 조각 타입입니다.')
}

/**
 * 답변을 조각으로 저장한다. 타입은 규칙 엔진이 제안하지만 **사용자가 확정**한다.
 * verified 는 본인이 직접 쓴 내용이므로 체크박스로 받는다.
 */
export async function answerQuestion(formData: FormData): Promise<void> {
  const questionId = String(formData.get('questionId') ?? '')
  const q = await getQuestion(questionId)
  if (!q) throw new Error('질문을 찾을 수 없습니다.')

  const body = String(formData.get('body') ?? '').trim()
  if (!body) throw new Error('답변을 적어주세요.')

  const title = String(formData.get('title') ?? '').trim()
    || q.question.slice(0, 60)

  const ev = await createEvidence({
    type: assertType(formData.get('type')),
    title,
    body,
    periodFrom: String(formData.get('periodFrom') ?? '').trim() || null,
    periodTo: String(formData.get('periodTo') ?? '').trim() || null,
    tags: String(formData.get('tags') ?? '')
      .split(/[,\n]/).map((t) => t.trim()).filter(Boolean).slice(0, 20),
    strength: Math.min(5, Math.max(1, Number(formData.get('strength') ?? 3) || 3)),
    verified: formData.get('verified') === 'on',
    source: 'manual',
  })

  await markAnswered(questionId, ev.id)
  await refreshAllReadiness()
  await syncQuestions()

  revalidatePath('/coach')
  revalidatePath('/evidence')
  revalidatePath('/')
}

export async function dismiss(formData: FormData): Promise<void> {
  await dismissQuestion(String(formData.get('questionId') ?? ''))
  revalidatePath('/coach')
  revalidatePath('/')
}
