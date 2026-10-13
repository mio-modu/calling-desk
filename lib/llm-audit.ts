/**
 * LLM 추출 결과를 원문과 대조하는 감사기. 순수 함수이며 API 를 호출하지 않는다.
 *
 * 환각은 세 가지 흔적을 남긴다. 셋 다 원문과의 대조로 기계적으로 잡힌다.
 *   ① source_quote 가 원문에 없다        → 문장을 지어냈다
 *   ② 원문에 없는 수량(명·원·%)이 있다    → 수치를 지어냈다
 *   ③ 원문에 없는 연도가 기간에 있다      → 날짜를 추측했다
 *
 * 수량이 아닌 숫자(년·개월 등)는 기간에서 파생될 수 있으므로 경고로만 올린다.
 * 사람이 판단할 몫과 기계가 단정할 몫을 섞지 않는다.
 */
import type { ExtractedCandidate } from './llm'

export type AuditResult = { fails: string[]; warns: string[] }

const QUANTITY_RE = /(\d[\d,.]*)\s*(명|분|가정|세대|%|퍼센트|배|원|만원|억)/
const NUMBER_RE = /\d[\d,.]*/
const YEAR_RE = /\b(19|20)\d{2}\b/

/** 공백·구두점을 무시한 비교용 정규화 */
export function norm(s: string): string {
  return s.replace(/\s+/g, '').replace(/[.,·'"'"]/g, '')
}

function tokens(s: string, re: RegExp, group = 0): Set<string> {
  const out = new Set<string>()
  for (const m of s.matchAll(new RegExp(re.source, 'g'))) {
    const v = (group && m[group] ? m[group] : m[0]).replace(/[,.]+$/, '')
    if (v) out.add(v)
  }
  return out
}

export function auditCandidates(
  source: string,
  candidates: ExtractedCandidate[],
): AuditResult {
  const fails: string[] = []
  const warns: string[] = []

  const srcNorm = norm(source)
  const srcNumbers = tokens(source, NUMBER_RE)
  const srcYears = tokens(source, YEAR_RE)

  for (const [i, c] of candidates.entries()) {
    const label = `후보 ${i + 1} "${c.title}"`

    // ① 인용이 원문에 실제로 존재하는가
    if (!c.source_quote?.trim()) {
      fails.push(`${label}: source_quote 가 비어 있다 (대조할 근거가 없다)`)
    } else if (!srcNorm.includes(norm(c.source_quote))) {
      fails.push(`${label}: source_quote 가 원문에 없다 → 문장을 지어냈다: "${c.source_quote}"`)
    }

    // ② 원문에 없는 수량
    const text = `${c.title} ${c.body}`
    for (const q of tokens(text, QUANTITY_RE, 1)) {
      if (!srcNumbers.has(q)) {
        fails.push(`${label}: 원문에 없는 수량 "${q}" → 수치를 지어냈다`)
      }
    }
    // 수량 외 숫자는 기간 파생 가능 — 경고
    for (const n of tokens(text, NUMBER_RE)) {
      if (!srcNumbers.has(n)) {
        warns.push(`${label}: 원문에 없는 숫자 "${n}" (기간 파생일 수 있음 — 눈으로 확인)`)
      }
    }

    // ③ 원문에 없는 연도를 기간에 넣었는가
    for (const p of [c.period_from, c.period_to]) {
      const y = /^(\d{4})/.exec((p ?? '').trim())?.[1]
      if (y && !srcYears.has(y)) {
        fails.push(`${label}: 원문에 없는 연도 "${y}" 를 기간에 넣었다 → 날짜를 추측했다`)
      }
    }
  }

  return { fails, warns }
}

/** 원문에 숫자가 없는 주제에 수치가 붙었는지 — 가장 위험한 환각 */
export function auditNoMetricTopic(
  candidates: ExtractedCandidate[],
  topicRe: RegExp,
): string[] {
  return candidates
    .filter((c) => topicRe.test(`${c.title}${c.body}`))
    .filter((c) => new RegExp(`${QUANTITY_RE.source}`).test(`${c.title}${c.body}`))
    .map((c) => c.title)
}

/** 기간이 모호한 주제에 날짜를 채웠는지 */
export function auditVagueDates(
  candidates: ExtractedCandidate[],
  topicRe: RegExp,
): string[] {
  return candidates
    .filter((c) => topicRe.test(`${c.title}${c.body}${c.source_quote}`))
    .filter((c) => c.period_from?.trim() || c.period_to?.trim())
    .map((c) => `${c.title}(${c.period_from}~${c.period_to})`)
}
