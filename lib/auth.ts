// 1인용 도구이므로 회원가입·권한관리는 만들지 않는다.
// APP_SECRET 을 아는 사람만 들어오게 하는 쿠키 게이트 하나로 끝낸다.
// 쿠키에는 시크릿 원문을 담지 않고 파생 토큰만 담는다.

export const SESSION_COOKIE = 'cd_session'
const SALT = 'calling-desk.v1'

export async function deriveToken(secret: string): Promise<string> {
  const data = new TextEncoder().encode(`${SALT}:${secret}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** 길이가 다르거나 내용이 다르면 false. 타이밍 차이를 줄여 비교한다. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
