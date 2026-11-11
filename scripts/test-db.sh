#!/usr/bin/env bash
# 로컬 PostgreSQL에서 Supabase 마이그레이션과 RLS 시험 실행
# 필요: psql, 비어 있는 PostgreSQL 서버 (PGHOST/PGPORT/PGUSER 환경 변수로 지정)
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${TEST_DB:-payday_test}"
psql -q -v ON_ERROR_STOP=1 -c "drop database if exists ${DB}" -c "create database ${DB}"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/supabase_shim.sql
for f in supabase/migrations/*.sql; do psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f"; done
psql -q -t -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/rls_test.sql 2>&1 | sed -n 's/.*NOTICE:  //p; /ERROR\|FAIL\|PASSED/p'
test "${PIPESTATUS[0]}" -eq 0
