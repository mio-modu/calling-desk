'use client'

import { useActionState } from 'react'
import type { PolishState } from '@/app/(app)/docs/actions'
import { Button, Notice, Textarea } from './ui'

export function PolishPanel({
  action, available,
}: {
  action: (prev: PolishState, formData: FormData) => Promise<PolishState>
  available: boolean
}) {
  const [state, formAction, pending] = useActionState(action, { original: '' })

  if (!available) {
    return (
      <Notice tone="neutral">
        ANTHROPIC_API_KEY 가 없어 문장 다듬기는 비활성화돼 있습니다.
        규칙 기반 기능(완성도 점검·코칭 질문)은 키 없이 그대로 동작합니다.
      </Notice>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-ink-faint">
        내가 쓴 문장을 더 정확하게 다듬습니다. 내용은 바꾸지 않습니다.
        <strong className="text-ink-soft"> 결과를 본문에 자동 반영하지 않습니다</strong> — 비교해 보고 직접 옮겨 쓰세요.
      </p>

      <form action={formAction} className="space-y-2">
        <Textarea
          name="original"
          rows={6}
          defaultValue={state.original}
          placeholder="다듬고 싶은 문단을 붙여넣으세요."
          className="text-[13px]"
        />
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? '다듬는 중…' : '다듬기'}
        </Button>
      </form>

      {state.error && <Notice tone="blocker">{state.error}</Notice>}

      {state.result && (
        <div className="space-y-2">
          {state.warning && <Notice tone="blocker">{state.warning}</Notice>}
          {state.safe && <Notice tone="ok">숫자 검증 통과 — 원문에 없던 숫자가 생기지 않았습니다.</Notice>}
          <div className="rounded-lg border border-line bg-canvas px-3 py-2.5 text-[13px] whitespace-pre-wrap">
            {state.result}
          </div>
        </div>
      )}
    </div>
  )
}
