// 도메인 상수. 화면·점수·코칭이 전부 이 파일만 읽는다.
// Phase 2 에서 섹션 체크리스트와 분량 기준을 코퍼스 유래로 바꿀 때
// 교체 지점이 이 파일 하나로 끝나도록 모아 두었다.

export const EVIDENCE_TYPES = [
  'career', 'metric', 'episode', 'sermon',
  'theology', 'competency', 'relationship', 'scrap',
] as const
export type EvidenceType = (typeof EVIDENCE_TYPES)[number]

export const EVIDENCE_TYPE_META: Record<
  EvidenceType,
  { label: string; usedFor: string; example: string }
> = {
  career:       { label: '경력',   usedFor: '이력서',              example: '2019~2022 ○○교회 청년부 담당' },
  metric:       { label: '수치',   usedFor: '이력서·자기소개서',     example: '출석 30 → 85명 (3년)' },
  episode:      { label: '에피소드', usedFor: '자기소개서·면접',      example: '코로나기 온라인 전환 시 시니어 접속 지원' },
  sermon:       { label: '설교',   usedFor: '설교 샘플 선정',        example: '고난과 위로 / 고후 1:3-7 / 2025.3' },
  theology:     { label: '신학',   usedFor: '신앙고백서',           example: '성례에 대한 입장, 종말론 강조점' },
  competency:   { label: '역량',   usedFor: '이력서·목회계획서',      example: '행정 전산화 주도, 상담 훈련 이수' },
  relationship: { label: '관계',   usedFor: '추천서 확보',          example: '추천 가능한 분 3인과의 관계' },
  scrap:        { label: '스크랩', usedFor: '문장 참고',            example: '좋은 표현 (출처 포함)' },
}

export const EVIDENCE_SOURCES = ['manual', 'imported_doc', 'sermon_file'] as const
export type EvidenceSource = (typeof EVIDENCE_SOURCES)[number]
export const EVIDENCE_SOURCE_LABEL: Record<EvidenceSource, string> = {
  manual: '직접입력',
  imported_doc: '과거서류 업로드',
  sermon_file: '설교파일',
}

// ── 마스터 서류 9종 (기획서 4장 A) ────────────────────────────────

export const DOC_TYPES = [
  'resume', 'self_intro', 'faith_confession', 'ministry_plan',
  'family_intro', 'sermon_script', 'sermon_video',
  'intro_video', 'portfolio',
] as const
export type DocType = (typeof DOC_TYPES)[number]

export type DocSection = { key: string; label: string; hint: string; required: boolean }

export type DocTypeMeta = {
  seq: number
  label: string
  /**
   * written = 본문을 쓰는 서류. 섹션·근거·수치·분량으로 평가한다.
   * media   = 영상. 본문 분량이나 수치는 의미가 없고, 링크·촬영일·신선도로 평가한다.
   */
  kind: 'written' | 'media'
  reuse: '높음' | '중간' | '낮음'
  note: string
  /** 신선도 요구 (일). media 및 갱신이 필요한 서류에만 설정. */
  freshnessDays?: number
  /** 분량 적정 구간 (본문 글자수). Phase 2 에서 코퍼스 기준으로 교체. */
  lengthRange?: [number, number]
  /** 연표 공백을 따져야 하는 서류인가 */
  checksTimeline: boolean
  sections: DocSection[]
}

export const DOC_TYPE_META: Record<DocType, DocTypeMeta> = {
  resume: {
    seq: 1, label: '사역 이력서', kind: 'written', reuse: '높음',
    note: '교회별 분량 요구가 다릅니다. 마스터를 길게 두고 줄여 쓰는 편이 낫습니다.',
    lengthRange: [800, 3000], checksTimeline: true,
    sections: [
      { key: 'personal',  label: '인적사항',      hint: '성명·생년·연락처·현 소속',               required: true },
      { key: 'education', label: '학력',          hint: '학부 / 신학대학원 (연도·전공 포함)',       required: true },
      { key: 'ordination',label: '안수·노회',     hint: '목사고시 합격, 안수 연도, 소속 노회',       required: true },
      { key: 'career',    label: '사역 경력',     hint: '기간·교회·직책·담당 사역. 연도 공백 없이',  required: true },
      { key: 'training',  label: '교육·훈련',     hint: '상담·선교·행정 등 이수 과정',             required: false },
      { key: 'etc',       label: '저술·기타',     hint: '저술, 강의, 수상, 자격',                 required: false },
    ],
  },
  self_intro: {
    seq: 2, label: '자기소개서', kind: 'written', reuse: '높음',
    note: '성장과정·소명·가족을 포함해 달라는 요구가 빈번합니다.',
    lengthRange: [1500, 4000], checksTimeline: false,
    sections: [
      { key: 'growth',   label: '성장과정',       hint: '신앙의 배경. 사실 중심으로',              required: true },
      { key: 'calling',  label: '소명',           hint: '목회로 부름받은 구체적 경험',             required: true },
      { key: 'family',   label: '가족',           hint: '배우자·자녀. 간결하게',                  required: true },
      { key: 'ministry', label: '목회관',         hint: '무엇을 가장 중요하게 보는가',             required: true },
      { key: 'strength', label: '강점·약점',      hint: '약점은 회피하지 말고 대처까지',           required: false },
    ],
  },
  faith_confession: {
    seq: 3, label: '신앙고백서', kind: 'written', reuse: '높음',
    note: '교단(통합) 신학 입장을 명시해 달라는 요구가 많습니다.',
    lengthRange: [1500, 5000], checksTimeline: false,
    sections: [
      { key: 'scripture', label: '성경관',         hint: '성경의 권위와 해석 원리',                required: true },
      { key: 'god',       label: '신론·기독론',    hint: '삼위일체, 그리스도의 인격과 사역',        required: true },
      { key: 'salvation', label: '구원론',         hint: '은혜·믿음·성화의 관계',                  required: true },
      { key: 'church',    label: '교회론·성례',    hint: '세례와 성찬에 대한 입장',                required: true },
      { key: 'eschaton',  label: '종말론',         hint: '강조점을 분명히',                        required: true },
      { key: 'denom',     label: '교단 신학 입장', hint: '예장 통합 헌법·신앙고백과의 관계',        required: true },
    ],
  },
  ministry_plan: {
    seq: 4, label: '목회계획서 / 목회비전', kind: 'written', reuse: '낮음',
    note: '교회마다 새로 써야 합니다. 마스터는 뼈대와 철학까지만 두고, 진단·연차계획은 공고별로 채우는 편이 낫습니다.',
    lengthRange: [2000, 8000], checksTimeline: false,
    sections: [
      { key: 'diagnosis', label: '교회 진단',     hint: '규모·연령 구성·지역 특성. 지원 교회에 맞춰 교체되는 자리',  required: true },
      { key: 'philosophy',label: '목회 철학',     hint: '추상어 금지. 주간 일정으로 환산되는 말로',                required: true },
      { key: 'worship',   label: '예배·말씀',     hint: '설교 계획, 예배 운영',                                 required: true },
      { key: 'education', label: '교육·양육',     hint: '연령별 양육 체계',                                     required: true },
      { key: 'mission',   label: '선교·봉사',     hint: '지역사회와의 관계',                                    required: true },
      { key: 'admin',     label: '행정·재정',     hint: '당회·제직회 운영, 재정 투명성',                         required: false },
      { key: 'roadmap',   label: '연차 계획',     hint: '1년 / 3년 / 5년. 측정 가능한 목표로',                   required: true },
    ],
  },
  family_intro: {
    seq: 5, label: '가족 소개서', kind: 'written', reuse: '높음',
    note: '별도로 요구하는 교회가 많습니다. 미리 써두면 재사용됩니다.',
    lengthRange: [400, 1500], checksTimeline: false,
    sections: [
      { key: 'spouse',   label: '배우자',         hint: '신앙 이력과 사역 참여',                  required: true },
      { key: 'children', label: '자녀',           hint: '연령·학업. 간결하게',                    required: true },
      { key: 'life',     label: '가정 신앙생활',  hint: '가정예배 등 실제 하고 있는 것',           required: false },
    ],
  },
  sermon_script: {
    seq: 6, label: '설교 원고', kind: 'written', reuse: '중간',
    note: '1~3편을 요구합니다. 주제를 지정하는 경우가 있어 풀을 넓게 두어야 합니다.',
    lengthRange: [3000, 9000], checksTimeline: false,
    sections: [
      { key: 'text',   label: '본문·제목',  hint: '성경 본문과 설교 제목',          required: true },
      { key: 'intro',  label: '서론',       hint: '청중의 문제의식과 연결',         required: true },
      { key: 'body',   label: '본론',       hint: '대지 구조가 드러나게',           required: true },
      { key: 'apply',  label: '적용',       hint: '구체적 행동으로',                required: true },
      { key: 'outro',  label: '결론',       hint: '한 문장으로 요약되는가',         required: true },
    ],
  },
  sermon_video: {
    seq: 7, label: '설교 영상', kind: 'media', reuse: '낮음',
    note: '"최근 6개월 이내" 조건이 빈번합니다. 주기적으로 갱신해야 하는 유일한 서류입니다.',
    freshnessDays: 180, checksTimeline: false,
    sections: [
      { key: 'url',    label: '영상 링크',   hint: '공개 링크. 비공개면 열람 방법까지',   required: true },
      { key: 'date',   label: '촬영일',      hint: '신선도 판정의 기준입니다',            required: true },
      { key: 'detail', label: '본문·제목',   hint: '어떤 본문의 설교인가',                required: true },
    ],
  },
  intro_video: {
    seq: 8, label: '자기소개 영상', kind: 'media', reuse: '중간',
    note: '1~3분. 일부 교회가 요구합니다.',
    freshnessDays: 365, checksTimeline: false,
    sections: [
      { key: 'url',  label: '영상 링크', hint: '공개 링크',          required: true },
      { key: 'date', label: '촬영일',    hint: '1년 넘으면 갱신 권장', required: true },
      { key: 'len',  label: '길이',      hint: '1~3분 권장',          required: false },
    ],
  },
  portfolio: {
    seq: 9, label: '목회 포트폴리오', kind: 'written', reuse: '높음',
    note: '요구는 드물지만 차별화 요소입니다. 수치가 들어가야 의미가 있습니다.',
    lengthRange: [1000, 5000], checksTimeline: true,
    sections: [
      { key: 'overview', label: '사역 개요',    hint: '한 장으로 보이는 요약',           required: true },
      { key: 'result',   label: '주요 성과',    hint: '맡은 일과 결과를 짝지어',          required: true },
      { key: 'metric',   label: '수치',         hint: '출석·재정·참여. 전후 비교로',      required: true },
      { key: 'material', label: '사진·자료',    hint: '링크 또는 첨부',                   required: false },
    ],
  },
}

export const DOC_TYPES_BY_SEQ = [...DOC_TYPES].sort(
  (a, b) => DOC_TYPE_META[a].seq - DOC_TYPE_META[b].seq,
)

// ── "완료" 판정 기준 ─────────────────────────────────────────────
// 준비도 대시보드의 21종 진행바가 의미를 가지려면 기준이 고정돼야 한다.
// 화면은 이 상수만 읽고, 판정 로직을 따로 갖지 않는다.

export const COMPLETION = {
  /** 서류: 활성 버전이 있고 완성도 점수가 이 값 이상이면 완료 */
  docMinScore: 70,
  /** 증빙: 유효기한 임박 경고를 띄우는 기준 (일) */
  credentialWarnDays: 30,
  /** 서류 9종 + 증빙 12종 */
  totalItems: DOC_TYPES.length + 12,
} as const

// ── 코칭 ────────────────────────────────────────────────────────

export const COACH = {
  /** 하루에 보여줄 질문 수 */
  dailyCount: 3,
  /** dismiss 후 다시 묻지 않는 기간 (일) */
  snoozeDays: 30,
  /** 연표 공백으로 볼 최소 간격 (일) */
  timelineGapDays: 365,
  /** 수치 질문 대상이 되는 최소 사역 기간 (일) */
  metricMinSpanDays: 365,
  /** 보강 질문 대상이 되는 strength 상한 */
  weakStrengthMax: 2,
  /** 신선도 임박 경고 기준 (일) */
  staleWarnDays: 45,
} as const

export const COACH_RULES = [
  'timeline_gap', 'missing_metric', 'corpus_gap', 'weak_evidence', 'stale_asset',
] as const
export type CoachRule = (typeof COACH_RULES)[number]

/** 기획서 6장 ① 의 우선순위 순서. 숫자가 작을수록 먼저 묻는다. */
export const COACH_RULE_PRIORITY: Record<CoachRule, number> = {
  timeline_gap: 10,
  missing_metric: 20,
  corpus_gap: 30,
  weak_evidence: 40,
  stale_asset: 50,
}

export const CREDENTIAL_STATUSES = ['not_started', 'requested', 'received'] as const
export type CredentialStatus = (typeof CREDENTIAL_STATUSES)[number]
export const CREDENTIAL_STATUS_LABEL: Record<CredentialStatus, string> = {
  not_started: '미착수',
  requested: '신청함',
  received: '보유중',
}
