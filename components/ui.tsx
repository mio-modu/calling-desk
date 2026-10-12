import Link from 'next/link'
import type { ReactNode } from 'react'
import type { ReadinessSeverity } from '@/lib/readiness'

export function Card({
  title, subtitle, action, children, className = '',
}: {
  title?: ReactNode; subtitle?: ReactNode; action?: ReactNode
  children: ReactNode; className?: string
}) {
  return (
    <section className={`rounded-xl border border-line bg-surface ${className}`}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-3.5">
          <div>
            {title && <h2 className="font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[13px] text-ink-faint">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className="px-5 py-4">{children}</div>
    </section>
  )
}

const TONES = {
  neutral: 'bg-canvas text-ink-soft border-line',
  accent: 'bg-accent-soft text-accent border-accent/20',
  ok: 'bg-ok-soft text-ok border-ok/20',
  warn: 'bg-warn-soft text-warn border-warn/20',
  blocker: 'bg-blocker-soft text-blocker border-blocker/20',
} as const

export function Badge({
  children, tone = 'neutral',
}: { children: ReactNode; tone?: keyof typeof TONES }) {
  return (
    <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11.5px] font-medium whitespace-nowrap ${TONES[tone]}`}>
      {children}
    </span>
  )
}

export function severityTone(s: ReadinessSeverity): keyof typeof TONES {
  return s === 'blocker' ? 'blocker' : s === 'warn' ? 'warn' : 'neutral'
}

export function severityLabel(s: ReadinessSeverity): string {
  return s === 'blocker' ? '필수' : s === 'warn' ? '권장' : '참고'
}

/** 점수는 보조 지표다. 색으로 과하게 단정하지 않는다. */
export function ScoreBar({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' }) {
  const tone = score >= 70 ? 'bg-ok' : score >= 40 ? 'bg-warn' : 'bg-blocker'
  return (
    <div className={`w-full overflow-hidden rounded-full bg-line ${size === 'sm' ? 'h-1.5' : 'h-2'}`}>
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(2, score)}%` }} />
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-ink-faint">{children}</p>
}

export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <span className="mb-1 block text-[13px] font-medium text-ink-soft">
      {children}
      {hint && <span className="ml-1.5 font-normal text-ink-faint">{hint}</span>}
    </span>
  )
}

const FIELD = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/15'

export function Input(p: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={`${FIELD} ${p.className ?? ''}`} />
}

export function Textarea(p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={`${FIELD} ${p.className ?? ''}`} />
}

export function Select(p: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={`${FIELD} ${p.className ?? ''}`} />
}

const BTN = {
  primary: 'bg-accent text-white hover:bg-accent/90',
  secondary: 'border border-line bg-surface text-ink hover:bg-canvas',
  ghost: 'text-ink-soft hover:bg-canvas',
  danger: 'border border-blocker/30 bg-surface text-blocker hover:bg-blocker-soft',
} as const

export function Button({
  variant = 'primary', className = '', ...p
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BTN }) {
  return (
    <button
      {...p}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${BTN[variant]} ${className}`}
    />
  )
}

export function LinkButton({
  href, variant = 'secondary', children, className = '',
}: { href: string; variant?: keyof typeof BTN; children: ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${BTN[variant]} ${className}`}
    >
      {children}
    </Link>
  )
}

/** 서버 액션 결과 메시지 */
export function Notice({
  tone = 'neutral', children,
}: { tone?: keyof typeof TONES; children: ReactNode }) {
  return (
    <div className={`rounded-lg border px-3.5 py-2.5 text-sm ${TONES[tone]}`}>{children}</div>
  )
}
