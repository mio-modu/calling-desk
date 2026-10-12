import { query, queryOne } from '../db'
import type { EvidenceType } from '../domain'
import { mapEvidence } from './mappers'
import type { Evidence } from './types'
import type { CareerSpan } from '../readiness'

export type EvidenceFilter = {
  type?: EvidenceType
  tag?: string
  from?: string
  to?: string
  q?: string
}

export async function listEvidence(f: EvidenceFilter = {}): Promise<Evidence[]> {
  const where: string[] = []
  const p: unknown[] = []
  if (f.type) { p.push(f.type); where.push(`type = $${p.length}`) }
  if (f.tag) { p.push(f.tag); where.push(`$${p.length} = any(tags)`) }
  // 기간이 겹치는 조각만. 기간이 없는 조각은 범위 필터에서 제외된다.
  if (f.from) { p.push(f.from); where.push(`(period_to is null or period_to >= $${p.length})`) }
  if (f.to) { p.push(f.to); where.push(`(period_from is null or period_from <= $${p.length})`) }
  if (f.q) { p.push(`%${f.q}%`); where.push(`(title ilike $${p.length} or body ilike $${p.length})`) }

  const rows = await query(
    `select * from evidence
     ${where.length ? 'where ' + where.join(' and ') : ''}
     order by coalesce(period_from, '1900-01-01') desc, created_at desc`,
    p,
  )
  return rows.map(mapEvidence)
}

export async function getEvidence(id: string): Promise<Evidence | null> {
  const r = await queryOne('select * from evidence where id = $1', [id])
  return r ? mapEvidence(r) : null
}

export type EvidenceInput = {
  type: EvidenceType
  title: string
  body: string
  periodFrom: string | null
  periodTo: string | null
  tags: string[]
  strength: number
  verified: boolean
  source?: string
  sourceRef?: string | null
  sourceQuote?: string | null
}

export async function createEvidence(i: EvidenceInput): Promise<Evidence> {
  const r = await queryOne(
    `insert into evidence
       (type, title, body, period_from, period_to, tags, strength, verified, source, source_ref, source_quote)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     returning *`,
    [i.type, i.title, i.body, i.periodFrom, i.periodTo, i.tags, i.strength, i.verified,
     i.source ?? 'manual', i.sourceRef ?? null, i.sourceQuote ?? null],
  )
  return mapEvidence(r)
}

export async function updateEvidence(id: string, i: EvidenceInput): Promise<void> {
  await query(
    `update evidence set
       type=$2, title=$3, body=$4, period_from=$5, period_to=$6,
       tags=$7, strength=$8, verified=$9
     where id=$1`,
    [id, i.type, i.title, i.body, i.periodFrom, i.periodTo, i.tags, i.strength, i.verified],
  )
}

export async function deleteEvidence(id: string): Promise<void> {
  await query('delete from evidence where id = $1', [id])
}

/** 연표 공백 탐지용. career 조각의 기간만 필요하다. */
export async function careerTimeline(): Promise<CareerSpan[]> {
  const rows = await query(
    `select title, period_from, period_to from evidence
     where type = 'career' order by period_from nulls last`,
  )
  return rows.map((r: Record<string, unknown>) => ({
    title: String(r.title),
    from: r.period_from ? new Date(r.period_from as string).toISOString().slice(0, 10) : null,
    to: r.period_to ? new Date(r.period_to as string).toISOString().slice(0, 10) : null,
  }))
}

export async function countsByType(): Promise<Record<string, number>> {
  const rows = await query('select type, count(*)::int as n from evidence group by type')
  return Object.fromEntries(rows.map((r: Record<string, unknown>) => [r.type, r.n as number]))
}

export async function allTags(): Promise<string[]> {
  const rows = await query(
    'select distinct unnest(tags) as tag from evidence order by tag',
  )
  return rows.map((r: Record<string, unknown>) => String(r.tag))
}
