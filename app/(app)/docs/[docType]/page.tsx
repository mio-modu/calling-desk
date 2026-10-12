import Link from 'next/link'
import { notFound } from 'next/navigation'
import { DOC_TYPES, DOC_TYPE_META, type DocType } from '@/lib/domain'
import { addDays, formatKorean, formatPeriod } from '@/lib/date'
import { llmAvailable } from '@/lib/env'
import {
  getActiveDoc, listLinks, listVersions, refreshReadiness,
} from '@/lib/repo/docs'
import { listEvidence } from '@/lib/repo/evidence'
import {
  Badge, Button, Card, Empty, Label, ScoreBar, Select, severityLabel, severityTone,
} from '@/components/ui'
import { DocEditor } from '@/components/DocEditor'
import { PolishPanel } from '@/components/PolishPanel'
import { addLink, createOutline, polishText, removeLink, saveVersion } from '../actions'

export const dynamic = 'force-dynamic'

const TABS = [
  { key: 'issues', label: '코칭 지적' },
  { key: 'evidence', label: '연결된 조각' },
  { key: 'versions', label: '버전' },
] as const

export default async function DocEditorPage({
  params, searchParams,
}: {
  params: Promise<{ docType: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { docType: raw } = await params
  if (!(DOC_TYPES as readonly string[]).includes(raw)) notFound()
  const docType = raw as DocType
  const meta = DOC_TYPE_META[docType]

  const tab = (await searchParams).tab ?? 'issues'
  const doc = await getActiveDoc(docType)

  const [links, versions, evidence] = await Promise.all([
    doc ? listLinks(doc.id) : Promise.resolve([]),
    listVersions(docType),
    listEvidence(),
  ])

  // 저장 직후나 자산이 바뀐 뒤 점수를 최신으로 맞춘다.
  const readiness = doc ? await refreshReadiness(doc) : { score: 0, detail: [] }
  const linkedIds = new Set(links.map((l) => l.evidenceId))
  const shotOn = doc?.validUntil ? addDays(doc.validUntil, -(meta.freshnessDays ?? 180)) : ''

  return (
    <main className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link href="/docs" className="text-[13px] text-ink-faint hover:text-accent">← 작업대</Link>
        <h1 className="text-lg font-semibold">{meta.label}</h1>
        {doc ? <Badge tone="accent">v{doc.version}</Badge> : <Badge>미작성</Badge>}
        <Badge tone={meta.reuse === '낮음' ? 'warn' : 'neutral'}>재사용 {meta.reuse}</Badge>
        <span className="ml-auto flex items-center gap-2">
          <span className="w-28"><ScoreBar score={readiness.score} size="sm" /></span>
          <span className="text-sm tabular-nums text-ink-soft">{readiness.score}점</span>
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ── 좌: 본문 ── */}
        <div className="space-y-4 lg:col-span-2">
          <Card
            title="본문"
            subtitle={meta.note}
            action={
              !doc?.contentMd.trim() ? (
                <form action={createOutline}>
                  <input type="hidden" name="docType" value={docType} />
                  <Button type="submit" variant="secondary">뼈대 세우기</Button>
                </form>
              ) : null
            }
          >
            <DocEditor
              /*
               * 활성 버전이 바뀌면 에디터를 다시 마운트해야 한다.
               * 본문은 client state(useState)로 들고 있어서, 서버 액션이
               * 새 버전을 만들고 revalidate 해도 key 가 그대로면 예전 state 가 남는다.
               * (뼈대 세우기를 눌러도 화면이 비어 보이고, 그대로 저장하면 뼈대가 날아간다.)
               */
              key={doc?.id ?? 'empty'}
              action={saveVersion}
              docType={docType}
              initialTitle={doc?.title ?? meta.label}
              initialContent={doc?.contentMd ?? ''}
              initialShotOn={shotOn}
              isMedia={meta.kind === 'media'}
              freshnessDays={meta.freshnessDays ?? 180}
              placeholder={
                meta.kind === 'media'
                  ? '영상 링크와 설교 본문·제목을 적어두세요.'
                  : '여기에 직접 쓰세요. 백지가 막막하면 위의 "뼈대 세우기"로 목차만 먼저 세울 수 있습니다.'
              }
            />
          </Card>

          <Card title="문장 다듬기" subtitle="허용된 LLM 사용 두 가지 중 하나">
            <PolishPanel action={polishText} available={llmAvailable()} />
          </Card>
        </div>

        {/* ── 우: 사이드바 ── */}
        <div className="space-y-4">
          <div className="flex gap-1 rounded-lg border border-line bg-surface p-1">
            {TABS.map((t) => (
              <Link
                key={t.key}
                href={`/docs/${docType}?tab=${t.key}`}
                className={`flex-1 rounded-md px-2 py-1.5 text-center text-[13px] font-medium transition ${
                  tab === t.key ? 'bg-accent-soft text-accent' : 'text-ink-soft hover:bg-canvas'
                }`}
              >
                {t.label}
                {t.key === 'issues' && readiness.detail.length > 0 && ` ${readiness.detail.length}`}
                {t.key === 'evidence' && links.length > 0 && ` ${links.length}`}
              </Link>
            ))}
          </div>

          {tab === 'issues' && (
            <Card title="빠진 항목" subtitle="고쳐주지 않고 지적만 합니다">
              {readiness.detail.length === 0 ? (
                <Empty>지적할 것이 없습니다.</Empty>
              ) : (
                <ul className="space-y-3">
                  {readiness.detail.map((it, i) => (
                    <li key={i} className="border-b border-line pb-3 last:border-0 last:pb-0">
                      <div className="flex gap-2">
                        <Badge tone={severityTone(it.severity)}>{severityLabel(it.severity)}</Badge>
                        <p className="min-w-0 text-[13.5px] font-medium leading-snug">{it.label}</p>
                      </div>
                      {it.hint && <p className="mt-1 pl-1 text-[12.5px] text-ink-faint">{it.hint}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {tab === 'evidence' && (
            <Card title="연결된 자산 조각" subtitle="주장마다 근거가 붙어 있어야 면접에서 버팁니다">
              {!doc ? (
                <Empty>먼저 본문을 한 번 저장하세요.</Empty>
              ) : (
                <>
                  <form action={addLink} className="space-y-2 border-b border-line pb-4">
                    <input type="hidden" name="docId" value={doc.id} />
                    <input type="hidden" name="docType" value={docType} />
                    <div>
                      <Label>조각</Label>
                      <Select name="evidenceId" required defaultValue="">
                        <option value="" disabled>조각 선택…</option>
                        {evidence
                          .filter((e) => !linkedIds.has(e.id))
                          .map((e) => (
                            <option key={e.id} value={e.id}>
                              [{e.type}] {e.title}
                            </option>
                          ))}
                      </Select>
                    </div>
                    <div>
                      <Label>어느 섹션의 근거인가</Label>
                      <Select name="section" defaultValue={meta.sections[0]?.key ?? ''}>
                        {meta.sections.map((s) => (
                          <option key={s.key} value={s.key}>{s.label}</option>
                        ))}
                      </Select>
                    </div>
                    <Button type="submit" variant="secondary">연결</Button>
                  </form>

                  {links.length === 0 ? (
                    <Empty>아직 연결된 조각이 없습니다.</Empty>
                  ) : (
                    <ul className="mt-3 space-y-2.5">
                      {links.map((l) => {
                        const label = meta.sections.find((s) => s.key === l.section)?.label ?? '문서 전체'
                        return (
                          <li key={l.id} className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-[13.5px] font-medium">{l.evidence.title}</p>
                              <p className="text-[12px] text-ink-faint">
                                {label} · {l.evidence.type}
                                {!l.evidence.verified && ' · 미확인'}
                              </p>
                            </div>
                            <form action={removeLink}>
                              <input type="hidden" name="linkId" value={l.id} />
                              <input type="hidden" name="docType" value={docType} />
                              <Button type="submit" variant="ghost" className="px-1.5 py-0.5 text-[12px]">해제</Button>
                            </form>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </>
              )}
            </Card>
          )}

          {tab === 'versions' && (
            <Card title="버전 히스토리" subtitle="이전 버전은 지워지지 않습니다">
              {versions.length === 0 ? (
                <Empty>아직 저장된 버전이 없습니다.</Empty>
              ) : (
                <ol className="space-y-3">
                  {versions.map((v) => (
                    <li key={v.id} className="border-b border-line pb-3 last:border-0 last:pb-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">v{v.version}</span>
                        {v.isActive && <Badge tone="accent">활성</Badge>}
                        <span className="ml-auto text-[12px] tabular-nums text-ink-faint">
                          {v.readinessScore ?? '—'}점
                        </span>
                      </div>
                      <p className="mt-1 text-[13px] text-ink-soft">{v.note || '(이유 없음)'}</p>
                      <p className="text-[12px] text-ink-faint">{formatKorean(v.createdAt)}</p>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          )}

          <Card title="섹션 체크리스트" subtitle="Phase 2 에서 코퍼스 기준으로 교체됩니다">
            <ul className="space-y-1.5 text-[13px]">
              {meta.sections.map((s) => (
                <li key={s.key} className="flex gap-2">
                  <span className={s.required ? 'text-blocker' : 'text-ink-faint'}>
                    {s.required ? '●' : '○'}
                  </span>
                  <span>
                    <span className="font-medium">{s.label}</span>
                    <span className="text-ink-faint"> — {s.hint}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          {meta.checksTimeline && (
            <Card title="연표" subtitle="career 조각의 기간으로 공백을 탐지합니다">
              {evidence.filter((e) => e.type === 'career').length === 0 ? (
                <Empty>경력 조각이 없습니다.</Empty>
              ) : (
                <ul className="space-y-1.5 text-[13px]">
                  {evidence.filter((e) => e.type === 'career').map((e) => (
                    <li key={e.id} className="flex justify-between gap-2">
                      <span className="truncate">{e.title}</span>
                      <span className="shrink-0 tabular-nums text-ink-faint">
                        {formatPeriod(e.periodFrom, e.periodTo)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>
      </div>
    </main>
  )
}
