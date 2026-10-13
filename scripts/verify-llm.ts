/**
 * LLM 경로 검증. 키가 들어온 뒤 한 번 돌려 "조각 추출이 사실을 지어내지 않는가"를
 * 눈이 아니라 기계로 확인한다.
 *
 *   npm run verify:llm
 *
 * DB 를 쓰지 않는다. ANTHROPIC_API_KEY 만 있으면 어디서든 돌아간다.
 * 판정 로직은 lib/llm-audit.ts 에 있고 단위 테스트로 검증돼 있다
 * (실패를 못 잡는 검사기는 쓸모가 없으므로 심어둔 환각을 잡는지 먼저 시험했다).
 */
import { extractCandidates, llmAvailable, polish } from '../lib/llm'
import { auditCandidates, auditNoMetricTopic, auditVagueDates } from '../lib/llm-audit'
import { parsePartialDate } from '../lib/repo/uploads'

// 함정을 일부러 심은 원문이다.
//  · '청년부를 담당했습니다' — 숫자가 없다. 수치를 만들어내면 안 된다.
//  · '2019년부터 2022년까지' — 연도만 있다. 월·일을 지어내면 안 된다.
//  · '몇 해 동안' — 기간이 모호하다. 날짜를 추측하면 안 된다.
//  · '30명에서 85명' — 숫자가 있다. 반올림·환산하면 안 된다.
//  · 교회명이 익명화돼 있다. 실제 교회명을 지어내면 안 된다.
const SOURCE = `
사역 이력

○○교회에서 2008년 3월부터 2014년 12월까지 교육전도사로 섬겼습니다.
중고등부를 담당했으며, 주일 출석이 30명에서 85명으로 늘었습니다.

△△교회에서는 2019년부터 2022년까지 청년부를 담당했습니다.
청년부를 담당했습니다.

몇 해 동안 지역 아동센터와 협력해 방과후 교실을 운영했습니다.

교회 재정 시스템을 전산화해 결산 기간을 2주에서 3일로 줄였습니다.
`.trim()

async function main(): Promise<void> {
  if (!llmAvailable()) {
    console.error(
      'ANTHROPIC_API_KEY 가 없습니다.\n' +
      '클라우드 환경 → Edit 에서 ANTHROPIC_API_KEY 를 추가하면 새 세션에서 잡힙니다.\n' +
      '로컬에서는 .env.local 에 넣고 다시 실행하세요.',
    )
    process.exit(2)
  }

  console.log('원문 (함정 포함):')
  console.log(SOURCE.split('\n').map((l) => '  │ ' + l).join('\n'))

  console.log('\n── 조각 추출 호출 ──')
  const t0 = Date.now()
  const cands = await extractCandidates(SOURCE)
  console.log(`후보 ${cands.length}건 (${((Date.now() - t0) / 1000).toFixed(1)}초)\n`)

  for (const [i, c] of cands.entries()) {
    const from = parsePartialDate(c.period_from, 'from') ?? 'null'
    const to = parsePartialDate(c.period_to, 'to') ?? 'null'
    console.log(`[${i + 1}] ${c.type} — ${c.title}`)
    console.log(`    내용: ${c.body || '(없음)'}`)
    console.log(`    기간: ${c.period_from || '(없음)'} ~ ${c.period_to || '(없음)'}  → DB: ${from} ~ ${to}`)
    console.log(`    인용: ${c.source_quote || '(없음)'}\n`)
  }

  const { fails, warns } = auditCandidates(SOURCE, cands)

  // 함정 1: 원문에 숫자가 없는 '청년부 담당'에 수치가 붙었는가
  const youthInvented = auditNoMetricTopic(cands, /청년/)
  if (youthInvented.length) {
    fails.push(`'청년부 담당'은 원문에 숫자가 없는데 수치가 붙었다: ${youthInvented.join(', ')}`)
  } else {
    console.log("✓ 함정 1 통과: 숫자 없는 '청년부 담당'에 수치를 붙이지 않았다")
  }

  // 함정 2: 기간이 모호한 사역에 날짜를 채웠는가
  const vagueDated = auditVagueDates(cands, /아동센터|방과후/)
  if (vagueDated.length) {
    fails.push(`'몇 해 동안'은 기간이 모호한데 날짜가 채워졌다: ${vagueDated.join(', ')}`)
  } else {
    console.log("✓ 함정 2 통과: 기간이 모호한 사역에 날짜를 지어내지 않았다")
  }

  console.log('\n── 문장 다듬기 호출 ──')
  const original =
    '제가 청년부를 맡아서 열심히 섬겼었고 그래서 청년들이 많이 늘어났는데 출석이 30명에서 85명이 되었습니다.'
  const r = await polish(original)
  console.log(`원문: ${original}`)
  console.log(`결과: ${r.text}`)
  console.log(`판정: safe=${r.safe}${r.warning ? ` — ${r.warning}` : ''}`)
  if (!r.safe) fails.push(`문장 다듬기가 안전 검사를 통과하지 못했다: ${r.warning}`)
  else console.log('✓ 숫자 검증 통과 — 원문에 없던 숫자가 생기지 않았다')

  console.log('\n' + '─'.repeat(64))
  if (warns.length) {
    console.log(`확인 필요 ${warns.length}건 (기계가 단정하지 않는 것):`)
    for (const w of warns) console.log(`  · ${w}`)
    console.log('')
  }
  if (fails.length) {
    console.log(`✗ 실패 ${fails.length}건 — 프롬프트를 조정해야 합니다:`)
    for (const f of fails) console.log(`  · ${f}`)
    process.exit(1)
  }
  console.log('✓ LLM 경로 검증 통과')
  console.log('  · 인용한 문장이 전부 원문에 실제로 존재한다 (문장을 지어내지 않았다)')
  console.log('  · 원문에 없는 수량을 만들어내지 않았다')
  console.log('  · 원문에 없는 연도를 기간에 넣지 않았다')
  console.log('  · 문장 다듬기가 숫자를 바꾸지 않았다')
}

main().catch((err) => {
  console.error('\n✗ 호출 실패:', err instanceof Error ? err.message : err)
  process.exit(1)
})
