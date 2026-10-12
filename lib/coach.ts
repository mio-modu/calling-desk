// 코칭 질문 생성. 기획서 6장 ① 의 우선순위 규칙을 그대로 구현한다.
//
// 설계 원칙 두 가지:
//  1) 규칙 1·2·4·5 는 LLM 없이 결정적으로 만든다. 같은 자산 상태면 같은 질문이 나온다.
//  2) **질문 문장은 고정 템플릿이다.** 고쳐주는 문장이 아니라 지적하고 되묻는 문장만
//     나오도록 문장 자체를 코드에 박아 둔다. LLM 이 여기에 끼어들 자리가 없다.
//
// 규칙 3(코퍼스 빈발 항목 대비 내 자산 부족)은 Phase 2 의 코퍼스가 있어야 작동한다.
// 지금은 corpusGaps 를 주입받는 형태로만 열어 두고 기본값은 빈 배열이다.

import {
  COACH, COACH_RULE_PRIORITY, DOC_TYPE_META,
  type CoachRule, type DocType, type EvidenceType,
} from './domain'
import { findTimelineGaps } from './readiness'
import { daysBetween, daysUntil, formatKorean, formatPeriod, kstTodayISO, obj, subj } from './date'

export type CoachTargetType = 'evidence' | 'master_doc' | 'credential' | 'timeline'

export type CoachCandidate = {
  ruleCode: CoachRule
  /** 같은 사안으로 질문이 중복 생성되지 않게 하는 안정 키 */
  dedupeKey: string
  question: string
  rationale: string
  targetType: CoachTargetType | null
  targetId: string | null
  priority: number
  /** 답변이 조각으로 저장될 때 제안할 타입 (사용자가 최종 확정) */
  suggestedType: EvidenceType | null
}

export type CoachEvidence = {
  id: string
  type: EvidenceType
  title: string
  body: string
  periodFrom: string | null
  periodTo: string | null
  tags: string[]
  strength: number
}

export type CoachDoc = {
  id: string
  docType: DocType
  validUntil: string | null
  readinessScore: number | null
}

export type CoachCredential = {
  id: string
  docName: string
  status: string
  validUntil: string | null
  leadTimeDays: number | null
}

/** Phase 2 의 코퍼스가 채워줄 입력 */
export type CorpusGap = {
  /** 요구 항목 원문 (예: '다음세대 사역 경험') */
  topic: string
  /** 공고에서의 등장 비율 0..1 */
  frequency: number
  /** 이 주제에 해당하는 내 조각 수 */
  myCount: number
}

export type CoachInput = {
  evidence: CoachEvidence[]
  docs: CoachDoc[]
  credentials: CoachCredential[]
  corpusGaps?: CorpusGap[]
  today?: string
}

const METRIC_IN_TEXT =
  /(\d[\d,.]*\s*(명|분|가정|세대|%|퍼센트|배|회|개|곳|만원|억원|억|천만|원))|(\d[\d,.]*\s*(→|~|에서)\s*\d)/

function spanDays(from: string | null, to: string | null, today: string): number {
  if (!from) return 0
  return daysBetween(from.slice(0, 10), (to ?? today).slice(0, 10))
}

// ── 규칙 1: 이력서 연표의 빈 구간 ─────────────────────────────────

function ruleTimelineGap(input: CoachInput, today: string): CoachCandidate[] {
  const career = input.evidence.filter((e) => e.type === 'career')
  const out: CoachCandidate[] = []

  for (const g of findTimelineGaps(
    career.map((e) => ({ title: e.title, from: e.periodFrom, to: e.periodTo })),
    today,
  )) {
    const years = Math.floor(g.days / 365)
    const months = Math.floor((g.days % 365) / 30)
    const dur = years ? `${years}년 ${months}개월` : `${months}개월`
    out.push({
      ruleCode: 'timeline_gap',
      dedupeKey: `timeline_gap:${g.from}:${g.to}`,
      question: `${formatKorean(g.from)} ~ ${formatKorean(g.to)} 구간이 비어 있습니다. 이 시기에 무엇을 하고 계셨습니까?`,
      rationale: `연표에 ${dur}의 공백이 있습니다. 청빙위원회가 가장 먼저 묻는 자리이고, 비워두면 추측하게 됩니다.`,
      targetType: 'timeline',
      targetId: null,
      priority: COACH_RULE_PRIORITY.timeline_gap,
      suggestedType: 'career',
    })
  }

  for (const e of career.filter((e) => !e.periodFrom)) {
    out.push({
      ruleCode: 'timeline_gap',
      dedupeKey: `timeline_undated:${e.id}`,
      question: `'${e.title}' 조각에 기간이 없습니다. 언제부터 언제까지였습니까?`,
      rationale: '기간이 없는 경력은 연표에서 빠지고, 공백 탐지에도 잡히지 않습니다.',
      targetType: 'evidence',
      targetId: e.id,
      priority: COACH_RULE_PRIORITY.timeline_gap + 1,
      suggestedType: 'career',
    })
  }

  return out
}

// ── 규칙 2: 수치 없는 경력 ───────────────────────────────────────

function ruleMissingMetric(input: CoachInput, today: string): CoachCandidate[] {
  const metricTags = new Set(
    input.evidence.filter((e) => e.type === 'metric').flatMap((e) => e.tags),
  )

  return input.evidence
    .filter((e) => e.type === 'career')
    .filter((e) => spanDays(e.periodFrom, e.periodTo, today) >= COACH.metricMinSpanDays)
    .filter((e) => !METRIC_IN_TEXT.test(e.body))
    // 같은 태그를 가진 수치 조각이 이미 있으면 묻지 않는다.
    .filter((e) => !e.tags.some((t) => metricTags.has(t)))
    .map((e) => {
      const years = Math.max(1, Math.round(spanDays(e.periodFrom, e.periodTo, today) / 365))
      return {
        ruleCode: 'missing_metric' as CoachRule,
        dedupeKey: `missing_metric:${e.id}`,
        question: `'${e.title}'${obj(e.title)} ${years}년 담당하셨는데, 시작과 끝의 숫자가 기록에 없습니다. 맡으신 첫 시점과 마지막 시점의 규모(출석 인원·참여자 수·예산 등)는 각각 얼마였습니까?`,
        rationale: `${formatPeriod(e.periodFrom, e.periodTo)} — 숫자 없는 사역 서술은 검증이 되지 않아 서류에서 가장 먼저 걸러집니다.`,
        targetType: 'evidence' as CoachTargetType,
        targetId: e.id,
        priority: COACH_RULE_PRIORITY.missing_metric,
        suggestedType: 'metric' as EvidenceType,
      }
    })
}

// ── 규칙 3: 코퍼스 빈발 항목 대비 자산 부족 (Phase 2) ─────────────

function ruleCorpusGap(input: CoachInput): CoachCandidate[] {
  return (input.corpusGaps ?? [])
    .filter((g) => g.frequency >= 0.2 && g.myCount <= 2)
    .map((g) => ({
      ruleCode: 'corpus_gap' as CoachRule,
      dedupeKey: `corpus_gap:${g.topic}`,
      question: `공고의 ${Math.round(g.frequency * 100)}%가 '${g.topic}'을 언급하는데, 관련 조각이 ${g.myCount}개뿐입니다. 이 영역에서 실제로 하신 일이 무엇입니까?`,
      rationale: `요구사항 코퍼스 기준 상위 항목입니다. 내 자산 ${g.myCount}건으로는 서류에서 한 문장밖에 못 씁니다.`,
      targetType: null,
      targetId: null,
      priority: COACH_RULE_PRIORITY.corpus_gap,
      suggestedType: null,
    }))
}

// ── 규칙 4: strength 낮은 조각 보강 ──────────────────────────────

function ruleWeakEvidence(input: CoachInput): CoachCandidate[] {
  return input.evidence
    .filter((e) => e.strength <= COACH.weakStrengthMax)
    .map((e) => ({
      ruleCode: 'weak_evidence' as CoachRule,
      dedupeKey: `weak_evidence:${e.id}`,
      question: `'${e.title}' 조각${subj(e.title)} 추상적입니다. 그 일이 실제로 일어난 장면 하나만 더 말씀해 주십시오 — 언제, 누가 있었고, 무엇을 하셨습니까?`,
      rationale: `근거 강도 ${e.strength}/5. 이 상태로는 서류에 인용해도 면접에서 되물으면 막힙니다.`,
      targetType: 'evidence' as CoachTargetType,
      targetId: e.id,
      priority: COACH_RULE_PRIORITY.weak_evidence,
      suggestedType: e.type,
    }))
}

// ── 규칙 5: 오래된 조각 / 만료 임박 ──────────────────────────────

function ruleStaleAsset(input: CoachInput, today: string): CoachCandidate[] {
  const out: CoachCandidate[] = []

  for (const d of input.docs) {
    const meta = DOC_TYPE_META[d.docType]
    if (meta.kind !== 'media' || !d.validUntil) continue
    const left = daysUntil(d.validUntil, today)
    if (left > COACH.staleWarnDays) continue
    const months = Math.round((meta.freshnessDays ?? 180) / 30)
    out.push({
      ruleCode: 'stale_asset',
      dedupeKey: `stale_doc:${d.id}:${d.validUntil}`,
      question: left < 0
        ? `${meta.label}의 신선도 기한이 ${-left}일 지났습니다. "최근 ${months}개월 이내" 요구에 이미 걸립니다. 언제 새로 촬영하시겠습니까?`
        : `${meta.label}의 신선도 기한이 ${left}일 남았습니다. "최근 ${months}개월 이내" 요구에 곧 걸립니다. 언제 새로 촬영하시겠습니까?`,
      rationale: `유효기한 ${formatKorean(d.validUntil)}. 공고가 뜬 뒤에 촬영하면 늦습니다.`,
      targetType: 'master_doc',
      targetId: d.id,
      // 이미 만료된 건은 다른 규칙보다 먼저 묻는다.
      priority: COACH_RULE_PRIORITY.stale_asset - (left < 0 ? 45 : 20),
      suggestedType: null,
    })
  }

  for (const c of input.credentials) {
    if (c.status !== 'received' || !c.validUntil) continue
    const left = daysUntil(c.validUntil, today)
    if (left > COACH.staleWarnDays) continue
    const lead = c.leadTimeDays
    out.push({
      ruleCode: 'stale_asset',
      dedupeKey: `stale_credential:${c.id}:${c.validUntil}`,
      question: left < 0
        ? `'${c.docName}'의 유효기한이 ${-left}일 지났습니다. 지금 보유분은 제출할 수 없습니다. 재발급을 신청하셨습니까?`
        : `'${c.docName}'의 유효기한이 ${left}일 남았습니다.${lead != null ? ` 재발급에 ${lead}일 걸리니 ${left - lead}일 안에 신청해야 합니다.` : ' 재발급 리드타임이 확인되지 않았습니다.'} 지금 신청하시겠습니까?`,
      rationale: `유효기한 ${formatKorean(c.validUntil)}. 공고 마감과 겹치면 손쓸 방법이 없습니다.`,
      targetType: 'credential',
      targetId: c.id,
      priority: COACH_RULE_PRIORITY.stale_asset - (left < 0 ? 45 : 20),
      suggestedType: null,
    })
  }

  return out
}

// ── 통합 ─────────────────────────────────────────────────────────

/**
 * 현재 자산 상태에서 나와야 할 질문 전체를 우선순위 순으로 돌려준다.
 * 저장·중복제거·하루 3개 선택은 repo 계층이 담당한다.
 */
export function generateQuestions(input: CoachInput): CoachCandidate[] {
  const today = input.today ?? kstTodayISO()
  const all = [
    ...ruleTimelineGap(input, today),
    ...ruleMissingMetric(input, today),
    ...ruleCorpusGap(input),
    ...ruleWeakEvidence(input),
    ...ruleStaleAsset(input, today),
  ]
  // dedupeKey 중복 제거 (먼저 온 것 우선)
  const seen = new Set<string>()
  const unique = all.filter((c) => !seen.has(c.dedupeKey) && seen.add(c.dedupeKey))
  return unique.sort((a, b) => a.priority - b.priority || a.dedupeKey.localeCompare(b.dedupeKey))
}
