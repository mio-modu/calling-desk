import Link from 'next/link'
import { loadDashboard } from '@/lib/dashboard'
import { syncQuestions, todaysQuestions } from '@/lib/repo/coach'
import { refreshAllReadiness } from '@/lib/repo/docs'
import { COMPLETION } from '@/lib/domain'
import { daysUntil, formatKorean, kstTodayISO } from '@/lib/date'
import { Badge, Card, Empty, LinkButton, ScoreBar, severityLabel, severityTone } from '@/components/ui'

export const dynamic = 'force-dynamic'
export const metadata = { title: '준비도 · 청빙 작업대' }

export default async function DashboardPage() {
  // 들어올 때마다 점수와 질문을 현재 자산 상태로 맞춘다.
  // 공고가 없어도 이 숫자가 오르는 게 매일의 작업이다.
  await refreshAllReadiness()
  await syncQuestions()

  const [dash, questions] = await Promise.all([loadDashboard(), todaysQuestions()])
  const today = kstTodayISO()
  const pct = Math.round((dash.complete / dash.total) * 100)

  return (
    <main className="space-y-5">
      <Card
        title={`${dash.total}종 중 ${dash.complete}종 완료`}
        subtitle={`서류 ${dash.docsComplete}/${dash.docs.length} · 증빙 ${dash.credentialsComplete}/${dash.credentials.length} — 완료 기준은 서류 완성도 ${COMPLETION.docMinScore}점 이상이고 필수 지적이 0건, 증빙은 보유중이며 유효기간 내`}
      >
        <div className="flex items-center gap-4">
          <div className="flex-1"><ScoreBar score={pct} /></div>
          <span className="shrink-0 text-2xl font-semibold tabular-nums">{pct}%</span>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-5">
        <Card
          className="lg:col-span-3"
          title="오늘의 코칭 질문"
          subtitle="답하면 자산 조각이 됩니다"
          action={<LinkButton href="/coach">코칭으로</LinkButton>}
        >
          {questions.length === 0 ? (
            <Empty>지금은 물어볼 것이 없습니다. 자산을 더 쌓으면 질문이 생깁니다.</Empty>
          ) : (
            <ol className="space-y-3">
              {questions.map((q) => (
                <li key={q.id} className="rounded-lg border border-line p-3.5">
                  <p className="text-[15px] font-medium leading-snug">{q.question}</p>
                  <p className="mt-1.5 text-[13px] text-ink-faint">{q.rationale}</p>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card
          className="lg:col-span-2"
          title="유효기간 임박"
          subtitle={`${COMPLETION.credentialWarnDays}일 이내 또는 이미 지난 것`}
          action={<LinkButton href="/credentials">증빙 관리</LinkButton>}
        >
          {dash.expiring.length === 0 ? (
            <Empty>임박한 것이 없습니다.</Empty>
          ) : (
            <ul className="space-y-2.5">
              {dash.expiring.map((c) => {
                const left = daysUntil(c.validUntil!, today)
                return (
                  <li key={c.id} className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm">{c.docName}</span>
                    <Badge tone={left < 0 ? 'blocker' : 'warn'}>
                      {left < 0 ? `${-left}일 지남` : `D-${left}`} · {formatKorean(c.validUntil)}
                    </Badge>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card
        title="서류별 완성도"
        subtitle="점수보다 '무엇이 빠졌는지'가 중요합니다"
        action={<LinkButton href="/docs">작업대로</LinkButton>}
      >
        <ul className="divide-y divide-line">
          {dash.docs.map((d) => (
            <li key={d.docType} className="py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <Link href={`/docs/${d.docType}`} className="font-medium hover:text-accent">
                  {d.label}
                </Link>
                {d.complete
                  ? <Badge tone="ok">완료</Badge>
                  : d.doc ? <Badge tone="warn">작성중</Badge> : <Badge>미작성</Badge>}
                {d.doc && <span className="text-[12px] text-ink-faint">v{d.doc.version}</span>}
                <span className="ml-auto flex items-center gap-2.5">
                  {d.blockerCount > 0 && <Badge tone="blocker">필수 {d.blockerCount}건</Badge>}
                  <span className="w-24"><ScoreBar score={d.score} size="sm" /></span>
                  <span className="w-9 text-right text-sm tabular-nums text-ink-soft">{d.score}</span>
                </span>
              </div>
              {d.topIssues.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {d.topIssues.map((it, i) => (
                    <li key={i} className="flex gap-2 text-[13px] text-ink-soft">
                      <Badge tone={severityTone(it.severity)}>{severityLabel(it.severity)}</Badge>
                      <span className="min-w-0">{it.label}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </main>
  )
}
