/**
 * 데모 데이터. 화면이 어떻게 보이는지 확인하거나 사용법을 익힐 때 쓴다.
 *   npm run db:demo
 * 기존 데이터를 지우므로 실제로 쓰기 시작한 뒤에는 돌리지 말 것.
 */
import { getPool, query } from '../lib/db'
import { extractCandidatesByRules } from '../lib/extract-rules'
import { createUpload, saveCandidates, listCandidates, acceptCandidates } from '../lib/repo/uploads'
import { createVersion, linkEvidence, refreshAllReadiness } from '../lib/repo/docs'
import { createEvidence } from '../lib/repo/evidence'
import { saveProfile } from '../lib/repo/profile'
import { syncQuestions } from '../lib/repo/coach'
import { addDays, kstTodayISO } from '../lib/date'

const PAST_RESUME = `# 사역 이력서

## 인적사항
김성진 / 1976년생 / 서울동남노회 소속

## 사역 경력
- 2004.3 ~ 2010.2   한빛교회 교육전도사. 중고등부를 담당했습니다.
- 2015.3 ~ 2020.2   새순교회 청년부 담당 부목사
- 2020.3 ~ 현재      푸른숲교회 부목사. 행정과 교육을 함께 맡고 있습니다.

## 기타
교회 재정 시스템 전산화를 주도해 결산 기간을 2주에서 3일로 줄였습니다.
청년부 주일 출석이 35명에서 92명으로 늘었습니다.
`

const RESUME_V2 = `# 사역 이력서

## 인적사항
김성진 / 1976년생 / 서울동남노회 / 2014년 목사안수

## 학력
- 2000.3 ~ 2004.2 한국외국어대학교 영어교육과 졸업
- 2011.3 ~ 2014.2 장로회신학대학교 신학대학원(M.Div.) 졸업

## 안수·노회
2014년 서울동남노회에서 목사안수를 받았고 현재까지 같은 노회에 소속되어 있습니다.

## 사역 경력
2004년 3월부터 2010년 2월까지 한빛교회에서 교육전도사로 중고등부를 담당했습니다.
부임 당시 주일 출석 22명이었고, 마지막 해에는 58명이 되었습니다.

2015년 3월부터 2020년 2월까지 새순교회에서 청년부 담당 부목사로 섬겼습니다.
청년부 주일 출석이 35명에서 92명으로 늘었고, 주중 소그룹을 4개에서 11개로 늘렸습니다.

2020년 3월부터 현재까지 푸른숲교회에서 부목사로 행정과 교육을 맡고 있습니다.
교회 재정 시스템 전산화를 주도해 결산 기간을 2주에서 3일로 줄였습니다.

## 교육·훈련
기독교 상담 기초과정(2018), 교회 행정 실무과정(2021)을 이수했습니다.
`

async function main(): Promise<void> {
  console.log('기존 데이터 삭제…')
  await query('truncate evidence, master_doc, uploaded_doc, coach_question restart identity cascade')
  await query(`update credential set status='not_started', requested_at=null,
               received_at=null, valid_until=null, note=''`)

  console.log('프로필…')
  await saveProfile({
    name: '김성진', birthYear: 1976, birthDate: '1976-05-14',
    presbytery: '서울동남노회', ordinationYear: 2014,
    seminary: '장로회신학대학교 신학대학원',
    careerYearsSenior: 0, careerYearsAssociate: 16, pensionEnrolled: true,
    preferredRegions: ['서울', '경기'], excludedRegions: [], minChurchSize: 150,
    updatedAt: null,
  })

  console.log('과거 서류 업로드 → 규칙 분해 → 승인…')
  const upload = await createUpload({
    filename: '2023_이력서_초안.md', mime: 'text/markdown',
    byteSize: Buffer.byteLength(PAST_RESUME), storagePath: null,
    extractedText: PAST_RESUME, extractStatus: 'extracted', extractError: null,
  })
  await saveCandidates(upload.id, extractCandidatesByRules(PAST_RESUME))
  const pending = await listCandidates(upload.id, 'pending')
  // 인적사항 줄만 빼고 승인한다 (사람이 고르는 흐름을 재현)
  const approve = pending.filter((c) => !/1976년생/.test(c.title))
  await acceptCandidates(upload.id, approve.map((c) => ({
    id: c.id, type: c.type, title: c.title, body: c.body,
    periodFrom: c.periodFrom, periodTo: c.periodTo, tags: c.tags,
    strength: /출석|전산화/.test(c.title + c.body) ? 5 : 3,
  })))

  console.log('직접 입력한 조각…')
  await createEvidence({
    type: 'episode', title: '코로나기 온라인 예배 전환',
    body: '2020년 3월 온라인 예배로 전환하면서, 스마트폰이 익숙하지 않은 70대 이상 성도 40여 명을 일일이 전화로 안내했습니다. 자녀들에게 부탁하기 어려워하시는 분들께는 직접 찾아가 접속을 도왔습니다.',
    periodFrom: '2020-03-01', periodTo: '2020-08-31',
    tags: ['장년', '예배'], strength: 5, verified: true, source: 'manual',
  })
  await createEvidence({
    type: 'theology', title: '성례에 대한 입장',
    body: '세례와 성찬을 은혜의 방편으로 봅니다. 성찬에서 그리스도의 영적 임재를 고백하는 개혁주의 전통을 따릅니다.',
    periodFrom: null, periodTo: null, tags: [], strength: 4, verified: true, source: 'manual',
  })
  await createEvidence({
    type: 'relationship', title: '추천서 부탁 가능한 분 3인',
    body: '전 담임이신 박○○ 목사(새순교회), 신대원 지도교수 이○○ 교수, 노회 서기 최○○ 목사.',
    periodFrom: null, periodTo: null, tags: [], strength: 3, verified: false, source: 'manual',
  })
  // 약한 조각 — 코칭 규칙 4 가 보강을 묻는다
  await createEvidence({
    type: 'episode', title: '지역사회 봉사',
    body: '지역사회를 섬겼습니다.',
    periodFrom: null, periodTo: null, tags: [], strength: 1, verified: false, source: 'manual',
  })

  console.log('마스터 서류…')
  const v1 = await createVersion('resume', {
    title: '사역 이력서', contentMd: PAST_RESUME,
    note: '과거 이력서 초안을 그대로 올림', validUntil: null,
  })
  const v2 = await createVersion('resume', {
    title: '사역 이력서', contentMd: RESUME_V2,
    note: '학력·안수 섹션 추가, 사역별 수치 보강 (출석·소그룹 수)', validUntil: null,
  })
  const evs = await query<{ id: string; type: string }>('select id, type from evidence')
  for (const e of evs.filter((x) => x.type === 'career' || x.type === 'metric')) {
    await linkEvidence(v2.id, e.id, 'career')
  }

  await createVersion('self_intro', {
    title: '자기소개서',
    contentMd: `# 자기소개서\n\n## 성장과정\n\n부모님이 모두 교사이셨고, 주일학교 교사로도 오래 섬기셨습니다. 어린 시절부터 교회가 생활의 중심이었습니다.\n\n## 소명\n\n대학 3학년 때 농어촌 단기선교에서, 목사님 한 분이 섬기시던 시골 교회의 주일학교를 맡았습니다. 그 여름이 끝날 무렵 진로를 다시 생각하게 되었습니다.\n`,
    note: '성장과정·소명만 먼저 작성', validUntil: null,
  })

  // 설교 영상 — 신선도 기한이 임박한 상태로 (코칭 규칙 5 가 묻는다)
  const today = kstTodayISO()
  await createVersion('sermon_video', {
    title: '설교 영상',
    contentMd: `# 설교 영상\n\n## 영상 링크\n\nhttps://youtu.be/example\n\n## 촬영일\n\n${addDays(today, -155)}\n\n## 본문·제목\n\n고린도후서 1:3-7 / 고난과 위로\n`,
    note: '2월 주일 설교 녹화본',
    validUntil: addDays(today, 25),   // 6개월 기한까지 25일 남음
  })

  console.log('증빙…')
  const creds = await query<{ id: string; seq: number }>('select id, seq from credential order by seq')
  const set = async (seq: number, patch: Record<string, unknown>) => {
    const c = creds.find((x) => x.seq === seq)!
    const cols = Object.keys(patch)
    await query(
      `update credential set ${cols.map((k, i) => `${k}=$${i + 2}`).join(', ')} where id=$1`,
      [c.id, ...cols.map((k) => patch[k])],
    )
  }
  await set(10, { status: 'received', received_at: addDays(today, -40) })            // 목사안수증명서
  await set(12, { status: 'received', received_at: addDays(today, -35) })            // 신대원 졸업
  await set(13, { status: 'received', received_at: addDays(today, -35) })            // 신대원 성적
  await set(15, { status: 'received', received_at: addDays(today, -30) })            // 목사고시 합격
  await set(11, { status: 'requested', requested_at: addDays(today, -6),
                  note: '노회 서기께 요청, 다음 노회 때 발급 예정' })                   // 노회 소속증명
  await set(17, { status: 'received', received_at: addDays(today, -160),
                  valid_until: addDays(today, 20) })                                 // 건강진단서 — 임박
  await set(18, { status: 'received', received_at: addDays(today, -95),
                  valid_until: addDays(today, -5) })                                 // 주민등록등본 — 만료

  console.log('점수·질문 갱신…')
  await refreshAllReadiness()
  await syncQuestions()

  console.log(`\n완료. 이력서 v${v2.version} (v${v1.version} 보존), 조각 ${evs.length}개.`)
  await getPool().end()
}

main().catch(async (e) => { console.error(e); await getPool().end().catch(() => {}); process.exit(1) })
