'use client'

import { useState } from 'react'
import { EVIDENCE_TYPES, EVIDENCE_TYPE_META } from '@/lib/domain'
import { Badge, Button, Input, Label, Select, Textarea } from './ui'

const RULE_LABEL: Record<string, string> = {
  timeline_gap: '연표 공백',
  missing_metric: '수치 없음',
  corpus_gap: '코퍼스 대비 부족',
  weak_evidence: '근거 약함',
  stale_asset: '갱신 필요',
}

export function CoachCard({
  question, answerAction, dismissAction, suggestedType,
}: {
  question: { id: string; question: string; rationale: string; ruleCode: string }
  answerAction: (formData: FormData) => void | Promise<void>
  dismissAction: (formData: FormData) => void | Promise<void>
  suggestedType: string
}) {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState(suggestedType)

  return (
    <li className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start gap-2">
        <Badge tone="neutral">{RULE_LABEL[question.ruleCode] ?? question.ruleCode}</Badge>
      </div>
      <p className="mt-2 text-[15.5px] font-medium leading-snug">{question.question}</p>
      <p className="mt-1.5 text-[13px] text-ink-faint">{question.rationale}</p>

      {!open ? (
        <div className="mt-3 flex items-center gap-2">
          <Button type="button" onClick={() => setOpen(true)}>답하기</Button>
          <form action={dismissAction}>
            <input type="hidden" name="questionId" value={question.id} />
            <Button type="submit" variant="ghost">나중에 (30일)</Button>
          </form>
        </div>
      ) : (
        <form action={answerAction} className="mt-3 space-y-3 border-t border-line pt-3">
          <input type="hidden" name="questionId" value={question.id} />

          <div>
            <Label>답변 — 그대로 조각이 됩니다</Label>
            <Textarea name="body" rows={4} required autoFocus
              placeholder="사실 중심으로. 숫자가 있으면 반드시 넣으세요." />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label hint="— 제안된 타입입니다. 바꿀 수 있습니다">타입</Label>
              <Select name="type" value={type} onChange={(e) => setType(e.target.value)}>
                {EVIDENCE_TYPES.map((t) => (
                  <option key={t} value={t}>{EVIDENCE_TYPE_META[t].label} ({t})</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>근거 강도</Label>
              <Select name="strength" defaultValue="3">
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
              </Select>
            </div>
          </div>

          <div>
            <Label hint="— 비우면 질문 앞부분이 제목이 됩니다">제목</Label>
            <Input name="title" placeholder="예: 2016~2018 신대원 재학" />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>시작</Label>
              <Input type="date" name="periodFrom" />
            </div>
            <div>
              <Label>종료</Label>
              <Input type="date" name="periodTo" />
            </div>
            <div>
              <Label>태그</Label>
              <Input name="tags" placeholder="청년, 수치" />
            </div>
          </div>

          <label className="flex items-center gap-2 text-[13px] text-ink-soft">
            <input type="checkbox" name="verified" className="size-4" />
            적은 수치·날짜가 정확하다
          </label>

          <div className="flex items-center gap-2">
            <Button type="submit">조각으로 저장</Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>취소</Button>
          </div>
        </form>
      )}
    </li>
  )
}
