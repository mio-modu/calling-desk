#!/usr/bin/env bash
# Phase 1 전체 검증. dev 서버가 3100 포트에 떠 있어야 한다.
#   npx next dev -p 3100 &
#   bash scripts/verify.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "── 단위 테스트 ──"
npm test 2>&1 | grep -E '^# (tests|pass|fail)'

echo
echo "── 완료 기준 (DB 전 경로) ──"
npm run db:smoke 2>&1 | tail -8

echo
echo "── 브라우저 E2E 준비: 후보 1건 시드 ──"
psql "${DATABASE_URL:-postgresql://postgres@localhost:54329/calling_desk}" -q -c "
insert into evidence_candidate (uploaded_doc_id, type, title, body, tags, source_quote)
select id, 'metric', '청년부 출석 증가', '출석 30명에서 85명으로 늘었습니다.',
       ARRAY['청년','수치'], '청년부 출석이 30명에서 85명이 되었습니다.'
from uploaded_doc limit 1"

echo
echo "── 브라우저 E2E ──"
node scripts/e2e.mjs
