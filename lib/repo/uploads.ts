import { query, queryOne, tx } from '../db'
import type { EvidenceType } from '../domain'
import { mapCandidate, mapEvidence, mapUpload } from './mappers'
import type { EvidenceCandidate, Evidence, UploadedDoc } from './types'
import type { ExtractedCandidate } from '../llm'

/**
 * LLM 이 돌려준 "2019" / "2019-03" / "" 같은 부분 날짜를 date 로 정규화한다.
 * **비어 있으면 null 이다. 추측해 채우지 않는다.**
 * 연도만 있으면 그 해의 시작/끝으로, 연·월만 있으면 그 달의 시작/끝으로 본다.
 */
export function parsePartialDate(s: string | null | undefined, edge: 'from' | 'to'): string | null {
  const v = (s ?? '').trim()
  if (!v) return null

  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  if (m) return v

  m = /^(\d{4})[-./](\d{1,2})$/.exec(v)
  if (m) {
    const y = Number(m[1]); const mo = Number(m[2])
    if (mo < 1 || mo > 12) return null
    return edge === 'from'
      ? `${y}-${String(mo).padStart(2, '0')}-01`
      : new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10)
  }

  m = /^(\d{4})$/.exec(v)
  if (m) return edge === 'from' ? `${m[1]}-01-01` : `${m[1]}-12-31`

  return null
}

export async function createUpload(i: {
  filename: string
  mime: string | null
  byteSize: number
  storagePath: string | null
  extractedText: string
  extractStatus: 'extracted' | 'failed'
  extractError: string | null
}): Promise<UploadedDoc> {
  const r = await queryOne(
    `insert into uploaded_doc
       (filename, mime, byte_size, storage_path, extracted_text, extract_status, extract_error)
     values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [i.filename, i.mime, i.byteSize, i.storagePath, i.extractedText, i.extractStatus, i.extractError],
  )
  return mapUpload(r)
}

export async function listUploads(): Promise<UploadedDoc[]> {
  const rows = await query('select * from uploaded_doc order by created_at desc')
  return rows.map(mapUpload)
}

export async function getUpload(id: string): Promise<UploadedDoc | null> {
  const r = await queryOne('select * from uploaded_doc where id = $1', [id])
  return r ? mapUpload(r) : null
}

export async function deleteUpload(id: string): Promise<void> {
  await query('delete from uploaded_doc where id = $1', [id])
}

/** 추출 결과를 **후보로만** 저장한다. evidence 에 직접 쓰는 경로는 없다. */
export async function saveCandidates(uploadId: string, cands: ExtractedCandidate[]): Promise<number> {
  let n = 0
  await tx(async (c) => {
    for (const cand of cands) {
      if (!cand.title?.trim()) continue
      await c.query(
        `insert into evidence_candidate
           (uploaded_doc_id, type, title, body, period_from, period_to, tags, source_quote)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [uploadId, cand.type, cand.title.trim(), cand.body ?? '',
         parsePartialDate(cand.period_from, 'from'), parsePartialDate(cand.period_to, 'to'),
         cand.tags ?? [], cand.source_quote ?? ''],
      )
      n++
    }
    await c.query(`update uploaded_doc set analysis_status='analyzed', analysis_error=null where id=$1`, [uploadId])
  })
  return n
}

export async function markAnalysisFailed(uploadId: string, error: string): Promise<void> {
  await query(
    `update uploaded_doc set analysis_status='failed', analysis_error=$2 where id=$1`,
    [uploadId, error],
  )
}

export async function listCandidates(
  uploadId: string,
  status?: 'pending' | 'accepted' | 'rejected',
): Promise<EvidenceCandidate[]> {
  const rows = status
    ? await query(
        'select * from evidence_candidate where uploaded_doc_id=$1 and status=$2 order by created_at',
        [uploadId, status])
    : await query(
        'select * from evidence_candidate where uploaded_doc_id=$1 order by created_at', [uploadId])
  return rows.map(mapCandidate)
}

export async function pendingCandidateCount(): Promise<number> {
  const r = await queryOne(`select count(*)::int as n from evidence_candidate where status='pending'`)
  return (r?.n as number) ?? 0
}

export type CandidateApproval = {
  id: string
  type: EvidenceType
  title: string
  body: string
  periodFrom: string | null
  periodTo: string | null
  tags: string[]
  strength: number
}

/**
 * 사람이 체크한 후보만 evidence 로 승격한다.
 * **verified 는 항상 false 로 들어간다** — LLM 이 옮긴 수치·날짜는 본인이
 * 원문과 대조해 확인한 뒤에야 verified 가 된다 (/evidence 에서 직접 전환).
 */
export async function acceptCandidates(
  uploadId: string,
  approvals: CandidateApproval[],
): Promise<Evidence[]> {
  if (!approvals.length) return []
  return tx(async (c) => {
    const out: Evidence[] = []
    for (const a of approvals) {
      const ins = await c.query(
        `insert into evidence
           (type, title, body, period_from, period_to, tags, strength, verified, source, source_ref, source_quote)
         select $1,$2,$3,$4,$5,$6,$7,false,'imported_doc',$8,cand.source_quote
         from evidence_candidate cand
         where cand.id = $9 and cand.uploaded_doc_id = $10 and cand.status = 'pending'
         returning *`,
        // source_ref(text) 와 uploaded_doc_id(uuid) 에 같은 값을 쓰지만 타입이 달라
        // 파라미터를 분리해야 한다. 하나로 묶으면 Postgres 가 타입을 추론하지 못한다.
        [a.type, a.title, a.body, a.periodFrom, a.periodTo, a.tags, a.strength,
         uploadId, a.id, uploadId],
      )
      if (!ins.rows[0]) continue
      const ev = mapEvidence(ins.rows[0])
      await c.query(
        `update evidence_candidate set status='accepted', promoted_evidence_id=$2 where id=$1`,
        [a.id, ev.id],
      )
      out.push(ev)
    }
    return out
  })
}

export async function rejectCandidates(uploadId: string, ids: string[]): Promise<void> {
  if (!ids.length) return
  await query(
    `update evidence_candidate set status='rejected'
     where uploaded_doc_id=$1 and id = any($2) and status='pending'`,
    [uploadId, ids],
  )
}
