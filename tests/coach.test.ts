import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateQuestions, type CoachEvidence } from '../lib/coach'

const TODAY = '2026-10-12'
const base = { docs: [], credentials: [], today: TODAY }

function ev(p: Partial<CoachEvidence>): CoachEvidence {
  return {
    id: 'e-' + (p.title ?? 'x'), type: 'career', title: 't', body: '',
    periodFrom: null, periodTo: null, tags: [], strength: 3, ...p,
  }
}

test('규칙 1 — 연표 공백을 되묻는다', () => {
  const qs = generateQuestions({
    ...base,
    evidence: [
      ev({ title: 'A', periodFrom: '2012-03-01', periodTo: '2016-02-28', body: '성도 40명' }),
      ev({ title: 'B', periodFrom: '2018-03-01', periodTo: '2022-02-28', body: '성도 60명' }),
    ],
  })
  const gap = qs.find((q) => q.ruleCode === 'timeline_gap')
  assert.ok(gap)
  assert.match(gap!.question, /구간이 비어 있습니다/)
  assert.match(gap!.question, /무엇을 하고 계셨습니까/)
})

test('규칙 2 — 1년 이상인데 수치 없는 경력만 묻는다', () => {
  const qs = generateQuestions({
    ...base,
    evidence: [
      ev({ title: '청년부', periodFrom: '2019-03-01', periodTo: '2022-02-28', body: '청년부를 담당했습니다.' }),
      ev({ title: '수치있음', periodFrom: '2012-03-01', periodTo: '2016-02-28', body: '출석 30명에서 85명으로' }),
      ev({ title: '짧은사역', periodFrom: '2026-06-01', periodTo: '2026-09-01', body: '단기' }),
    ],
  })
  const m = qs.filter((q) => q.ruleCode === 'missing_metric')
  assert.equal(m.length, 1)
  assert.match(m[0].question, /'청년부'를 3년 담당하셨는데/)
  assert.equal(m[0].suggestedType, 'metric')
})

test('규칙 2 — 같은 태그의 수치 조각이 있으면 묻지 않는다', () => {
  const qs = generateQuestions({
    ...base,
    evidence: [
      ev({ title: '청년부', periodFrom: '2019-03-01', periodTo: '2022-02-28', body: '담당', tags: ['청년'] }),
      ev({ id: 'm1', type: 'metric', title: '출석', body: '30 → 85명', tags: ['청년'], strength: 4 }),
    ],
  })
  assert.equal(qs.filter((q) => q.ruleCode === 'missing_metric').length, 0)
})

test('규칙 3 — 코퍼스가 비면 아무 질문도 만들지 않는다 (Phase 2 대기)', () => {
  const qs = generateQuestions({ ...base, evidence: [] })
  assert.equal(qs.filter((q) => q.ruleCode === 'corpus_gap').length, 0)
})

test('규칙 3 — 코퍼스가 주입되면 빈발·자산부족 항목만 묻는다', () => {
  const qs = generateQuestions({
    ...base, evidence: [],
    corpusGaps: [
      { topic: '다음세대 사역 경험', frequency: 0.41, myCount: 2 },
      { topic: '행정 경험', frequency: 0.35, myCount: 9 },   // 자산 충분 → 제외
      { topic: '해외선교', frequency: 0.05, myCount: 0 },     // 빈도 낮음 → 제외
    ],
  })
  const c = qs.filter((q) => q.ruleCode === 'corpus_gap')
  assert.equal(c.length, 1)
  assert.match(c[0].question, /41%가 '다음세대 사역 경험'/)
})

test('규칙 4 — strength 2 이하만 보강 질문', () => {
  const qs = generateQuestions({
    ...base,
    evidence: [
      ev({ id: 'w', type: 'episode', title: '약한것', strength: 2 }),
      ev({ id: 's', type: 'episode', title: '강한것', strength: 4 }),
    ],
  })
  const w = qs.filter((q) => q.ruleCode === 'weak_evidence')
  assert.equal(w.length, 1)
  assert.match(w[0].question, /'약한것' 조각이 추상적입니다/)
})

test('규칙 5 — 만료된 설교영상은 다른 규칙보다 먼저 묻는다', () => {
  const qs = generateQuestions({
    evidence: [ev({ id: 'w', title: '약한것', strength: 1 })],
    docs: [{ id: 'd1', docType: 'sermon_video', validUntil: '2026-07-01', readinessScore: 40 }],
    credentials: [],
    today: TODAY,
  })
  assert.equal(qs[0].ruleCode, 'stale_asset')
  assert.match(qs[0].question, /신선도 기한이 103일 지났습니다/)
  assert.match(qs[0].question, /최근 6개월 이내/)
})

test('규칙 5 — 증빙 유효기한은 리드타임을 빼서 신청 시점을 알려준다', () => {
  const qs = generateQuestions({
    evidence: [], docs: [],
    credentials: [{ id: 'c1', docName: '건강진단서', status: 'received', validUntil: '2026-11-10', leadTimeDays: 5 }],
    today: TODAY,
  })
  const s = qs.find((q) => q.ruleCode === 'stale_asset')
  assert.ok(s)
  assert.match(s!.question, /29일 남았습니다/)
  assert.match(s!.question, /재발급에 5일 걸리니 24일 안에 신청/)
})

test('규칙 5 — 미보유 증빙은 유효기한 질문을 하지 않는다', () => {
  const qs = generateQuestions({
    evidence: [], docs: [],
    credentials: [{ id: 'c1', docName: 'X', status: 'not_started', validUntil: '2026-10-20', leadTimeDays: 3 }],
    today: TODAY,
  })
  assert.equal(qs.length, 0)
})

test('dedupeKey 는 중복되지 않고 우선순위 순으로 정렬된다', () => {
  const qs = generateQuestions({
    ...base,
    evidence: [
      ev({ id: 'a', title: 'A', periodFrom: '2012-03-01', periodTo: '2016-02-28' }),
      ev({ id: 'b', title: 'B', periodFrom: '2018-03-01', periodTo: '2022-02-28' }),
      ev({ id: 'c', title: 'C', strength: 1 }),
    ],
  })
  assert.equal(new Set(qs.map((q) => q.dedupeKey)).size, qs.length)
  for (let i = 1; i < qs.length; i++) assert.ok(qs[i - 1].priority <= qs[i].priority)
})

test('질문 문장에 대필·수정 제안 표현이 들어가지 않는다', () => {
  const qs = generateQuestions({
    evidence: [
      ev({ id: 'a', title: 'A', periodFrom: '2012-03-01', periodTo: '2016-02-28' }),
      ev({ id: 'b', title: 'B', periodFrom: '2018-03-01', periodTo: '2022-02-28' }),
      ev({ id: 'c', title: 'C', strength: 1 }),
      ev({ id: 'd', title: '청년부', periodFrom: '2019-03-01', periodTo: '2022-02-28', body: '담당' }),
    ],
    docs: [{ id: 'd1', docType: 'sermon_video', validUntil: '2026-11-01', readinessScore: 50 }],
    credentials: [{ id: 'c1', docName: '건강진단서', status: 'received', validUntil: '2026-11-01', leadTimeDays: 5 }],
    today: TODAY,
  })
  assert.ok(qs.length >= 5)
  const banned = ['써드렸', '이렇게 바꾸', '수정했', '작성해드', '다음과 같이 고치']
  for (const q of qs) {
    for (const b of banned) assert.ok(!q.question.includes(b), `${b} in: ${q.question}`)
    // 모든 질문은 되묻는 문장으로 끝난다
    assert.match(q.question, /\?$/, `물음표로 끝나지 않음: ${q.question}`)
  }
})

test('한국어 목적격 조사가 받침에 맞게 붙는다', async () => {
  const { obj, subj, topic } = await import('../lib/date')
  assert.equal(obj('부목사'), '를')      // 사 — 받침 없음
  assert.equal(obj('청년부'), '를')      // 부 — 받침 없음
  assert.equal(obj('중고등부 담당'), '을') // 당 — 받침 있음
  assert.equal(subj('조각'), '이')
  assert.equal(subj('사역'), '이')
  assert.equal(subj('교회'), '가')
  assert.equal(topic('이력서'), '는')
  assert.equal(topic('설교문'), '은')
  // 판단할 수 없는 경우는 둘 다 보여준다
  assert.equal(obj('Ministry'), '을(를)')
})

test('수치 질문 문장에 조사가 올바르게 들어간다', () => {
  const qs = generateQuestions({
    ...base,
    evidence: [
      ev({ id: 'a', title: '△△교회 청년부 담당 부목사', periodFrom: '2019-03-01', periodTo: '2022-02-28', body: '담당' }),
      ev({ id: 'b', title: '중고등부 담당', periodFrom: '2005-03-01', periodTo: '2011-12-31', body: '담당' }),
    ],
  })
  const a = qs.find((q) => q.question.includes('부목사'))!
  const b = qs.find((q) => q.question.includes('중고등부'))!
  assert.match(a.question, /부목사'를 3년 담당하셨는데/)
  assert.match(b.question, /중고등부 담당'을 7년 담당하셨는데/)
})
