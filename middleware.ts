import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, deriveToken, safeEqual } from './lib/auth'

export const config = {
  // 정적 자산과 로그인 화면을 뺀 모든 경로를 막는다.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|login).*)'],
}

export async function middleware(req: NextRequest) {
  const secret = process.env.APP_SECRET
  if (!secret) {
    return new NextResponse(
      'APP_SECRET 이 설정되지 않았습니다. .env.local 을 확인하세요.',
      { status: 500 },
    )
  }

  const cookie = req.cookies.get(SESSION_COOKIE)?.value
  if (cookie && safeEqual(cookie, await deriveToken(secret))) {
    return NextResponse.next()
  }

  const url = req.nextUrl.clone()
  url.pathname = '/login'
  url.search = req.nextUrl.pathname === '/' ? '' : `?next=${encodeURIComponent(req.nextUrl.pathname)}`
  return NextResponse.redirect(url)
}
