// 업로드 파일에서 텍스트를 뽑는다. .md / .txt / .docx / .pdf
// 추출만 담당하고 해석은 하지 않는다 (해석은 lib/llm.ts 의 승인 대기 흐름).

export const SUPPORTED_EXTENSIONS = ['.md', '.txt', '.markdown', '.docx', '.pdf'] as const

export type ExtractResult =
  | { ok: true; text: string }
  | { ok: false; error: string }

function extOf(filename: string): string {
  const i = filename.lastIndexOf('.')
  return i === -1 ? '' : filename.slice(i).toLowerCase()
}

export function isSupported(filename: string): boolean {
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(extOf(filename))
}

export async function extractText(filename: string, data: Buffer): Promise<ExtractResult> {
  const ext = extOf(filename)
  try {
    if (ext === '.md' || ext === '.markdown' || ext === '.txt') {
      return { ok: true, text: data.toString('utf8') }
    }

    if (ext === '.docx') {
      const mammoth = await import('mammoth')
      const { value } = await mammoth.extractRawText({ buffer: data })
      return { ok: true, text: value }
    }

    if (ext === '.pdf') {
      const { extractText: pdfText, getDocumentProxy } = await import('unpdf')
      const pdf = await getDocumentProxy(new Uint8Array(data))
      const { text } = await pdfText(pdf, { mergePages: true })
      const merged = Array.isArray(text) ? text.join('\n') : text
      if (!merged.trim()) {
        return {
          ok: false,
          error: '텍스트를 찾지 못했습니다. 스캔된 이미지 PDF 로 보입니다. 텍스트가 있는 PDF 나 .docx 로 올려주세요.',
        }
      }
      return { ok: true, text: merged }
    }

    return { ok: false, error: `지원하지 않는 형식입니다 (${ext || '확장자 없음'}). ${SUPPORTED_EXTENSIONS.join(', ')} 만 가능합니다.` }
  } catch (err) {
    return { ok: false, error: `추출 실패: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/** 너무 긴 문서는 LLM 호출 전에 자른다. 잘렸는지 호출자에게 알린다. */
export function clampForLlm(text: string, maxChars = 40_000): { text: string; truncated: boolean } {
  const clean = text.replace(/\r\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim()
  if (clean.length <= maxChars) return { text: clean, truncated: false }
  return { text: clean.slice(0, maxChars), truncated: true }
}
