import Link from 'next/link'
import { pendingCount } from '@/lib/repo/coach'
import { pendingCandidateCount } from '@/lib/repo/uploads'

const NAV = [
  { href: '/', label: '준비도' },
  { href: '/docs', label: '서류 작업대' },
  { href: '/evidence', label: '자산 은행' },
  { href: '/coach', label: '코칭' },
  { href: '/credentials', label: '증빙' },
  { href: '/profile', label: '프로필' },
]

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // 네비에 할 일 개수를 띄운다. 매일 들어와서 숫자를 줄이는 게 이 도구의 사용법이다.
  const [questions, candidates] = await Promise.all([
    pendingCount().catch(() => 0),
    pendingCandidateCount().catch(() => 0),
  ])

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-6">
      <header className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line pb-3">
        <Link href="/" className="font-semibold tracking-tight">청빙 작업대</Link>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="text-ink-soft transition hover:text-accent">
              {n.label}
              {n.href === '/coach' && questions > 0 && (
                <span className="ml-1 rounded bg-accent-soft px-1 text-[11px] font-medium text-accent">
                  {questions}
                </span>
              )}
              {n.href === '/evidence' && candidates > 0 && (
                <span className="ml-1 rounded bg-warn-soft px-1 text-[11px] font-medium text-warn">
                  승인 {candidates}
                </span>
              )}
            </Link>
          ))}
        </nav>
      </header>
      {children}
    </div>
  )
}
