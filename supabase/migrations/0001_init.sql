-- Phase 1: 자산 은행 + 서류 작업대 + 코칭
-- 기획서 7장의 Phase 1 범위 테이블 + 승인 대기 2종(uploaded_doc, evidence_candidate)
--
-- 설계 메모: LLM이 추출한 조각은 evidence 에 직접 들어올 수 없다.
-- 반드시 evidence_candidate 를 거쳐 사람이 승인해야 승격된다.
-- "자동 저장하지 마라"는 요구를 주석이 아니라 스키마로 보장하기 위한 분리다.

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;


-- ── 프로필 (단일 행) ──────────────────────────────────────────────
create table if not exists profile (
  id                      int primary key default 1 check (id = 1),
  name                    text,
  birth_year              int,
  birth_date              date,
  presbytery              text,
  ordination_year         int,
  seminary                text,
  career_years_senior     numeric(4,1),
  career_years_associate  numeric(4,1),
  pension_enrolled        boolean,
  preferred_regions       text[] not null default '{}',
  excluded_regions        text[] not null default '{}',
  min_church_size         int,
  updated_at              timestamptz not null default now()
);
create trigger profile_updated_at before update on profile
  for each row execute function set_updated_at();


-- ── ① 자산 조각 ──────────────────────────────────────────────────
create table if not exists evidence (
  id           uuid primary key default gen_random_uuid(),
  type         text not null check (type in
                 ('career','metric','episode','sermon',
                  'theology','competency','relationship','scrap')),
  title        text not null,
  body         text not null default '',
  period_from  date,
  period_to    date,
  tags         text[] not null default '{}',
  strength     int not null default 3 check (strength between 1 and 5),
  verified     boolean not null default false,
  source       text not null default 'manual'
                 check (source in ('manual','imported_doc','sermon_file')),
  source_ref   text,
  source_quote text,   -- 업로드 유래일 때 원문 인용 (수치 대조용)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (period_to is null or period_from is null or period_to >= period_from)
);
create trigger evidence_updated_at before update on evidence
  for each row execute function set_updated_at();
create index evidence_type_idx   on evidence (type);
create index evidence_tags_idx   on evidence using gin (tags);
create index evidence_period_idx on evidence (period_from, period_to);


-- ── ② 마스터 서류 ────────────────────────────────────────────────
create table if not exists master_doc (
  id               uuid primary key default gen_random_uuid(),
  doc_type         text not null check (doc_type in
                     ('resume','self_intro','faith_confession','ministry_plan',
                      'family_intro','sermon_script','sermon_video',
                      'intro_video','portfolio')),
  version          int  not null check (version >= 1),
  title            text not null default '',
  content_md       text not null default '',
  is_active        boolean not null default true,
  note             text not null default '',
  readiness_score  int,
  readiness_detail jsonb not null default '[]'::jsonb,
  valid_until      date,   -- 설교영상처럼 신선도가 있는 것
  created_at       timestamptz not null default now(),
  unique (doc_type, version)
);
-- doc_type 하나에 활성 버전은 반드시 하나
create unique index master_doc_single_active
  on master_doc (doc_type) where is_active;


create table if not exists evidence_link (
  id            uuid primary key default gen_random_uuid(),
  evidence_id   uuid not null references evidence(id)   on delete cascade,
  master_doc_id uuid not null references master_doc(id) on delete cascade,
  section       text not null default '',
  created_at    timestamptz not null default now(),
  unique (evidence_id, master_doc_id, section)
);
create index evidence_link_doc_idx on evidence_link (master_doc_id);


-- ── 증빙 (기획서 4장 B + 추천서) ──────────────────────────────────
create table if not exists credential (
  id             uuid primary key default gen_random_uuid(),
  seq            int  not null unique,   -- 기획서 4장 번호 10~21
  doc_name       text not null,
  issuer         text not null,
  lead_time_days int,                    -- null = 미확인
  lead_time_note text,
  status         text not null default 'not_started'
                   check (status in ('not_started','requested','received')),
  requested_at   date,
  received_at    date,
  valid_until    date,
  reusable       boolean not null default true,
  file_path      text,
  warning        text,                   -- 선행조건 경고 (범죄경력회보서 등)
  note           text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger credential_updated_at before update on credential
  for each row execute function set_updated_at();


-- ── ① 업로드 원본 ────────────────────────────────────────────────
create table if not exists uploaded_doc (
  id              uuid primary key default gen_random_uuid(),
  filename        text not null,
  mime            text,
  byte_size       int,
  storage_path    text,
  extracted_text  text not null default '',
  extract_status  text not null default 'extracted'
                    check (extract_status in ('extracted','failed')),
  extract_error   text,
  analysis_status text not null default 'pending'
                    check (analysis_status in ('pending','analyzed','failed')),
  analysis_error  text,
  created_at      timestamptz not null default now()
);


-- ── ① 승인 대기 조각 ─────────────────────────────────────────────
-- LLM 추출 결과는 여기까지만 들어온다. 사람이 승인해야 evidence 로 승격.
create table if not exists evidence_candidate (
  id                   uuid primary key default gen_random_uuid(),
  uploaded_doc_id      uuid not null references uploaded_doc(id) on delete cascade,
  type                 text not null check (type in
                         ('career','metric','episode','sermon',
                          'theology','competency','relationship','scrap')),
  title                text not null,
  body                 text not null default '',
  period_from          date,
  period_to            date,
  tags                 text[] not null default '{}',
  source_quote         text not null default '',  -- 원문 인용 (대조 필수)
  status               text not null default 'pending'
                         check (status in ('pending','accepted','rejected')),
  promoted_evidence_id uuid references evidence(id) on delete set null,
  created_at           timestamptz not null default now()
);
create index evidence_candidate_doc_idx
  on evidence_candidate (uploaded_doc_id, status);


-- ── ① 코칭 질문 ──────────────────────────────────────────────────
create table if not exists coach_question (
  id                   uuid primary key default gen_random_uuid(),
  rule_code            text not null check (rule_code in
                         ('timeline_gap','missing_metric','corpus_gap',
                          'weak_evidence','stale_asset')),
  dedupe_key           text not null unique,  -- 같은 사안 재생성 방지
  question             text not null,
  rationale            text not null default '',
  target_type          text check (target_type in
                         ('evidence','master_doc','credential','timeline')),
  target_id            uuid,
  priority             int  not null default 100,
  status               text not null default 'pending'
                         check (status in ('pending','answered','dismissed')),
  answered_evidence_id uuid references evidence(id) on delete set null,
  asked_at             timestamptz,
  answered_at          timestamptz,
  dismissed_at         timestamptz,
  snooze_until         date,     -- dismiss 쿨다운
  created_at           timestamptz not null default now()
);
create index coach_question_pick_idx
  on coach_question (status, priority, created_at);
