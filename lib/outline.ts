// 빈 서류의 뼈대(목차) 생성. **LLM 을 쓰지 않는다.**
//
// 기획서 2장은 "초안의 뼈대"를 LLM 허용 예외로 두었지만, 뼈대는 섹션 체크리스트에서
// 결정적으로 만들 수 있다. 그렇게 하면 "내용은 비워둔다"가 구현상 보장된다 —
// 내용을 채울 코드 경로가 없기 때문이다. 키도 필요 없고 매번 같은 결과가 나온다.

import { DOC_TYPE_META, type DocType } from './domain'

export function buildOutline(docType: DocType): string {
  const meta = DOC_TYPE_META[docType]
  const lines: string[] = [`# ${meta.label}`, '']

  for (const s of meta.sections) {
    lines.push(`## ${s.label}${s.required ? '' : ' (선택)'}`)
    lines.push('')
    // 내용이 아니라 "무엇을 써야 하는가"만 남긴다. 작성 후 지우는 안내선이다.
    lines.push(`<!-- ${s.hint} -->`)
    lines.push('')
  }

  return lines.join('\n')
}
