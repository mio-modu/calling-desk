// LLM 사용 지점. 기획서 2장이 허용한 범위만 구현한다.
//
// 허용되는 것은 두 가지뿐이다:
//   (a) 업로드한 과거 서류에서 자산 조각 **후보** 추출 — 저장은 사람이 승인해야 한다.
//   (b) 사용자가 쓴 문장 다듬기 — 내용을 바꾸지 않는 선에서.
//
// 서류를 통째로 생성하는 함수는 이 파일에 없다. 뼈대 생성은 lib/outline.ts 에서
// 섹션 체크리스트로 결정적으로 만들기 때문에 LLM 을 타지 않는다.
//
// 추가 안전장치: polish 는 원문에 없던 숫자가 생기면 결과를 버린다(아래 주석 참고).

import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { EVIDENCE_TYPES, EVIDENCE_TYPE_META } from './domain'
import { env, llmAvailable } from './env'

const MODEL = 'claude-opus-5-5'

export class LlmUnavailableError extends Error {
  constructor() {
    super('ANTHROPIC_API_KEY 가 설정되지 않았습니다. 이 기능만 비활성화된 상태입니다.')
    this.name = 'LlmUnavailableError'
  }
}

function client(): Anthropic {
  const apiKey = env.anthropicKey
  if (!apiKey) throw new LlmUnavailableError()
  return new Anthropic({ apiKey })
}

export { llmAvailable }

// ── (a) 자산 조각 후보 추출 ──────────────────────────────────────

const CandidateSchema = z.object({
  type: z.enum(EVIDENCE_TYPES),
  title: z.string(),
  body: z.string(),
  // 원문에 연·월이 적혀 있지 않으면 빈 문자열. 추측 금지.
  period_from: z.string(),
  period_to: z.string(),
  tags: z.array(z.string()),
  // 이 후보가 어느 문장에서 나왔는지. 사용자가 수치를 대조하는 근거.
  source_quote: z.string(),
})

const ExtractionSchema = z.object({ candidates: z.array(CandidateSchema) })

export type ExtractedCandidate = z.infer<typeof CandidateSchema>

const EXTRACT_SYSTEM = `당신은 담임목사 청빙 서류를 준비하는 목사의 자산 정리를 돕는 보조자다.
사용자가 과거에 쓴 서류를 받아, 재사용 가능한 "자산 조각" 후보로 분해한다.

조각 타입:
${EVIDENCE_TYPES.map((t) => `- ${t}: ${EVIDENCE_TYPE_META[t].label} — ${EVIDENCE_TYPE_META[t].usedFor}. 예: ${EVIDENCE_TYPE_META[t].example}`).join('\n')}

절대 규칙:
1. **원문에 없는 사실을 만들지 마라.** 날짜·숫자·교회명·직책을 추측해 채우지 마라.
2. 기간이 원문에 적혀 있지 않으면 period_from, period_to 를 빈 문자열("")로 두어라.
   "2019~2022" 처럼 연도만 있으면 "2019-01-01" 같은 월·일을 임의로 만들지 말고
   "2019" 로만 적어라. 연·월이 다 있으면 "2019-03" 형식으로 적어라.
3. 숫자는 원문에 적힌 그대로만 옮겨라. 반올림·환산·추정하지 마라.
4. source_quote 에는 이 조각의 근거가 된 **원문 문장을 그대로** 넣어라. 요약하지 마라.
5. body 는 원문의 표현을 유지해 정리하라. 미사여구를 더하지 마라.
6. 한 문단에서 여러 조각이 나올 수 있다. 경력과 수치는 분리하라.
   "청년부 3년 담당, 출석 30명에서 85명" → career 1개 + metric 1개.
7. 확실하지 않으면 조각을 만들지 마라. 적게 뽑는 편이 낫다.`

export async function extractCandidates(text: string): Promise<ExtractedCandidate[]> {
  const c = client()
  const res = await c.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: EXTRACT_SYSTEM,
    messages: [{
      role: 'user',
      content: `다음은 내가 과거에 쓴 서류다. 자산 조각 후보로 분해해라.\n\n---\n${text}\n---`,
    }],
    output_config: { format: zodOutputFormat(ExtractionSchema) },
  })
  return res.parsed_output?.candidates ?? []
}

// ── (b) 문장 다듬기 ──────────────────────────────────────────────

const POLISH_SYSTEM = `당신은 목사의 글을 다듬는 교정자다. **내용을 바꾸지 않는다.**

허용:
- 비문·중복 표현 정리
- 어색한 조사·어미 교정
- 지나치게 긴 문장 분리

금지:
- 새로운 사실·숫자·날짜·고유명사 추가
- 없던 주장이나 평가 추가
- 의미를 바꾸는 단어 교체
- 미사여구·수식어 추가 ("헌신적으로", "뜨겁게" 같은 말을 임의로 붙이지 마라)
- 분량을 크게 늘리는 것

결과는 다듬은 본문만 출력한다. 설명·머리말을 붙이지 마라.`

/** 숫자 토큰만 뽑아낸다. 원문에 없던 숫자가 생겼는지 대조하는 데 쓴다. */
function numberTokens(s: string): string[] {
  return (s.match(/\d[\d,.]*/g) ?? []).map((n) => n.replace(/[,.]$/, ''))
}

export type PolishResult = {
  text: string
  /** 숫자 검증을 통과했는가. false 면 결과를 적용하지 말아야 한다. */
  safe: boolean
  warning?: string
}

export async function polish(original: string): Promise<PolishResult> {
  const c = client()
  const res = await c.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: POLISH_SYSTEM,
    messages: [{ role: 'user', content: original }],
  })

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()

  if (!text) return { text: original, safe: false, warning: '빈 응답이 돌아왔습니다.' }

  // 내용 불변을 기계적으로 검증한다. 원문에 없던 숫자가 생기면 신뢰하지 않는다.
  const before = new Set(numberTokens(original))
  const added = numberTokens(text).filter((n) => !before.has(n))
  if (added.length) {
    return {
      text,
      safe: false,
      warning: `원문에 없던 숫자(${added.join(', ')})가 생겼습니다. 적용하지 마시고 직접 확인하세요.`,
    }
  }

  // 분량이 1.6배를 넘으면 내용이 더해진 것으로 본다.
  if (text.length > original.length * 1.6 + 40) {
    return {
      text,
      safe: false,
      warning: '분량이 크게 늘었습니다. 내용이 더해졌을 수 있으니 대조해 보세요.',
    }
  }

  return { text, safe: true }
}
