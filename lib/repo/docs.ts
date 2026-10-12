import { query, queryOne, tx } from '../db'
import { DOC_TYPES, type DocType } from '../domain'
import { computeReadiness, type ReadinessItem, type ReadinessLink } from '../readiness'
import { mapDoc, mapLink } from './mappers'
import type { DocLink, MasterDoc } from './types'
import { careerTimeline } from './evidence'

export async function getActiveDoc(docType: DocType): Promise<MasterDoc | null> {
  const r = await queryOne(
    'select * from master_doc where doc_type = $1 and is_active',
    [docType],
  )
  return r ? mapDoc(r) : null
}

export async function listActiveDocs(): Promise<Partial<Record<DocType, MasterDoc>>> {
  const rows = await query('select * from master_doc where is_active')
  const out: Partial<Record<DocType, MasterDoc>> = {}
  for (const r of rows) {
    const d = mapDoc(r)
    out[d.docType] = d
  }
  return out
}

export async function getDocById(id: string): Promise<MasterDoc | null> {
  const r = await queryOne('select * from master_doc where id = $1', [id])
  return r ? mapDoc(r) : null
}

export async function listVersions(docType: DocType): Promise<MasterDoc[]> {
  const rows = await query(
    'select * from master_doc where doc_type = $1 order by version desc',
    [docType],
  )
  return rows.map(mapDoc)
}

export type VersionInput = {
  title: string
  contentMd: string
  note: string
  validUntil: string | null
}

/**
 * 저장은 항상 새 버전을 만든다. 이전 버전은 보존하고 비활성화한다.
 * 연결된 자산 조각은 새 버전으로 이어진다 — 버전을 올릴 때마다 다시
 * 연결하게 만들면 아무도 쓰지 않을 기능이 된다.
 */
export async function createVersion(docType: DocType, i: VersionInput): Promise<MasterDoc> {
  return tx(async (c) => {
    const prev = await c.query(
      'select id, version from master_doc where doc_type = $1 order by version desc limit 1',
      [docType],
    )
    const prevId: string | null = prev.rows[0]?.id ?? null
    const nextVersion = (prev.rows[0]?.version ?? 0) + 1

    await c.query('update master_doc set is_active = false where doc_type = $1 and is_active', [docType])

    const ins = await c.query(
      `insert into master_doc (doc_type, version, title, content_md, is_active, note, valid_until)
       values ($1,$2,$3,$4,true,$5,$6) returning *`,
      [docType, nextVersion, i.title, i.contentMd, i.note, i.validUntil],
    )
    const created = mapDoc(ins.rows[0])

    if (prevId) {
      await c.query(
        `insert into evidence_link (evidence_id, master_doc_id, section)
         select evidence_id, $2, section from evidence_link where master_doc_id = $1
         on conflict do nothing`,
        [prevId, created.id],
      )
    }
    return created
  })
}

export async function listLinks(docId: string): Promise<DocLink[]> {
  const rows = await query(
    `select l.id, l.evidence_id, l.section, e.*
     from evidence_link l join evidence e on e.id = l.evidence_id
     where l.master_doc_id = $1
     order by l.section, e.title`,
    [docId],
  )
  return rows.map(mapLink)
}

export async function linkEvidence(docId: string, evidenceId: string, section: string): Promise<void> {
  await query(
    `insert into evidence_link (evidence_id, master_doc_id, section)
     values ($1,$2,$3) on conflict do nothing`,
    [evidenceId, docId, section],
  )
}

export async function unlinkEvidence(linkId: string): Promise<void> {
  await query('delete from evidence_link where id = $1', [linkId])
}

/** 완성도를 다시 계산해 저장하고 결과를 돌려준다. */
export async function refreshReadiness(doc: MasterDoc): Promise<{ score: number; detail: ReadinessItem[] }> {
  const [links, timeline] = await Promise.all([listLinks(doc.id), careerTimeline()])
  const linked: ReadinessLink[] = links.map((l) => ({
    evidenceId: l.evidenceId,
    type: l.evidence.type,
    title: l.evidence.title,
    section: l.section,
  }))
  const r = computeReadiness({
    docType: doc.docType,
    contentMd: doc.contentMd,
    updatedAt: doc.createdAt,
    validUntil: doc.validUntil,
    linked,
    careerTimeline: timeline,
  })
  await query(
    'update master_doc set readiness_score = $2, readiness_detail = $3 where id = $1',
    [doc.id, r.score, JSON.stringify(r.detail)],
  )
  return { score: r.score, detail: r.detail }
}

/** 모든 활성 서류의 완성도를 다시 계산한다 (자산이 바뀌면 점수도 바뀐다). */
export async function refreshAllReadiness(): Promise<void> {
  const active = await listActiveDocs()
  for (const docType of DOC_TYPES) {
    const d = active[docType]
    if (d) await refreshReadiness(d)
  }
}
