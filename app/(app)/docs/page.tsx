import Link from 'next/link'
import { loadDashboard } from '@/lib/dashboard'
import { refreshAllReadiness } from '@/lib/repo/docs'
import { DOC_TYPE_META } from '@/lib/domain'
import { formatKorean } from '@/lib/date'
import { Badge, Card, ScoreBar, severityLabel, severityTone } from '@/components/ui'

export const dynamic = 'force-dynamic'
export const metadata = { title: '서류 작업대 · 청빙 작업대' }

export default async function DocsPage() {
  await refreshAllReadiness()
  const dash = await loadDashboard()

  return (
    <main className="space-y-5">
      <Card
        title="서류 작업대"
        subtitle="마스터 9종. 공고와 무관하게 여기를 채워 두는 게 본체입니다."
      >
        <p className="text-sm text-ink-soft">
          재사용성이 <strong>낮음</strong>인 두 종류(목회계획서·설교 영상)만 매번 손이 갑니다.
          나머지 7종은 한 번 잘 만들어 두면 공고가 떠도 급할 일이 없습니다.
        </p>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {dash.docs.map((d) => {
          const meta = DOC_TYPE_META[d.docType]
          return (
            <section key={d.docType} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/docs/${d.docType}`} className="font-semibold hover:text-accent">
                    {d.label}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {d.complete
                      ? <Badge tone="ok">완료</Badge>
                      : d.doc ? <Badge tone="warn">작성중</Badge> : <Badge>미작성</Badge>}
                    <Badge tone={meta.reuse === '낮음' ? 'warn' : 'neutral'}>재사용 {meta.reuse}</Badge>
                    {d.doc && <span className="text-[12px] text-ink-faint">v{d.doc.version}</span>}
                    {meta.kind === 'media' && d.doc?.validUntil && (
                      <Badge tone="neutral">신선도 {formatKorean(d.doc.validUntil)}까지</Badge>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-xl font-semibold tabular-nums">{d.score}</div>
                  <div className="text-[11px] text-ink-faint">완성도</div>
                </div>
              </div>

              <div className="mt-3"><ScoreBar score={d.score} size="sm" /></div>

              <p className="mt-3 text-[13px] text-ink-faint">{meta.note}</p>

              {d.topIssues.length > 0 && (
                <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
                  {d.topIssues.map((it, i) => (
                    <li key={i} className="flex gap-2 text-[13px]">
                      <Badge tone={severityTone(it.severity)}>{severityLabel(it.severity)}</Badge>
                      <span className="min-w-0 text-ink-soft">{it.label}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        })}
      </div>
    </main>
  )
}
