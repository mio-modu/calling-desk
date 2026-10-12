import Link from 'next/link'
import { notFound } from 'next/navigation'
import { EVIDENCE_TYPES, EVIDENCE_TYPE_META } from '@/lib/domain'
import { getUpload, listCandidates } from '@/lib/repo/uploads'
import {
  Badge, Button, Card, Empty, Input, Label, Notice, Select, Textarea,
} from '@/components/ui'
import { approveCandidates, removeUpload } from '../../actions'

export const dynamic = 'force-dynamic'

export default async function UploadReviewPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const upload = await getUpload(id)
  if (!upload) notFound()

  const [pending, accepted, rejected] = await Promise.all([
    listCandidates(id, 'pending'),
    listCandidates(id, 'accepted'),
    listCandidates(id, 'rejected'),
  ])

  return (
    <main className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/evidence" className="text-[13px] text-ink-faint hover:text-accent">← 자산 은행</Link>
        <h1 className="text-lg font-semibold">{upload.filename}</h1>
        {pending.length > 0 && <Badge tone="accent">승인 대기 {pending.length}</Badge>}
        {accepted.length > 0 && <Badge tone="ok">저장됨 {accepted.length}</Badge>}
        {rejected.length > 0 && <Badge>버림 {rejected.length}</Badge>}
        <form action={removeUpload} className="ml-auto">
          <input type="hidden" name="id" value={upload.id} />
          <Button type="submit" variant="danger">업로드 삭제</Button>
        </form>
      </div>

      {upload.extractStatus === 'failed' && (
        <Notice tone="blocker">텍스트 추출 실패 — {upload.extractError}</Notice>
      )}
      {upload.analysisStatus === 'failed' && (
        <Notice tone="warn">{upload.analysisError}</Notice>
      )}

      <Card
        title="조각 후보"
        subtitle="체크한 것만 자산 은행에 저장됩니다. 체크하지 않은 것은 버려집니다."
      >
        {pending.length === 0 ? (
          <Empty>
            {accepted.length + rejected.length > 0
              ? '이 업로드는 이미 처리했습니다.'
              : '후보가 없습니다.'}
          </Empty>
        ) : (
          <form action={approveCandidates} className="space-y-4">
            <input type="hidden" name="uploadId" value={upload.id} />

            <Notice tone="warn">
              날짜와 숫자는 <strong>원문 인용과 대조</strong>해 주세요. 원문에 없던 값은 비워져 있습니다.
              저장되는 조각은 전부 <strong>미확인(verified=false)</strong> 상태로 들어갑니다 —
              대조를 마친 뒤 자산 은행에서 직접 &lsquo;확인됨&rsquo;으로 바꾸세요.
            </Notice>

            <ul className="space-y-4">
              {pending.map((c) => (
                <li key={c.id} className="rounded-lg border border-line p-4">
                  <input type="hidden" name="allIds" value={c.id} />

                  <label className="flex items-center gap-2 pb-3 font-medium">
                    <input type="checkbox" name="chosen" value={c.id} defaultChecked className="size-4" />
                    저장
                  </label>

                  {c.sourceQuote && (
                    <blockquote className="mb-3 border-l-2 border-line bg-canvas px-3 py-2 text-[12.5px] text-ink-soft">
                      <span className="mb-0.5 block text-[11px] font-medium text-ink-faint">원문 인용</span>
                      {c.sourceQuote}
                    </blockquote>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label>타입</Label>
                      <Select name={`type:${c.id}`} defaultValue={c.type}>
                        {EVIDENCE_TYPES.map((t) => (
                          <option key={t} value={t}>{EVIDENCE_TYPE_META[t].label} ({t})</option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <Label>근거 강도</Label>
                      <Select name={`strength:${c.id}`} defaultValue="3">
                        {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                      </Select>
                    </div>
                  </div>

                  <div className="mt-3">
                    <Label>제목</Label>
                    <Input name={`title:${c.id}`} defaultValue={c.title} />
                  </div>

                  <div className="mt-3">
                    <Label>내용</Label>
                    <Textarea name={`body:${c.id}`} rows={3} defaultValue={c.body} />
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div>
                      <Label hint={c.periodFrom ? undefined : '— 원문에 없었음'}>시작</Label>
                      <Input type="date" name={`periodFrom:${c.id}`} defaultValue={c.periodFrom ?? ''} />
                    </div>
                    <div>
                      <Label hint={c.periodTo ? undefined : '— 원문에 없었음'}>종료</Label>
                      <Input type="date" name={`periodTo:${c.id}`} defaultValue={c.periodTo ?? ''} />
                    </div>
                    <div>
                      <Label>태그</Label>
                      <Input name={`tags:${c.id}`} defaultValue={c.tags.join(', ')} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <Button type="submit">체크한 것만 저장</Button>
          </form>
        )}
      </Card>

      {upload.extractedText && (
        <Card title="추출된 원문" subtitle="대조용">
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink-soft">
            {upload.extractedText}
          </pre>
        </Card>
      )}
    </main>
  )
}
