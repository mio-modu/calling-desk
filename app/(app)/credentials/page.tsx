import { COMPLETION, CREDENTIAL_STATUSES, CREDENTIAL_STATUS_LABEL } from '@/lib/domain'
import { daysUntil, formatKorean, kstTodayISO } from '@/lib/date'
import { isCredentialComplete, listCredentials } from '@/lib/repo/credentials'
import { Badge, Button, Card, Input, Label, Notice, Select } from '@/components/ui'
import { saveCredential } from './actions'

export const dynamic = 'force-dynamic'
export const metadata = { title: '증빙 관리 · 청빙 작업대' }

export default async function CredentialsPage() {
  const credentials = await listCredentials()
  const today = kstTodayISO()
  const done = credentials.filter((c) => isCredentialComplete(c, today)).length

  return (
    <main className="space-y-5">
      <Card
        title={`증빙 ${credentials.length}종 중 ${done}종 보유`}
        subtitle="리드타임이 긴 것부터 신청해 두는 게 '공고를 늦게 알아서 못 낸다'를 구조적으로 없앱니다."
      >
        <Notice tone="neutral">
          노회 발급분(안수증명·소속증명)이 최대 21일, 추천서는 타인의 시간에 달려 있습니다.
          이 두 가지를 먼저 걸어두세요.
        </Notice>
      </Card>

      <div className="space-y-3">
        {credentials.map((c) => {
          const left = c.validUntil ? daysUntil(c.validUntil, today) : null
          const expiring = left !== null && left <= COMPLETION.credentialWarnDays
          const complete = isCredentialComplete(c, today)

          return (
            <section key={c.id} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12px] tabular-nums text-ink-faint">#{c.seq}</span>
                <h2 className="font-semibold">{c.docName}</h2>
                {complete
                  ? <Badge tone="ok">보유중</Badge>
                  : c.status === 'requested' ? <Badge tone="warn">신청함</Badge> : <Badge>미착수</Badge>}
                {left !== null && expiring && (
                  <Badge tone={left < 0 ? 'blocker' : 'warn'}>
                    {left < 0 ? `${-left}일 지남` : `D-${left}`}
                  </Badge>
                )}
                {!c.reusable && <Badge tone="warn">유효기간 주의</Badge>}
                <span className="ml-auto text-[12.5px] text-ink-faint">
                  {c.issuer} · 리드타임 {c.leadTimeNote ?? (c.leadTimeDays != null ? `${c.leadTimeDays}일` : '미확인')}
                </span>
              </div>

              {c.warning && (
                <div className="mt-2.5">
                  <Notice tone={c.seq === 19 ? 'blocker' : 'warn'}>{c.warning}</Notice>
                </div>
              )}

              <form action={saveCredential} className="mt-3 grid gap-3 sm:grid-cols-5">
                <input type="hidden" name="id" value={c.id} />
                <div>
                  <Label>상태</Label>
                  <Select name="status" defaultValue={c.status}>
                    {CREDENTIAL_STATUSES.map((s) => (
                      <option key={s} value={s}>{CREDENTIAL_STATUS_LABEL[s]}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>신청일</Label>
                  <Input type="date" name="requestedAt" defaultValue={c.requestedAt ?? ''} />
                </div>
                <div>
                  <Label>수령일</Label>
                  <Input type="date" name="receivedAt" defaultValue={c.receivedAt ?? ''} />
                </div>
                <div>
                  <Label hint={c.reusable ? '— 없으면 비움' : '— 필수'}>유효기한</Label>
                  <Input type="date" name="validUntil" defaultValue={c.validUntil ?? ''} />
                </div>
                <div className="flex items-end">
                  <Button type="submit" variant="secondary" className="w-full">저장</Button>
                </div>
                <div className="sm:col-span-5">
                  <Label>메모</Label>
                  <Input name="note" defaultValue={c.note} placeholder="담당자, 발급 방법, 비용 등" />
                </div>
              </form>

              {complete && c.validUntil && (
                <p className="mt-2 text-[12.5px] text-ok">
                  보유중 ({formatKorean(c.validUntil)}까지) — 공고가 떠도 이 항목은 신청할 필요가 없습니다.
                </p>
              )}
            </section>
          )
        })}
      </div>
    </main>
  )
}
