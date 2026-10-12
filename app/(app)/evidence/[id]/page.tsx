import Link from 'next/link'
import { notFound } from 'next/navigation'
import { EVIDENCE_SOURCE_LABEL } from '@/lib/domain'
import { formatKorean } from '@/lib/date'
import { getEvidence } from '@/lib/repo/evidence'
import { Badge, Card } from '@/components/ui'
import { EvidenceForm } from '@/components/EvidenceForm'
import { editEvidence } from '../actions'

export const dynamic = 'force-dynamic'

export default async function EvidenceDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const e = await getEvidence(id)
  if (!e) notFound()

  return (
    <main className="mx-auto max-w-2xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/evidence" className="text-[13px] text-ink-faint hover:text-accent">← 자산 은행</Link>
        <h1 className="text-lg font-semibold">{e.title}</h1>
        {e.verified ? <Badge tone="ok">확인됨</Badge> : <Badge tone="warn">미확인</Badge>}
      </div>

      {e.sourceQuote && (
        <Card title="원문 인용" subtitle={`${EVIDENCE_SOURCE_LABEL[e.source]} · 수치·날짜 대조용`}>
          <blockquote className="border-l-2 border-line bg-canvas px-3 py-2 text-[13px] text-ink-soft">
            {e.sourceQuote}
          </blockquote>
        </Card>
      )}

      <Card title="조각 수정" subtitle={`등록 ${formatKorean(e.createdAt)} · 수정 ${formatKorean(e.updatedAt)}`}>
        <EvidenceForm
          action={editEvidence}
          submitLabel="저장"
          initial={{
            id: e.id, type: e.type, title: e.title, body: e.body,
            periodFrom: e.periodFrom, periodTo: e.periodTo,
            tags: e.tags, strength: e.strength, verified: e.verified,
          }}
        />
      </Card>
    </main>
  )
}
