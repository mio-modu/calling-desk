import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsePartialDate } from '../lib/repo/uploads'

test('빈 값은 null — 추측해 채우지 않는다', () => {
  assert.equal(parsePartialDate('', 'from'), null)
  assert.equal(parsePartialDate(null, 'from'), null)
  assert.equal(parsePartialDate(undefined, 'to'), null)
  assert.equal(parsePartialDate('  ', 'to'), null)
})

test('연도만 있으면 그 해의 시작/끝', () => {
  assert.equal(parsePartialDate('2019', 'from'), '2019-01-01')
  assert.equal(parsePartialDate('2019', 'to'), '2019-12-31')
})

test('연·월이면 그 달의 시작/끝 (말일 계산 포함)', () => {
  assert.equal(parsePartialDate('2019-03', 'from'), '2019-03-01')
  assert.equal(parsePartialDate('2019-03', 'to'), '2019-03-31')
  assert.equal(parsePartialDate('2024-02', 'to'), '2024-02-29')  // 윤년
  assert.equal(parsePartialDate('2023-02', 'to'), '2023-02-28')
})

test('완전한 날짜는 그대로', () => {
  assert.equal(parsePartialDate('2019-03-15', 'from'), '2019-03-15')
})

test('해석할 수 없는 값은 null (쓰레기를 날짜로 만들지 않는다)', () => {
  assert.equal(parsePartialDate('2019년 봄', 'from'), null)
  assert.equal(parsePartialDate('언젠가', 'from'), null)
  assert.equal(parsePartialDate('2019-13', 'from'), null)
})
