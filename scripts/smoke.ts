/**
 * Phase 1 완료 기준 검증.
 *
 * "공고가 하나도 없는 상태에서, 과거 이력서 한 장을 업로드하면
 *  조각으로 분해되어 자산 은행에 쌓이고, 이력서 마스터 v1이 만들어지고,
 *  완성도 점수와 빠진 항목이 나오고, 코칭 질문 3개가 생성된다."
 *
 * 실행: npm run db:smoke
 *
 * 대역(mock)이 없다. 규칙 기반 분해를 쓰므로 LLM 호출 없이 전 경로가 실제로 돈다 —
 * 텍스트 추출, 조각 분해, **사람 승인 게이트**, 승격, 마스터 버전 생성,
 * 완성도 점수, 코칭 질문까지 실제 코드와 실제 DB 로 확인한다. 비용은 0이다.
 */
import assert from 'node:assert/strict'
import { getPool, query } from '../lib/db'
import { extractText } from '../lib/extract'
import { extractCandidatesByRules } from '../lib/extract-rules'
import { auditCandidates } from '../lib/llm-audit'
import {
  acceptCandidates, createUpload, listCandidates, saveCandidates,
} from '../lib/repo/uploads'
import { listEvidence } from '../lib/repo/evidence'
import { createVersion, getActiveDoc, linkEvidence, refreshReadiness } from '../lib/repo/docs'
import { syncQuestions, todaysQuestions } from '../lib/repo/coach'
import { loadDashboard } from '../lib/dashboard'

const PAST_RESUME = `
# 사역 이력서

## 인적사항
김○○ / 1975년생 / ○○노회 소속

## 학력
- 2001.3 ~ 2005.2  ○○대학교 영어교육과 졸업
- 2012.3 ~ 2015.2  장로회신학대학원 신학과(M.Div.) 졸업

## 사역 경력
- 2005.3 ~ 2011.12  ○○교회 교육전도사. 중고등부를 담당했습니다.
- 2019.3 ~ 2022.2   △△교회 청년부 담당 부목사. 청년부를 맡아 섬겼습니다.
- 2022.3 ~ 현재      □□교회 부목사. 행정과 교육을 함께 맡고 있습니다.

## 기타
교회 재정 시스템 전산화를 주도해 결산 기간을 2주에서 3일로 줄였습니다.
`.trim()

const RESUME_V1 = `
# 사역 이력서

## 인적사항
김○○ / 1975년생 / ○○노회 소속 / 2015년 목사안수

## 학력
- 2001.3 ~ 2005.2 ○○대학교 영어교육과 졸업
- 2012.3 ~ 2015.2 장로회신학대학원 신학과(M.Div.) 졸업

## 안수·노회
2015년 ○○노회에서 목사안수를 받았고, 현재까지 같은 노회에 소속되어 있습니다.

## 사역 경력
2005년 3월부터 2011년 12월까지 ○○교회에서 교육전도사로 중고등부를 담당했습니다.
주일 출석은 처음 20명 수준이었고 마지막 해에는 45명까지 늘었습니다.

2019년 3월부터 2022년 2월까지 △△교회에서 청년부 담당 부목사로 섬겼습니다.
청년부를 맡아 3년간 사역했고, 주일 예배와 주중 소그룹을 함께 운영했습니다.

2022년 3월부터 현재까지 □□교회에서 부목사로 행정과 교육을 맡고 있습니다.
교회 재정 시스템 전산화를 주도해 결산 기간을 2주에서 3일로 줄였습니다.

## 교육·훈련
기독교 상담 기초과정을 이수했습니다.
`.trim()

function section(label: string): void {
  console.log(`\n${'─'.repeat(64)}\n${label}\n${'─'.repeat(64)}`)
}

async function main(): Promise<void> {
  section('0. 초기화 — 공고가 하나도 없는 상태에서 시작')
  await query(`truncate evidence, master_doc, uploaded_doc, coach_question restart identity cascade`)
  await query(`update credential set status='not_started', requested_at=null,
               received_at=null, valid_until=null, note=''`)
  const before = await loadDashboard()
  console.log(`준비도: ${before.total}종 중 ${before.complete}종 완료 (서류 ${before.docsComplete}, 증빙 ${before.credentialsComplete})`)
  assert.equal(before.complete, 0)
  assert.equal(before.total, 21, '21종이어야 한다 (서류 9 + 증빙 12)')

  section('1. 과거 이력서 업로드 → 텍스트 추출')
  const extracted = await extractText('과거이력서.md', Buffer.from(PAST_RESUME, 'utf8'))
  assert.ok(extracted.ok, '추출 성공')
  const upload = await createUpload({
    filename: '과거이력서.md', mime: 'text/markdown',
    byteSize: Buffer.byteLength(PAST_RESUME), storagePath: null,
    extractedText: extracted.ok ? extracted.text : '',
    extractStatus: 'extracted', extractError: null,
  })
  console.log(`업로드: ${upload.filename} (${upload.byteSize} bytes), 추출 ${extracted.ok ? extracted.text.length : 0}자`)

  section('2. 규칙 기반 분해 → 조각 후보 — evidence 에는 아직 아무것도 없어야 한다')
  const extractedCands = extractCandidatesByRules(extracted.ok ? extracted.text : '')
  // 규칙 분해는 원문에서 글자를 잘라 올 뿐이므로 환각 감사를 항상 통과해야 한다.
  const audit = auditCandidates(PAST_RESUME, extractedCands)
  assert.deepEqual(audit.fails, [], `환각 감사 실패:\n${audit.fails.join('\n')}`)
  console.log('✓ 환각 감사 통과 — 인용·수치·연도가 전부 원문에 존재')
  const n = await saveCandidates(upload.id, extractedCands)
  const candidates = await listCandidates(upload.id, 'pending')
  console.log(`후보 ${n}개 생성:`)
  for (const c of candidates) {
    console.log(`  · [${c.type}] ${c.title}  기간=${c.periodFrom ?? '없음'}~${c.periodTo ?? '없음'}`)
  }
  const evidenceBeforeApproval = await listEvidence()
  assert.equal(evidenceBeforeApproval.length, 0,
    '승인 전에는 자산 은행이 비어 있어야 한다 (자동 저장 금지)')
  console.log('✓ 승인 전 자산 은행 비어 있음 — 자동 저장되지 않았다')

  // 날짜 정규화 확인: "2005.3" → 2005-03-01, '현재' → null
  const firstCareer = candidates.find((c) => c.title.includes('교육전도사'))!
  assert.equal(firstCareer.periodFrom, '2005-03-01')
  assert.equal(firstCareer.periodTo, '2011-12-31')
  const ongoing = candidates.find((c) => c.title.includes('□□교회'))!
  assert.equal(ongoing.periodTo, null, "'현재'는 종료일 null 이어야 한다")
  console.log('✓ 부분 날짜 정규화 정상, 없는 값은 추측하지 않음')

  section('3. 사람이 승인 — 경력·수치·역량만 승격하고 학력 줄은 버린다')
  const approve = candidates.filter((c) => !/대학교|대학원/.test(c.title))
  const promoted = await acceptCandidates(upload.id, approve.map((c) => ({
    id: c.id, type: c.type, title: c.title, body: c.body,
    periodFrom: c.periodFrom, periodTo: c.periodTo, tags: c.tags, strength: 3,
  })))
  console.log(`승격 ${promoted.length}개 / 후보 ${candidates.length}개`)
  assert.ok(promoted.length > 0 && promoted.length < candidates.length,
    '일부만 승격돼야 한다 (승인하지 않은 것은 저장되지 않는다)')
  const leftover = await listCandidates(upload.id, 'pending')
  assert.equal(leftover.length, candidates.length - promoted.length,
    '승인하지 않은 후보는 pending 으로 남아 있어야 한다')
  assert.ok(promoted.every((e) => !e.verified),
    '승격된 조각은 전부 verified=false 여야 한다')
  assert.ok(promoted.every((e) => e.source === 'imported_doc' && e.sourceQuote),
    '원문 인용이 함께 보관돼야 한다')
  console.log('✓ 승인한 것만 저장, 전부 미확인(verified=false), 원문 인용 보존')

  section('4. 이력서 마스터 v1 생성')
  const v1 = await createVersion('resume', {
    title: '사역 이력서', contentMd: RESUME_V1,
    note: '과거 이력서에서 분해한 조각으로 초안 작성', validUntil: null,
  })
  console.log(`master_doc: resume v${v1.version} (활성=${v1.isActive})`)
  assert.equal(v1.version, 1)

  // 근거 연결 — 사역 경력 섹션에만 붙인다 (나머지 섹션은 미연결로 남아 지적을 받는다)
  const careerEvidence = promoted.filter((e) => e.type === 'career')
  for (const e of careerEvidence) await linkEvidence(v1.id, e.id, 'career')
  console.log(`근거 연결: career 섹션에 ${careerEvidence.length}개`)

  section('5. 완성도 점수와 빠진 항목')
  const active = (await getActiveDoc('resume'))!
  const r = await refreshReadiness(active)
  console.log(`완성도 ${r.score}점\n빠진 항목 ${r.detail.length}건:`)
  for (const d of r.detail) {
    console.log(`  [${d.severity}] ${d.label}`)
    if (d.hint) console.log(`           ↳ ${d.hint}`)
  }
  assert.ok(r.score > 0 && r.score < 100, '점수가 0과 100 사이여야 한다')
  assert.ok(r.detail.length > 0, '빠진 항목이 나와야 한다')
  assert.ok(r.detail.some((d) => d.code.startsWith('gap:')),
    '2012~2019 사이 연표 공백이 지적돼야 한다')

  section('6. 코칭 질문 생성 — 하루 3개')
  await syncQuestions()
  const questions = await todaysQuestions()
  console.log(`오늘의 질문 ${questions.length}개:`)
  for (const q of questions) {
    console.log(`  · [${q.ruleCode}] ${q.question}`)
    console.log(`      근거: ${q.rationale}`)
  }
  assert.equal(questions.length, 3, '하루 3개가 나와야 한다')
  assert.ok(questions.every((q) => q.question.endsWith('?')),
    '모든 질문은 되묻는 문장이어야 한다')

  // 같은 날 다시 불러도 같은 질문이어야 한다
  const again = await todaysQuestions()
  assert.deepEqual(again.map((q) => q.id), questions.map((q) => q.id),
    '같은 날에는 같은 질문이 나와야 한다')
  console.log('✓ 같은 날 재방문 시 동일한 질문')

  section('7. 준비도 대시보드')
  const after = await loadDashboard()
  console.log(`${after.total}종 중 ${after.complete}종 완료 (서류 ${after.docsComplete}, 증빙 ${after.credentialsComplete})`)
  const resume = after.docs.find((d) => d.docType === 'resume')!
  console.log(`이력서: ${resume.score}점, 필수 지적 ${resume.blockerCount}건, 완료=${resume.complete}`)

  section('완료 기준 전부 통과')
  console.log('· 공고 0건 상태에서 동작')
  console.log('· 업로드 → 조각 분해 → 사람 승인 → 자산 은행 적재')
  console.log('· 이력서 마스터 v1 생성')
  console.log('· 완성도 점수 + 빠진 항목 산출')
  console.log('· 코칭 질문 3개 생성')

  await getPool().end()
}

main().catch(async (err) => {
  console.error('\n✗ 실패:', err)
  await getPool().end().catch(() => {})
  process.exit(1)
})
