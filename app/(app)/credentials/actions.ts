'use server'

import { revalidatePath } from 'next/cache'
import { CREDENTIAL_STATUSES, type CredentialStatus } from '@/lib/domain'
import { updateCredential } from '@/lib/repo/credentials'
import { syncQuestions } from '@/lib/repo/coach'

export async function saveCredential(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '')
  if (!id) throw new Error('증빙을 찾을 수 없습니다.')

  const statusRaw = String(formData.get('status') ?? 'not_started')
  const status = (CREDENTIAL_STATUSES as readonly string[]).includes(statusRaw)
    ? (statusRaw as CredentialStatus) : 'not_started'

  const d = (k: string) => String(formData.get(k) ?? '').trim() || null

  await updateCredential(id, {
    status,
    requestedAt: d('requestedAt'),
    receivedAt: d('receivedAt'),
    validUntil: d('validUntil'),
    note: String(formData.get('note') ?? '').trim(),
  })

  // 유효기한이 바뀌면 코칭 질문(규칙 5)도 바뀐다.
  await syncQuestions()
  revalidatePath('/credentials')
  revalidatePath('/')
}
