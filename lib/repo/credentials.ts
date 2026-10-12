import { query, queryOne } from '../db'
import { COMPLETION, type CredentialStatus } from '../domain'
import { daysUntil, kstTodayISO } from '../date'
import { mapCredential } from './mappers'
import type { Credential } from './types'

export async function listCredentials(): Promise<Credential[]> {
  const rows = await query('select * from credential order by seq')
  return rows.map(mapCredential)
}

export async function getCredential(id: string): Promise<Credential | null> {
  const r = await queryOne('select * from credential where id = $1', [id])
  return r ? mapCredential(r) : null
}

export type CredentialPatch = {
  status: CredentialStatus
  requestedAt: string | null
  receivedAt: string | null
  validUntil: string | null
  note: string
  filePath?: string | null
}

export async function updateCredential(id: string, p: CredentialPatch): Promise<void> {
  if (p.filePath === undefined) {
    await query(
      `update credential set status=$2, requested_at=$3, received_at=$4, valid_until=$5, note=$6
       where id=$1`,
      [id, p.status, p.requestedAt, p.receivedAt, p.validUntil, p.note],
    )
  } else {
    await query(
      `update credential set status=$2, requested_at=$3, received_at=$4, valid_until=$5, note=$6, file_path=$7
       where id=$1`,
      [id, p.status, p.requestedAt, p.receivedAt, p.validUntil, p.note, p.filePath],
    )
  }
}

/** 보유중이지만 유효기한이 임박·만료된 것 */
export function expiringCredentials(all: Credential[], today = kstTodayISO()): Credential[] {
  return all
    .filter((c) => c.status === 'received' && c.validUntil)
    .filter((c) => daysUntil(c.validUntil!, today) <= COMPLETION.credentialWarnDays)
    .sort((a, b) => (a.validUntil! < b.validUntil! ? -1 : 1))
}

/** 증빙이 "완료"인가 — 보유중이고, 유효기한이 있다면 아직 지나지 않았는가 */
export function isCredentialComplete(c: Credential, today = kstTodayISO()): boolean {
  if (c.status !== 'received') return false
  if (!c.validUntil) return true
  return daysUntil(c.validUntil, today) >= 0
}
