import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractCandidatesByRules, findPeriod, normalizeDateToken } from '../lib/extract-rules'
import { auditCandidates, auditNoMetricTopic, auditVagueDates } from '../lib/llm-audit'
import { parsePartialDate } from '../lib/repo/uploads'

test('날짜 토큰 정규화 — 적힌 만큼만', () => {
  assert.equal(normalizeDateToken('2019'), '2019')
  assert.equal(normalizeDateToken('2019.3'), '2019-03')
  assert.equal(normalizeDateToken('2019년 3월'), '2019-03')
  assert.equal(normalizeDateToken('2019-03'), '2019-03')
  assert.equal(normalizeDateToken('2019.03.01'), '2019-03')
  assert.equal(normalizeDateToken('현재'), '', '진행중은 비워 둔다')
  assert.equal(normalizeDateToken('재직 중'), '')
})

test('여러 형식의 기간 범위를 인식한다', () => {
  const cases: [string, string, string][] = [
    ['2019.3 ~ 2022.2 청년부', '2019-03', '2022-02'],
    ['2019년 3월부터 2022년 2월까지 섬겼습니다', '2019-03', '2022-02'],
    ['2005 ~ 2011 교육전도사', '2005', '2011'],
    ['2022.3 ~ 현재 부목사', '2022-03', ''],
    ['2012.3 - 2015.2 신대원', '2012-03', '2015-02'],
  ]
  for (const [line, from, to] of cases) {
    const p = findPeriod(line)
    assert.ok(p, `기간을 못 찾음: ${line}`)
    assert.equal(p!.from, from, line)
    assert.equal(p!.to, to, line)
  }
})

test('기간이 없으면 null — 없는 날짜를 만들지 않는다', () => {
  assert.equal(findPeriod('몇 해 동안 방과후 교실을 운영했습니다.'), null)
  assert.equal(findPeriod('청년부를 담당했습니다.'), null)
})

const RESUME = `사역 이력

- 2005.3 ~ 2011.12  ○○교회 교육전도사. 중고등부를 담당했습니다.
- 2019.3 ~ 2022.2   △△교회 청년부 담당 부목사
  청년부를 맡아 섬겼습니다.
- 2022.3 ~ 현재      □□교회 부목사

주일 출석이 30명에서 85명으로 늘었습니다.

교회 재정 시스템 전산화를 주도해 결산 기간을 2주에서 3일로 줄였습니다.

몇 해 동안 지역 아동센터와 협력해 방과후 교실을 운영했습니다.`

test('이력서를 조각으로 분해한다', () => {
  const c = extractCandidatesByRules(RESUME)
  const careers = c.filter((x) => x.type === 'career')
  assert.equal(careers.length, 3, `경력 3건이어야 한다: ${JSON.stringify(c.map((x) => [x.type, x.title]))}`)
  assert.ok(careers.some((x) => x.title.includes('교육전도사') && x.period_from === '2005-03'))
  assert.ok(careers.some((x) => x.period_from === '2022-03' && x.period_to === ''),
    '진행중인 사역은 종료일이 비어 있어야 한다')
  assert.ok(c.some((x) => x.type === 'metric' && /30|85/.test(x.body + x.title)))
})

test('태그를 본문에서 뽑는다', () => {
  const c = extractCandidatesByRules(RESUME)
  const youth = c.find((x) => /청년/.test(x.title + x.body))
  assert.ok(youth?.tags.includes('청년'))
})

// ── 핵심: 규칙 분해는 환각이 구조적으로 불가능하다 ──

test('환각 감사기를 통과한다 — 실패 0건', () => {
  const c = extractCandidatesByRules(RESUME)
  const { fails } = auditCandidates(RESUME, c)
  assert.deepEqual(fails, [], `환각이 검출됨:\n${fails.join('\n')}`)
})

test('모든 source_quote 가 원문에 실제로 존재한다', () => {
  const c = extractCandidatesByRules(RESUME)
  const norm = (s: string) => s.replace(/\s+/g, '')
  for (const x of c) {
    assert.ok(norm(RESUME).includes(norm(x.source_quote)),
      `원문에 없는 인용: "${x.source_quote}"`)
  }
})

test('숫자 없는 경력에 수치를 붙이지 않는다', () => {
  const c = extractCandidatesByRules(RESUME)
  assert.deepEqual(auditNoMetricTopic(c, /청년/), [])
})

test('기간이 모호한 사역에 날짜를 만들지 않는다', () => {
  const c = extractCandidatesByRules(RESUME)
  assert.deepEqual(auditVagueDates(c, /방과후|아동센터/), [])
})

test('추출한 기간이 DB 저장값으로 정상 변환된다', () => {
  const c = extractCandidatesByRules(RESUME)
  const edu = c.find((x) => x.title.includes('교육전도사'))!
  assert.equal(parsePartialDate(edu.period_from, 'from'), '2005-03-01')
  assert.equal(parsePartialDate(edu.period_to, 'to'), '2011-12-31')
  const now = c.find((x) => x.period_from === '2022-03')!
  assert.equal(parsePartialDate(now.period_to, 'to'), null)
})

test('설교·신학 조각을 구분한다', () => {
  const c = extractCandidatesByRules(
    '고난과 위로 / 고후 1:3-7 / 2025년 3월 설교\n\n세례와 성찬에 대한 저의 입장은 개혁주의 전통을 따릅니다.',
  )
  assert.ok(c.some((x) => x.type === 'sermon'), JSON.stringify(c.map((x) => [x.type, x.title])))
  assert.ok(c.some((x) => x.type === 'theology'))
})

test('빈 입력에도 터지지 않는다', () => {
  assert.deepEqual(extractCandidatesByRules(''), [])
  assert.deepEqual(extractCandidatesByRules('\n\n   \n'), [])
})

test('약어의 마침표에서 제목이 잘리지 않는다', () => {
  const c = extractCandidatesByRules('- 2012.3 ~ 2015.2  장로회신학대학원 신학과(M.Div.) 졸업')
  assert.equal(c.length, 1)
  assert.equal(c[0].title, '장로회신학대학원 신학과(M.Div.) 졸업')
})

test('문장 경계에서는 제목과 본문을 가른다', () => {
  const c = extractCandidatesByRules('- 2005.3 ~ 2011.12  ○○교회 교육전도사. 중고등부를 담당했습니다.')
  assert.equal(c[0].title, '○○교회 교육전도사')
  assert.equal(c[0].body, '중고등부를 담당했습니다.')
})
