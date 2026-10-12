// 완성도 점검. 순수 함수이며 LLM 을 쓰지 않는다.
// 같은 입력에 항상 같은 결과가 나와야 점수 추이를 믿을 수 있기 때문이다.
//
// 기획서 6장 ② 의 6개 구성요소를 쓰되, **점수보다 detail(빠진 항목 리스트)이
// 핵심 산출물**이다. 화면은 detail 을 먼저 보여준다.

import {
  COMPLETION, COACH, DOC_TYPE_META, type DocType, type EvidenceType,
} from './domain'
import { daysBetween, daysSince, daysUntil, formatKorean, kstTodayISO } from './date'

export type ReadinessSeverity = 'blocker' | 'warn' | 'info'

export type ReadinessItem = {
  code: string
  /** 사용자에게 보이는 지적 문장. 고쳐주는 문장이 아니라 지적하는 문장. */
  label: string
  severity: ReadinessSeverity
  hint?: string
}

export type ReadinessComponent = {
  key: string
  label: string
  weight: number
  /** 0..1 */
  value: number
  display: string
}

export type Readiness = {
  score: number
  components: ReadinessComponent[]
  detail: ReadinessItem[]
}

export type ReadinessLink = {
  evidenceId: string
  type: EvidenceType
  title: string
  /** DOC_TYPE_META 의 섹션 key. 문서 전체 연결이면 '' */
  section: string
}

export type CareerSpan = {
  title: string
  from: string | null
  to: string | null
}

export type ReadinessInput = {
  docType: DocType
  contentMd: string
  /** 활성 버전 생성일 = 최종 수정 시점. 없으면 미작성. */
  updatedAt?: string | Date | null
  validUntil?: string | null
  linked?: ReadinessLink[]
  /** 전체 career 조각의 기간. 연표 공백 탐지용. */
  careerTimeline?: CareerSpan[]
  today?: string
}

// ── 본문 파싱 ────────────────────────────────────────────────────

const HEADING_RE = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/

/** 숫자 + 단위, 또는 "30 → 85" 형태의 전후 비교 */
const METRIC_RE =
  /(\d[\d,.]*\s*(명|분|가정|세대|%|퍼센트|배|회|개|곳|년|개월|주|시간|만원|억원|억|천만|원))|(\d[\d,.]*\s*(→|~|-{1,2}|에서)\s*\d)/

export type ContentUnit = {
  text: string
  sectionKey: string | null
  heading: string
  isClaim: boolean
  hasMetric: boolean
}

export type ParsedContent = {
  headings: { raw: string; sectionKey: string | null }[]
  units: ContentUnit[]
  plainLength: number
}

/** 라벨을 토큰으로 쪼갠다. '안수·노회' → ['안수','노회'] */
function labelTokens(label: string): string[] {
  return label
    .split(/[·/,]|및|과|와/)
    .map((t) => normalize(t))
    .filter((t) => t.length >= 2)
}

function normalize(s: string): string {
  return s.replace(/[\s()[\]{}.,:;!?~\-–—'"`*_]/g, '').toLowerCase()
}

/** 제목 문자열을 서류 섹션 key 로 해석. 못 찾으면 null. */
export function resolveSection(docType: DocType, heading: string): string | null {
  const h = normalize(heading)
  if (!h) return null
  for (const s of DOC_TYPE_META[docType].sections) {
    const tokens = labelTokens(s.label)
    if (tokens.some((t) => h.includes(t))) return s.key
    if (normalize(s.label).includes(h) && h.length >= 2) return s.key
  }
  return null
}

function stripMarkdown(s: string): string {
  return s
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[\s>]*[-*+]\s+/gm, '')
    .replace(/^[\s>]*\d+\.\s+/gm, '')
    .replace(/[*_`>#|]/g, '')
    .trim()
}

export function parseContent(docType: DocType, md: string): ParsedContent {
  const lines = md.split(/\r?\n/)
  const headings: { raw: string; sectionKey: string | null }[] = []
  const units: ContentUnit[] = []

  let heading = ''
  let sectionKey: string | null = null
  let buffer: string[] = []

  const flush = () => {
    const raw = buffer.join('\n').trim()
    buffer = []
    if (!raw) return
    const text = stripMarkdown(raw)
    if (!text) return
    units.push({
      text,
      sectionKey,
      heading,
      // 40자 이상의 산문 블록을 "주장 문단"으로 본다.
      isClaim: text.length >= 40,
      hasMetric: METRIC_RE.test(text),
    })
  }

  for (const line of lines) {
    const m = HEADING_RE.exec(line)
    if (m) {
      flush()
      heading = m[1].trim()
      sectionKey = resolveSection(docType, heading)
      headings.push({ raw: heading, sectionKey })
      continue
    }
    if (!line.trim()) { flush(); continue }
    buffer.push(line)
  }
  flush()

  return { headings, units, plainLength: stripMarkdown(md).replace(/\s+/g, '').length }
}

// ── 연표 공백 ────────────────────────────────────────────────────

export type TimelineGap = { from: string; to: string; days: number }

/** career 기간을 병합해 COACH.timelineGapDays 이상의 공백을 찾는다. */
export function findTimelineGaps(
  spans: CareerSpan[],
  today = kstTodayISO(),
): TimelineGap[] {
  const ranges = spans
    .filter((s) => s.from)
    .map((s) => ({ from: s.from!.slice(0, 10), to: (s.to ?? today).slice(0, 10) }))
    .sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0))

  const gaps: TimelineGap[] = []
  if (ranges.length < 2) return gaps

  let cursor = ranges[0].to
  for (let i = 1; i < ranges.length; i++) {
    const r = ranges[i]
    const gap = daysBetween(cursor, r.from)
    if (gap >= COACH.timelineGapDays) {
      gaps.push({ from: cursor, to: r.from, days: gap })
    }
    if (r.to > cursor) cursor = r.to
  }
  return gaps
}

// ── 점수 ─────────────────────────────────────────────────────────

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`
}

export function computeReadiness(input: ReadinessInput): Readiness {
  const today = input.today ?? kstTodayISO()
  const meta = DOC_TYPE_META[input.docType]
  const linked = input.linked ?? []
  const detail: ReadinessItem[] = []
  const components: ReadinessComponent[] = []

  const content = input.contentMd ?? ''
  const parsed = parseContent(input.docType, content)

  // 미작성 서류는 점수를 매기지 않고 그렇게 말한다.
  if (!input.updatedAt || parsed.plainLength === 0) {
    return {
      score: 0,
      components: [],
      detail: [{
        code: 'not_started',
        label: '아직 작성되지 않았습니다.',
        severity: 'blocker',
        hint: meta.kind === 'media'
          ? '링크와 촬영일만 먼저 넣어두면 신선도 관리가 시작됩니다.'
          : '뼈대 생성으로 목차만 먼저 세우고, 한 섹션씩 채우는 편이 빠릅니다.',
      }],
    }
  }

  // ① 필수 섹션 충족도
  const requiredSections = meta.sections.filter((s) => s.required)
  const presentKeys = new Set(
    parsed.headings.map((h) => h.sectionKey).filter((k): k is string => Boolean(k)),
  )
  // 섹션에 제목만 있고 내용이 없으면 충족으로 보지 않는다.
  const filledKeys = new Set(
    parsed.units.filter((u) => u.sectionKey && u.text.length >= 10).map((u) => u.sectionKey!),
  )
  const metSections = requiredSections.filter((s) => filledKeys.has(s.key))
  const missingSections = requiredSections.filter((s) => !filledKeys.has(s.key))

  components.push({
    key: 'sections', label: '필수 섹션 충족도', weight: meta.kind === 'media' ? 50 : 30,
    value: requiredSections.length ? metSections.length / requiredSections.length : 1,
    display: `${metSections.length} / ${requiredSections.length}개`,
  })
  for (const s of missingSections) {
    detail.push({
      code: `section:${s.key}`,
      label: presentKeys.has(s.key)
        ? `'${s.label}' 항목에 제목만 있고 내용이 없습니다.`
        : `'${s.label}' 항목이 없습니다.`,
      severity: 'blocker',
      hint: s.hint,
    })
  }

  if (meta.kind === 'written') {
    // ② 자산 뒧받침률
    const claims = parsed.units.filter((u) => u.isClaim)
    const sectionsWithLink = new Set(linked.map((l) => l.section))
    const backed = claims.filter((u) =>
      u.sectionKey ? sectionsWithLink.has(u.sectionKey) : sectionsWithLink.has(''),
    )
    const backingValue = claims.length ? backed.length / claims.length : 0
    components.push({
      key: 'backing', label: '자산 뒷받침률', weight: 20, value: backingValue,
      display: `주장 문단 ${claims.length}개 중 ${backed.length}개`,
    })
    if (claims.length === 0) {
      detail.push({
        code: 'no_claims',
        label: '40자 이상의 서술 문단이 없습니다. 아직 목차 수준입니다.',
        severity: 'blocker',
      })
    } else if (backed.length < claims.length) {
      detail.push({
        code: 'backing',
        label: `주장 문단 ${claims.length}개 중 ${backed.length}개만 근거가 연결돼 있습니다.`,
        severity: backingValue < 0.5 ? 'blocker' : 'warn',
        hint: '근거 없는 문단은 면접에서 되묻습니다. 사이드바에서 자산 조각을 연결하세요.',
      })
    }

    // ③ 수치 포함률
    const withMetric = claims.filter((u) => u.hasMetric)
    const metricValue = claims.length ? withMetric.length / claims.length : 0
    // 전 문단에 수치가 필요한 것은 아니다. 30% 를 만점으로 본다.
    components.push({
      key: 'metric', label: '수치 포함률', weight: 15, value: clamp01(metricValue / 0.3),
      display: `${withMetric.length} / ${claims.length}개 문단`,
    })
    if (claims.length > 0 && metricValue < 0.3) {
      detail.push({
        code: 'metric',
        label: `수치가 들어간 문단이 ${withMetric.length}/${claims.length}개입니다.`,
        severity: withMetric.length === 0 ? 'blocker' : 'warn',
        hint: '숫자가 없는 사역 서술은 검증이 안 됩니다. 시작과 끝의 인원·재정·참여 수를 넣으세요.',
      })
    }

    // ⑥ 분량 적정성
    if (meta.lengthRange) {
      const [min, max] = meta.lengthRange
      const len = parsed.plainLength
      const value = len < min ? len / min : len > max ? clamp01(max / len) : 1
      components.push({
        key: 'length', label: '분량 적정성', weight: 15, value,
        display: `${len.toLocaleString('ko-KR')}자 (권장 ${min.toLocaleString('ko-KR')}~${max.toLocaleString('ko-KR')})`,
      })
      if (len < min) {
        detail.push({
          code: 'length_short',
          label: `분량이 ${len.toLocaleString('ko-KR')}자입니다. 권장 최소는 ${min.toLocaleString('ko-KR')}자입니다.`,
          severity: len < min * 0.5 ? 'blocker' : 'warn',
        })
      } else if (len > max) {
        detail.push({
          code: 'length_long',
          label: `분량이 ${len.toLocaleString('ko-KR')}자입니다. 권장 상한 ${max.toLocaleString('ko-KR')}자를 넘습니다.`,
          severity: 'info',
          hint: '교회가 분량을 지정하는 경우가 있습니다. 줄일 수 있는 마스터를 유지하는 건 괜찮습니다.',
        })
      }
    }
  }

  // ④ 연표 공백
  if (meta.checksTimeline) {
    const spans = input.careerTimeline ?? []
    const gaps = findTimelineGaps(spans, today)
    const undated = spans.filter((s) => !s.from)
    const value = gaps.length === 0 && undated.length === 0 ? 1 : gaps.length === 0 ? 0.6 : 0
    components.push({
      key: 'timeline', label: '연표 공백', weight: 10, value,
      display: gaps.length ? `공백 ${gaps.length}구간` : undated.length ? '기간 미입력 있음' : '공백 없음',
    })
    for (const g of gaps) {
      detail.push({
        code: `gap:${g.from}:${g.to}`,
        label: `${formatKorean(g.from)} ~ ${formatKorean(g.to)} 구간이 비어 있습니다. (${Math.floor(g.days / 365)}년 ${Math.floor((g.days % 365) / 30)}개월)`,
        severity: 'blocker',
        hint: '청빙위원회가 가장 먼저 묻는 자리입니다. 비워두면 추측하게 됩니다.',
      })
    }
    for (const u of undated) {
      detail.push({
        code: 'undated',
        label: `'${u.title}' 조각에 기간이 입력되지 않아 연표에서 빠집니다.`,
        severity: 'warn',
      })
    }
  }

  // ⑤ 최종 수정 경과일 / 신선도
  if (meta.kind === 'media') {
    const freshness = meta.freshnessDays ?? 180
    if (input.validUntil) {
      const left = daysUntil(input.validUntil, today)
      components.push({
        key: 'freshness', label: '신선도', weight: 50, value: clamp01(left / freshness),
        display: left >= 0 ? `유효기한까지 ${left}일` : `${-left}일 지남`,
      })
      if (left < 0) {
        detail.push({
          code: 'expired',
          label: `신선도 기한이 ${-left}일 지났습니다. (${formatKorean(input.validUntil)})`,
          severity: 'blocker',
          hint: `"최근 ${Math.round(freshness / 30)}개월 이내" 조건에 이미 걸립니다. 새로 촬영해야 합니다.`,
        })
      } else if (left <= COACH.staleWarnDays) {
        detail.push({
          code: 'expiring',
          label: `신선도 기한이 ${left}일 남았습니다. (${formatKorean(input.validUntil)})`,
          severity: 'warn',
          hint: '공고가 뜬 뒤에 촬영하면 늦습니다.',
        })
      }
    } else {
      components.push({
        key: 'freshness', label: '신선도', weight: 50, value: 0, display: '촬영일 미입력',
      })
      detail.push({
        code: 'no_valid_until',
        label: '촬영일이 입력되지 않아 신선도를 판정할 수 없습니다.',
        severity: 'blocker',
        hint: `촬영일을 넣으면 ${Math.round((meta.freshnessDays ?? 180) / 30)}개월 기준으로 만료일을 자동 계산합니다.`,
      })
    }
  } else {
    const age = daysSince(input.updatedAt, today)
    // 30일 이내는 만점, 180일에 0.
    const value = clamp01((180 - age) / 150)
    components.push({
      key: 'recency', label: '최종 수정 경과', weight: 10, value,
      display: `${age}일 경과`,
    })
    if (age > 90) {
      detail.push({
        code: 'stale',
        label: `최종 수정 후 ${age}일이 지났습니다.`,
        severity: age > 180 ? 'warn' : 'info',
        hint: '사역 상황이 바뀌었는데 서류가 그대로인 경우가 많습니다. 한 번 훑어보세요.',
      })
    }
  }

  const totalWeight = components.reduce((s, c) => s + c.weight, 0)
  const score = totalWeight
    ? Math.round((components.reduce((s, c) => s + c.weight * clamp01(c.value), 0) / totalWeight) * 100)
    : 0

  const order: Record<ReadinessSeverity, number> = { blocker: 0, warn: 1, info: 2 }
  detail.sort((a, b) => order[a.severity] - order[b.severity])

  return { score, components, detail }
}

/**
 * 서류가 "완료"인가 — 준비도 대시보드 21종 집계의 단일 기준.
 *
 * 점수만으로 판정하면 안 된다. 7년 연표 공백이 있는 이력서가 다른 항목이
 * 좋아서 70점을 넘으면 "완료"로 세어지는데, 그 서류는 제출할 수 없다.
 * 그래서 **필수(blocker) 지적이 하나도 없어야** 완료로 본다.
 */
export function isDocComplete(
  score: number | null | undefined,
  detail: ReadinessItem[] = [],
): boolean {
  if ((score ?? 0) < COMPLETION.docMinScore) return false
  return !detail.some((d) => d.severity === 'blocker')
}

export { pct }
