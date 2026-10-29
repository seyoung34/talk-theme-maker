# 내보내기 접수 계정 집계

`export-account-activity.sql`은 운영자가 SQL 편집기 또는 이미 안전하게 연결된 `psql`에서 직접 실행하는 단일 읽기 전용 SELECT다. 스크립트는 연결하거나 자격 증명을 받거나 저장하지 않는다. 두 테이블 전체를 읽을 수 있는 권한이 필요하며, RLS로 일부만 보이는 계정의 결과는 전체 집계가 아니다. 결과에는 계정 ID나 원시 행이 포함되지 않는다.

SQL 파일을 열어 그대로 실행하면 KST 어제를 종료일로 하는 30일을 집계한다. 특정 종료일은 첫 CTE의 `null::date`만 `DATE '2026-10-29'`처럼 유효한 날짜 리터럴로 바꾼다. 임의 텍스트를 SQL에 이어 붙이지 않는다. 존재하지 않는 날짜는 PostgreSQL 오류이고, KST 오늘보다 미래면 `validation_error`가 반환되며 집계값은 제공되지 않는다. 오늘을 지정하면 `partial_end_day`가 true이며 아직 끝나지 않은 하루다. 날짜 경계와 현재 관리자 목록은 같은 SELECT의 스냅샷에서 읽는다.

결과의 `daily_accounts`는 각 KST 날짜에 `export_jobs.created_at`으로 접수된 서로 다른 계정 수이며 0인 날짜도 포함한다. `end_day_accounts`는 종료일의 수, `window_distinct_accounts`는 종료일 포함 30일 전체에서 중복 제거한 수다. `end_day_to_window_ratio`는 전자를 후자로 나눈 값으로 분모가 0이면 NULL이다. 모든 상태의 접수를 포함하고 현재 `admin_profiles`에 있는 계정을 제외한다. 과거 관리자 여부는 알 수 없다. 이는 서비스 전체 DAU/MAU, 사람 수, 방문자 수가 아니며 내보내지 않은 사용자와 비로그인 방문자는 포함하지 않는다. GA4나 Cloudflare 수치와 합치지 않는다.

계정 삭제 시 관련 내보내기 기록도 삭제되므로, 과거 기간을 나중에 다시 조회하면 당시 실제 접수 계정 수보다 적어질 수 있다. 과거 관리자 여부도 현재 목록으로는 복원할 수 없다. 결과에는 조회 시각과 제외 기준을 함께 기록한다.

로컬 검증은 `node scripts/export-account-activity.test.mjs`로 실행한다. 실행 중인 로컬 Supabase Docker Postgres 컨테이너가 필요하며, 테스트는 임시 테이블만 사용하고 트랜잭션을 롤백한다. 운영 DB에 테스트를 실행하지 않는다.
