import { COACH } from '@/lib/domain'
import { syncQuestions, todaysQuestions, pendingCount } from '@/lib/repo/coach'
import { Card, Empty } from '@/components/ui'
import { CoachCard } from '@/components/CoachCard'
import { answerQuestion, dismiss } from './actions'

export const dynamic = 'force-dynamic'
export const metadata = { title: '코칭 · 청빙 작업대' }

/** 규칙별로 기본 제안 타입. 사용자가 최종 확정한다. */
const SUGGESTED: Record<string, string> = {
  timeline_gap: 'career',
  missing_metric: 'metric',
  weak_evidence: 'episode',
  corpus_gap: 'competency',
  stale_asset: 'competency',
}

export default async function CoachPage() {
  await syncQuestions()
  const [questions, pending] = await Promise.all([todaysQuestions(), pendingCount()])

  return (
    <main className="mx-auto max-w-3xl space-y-5">
      <Card
        title={`오늘의 질문 ${questions.length}개`}
        subtitle={`대기 중인 질문 ${pending}개 중 우선순위 상위 ${COACH.dailyCount}개입니다. 같은 날에는 같은 질문이 나옵니다.`}
      >
        <p className="text-sm text-ink-soft">
          이 도구는 서류를 써주지 않습니다. 묻습니다. 답하면 그 답이 자산 조각이 되고,
          조각이 쌓이면 서류는 조립됩니다.
        </p>
      </Card>

      {questions.length === 0 ? (
        <Card><Empty>지금은 물어볼 것이 없습니다. 자산을 더 쌓으면 질문이 생깁니다.</Empty></Card>
      ) : (
        <ul className="space-y-4">
          {questions.map((q) => (
            <CoachCard
              key={q.id}
              question={q}
              answerAction={answerQuestion}
              dismissAction={dismiss}
              suggestedType={SUGGESTED[q.ruleCode] ?? 'episode'}
            />
          ))}
        </ul>
      )}
    </main>
  )
}
