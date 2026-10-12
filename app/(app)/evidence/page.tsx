import Link from 'next/link'
import { EVIDENCE_TYPES, EVIDENCE_TYPE_META, EVIDENCE_SOURCE_LABEL } from '@/lib/domain'
import { formatPeriod } from '@/lib/date'
import { allTags, countsByType, listEvidence } from '@/lib/repo/evidence'
import { listUploads, listCandidates } from '@/lib/repo/uploads'
import { SUPPORTED_EXTENSIONS } from '@/lib/extract'
import { llmAvailable } from '@/lib/env'
import {
  Badge, Button, Card, Empty, Input, Label, Notice, Select,
} from '@/components/ui'
import { EvidenceForm } from '@/components/EvidenceForm'
import { addEvidence, removeEvidence, uploadDocument } from './actions'

export const dynamic = 'force-dynamic'
export const metadata = { title: '자산 은행 · 청빙 작업대' }

export default async function EvidencePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; tag?: string; q?: string }>
}) {
  const sp = await searchParams
  const type = (EVIDENCE_TYPES as readonly string[]).includes(sp.type ?? '')
    ? (sp.type as (typeof EVIDENCE_TYPES)[number]) : undefined

  const [items, counts, tags, uploads] = await Promise.all([
    listEvidence({ type, tag: sp.tag || undefined, q: sp.q || undefined }),
    countsByType(),
    allTags(),
    listUploads(),
  ])

  const pendingPerUpload = await Promise.all(
    uploads.map(async (u) => ({
      upload: u,
      pending: (await listCandidates(u.id, 'pending')).length,
    })),
  )
  const total = Object.values(counts).reduce((a, b) => a + b, 0)

  return (
    <main className="space-y-5">
      <Card
        title={`자산 조각 ${total}개`}
        subtitle="조각이 쌓여 있으면 어떤 공고가 와도 조립됩니다. 조각이 없으면 매번 기억을 짜내야 합니다."
      >
        <div className="flex flex-wrap gap-1.5">
          <Link href="/evidence">
            <Badge tone={!type ? 'accent' : 'neutral'}>전체 {total}</Badge>
          </Link>
          {EVIDENCE_TYPES.map((t) => (
            <Link key={t} href={`/evidence?type=${t}`}>
              <Badge tone={type === t ? 'accent' : 'neutral'}>
                {EVIDENCE_TYPE_META[t].label} {counts[t] ?? 0}
              </Badge>
            </Link>
          ))}
        </div>

        <form className="mt-4 flex flex-wrap items-end gap-2">
          {type && <input type="hidden" name="type" value={type} />}
          <div className="min-w-40 flex-1">
            <Label>검색</Label>
            <Input name="q" defaultValue={sp.q ?? ''} placeholder="제목·내용" />
          </div>
          <div className="w-40">
            <Label>태그</Label>
            <Select name="tag" defaultValue={sp.tag ?? ''}>
              <option value="">전체</option>
              {tags.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </div>
          <Button type="submit" variant="secondary">적용</Button>
        </form>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title={`조각 목록 ${items.length}개`}>
            {items.length === 0 ? (
              <Empty>조각이 없습니다. 오른쪽에서 직접 추가하거나 과거 서류를 올려보세요.</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {items.map((e) => (
                  <li key={e.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone="neutral">{EVIDENCE_TYPE_META[e.type].label}</Badge>
                          <Link href={`/evidence/${e.id}`} className="font-medium hover:text-accent">
                            {e.title}
                          </Link>
                          {e.verified
                            ? <Badge tone="ok">확인됨</Badge>
                            : <Badge tone="warn">미확인</Badge>}
                          <Badge tone={e.strength <= 2 ? 'blocker' : 'neutral'}>강도 {e.strength}</Badge>
                        </div>
                        {e.body && (
                          <p className="mt-1 line-clamp-2 text-[13px] text-ink-soft">{e.body}</p>
                        )}
                        <p className="mt-1 text-[12px] text-ink-faint">
                          {formatPeriod(e.periodFrom, e.periodTo)}
                          {' · '}{EVIDENCE_SOURCE_LABEL[e.source]}
                          {e.tags.length > 0 && ` · ${e.tags.join(', ')}`}
                        </p>
                      </div>
                      <form action={removeEvidence} className="shrink-0">
                        <input type="hidden" name="id" value={e.id} />
                        <Button type="submit" variant="ghost" className="px-1.5 py-0.5 text-[12px]">삭제</Button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            title="과거 서류 업로드"
            subtitle={`${SUPPORTED_EXTENSIONS.join(' / ')} — 조각 후보로 분해하고, 승인한 것만 저장합니다`}
          >
            {!llmAvailable() ? (
              <Notice tone="warn">
                ANTHROPIC_API_KEY 가 없어 자동 분해가 비활성화돼 있습니다.
                파일은 보관되고, 키를 넣은 뒤 다시 올리면 분해됩니다.
              </Notice>
            ) : (
              <form action={uploadDocument} className="flex flex-wrap items-end gap-2">
                <div className="min-w-48 flex-1">
                  <Label>파일</Label>
                  <Input type="file" name="file" required accept={SUPPORTED_EXTENSIONS.join(',')} />
                </div>
                <Button type="submit" variant="secondary">올려서 분해</Button>
              </form>
            )}

            {pendingPerUpload.length > 0 && (
              <ul className="mt-4 divide-y divide-line border-t border-line pt-3">
                {pendingPerUpload.map(({ upload, pending }) => (
                  <li key={upload.id} className="flex items-center justify-between gap-3 py-2">
                    <Link href={`/evidence/uploads/${upload.id}`} className="min-w-0 truncate text-[13.5px] hover:text-accent">
                      {upload.filename}
                    </Link>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {upload.extractStatus === 'failed' && <Badge tone="blocker">추출 실패</Badge>}
                      {upload.analysisStatus === 'failed' && <Badge tone="warn">분해 실패</Badge>}
                      {pending > 0 && <Badge tone="accent">승인 대기 {pending}</Badge>}
                      {pending === 0 && upload.analysisStatus === 'analyzed' && <Badge tone="ok">처리 완료</Badge>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card title="조각 직접 추가">
          <EvidenceForm action={addEvidence} />
        </Card>
      </div>
    </main>
  )
}
