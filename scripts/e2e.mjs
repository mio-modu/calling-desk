// 브라우저 E2E 검증 (서버 액션 경로 확인용).
// playwright 는 저장 의존성이 아니다 — 필요할 때만 설치해 돌린다:
//   npm i --no-save playwright && npx next dev -p 3100 & && node scripts/e2e.mjs
// 이 컨테이너의 Chromium 경로를 쓰므로 로컬에서는 executablePath 를 지우면 된다.
import { chromium } from 'playwright'

const BASE = 'http://localhost:3100'
const ok = (m) => console.log(`  ✓ ${m}`)
const fail = (m) => { console.error(`  ✗ ${m}`); process.exitCode = 1 }

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const page = await browser.newPage()
page.on('pageerror', (e) => console.error('  [page error]', e.message))

/** dev 모드는 라우트를 처음 열 때 컴파일하느라 수 초가 걸린다. 미리 한 번씩 돌려 둔다. */
async function warmUp(paths) {
  for (const p of paths) await page.goto(BASE + p, { waitUntil: 'networkidle' })
}

/** 제출 후 리다이렉트(POST→303→GET)가 끝날 때까지 기다린다. */
async function submit(locator, expect) {
  await Promise.all([page.waitForURL(expect, { timeout: 20000 }), locator.click()])
  await page.waitForLoadState('networkidle')
}

try {
  console.log('\n[1] 로그인 게이트')
  await page.goto(BASE, { waitUntil: 'networkidle' })
  if (!page.url().includes('/login')) fail('비로그인 접근이 차단되지 않음'); else ok('미인증 → /login 리다이렉트')

  await page.fill('input[name=secret]', 'wrong-secret')
  await submit(page.locator('button[type=submit]'), /\/login\?error=1/)
  try {
    await page.waitForSelector('text=시크릿이 맞지', { timeout: 5000 })
    ok('틀린 시크릿 거부')
  } catch { fail('틀린 시크릿이 통과됨') }

  await page.fill('input[name=secret]', 'dev-secret-change-me')
  await submit(page.locator('button[type=submit]'), (u) => u.pathname === '/')
  ok('올바른 시크릿으로 입장')

  await warmUp(['/credentials', '/coach', '/evidence', '/docs', '/docs/resume', '/docs/family_intro'])

  console.log('\n[2] 증빙 저장 (서버 액션)')
  await page.goto(`${BASE}/credentials`, { waitUntil: 'networkidle' })
  const card = page.locator('section', { has: page.locator('h2', { hasText: '목사안수증명서' }) }).first()
  await card.locator('select[name=status]').selectOption('received')
  await card.locator('input[name=receivedAt]').fill('2026-10-01')
  await card.locator('input[name=validUntil]').fill('2026-11-05')
  await card.locator('input[name=note]').fill('노회 서기 통해 발급')
  await card.locator('button[type=submit]').first().click()
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(400)
  const reloaded = page.locator('section', { has: page.locator('h2', { hasText: '목사안수증명서' }) }).first()
  if (await reloaded.locator('text=보유중').count()) ok('상태 저장 → 보유중')
  else fail('증빙 상태가 저장되지 않음')
  if (await reloaded.locator('text=D-24').count()) ok('유효기한 임박 D-24 배지')
  else fail('임박 배지 없음')

  console.log('\n[3] 대시보드 반영')
  await page.goto(BASE, { waitUntil: 'networkidle' })
  const h = await page.locator('h2').first().innerText()
  if (/21종 중 1종 완료/.test(h)) ok(`진행바: ${h}`)
  else fail(`진행바 예상과 다름: ${h}`)
  if (await page.locator('text=목사안수증명서').count()) ok('유효기간 임박 목록에 노출')
  else fail('임박 목록에 없음')

  console.log('\n[4] 코칭 질문 답변 → 조각 생성')
  await page.goto(`${BASE}/coach`, { waitUntil: 'networkidle' })
  const q1 = await page.locator('li.rounded-xl p.font-medium').first().innerText()
  // 하이드레이션 전에 누르면 onClick 이 붙어 있지 않아 아무 일도 일어나지 않는다.
  const answerBtn = page.locator('button:has-text("답하기")').first()
  await answerBtn.waitFor({ state: 'visible' })
  await page.waitForFunction(() => document.querySelector('button') !== null)
  for (let i = 0; i < 20; i++) {
    await answerBtn.click()
    try { await page.waitForSelector('textarea[name=body]', { timeout: 500 }); break } catch {}
  }
  await page.fill('textarea[name=body]', '2012년 3월부터 2015년 2월까지 장로회신학대학원에 재학했고, 졸업 후 2016년부터 2019년까지 군목으로 복무했습니다.')
  await page.fill('input[name=title]', '2012~2019 신대원 재학 및 군목 복무')
  await page.fill('input[name=periodFrom]', '2012-03-01')
  await page.fill('input[name=periodTo]', '2019-02-28')
  await page.check('input[name=verified]')
  await page.click('button:has-text("조각으로 저장")')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(400)
  ok(`답변한 질문: ${q1.slice(0, 40)}…`)
  await page.goto(`${BASE}/evidence`, { waitUntil: 'networkidle' })
  if (await page.locator('text=2012~2019 신대원 재학 및 군목 복무').count()) ok('답변이 자산 조각으로 저장됨')
  else fail('조각이 생성되지 않음')

  console.log('\n[5] 연표 공백 해소 확인')
  await page.goto(`${BASE}/docs/resume?tab=issues`, { waitUntil: 'networkidle' })
  const body = await page.locator('body').innerText()
  if (!/구간이 비어 있습니다/.test(body)) ok('공백을 채우자 지적이 사라짐')
  else fail('공백 지적이 남아 있음')

  console.log('\n[6] 새 버전 저장')
  await page.goto(`${BASE}/docs/family_intro`, { waitUntil: 'networkidle' })
  await page.click('button:has-text("뼈대 세우기")')
  await page.waitForLoadState('networkidle')
  await page.waitForFunction(() => {
    const t = document.querySelector('textarea[name=contentMd]')
    return t && t.value.includes('##')
  }, { timeout: 15000 }).catch(() => {})
  const afterOutline = await page.locator('textarea[name=contentMd]').inputValue()
  if (/## 배우자/.test(afterOutline) && /## 자녀/.test(afterOutline)) ok('뼈대 생성 — 목차만')
  else fail('뼈대가 생성되지 않음')
  if (!/배우자의 신앙은/.test(afterOutline)) ok('뼈대에 본문 내용이 없음')
  await page.fill('textarea[name=contentMd]', '# 가족 소개서\n\n## 배우자\n아내는 같은 신대원에서 공부했고, 현재 주일학교 교사로 섬기고 있습니다. 결혼 후 15년간 사역을 함께 해왔습니다.\n\n## 자녀\n중학생 1명, 초등학생 1명입니다.\n')
  await page.fill('input[name=note]', 'e2e 검증용 초안')
  await page.click('button:has-text("새 버전으로 저장")')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(400)
  const docBody = await page.locator('body').innerText()
  if (/v2/.test(docBody)) ok('새 버전 v2 생성 (v1 보존)')
  else fail('버전이 올라가지 않음')

  console.log('\n[7] 업로드 후보 승인 게이트')
  const upId = await (async () => {
    await page.goto(`${BASE}/evidence`, { waitUntil: 'networkidle' })
    const link = page.locator('a[href^="/evidence/uploads/"]').first()
    return (await link.getAttribute('href')).split('/').pop()
  })()
  await page.goto(`${BASE}/evidence/uploads/${upId}`, { waitUntil: 'networkidle' })
  if (await page.locator('text=원문 인용').count()) ok('원문 인용 표시 (수치 대조용)')
  else fail('원문 인용이 없음')
  const boxes = page.locator('input[name=chosen]')
  const n = await boxes.count()
  for (let i = 0; i < n; i++) await boxes.nth(i).uncheck()
  ok(`후보 ${n}건 전부 체크 해제`)
  await page.click('button:has-text("체크한 것만 저장")')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(400)
  await page.goto(`${BASE}/evidence`, { waitUntil: 'networkidle' })
  if (!(await page.locator('text=청년부 출석 증가').count())) ok('체크 해제한 후보는 저장되지 않음')
  else fail('승인하지 않은 후보가 저장됨')

  console.log('\n[8] 로그아웃 상태 재확인')
  await page.context().clearCookies()
  await page.goto(`${BASE}/credentials`, { waitUntil: 'networkidle' })
  if (page.url().includes('/login')) ok('쿠키 제거 후 다시 차단')
  else fail('쿠키 없이 접근 가능')
} finally {
  await browser.close()
}
console.log(process.exitCode ? '\n실패 있음' : '\n브라우저 검증 전부 통과')
