import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  auditCandidates, auditNoMetricTopic, auditVagueDates, norm,
} from '../lib/llm-audit'
import type { ExtractedCandidate } from '../lib/llm'

const SOURCE = `○○교회에서 2008년 3월부터 2014년 12월까지 교육전도사로 섬겼습니다.
주일 출석이 30명에서 85명으로 늘었습니다.
△△교회에서는 2019년부터 2022년까지 청년부를 담당했습니다.`

function cand(p: Partial<ExtractedCandidate>): ExtractedCandidate {
  return {
    type: 'career', title: 't', body: '', period_from: '', period_to: '',
    tags: [], source_quote: '', ...p,
  }
}

test('정직한 추출은 통과한다', () => {
  const { fails } = auditCandidates(SOURCE, [
    cand({
      title: '○○교회 교육전도사', body: '교육전도사로 섬겼습니다.',
      period_from: '2008-03', period_to: '2014-12',
      source_quote: '○○교회에서 2008년 3월부터 2014년 12월까지 교육전도사로 섬겼습니다.',
    }),
    cand({
      type: 'metric', title: '주일 출석 증가', body: '30명에서 85명으로 늘었습니다.',
      source_quote: '주일 출석이 30명에서 85명으로 늘었습니다.',
    }),
  ])
  assert.deepEqual(fails, [])
})

test('① 지어낸 인용을 잡는다', () => {
  const { fails } = auditCandidates(SOURCE, [
    cand({ title: 'x', source_quote: '성도들이 깊이 신뢰하는 목회자였습니다.' }),
  ])
  assert.equal(fails.length, 1)
  assert.match(fails[0], /원문에 없다 → 문장을 지어냈다/)
})

test('① 빈 인용도 잡는다', () => {
  const { fails } = auditCandidates(SOURCE, [cand({ title: 'x', source_quote: '  ' })])
  assert.match(fails[0], /source_quote 가 비어 있다/)
})

test('② 지어낸 수량을 잡는다 — 원문에 없는 "120명"', () => {
  const { fails } = auditCandidates(SOURCE, [
    cand({
      title: '청년부 담당', body: '청년부 출석이 120명까지 늘었습니다.',
      source_quote: '△△교회에서는 2019년부터 2022년까지 청년부를 담당했습니다.',
    }),
  ])
  assert.ok(fails.some((f) => /원문에 없는 수량 "120" → 수치를 지어냈다/.test(f)))
})

test('② 원문에 있는 수량은 통과한다 (반올림하지 않은 경우)', () => {
  const { fails } = auditCandidates(SOURCE, [
    cand({ title: '출석', body: '30명 → 85명', source_quote: '주일 출석이 30명에서 85명으로 늘었습니다.' }),
  ])
  assert.deepEqual(fails, [])
})

test('② 반올림한 수치도 잡는다 — 85 를 90 으로', () => {
  const { fails } = auditCandidates(SOURCE, [
    cand({ title: '출석', body: '약 90명으로 늘었습니다.', source_quote: '주일 출석이 30명에서 85명으로 늘었습니다.' }),
  ])
  assert.ok(fails.some((f) => /원문에 없는 수량 "90"/.test(f)))
})

test('③ 지어낸 연도를 잡는다 — 원문에 없는 2016', () => {
  const { fails } = auditCandidates(SOURCE, [
    cand({
      title: 'x', period_from: '2016-01', period_to: '2018-12',
      source_quote: '△△교회에서는 2019년부터 2022년까지 청년부를 담당했습니다.',
    }),
  ])
  assert.equal(fails.filter((f) => /연도/.test(f)).length, 2)
  assert.ok(fails.some((f) => /"2016" 를 기간에 넣었다/.test(f)))
})

test('기간 파생 숫자는 실패가 아니라 경고 (수량 단위가 없으므로)', () => {
  // '4' 는 원문에 토큰으로 존재하지 않는다 ('2014' 는 하나의 토큰이다).
  // 기간에서 계산된 값일 수도, 틀린 값일 수도 있어 사람이 볼 몫으로 남긴다.
  const { fails, warns } = auditCandidates(SOURCE, [
    cand({
      title: '청년부 담당', body: '4년간 담당했습니다.',
      source_quote: '△△교회에서는 2019년부터 2022년까지 청년부를 담당했습니다.',
    }),
  ])
  assert.deepEqual(fails, [], '수량 단위가 없는 숫자는 단정하지 않는다')
  assert.ok(warns.some((w) => /원문에 없는 숫자 "4"/.test(w)))
})

test('원문에 실제로 있는 숫자는 경고도 내지 않는다', () => {
  // '3' 은 원문의 '3월'에서 온다 — 지어낸 것이 아니다.
  const { fails, warns } = auditCandidates(SOURCE, [
    cand({
      title: '청년부 담당', body: '3년간 담당했습니다.',
      source_quote: '△△교회에서는 2019년부터 2022년까지 청년부를 담당했습니다.',
    }),
  ])
  assert.deepEqual(fails, [])
  assert.deepEqual(warns, [])
})

test('함정 — 숫자 없는 주제에 수치가 붙으면 잡는다', () => {
  const hit = auditNoMetricTopic([
    cand({ title: '청년부 담당', body: '청년 60명을 섬겼습니다.' }),
    cand({ title: '중고등부', body: '숫자 없음' }),
  ], /청년/)
  assert.deepEqual(hit, ['청년부 담당'])
})

test('함정 — 기간이 모호한데 날짜가 채워지면 잡는다', () => {
  const hit = auditVagueDates([
    cand({ title: '방과후 교실', period_from: '2017-01', source_quote: '몇 해 동안 운영했습니다.' }),
    cand({ title: '다른 사역', source_quote: '몇 해 동안 운영했습니다.' }),
  ], /방과후/)
  assert.equal(hit.length, 1)
  assert.match(hit[0], /방과후 교실/)
})

test('정규화는 공백·구두점 차이를 무시한다', () => {
  assert.equal(norm('○○교회에서,  2008년 3월부터'), norm('○○교회에서 2008년 3월부터'))
})
