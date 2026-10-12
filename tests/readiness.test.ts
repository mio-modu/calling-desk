import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeReadiness, findTimelineGaps, parseContent, resolveSection } from '../lib/readiness'

const TODAY = '2026-10-12'

test('미작성 서류는 점수 0 + 미작성 지적만', () => {
  const r = computeReadiness({ docType: 'resume', contentMd: '', updatedAt: null, today: TODAY })
  assert.equal(r.score, 0)
  assert.equal(r.detail.length, 1)
  assert.equal(r.detail[0].code, 'not_started')
})

test('제목을 섹션 key 로 해석 — 토큰 매칭', () => {
  assert.equal(resolveSection('resume', '## 인적사항'), 'personal')
  assert.equal(resolveSection('resume', '안수 및 소속 노회'), 'ordination')
  assert.equal(resolveSection('resume', '사역 경력'), 'career')
  assert.equal(resolveSection('resume', '취미'), null)
})

test('제목만 있고 내용 없는 섹션은 충족으로 보지 않는다', () => {
  const r = computeReadiness({
    docType: 'resume',
    contentMd: '# 인적사항\n\n# 학력\n\n# 안수·노회\n\n# 사역 경력\n',
    updatedAt: TODAY, today: TODAY,
  })
  const codes = r.detail.map((d) => d.code)
  assert.ok(codes.includes('section:personal'), '인적사항이 빠진 항목으로 잡혀야 한다')
  assert.ok(r.detail.some((d) => d.label.includes('제목만 있고 내용이 없습니다')))
})

test('주장 문단 수와 근거 연결 수를 세어 지적한다', () => {
  const para = '가'.repeat(60)
  const r = computeReadiness({
    docType: 'resume',
    contentMd: `# 인적사항\n\n${para}\n\n# 사역 경력\n\n${para}\n\n${para}\n`,
    updatedAt: TODAY, today: TODAY,
    linked: [{ evidenceId: 'e1', type: 'career', title: 'x', section: 'career' }],
  })
  const backing = r.detail.find((d) => d.code === 'backing')
  assert.ok(backing, 'backing 지적이 있어야 한다')
  // 주장 문단 3개 중 career 섹션의 2개만 연결됨
  assert.match(backing!.label, /3개 중 2개/)
})

test('수치 포함률 — 숫자+단위와 전후 비교를 인식', () => {
  const p = parseContent('resume', [
    '청년부 출석이 30명에서 85명으로 늘었습니다. ' + '가'.repeat(30),
    '',
    '열심히 섬겼고 많은 분들이 함께해 주셨습니다. ' + '가'.repeat(30),
  ].join('\n'))
  assert.equal(p.units.length, 2)
  assert.equal(p.units[0].hasMetric, true)
  assert.equal(p.units[1].hasMetric, false)
})

test('연표 공백 — 1년 이상만 잡고 겹치는 구간은 병합', () => {
  const gaps = findTimelineGaps([
    { title: 'A', from: '2012-03-01', to: '2016-02-28' },
    { title: 'B', from: '2018-03-01', to: '2022-02-28' },
    { title: 'C', from: '2022-03-01', to: null },
  ], TODAY)
  assert.equal(gaps.length, 1)
  assert.equal(gaps[0].from, '2016-02-28')
  assert.equal(gaps[0].to, '2018-03-01')
})

test('연표 공백이 6개월이면 잡지 않는다', () => {
  const gaps = findTimelineGaps([
    { title: 'A', from: '2012-03-01', to: '2016-02-28' },
    { title: 'B', from: '2016-08-01', to: '2022-02-28' },
  ], TODAY)
  assert.equal(gaps.length, 0)
})

test('영상 서류 — 촬영일 없으면 신선도 판정 불가 blocker', () => {
  const r = computeReadiness({
    docType: 'sermon_video',
    contentMd: '# 영상 링크\n\nhttps://example.com/v\n\n# 본문·제목\n\n고후 1:3-7 고난과 위로\n',
    updatedAt: TODAY, validUntil: null, today: TODAY,
  })
  assert.ok(r.detail.some((d) => d.code === 'no_valid_until'))
  // 영상은 분량/수치로 평가하지 않는다
  assert.ok(!r.components.some((c) => c.key === 'length'))
  assert.ok(!r.components.some((c) => c.key === 'metric'))
})

test('영상 서류 — 기한 지나면 만료 blocker', () => {
  const r = computeReadiness({
    docType: 'sermon_video',
    contentMd: '# 영상 링크\n\nhttps://e.com\n\n# 촬영일\n\n2026-01-01\n\n# 본문·제목\n\n고후 1:3-7\n',
    updatedAt: TODAY, validUntil: '2026-07-01', today: TODAY,
  })
  const exp = r.detail.find((d) => d.code === 'expired')
  assert.ok(exp)
  assert.equal(exp!.severity, 'blocker')
})

test('점수는 0~100 범위를 벗어나지 않는다', () => {
  const r = computeReadiness({
    docType: 'self_intro',
    contentMd: '가'.repeat(50_000),
    updatedAt: TODAY, today: TODAY,
  })
  assert.ok(r.score >= 0 && r.score <= 100, `score=${r.score}`)
})

test('완료 판정 — 점수가 높아도 필수 지적이 있으면 완료가 아니다', async () => {
  const { isDocComplete } = await import('../lib/readiness')
  assert.equal(isDocComplete(85, []), true)
  assert.equal(isDocComplete(65, []), false)
  // 7년 공백이 있는 이력서는 다른 항목이 좋아 74점이어도 제출할 수 없다
  assert.equal(
    isDocComplete(74, [{ code: 'gap:x', label: '공백', severity: 'blocker' }]),
    false,
  )
  assert.equal(
    isDocComplete(74, [{ code: 'stale', label: '오래됨', severity: 'warn' }]),
    true,
  )
})
