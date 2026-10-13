/**
 * 규칙 기반 조각 분해. **LLM 을 쓰지 않는다 — 비용이 0이다.**
 *
 * 이력서·자기소개서는 구조가 뚜렷하다. 날짜 범위, 숫자+단위, 불릿.
 * 그 패턴을 찾아 원문에서 **글자를 잘라 옮기기만** 한다.
 *
 * LLM 분해보다 나은 점이 하나 있다: 원문의 부분 문자열만 쓰므로
 * 사실을 지어내는 것이 구조적으로 불가능하다. 날짜도 적혀 있는 만큼만 채우고
 * 나머지는 비운다. 어차피 후보는 전부 사람이 승인하므로, 타입 추정이
 * 조금 거칠어도 승인 화면에서 고치면 된다.
 *
 * 못 하는 것도 분명하다: 문맥을 읽어 요약하거나, 여러 문단에 흩어진 사실을
 * 하나로 묶지 못한다. 그건 키가 있을 때 LLM 분해가 하는 일이다.
 */
import type { ExtractedCandidate } from './llm'
import type { EvidenceType } from './domain'

// ── 기간 ─────────────────────────────────────────────────────────

/** 2019 / 2019.3 / 2019년 3월 / 2019-03 / 2019.03.01 */
const DATE = String.raw`\d{4}(?:\s*[.\-/년]\s*\d{1,2}\s*월?(?:\s*[.\-/]\s*\d{1,2}\s*일?)?)?`
const NOW = String.raw`현재|지금|재직\s*중|재임\s*중|계속`
/** 범위 구분자. '-' 는 2019-03 과 충돌하므로 공백을 요구한다. */
const SEP = String.raw`\s*(?:~|∼|–|—|부터)\s*|\s+-\s+`

const RANGE_RE = new RegExp(
  String.raw`(${DATE})(?:${SEP})(${DATE}|${NOW})(?:\s*까지)?`,
)

/** '2019년 3월' → '2019-03', '2019' → '2019'. 적힌 만큼만 돌려준다. */
export function normalizeDateToken(raw: string): string {
  const s = raw.trim()
  if (new RegExp(`^(?:${NOW})$`).test(s)) return ''   // '현재' 는 비워 둔다 (진행중)
  const m = /^(\d{4})(?:\s*[.\-/년]\s*(\d{1,2}))?/.exec(s)
  if (!m) return ''
  if (!m[2]) return m[1]
  const mo = Number(m[2])
  if (mo < 1 || mo > 12) return m[1]
  return `${m[1]}-${String(mo).padStart(2, '0')}`
}

export type FoundPeriod = { from: string; to: string; text: string }

export function findPeriod(line: string): FoundPeriod | null {
  const m = RANGE_RE.exec(line)
  if (!m) return null
  return { from: normalizeDateToken(m[1]), to: normalizeDateToken(m[2]), text: m[0] }
}

// ── 수치 ─────────────────────────────────────────────────────────

const METRIC_RE =
  /(\d[\d,.]*\s*(?:명|분|가정|세대|%|퍼센트|배|회|곳|만원|억원|억|천만|원))|(\d[\d,.]*\s*(?:→|->|~|에서)\s*\d)/

// ── 타입 추정 ────────────────────────────────────────────────────

/** 고후 1:3-7 / 요한복음 3:16 */
const SERMON_RE = /[가-힣]{1,5}\s*\d{1,3}\s*[:장]\s*\d{1,3}/
const THEOLOGY_RE = /(신앙고백|성례|세례|성찬|종말론|구원론|교회론|성경관|칼빈|개혁주의|삼위일체|신학적\s*입장)/
const COMPETENCY_RE = /(주도|이수|수료|자격|훈련|구축|전산화|개선|도입|운영|기획|설계|개발)/
const RELATION_RE = /(추천|멘토|지도교수|동역|소개해\s*주)/

const TAG_RULES: [RegExp, string][] = [
  [/청년/, '청년'],
  [/중고등|중등|고등부/, '중고등부'],
  [/유년|유치|아동|어린이|주일학교|교회학교/, '다음세대'],
  [/장년|시니어|노인|실버/, '장년'],
  [/선교|해외/, '선교'],
  [/행정|재정|회계|결산/, '행정'],
  [/상담/, '상담'],
  [/교육|양육|제자훈련/, '교육'],
  [/심방/, '심방'],
  [/예배|찬양/, '예배'],
  [/전도(?!사)|새가족/, '전도'],   // '교육전도사' 의 '전도' 는 제외
]

function tagsFor(text: string): string[] {
  const out = new Set<string>()
  for (const [re, tag] of TAG_RULES) if (re.test(text)) out.add(tag)
  return [...out]
}

function guessType(text: string, hasPeriod: boolean, hasMetric: boolean): EvidenceType {
  if (SERMON_RE.test(text)) return 'sermon'
  if (THEOLOGY_RE.test(text)) return 'theology'
  if (hasMetric) return 'metric'
  if (hasPeriod) return 'career'
  if (RELATION_RE.test(text)) return 'relationship'
  if (COMPETENCY_RE.test(text)) return 'competency'
  return 'episode'
}

// ── 본문 다듬기 ──────────────────────────────────────────────────

/** 불릿·번호·구분기호만 떼어낸다. 글자를 더하지 않는다. */
function stripBullet(line: string): string {
  return line
    .replace(/^\s*(?:[-*+·•▪◦‣])\s*/, '')
    // 번호 목록은 '1.' '2)' 처럼 짧은 것만. \d+ 로 두면 '2005.3' 의 연도를 먹는다.
    .replace(/^\s*\d{1,2}[.)]\s+/, '')
    .replace(/^\s*[가-힣][.)]\s+/, '')
    .trim()
}

function tidy(s: string): string {
  return s.replace(/\s{2,}/g, ' ').replace(/^[\s,:;·\-–—]+|[\s,:;·\-–—]+$/g, '').trim()
}

/** 제목과 본문으로 가른다. 첫 절을 제목으로 쓴다. */
const MAX_TITLE = 60

function splitTitleBody(text: string): { title: string; body: string } {
  const t = tidy(text)

  // 문장·절 경계가 있으면 거기서 가른다 (길이와 무관하게).
  // 마침표 뒤에 공백을 요구한다 — 'M.Div.' 같은 약어에서 잘리지 않게.
  // '○○교회 교육전도사. 중고등부를 담당했습니다.' → 제목 / 본문
  const m = new RegExp(`^(.{6,${MAX_TITLE}}?)(?:[.。]\\s+|,\\s|\\s—\\s|\\s-\\s)(.+)$`).exec(t)
  if (m) return { title: tidy(m[1]), body: tidy(m[2]) }

  if (t.length <= MAX_TITLE) return { title: t, body: '' }

  // 경계가 없으면 마지막 띄어쓰기에서 가른다. 그냥 자르면 단어가 쪼개지고,
  // 전체를 body 에 넣으면 제목이 중복된다.
  const cut = t.lastIndexOf(' ', MAX_TITLE)
  if (cut > 10) return { title: tidy(t.slice(0, cut)), body: tidy(t.slice(cut)) }
  return { title: tidy(t.slice(0, MAX_TITLE)), body: tidy(t.slice(MAX_TITLE)) }
}

function isHeading(line: string): boolean {
  const t = line.trim()
  if (/^#{1,6}\s/.test(t)) return true
  // '사역 이력', '학력' 처럼 짧고 서술어가 없는 줄
  return t.length > 0 && t.length <= 12 && !/[.?!]$/.test(t) && !/\d/.test(t)
}

// ── 분해 ─────────────────────────────────────────────────────────

/**
 * 원문을 조각 후보로 분해한다. 반환값의 모든 source_quote 는
 * 원문에 그대로 존재하는 줄이다 (lib/llm-audit.ts 의 검사를 항상 통과한다).
 */
export function extractCandidatesByRules(source: string): ExtractedCandidate[] {
  const out: ExtractedCandidate[] = []
  const seen = new Set<string>()

  const push = (c: ExtractedCandidate) => {
    const key = `${c.type}|${tidy(c.title)}`
    if (!c.title || seen.has(key)) return
    seen.add(key)
    out.push(c)
  }

  for (const block of source.split(/\n\s*\n/)) {
    const lines = block.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim())
    let lastCareerIdx = -1

    for (const rawLine of lines) {
      if (isHeading(rawLine)) { lastCareerIdx = -1; continue }

      const line = stripBullet(rawLine)
      if (line.length < 4) continue

      const period = findPeriod(line)
      const hasMetric = METRIC_RE.test(line)

      if (period) {
        // 기간이 있는 줄 → 경력 (또는 설교·신학)
        const rest = tidy(line.replace(period.text, ' ').replace(/^\s*까지\s*/, ''))
        if (rest.length < 2) continue
        const { title, body } = splitTitleBody(rest)
        const type = guessType(line, true, false)
        push({
          type, title, body,
          period_from: period.from,
          period_to: period.to,
          tags: tagsFor(line),
          source_quote: rawLine.trim(),
        })
        lastCareerIdx = out.length - 1
        continue
      }

      if (hasMetric) {
        // 숫자가 있는 줄 → 수치 조각. 경력과 분리해 따로 세운다.
        const { title, body } = splitTitleBody(line)
        push({
          type: 'metric', title, body,
          period_from: '', period_to: '',
          tags: tagsFor(line),
          source_quote: rawLine.trim(),
        })
        continue
      }

      // 기간 바로 뒤의 서술은 그 경력의 설명으로 붙인다.
      if (lastCareerIdx >= 0 && !out[lastCareerIdx].body) {
        out[lastCareerIdx].body = tidy(line)
        out[lastCareerIdx].source_quote += '\n' + rawLine.trim()
        continue
      }

      const type = guessType(line, false, false)
      // 짧은 단문은 조각으로 세우지 않는다 — 적게 뽑는 편이 낫다.
      if (line.length < 12 && type === 'episode') continue
      const { title, body } = splitTitleBody(line)
      push({
        type, title, body,
        period_from: '', period_to: '',
        tags: tagsFor(line),
        source_quote: rawLine.trim(),
      })
    }
  }

  return out
}
