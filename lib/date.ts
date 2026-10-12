// 날짜는 전부 KST 기준. DB 는 date(날짜만) / timestamptz(시각) 를 쓰고,
// 화면과 판정은 KST 의 "오늘"을 기준으로 삼는다.

const KST = 'Asia/Seoul'
const MS_PER_DAY = 86_400_000

/** KST 기준 오늘. 'YYYY-MM-DD' */
export function kstTodayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: KST, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
}

/** 'YYYY-MM-DD' → UTC 자정 Date. 날짜 산술 전용. */
export function dateOnly(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`)
}

export function toISODate(d: Date | string | null | undefined): string | null {
  if (!d) return null
  if (typeof d === 'string') return d.slice(0, 10)
  return d.toISOString().slice(0, 10)
}

/** b - a 를 일수로. 음수면 a 가 b 보다 나중. */
export function daysBetween(a: string, b: string): number {
  return Math.round((dateOnly(b).getTime() - dateOnly(a).getTime()) / MS_PER_DAY)
}

export function addDays(iso: string, days: number): string {
  return new Date(dateOnly(iso).getTime() + days * MS_PER_DAY).toISOString().slice(0, 10)
}

/** 오늘로부터 iso 까지 남은 일수. 과거면 음수. */
export function daysUntil(iso: string, today = kstTodayISO()): number {
  return daysBetween(today, iso)
}

/** timestamptz 로부터 경과 일수 */
export function daysSince(ts: Date | string, today = kstTodayISO()): number {
  const iso = typeof ts === 'string' ? ts.slice(0, 10) : ts.toISOString().slice(0, 10)
  return daysBetween(iso, today)
}

export function formatKorean(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${y}.${Number(m)}.${Number(d)}`
}

/** 'YYYY.M' 형태의 기간 표기 */
export function formatPeriod(from: string | null, to: string | null): string {
  if (!from && !to) return '기간 미입력'
  const f = from ? `${from.slice(0, 4)}.${Number(from.slice(5, 7))}` : '?'
  const t = to ? `${to.slice(0, 4)}.${Number(to.slice(5, 7))}` : '현재'
  return `${f} ~ ${t}`
}

// ── 한국어 조사 ──────────────────────────────────────────────────
// 조각 제목이 들어가는 질문 문장에서 조사가 틀리면 바로 눈에 걸린다.
// 받침 유무로 갈라준다. (한글 음절: (코드 - 0xAC00) % 28 ≠ 0 이면 받침 있음)

function hasFinalConsonant(word: string): boolean | null {
  const ch = word.trim().replace(/[)\]}'"》」』>]+$/, '').slice(-1)
  if (!ch) return null
  const code = ch.charCodeAt(0)
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0
  if (/[0-9]$/.test(ch)) {
    // 숫자는 읽는 소리의 받침을 따른다: 0,1,3,6,7,8 → 받침 있음
    return ['0', '1', '3', '6', '7', '8'].includes(ch)
  }
  return null  // 영문·기호 등은 판단하지 않는다
}

/** 목적격 조사: 을 / 를 */
export function obj(word: string): string {
  const f = hasFinalConsonant(word)
  return f === null ? '을(를)' : f ? '을' : '를'
}

/** 주격 조사: 이 / 가 */
export function subj(word: string): string {
  const f = hasFinalConsonant(word)
  return f === null ? '이(가)' : f ? '이' : '가'
}

/** 보조사: 은 / 는 */
export function topic(word: string): string {
  const f = hasFinalConsonant(word)
  return f === null ? '은(는)' : f ? '은' : '는'
}
