import { query, queryOne } from '../db'
import { COACH } from '../domain'
import { addDays, kstTodayISO } from '../date'
import { generateQuestions, type CoachInput, type CorpusGap } from '../coach'
import { mapQuestion } from './mappers'
import type { CoachQuestionRow } from './types'
import { listEvidence } from './evidence'
import { listActiveDocs } from './docs'
import { listCredentials } from './credentials'

/**
 * 현재 자산 상태에서 나와야 할 질문을 DB 와 맞춘다.
 *  - 새로 생긴 사안 → 질문 추가
 *  - 해결된 사안 → 미답변 질문 삭제 (공백을 채우면 질문이 사라진다)
 *  - dismiss 쿨다운이 끝난 질문 → 다시 pending 으로
 * 답변한 질문은 기록으로 남기므로 건드리지 않는다.
 */
export async function syncQuestions(corpusGaps: CorpusGap[] = []): Promise<void> {
  const today = kstTodayISO()

  // 쿨다운이 지난 dismiss 질문을 되살린다.
  await query(
    `update coach_question set status='pending', snooze_until=null
     where status='dismissed' and snooze_until is not null and snooze_until <= $1`,
    [today],
  )

  const [evidence, docsMap, credentials] = await Promise.all([
    listEvidence(), listActiveDocs(), listCredentials(),
  ])

  const input: CoachInput = {
    evidence: evidence.map((e) => ({
      id: e.id, type: e.type, title: e.title, body: e.body,
      periodFrom: e.periodFrom, periodTo: e.periodTo, tags: e.tags, strength: e.strength,
    })),
    docs: Object.values(docsMap).map((d) => ({
      id: d!.id, docType: d!.docType, validUntil: d!.validUntil, readinessScore: d!.readinessScore,
    })),
    credentials: credentials.map((c) => ({
      id: c.id, docName: c.docName, status: c.status,
      validUntil: c.validUntil, leadTimeDays: c.leadTimeDays,
    })),
    corpusGaps,
    today,
  }

  const candidates = generateQuestions(input)
  const keys = candidates.map((c) => c.dedupeKey)

  for (const c of candidates) {
    await query(
      `insert into coach_question
         (rule_code, dedupe_key, question, rationale, target_type, target_id, priority)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (dedupe_key) do update set
         question = excluded.question,
         rationale = excluded.rationale,
         priority = excluded.priority
       where coach_question.status = 'pending'`,
      [c.ruleCode, c.dedupeKey, c.question, c.rationale, c.targetType, c.targetId, c.priority],
    )
  }

  // 더 이상 해당되지 않는 미답변 질문은 치운다.
  if (keys.length) {
    await query(
      `delete from coach_question
       where status in ('pending','dismissed') and dedupe_key <> all($1)`,
      [keys],
    )
  } else {
    await query(`delete from coach_question where status in ('pending','dismissed')`)
  }
}

/**
 * 오늘의 질문. 같은 날 다시 들어와도 같은 질문이 나오도록 asked_at 을 박아 둔다.
 */
export async function todaysQuestions(): Promise<CoachQuestionRow[]> {
  const today = kstTodayISO()

  const already = await query(
    `select * from coach_question
     where status='pending' and asked_at is not null and (asked_at at time zone 'Asia/Seoul')::date = $1
     order by priority, created_at`,
    [today],
  )

  const need = COACH.dailyCount - already.length
  if (need > 0) {
    await query(
      `update coach_question set asked_at = now()
       where id in (
         select id from coach_question
         where status='pending' and asked_at is null
         order by priority, created_at
         limit $1
       )`,
      [need],
    )
  }

  const rows = await query(
    `select * from coach_question
     where status='pending' and asked_at is not null and (asked_at at time zone 'Asia/Seoul')::date = $1
     order by priority, created_at
     limit $2`,
    [today, COACH.dailyCount],
  )
  return rows.map(mapQuestion)
}

export async function pendingCount(): Promise<number> {
  const r = await queryOne(`select count(*)::int as n from coach_question where status='pending'`)
  return (r?.n as number) ?? 0
}

export async function getQuestion(id: string): Promise<CoachQuestionRow | null> {
  const r = await queryOne('select * from coach_question where id = $1', [id])
  return r ? mapQuestion(r) : null
}

export async function markAnswered(id: string, evidenceId: string): Promise<void> {
  await query(
    `update coach_question set status='answered', answered_at=now(), answered_evidence_id=$2
     where id=$1`,
    [id, evidenceId],
  )
}

export async function dismissQuestion(id: string): Promise<void> {
  await query(
    `update coach_question set status='dismissed', dismissed_at=now(), snooze_until=$2 where id=$1`,
    [id, addDays(kstTodayISO(), COACH.snoozeDays)],
  )
}
