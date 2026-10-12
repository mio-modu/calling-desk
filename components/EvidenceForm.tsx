'use client'

import { useState } from 'react'
import { EVIDENCE_TYPES, EVIDENCE_TYPE_META } from '@/lib/domain'
import { Button, Input, Label, Select, Textarea } from './ui'

export function EvidenceForm({
  action, initial, submitLabel = '조각 추가',
}: {
  action: (formData: FormData) => void | Promise<void>
  initial?: {
    id?: string; type?: string; title?: string; body?: string
    periodFrom?: string | null; periodTo?: string | null
    tags?: string[]; strength?: number; verified?: boolean
  }
  submitLabel?: string
}) {
  const [type, setType] = useState(initial?.type ?? 'career')
  const meta = EVIDENCE_TYPE_META[type as keyof typeof EVIDENCE_TYPE_META]

  return (
    <form action={action} className="space-y-3">
      {initial?.id && <input type="hidden" name="id" value={initial.id} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>타입</Label>
          <Select name="type" value={type} onChange={(e) => setType(e.target.value)}>
            {EVIDENCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {EVIDENCE_TYPE_META[t].label} ({t})
              </option>
            ))}
          </Select>
          {meta && (
            <p className="mt-1 text-[12px] text-ink-faint">
              {meta.usedFor}에 쓰입니다. 예: {meta.example}
            </p>
          )}
        </div>
        <div>
          <Label hint="— 이 조각이 얼마나 강력한 근거인가">근거 강도</Label>
          <Select name="strength" defaultValue={String(initial?.strength ?? 3)}>
            <option value="1">1 — 막연함</option>
            <option value="2">2 — 추상적</option>
            <option value="3">3 — 보통</option>
            <option value="4">4 — 구체적</option>
            <option value="5">5 — 수치·증빙 있음</option>
          </Select>
        </div>
      </div>

      <div>
        <Label>제목</Label>
        <Input name="title" required defaultValue={initial?.title ?? ''} placeholder="예: ○○교회 청년부 담당" />
      </div>

      <div>
        <Label>내용</Label>
        <Textarea name="body" rows={4} defaultValue={initial?.body ?? ''}
          placeholder="사실 중심으로. 숫자가 있으면 반드시 넣으세요." />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label hint="— 모르면 비워두세요">시작</Label>
          <Input type="date" name="periodFrom" defaultValue={initial?.periodFrom ?? ''} />
        </div>
        <div>
          <Label hint="— 진행중이면 비워두세요">종료</Label>
          <Input type="date" name="periodTo" defaultValue={initial?.periodTo ?? ''} />
        </div>
      </div>

      <div>
        <Label hint="— 쉼표로 구분">태그</Label>
        <Input name="tags" defaultValue={(initial?.tags ?? []).join(', ')} placeholder="청년, 성장, 수치" />
      </div>

      <label className="flex items-center gap-2 text-[13px] text-ink-soft">
        <input type="checkbox" name="verified" defaultChecked={initial?.verified ?? false} className="size-4" />
        수치·날짜를 원문과 대조해 확인했다
      </label>

      <Button type="submit">{submitLabel}</Button>
    </form>
  )
}
