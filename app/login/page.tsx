import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { SESSION_COOKIE, deriveToken } from '@/lib/auth'
import { Button, Input, Notice } from '@/components/ui'

export const metadata = { title: '들어가기 · 청빙 작업대' }

async function signIn(formData: FormData) {
  'use server'
  const secret = process.env.APP_SECRET
  const given = String(formData.get('secret') ?? '')
  const next = String(formData.get('next') ?? '/') || '/'

  if (!secret || given !== secret) {
    redirect(`/login?error=1${next !== '/' ? `&next=${encodeURIComponent(next)}` : ''}`)
  }

  const jar = await cookies()
  jar.set(SESSION_COOKIE, await deriveToken(secret), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 90,
  })
  redirect(next.startsWith('/') ? next : '/')
}

export default async function LoginPage({
  searchParams,
}: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const sp = await searchParams

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-6">
      <h1 className="text-xl font-semibold">청빙 작업대</h1>
      <p className="mt-1 text-sm text-ink-faint">
        1인용 도구입니다. APP_SECRET 을 입력하세요.
      </p>

      <form action={signIn} className="mt-6 space-y-3">
        <input type="hidden" name="next" value={sp.next ?? '/'} />
        <Input
          name="secret"
          type="password"
          autoFocus
          required
          placeholder="APP_SECRET"
          autoComplete="current-password"
        />
        {sp.error && <Notice tone="blocker">시크릿이 맞지 않습니다.</Notice>}
        <Button type="submit" className="w-full">들어가기</Button>
      </form>
    </main>
  )
}
