'use client'

import { useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button, Input, Label, Textarea } from './ui'

export function DocEditor({
  action, docType, initialTitle, initialContent, initialShotOn, isMedia, freshnessDays, placeholder,
}: {
  action: (formData: FormData) => void | Promise<void>
  docType: string
  initialTitle: string
  initialContent: string
  initialShotOn: string
  isMedia: boolean
  freshnessDays: number
  placeholder: string
}) {
  const [content, setContent] = useState(initialContent)
  const [preview, setPreview] = useState(false)

  const chars = content.replace(/\s+/g, '').length

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="docType" value={docType} />

      <div>
        <Label>서류 제목</Label>
        <Input name="title" defaultValue={initialTitle} placeholder="서류 제목" />
      </div>

      {isMedia && (
        <div>
          <Label hint={`— 이 날짜 + ${freshnessDays}일이 신선도 기한이 됩니다`}>촬영일</Label>
          <Input type="date" name="shotOn" defaultValue={initialShotOn} />
        </div>
      )}

      <div>
        <div className="mb-1 flex items-end justify-between">
          <Label>본문 (마크다운)</Label>
          <div className="flex items-center gap-2 pb-1">
            <span className="text-[12px] tabular-nums text-ink-faint">{chars.toLocaleString('ko-KR')}자</span>
            <button
              type="button"
              onClick={() => setPreview((p) => !p)}
              className="rounded border border-line px-2 py-0.5 text-[12px] text-ink-soft hover:bg-canvas"
            >
              {preview ? '편집' : '미리보기'}
            </button>
          </div>
        </div>

        {preview ? (
          <div className="prose-doc min-h-[28rem] rounded-lg border border-line bg-surface px-4 py-3 text-sm">
            {content.trim()
              ? <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
              : <p className="text-ink-faint">본문이 비어 있습니다.</p>}
          </div>
        ) : (
          <Textarea
            name="contentMd"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={24}
            spellCheck={false}
            placeholder={placeholder}
            className="min-h-[28rem] font-mono text-[13px] leading-relaxed"
          />
        )}
        {/* 미리보기 중에도 본문이 전송되도록 */}
        {preview && <input type="hidden" name="contentMd" value={content} />}
      </div>

      <div>
        <Label hint="— 필수. 버전별 성과를 비교할 때 이게 라벨이 됩니다">이 버전을 만든 이유</Label>
        <Input name="note" required placeholder="예: 청년부 수치 보강, 2016~2018 공백 채움" />
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit">새 버전으로 저장</Button>
        <span className="text-[13px] text-ink-faint">저장하면 이전 버전은 보존되고 비활성화됩니다.</span>
      </div>
    </form>
  )
}
