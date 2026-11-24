#!/usr/bin/env bash
# Neon → Supabase 데이터 옮기기(2026-11-24 준비). 원본은 읽기만 한다.
#
#   SRC_URL=<Neon 직결 주소(DATABASE_URL_UNPOOLED)> DST_URL=<Supabase 세션 풀러 주소(5432)> scripts/migrate-db.sh [dry]
#
# - 받는 쪽은 새로 만든 빈 Supabase 프로젝트여야 한다(같은 표가 있으면 멈춘다).
# - neon_auth 스키마(Neon 인증, 코드에서 안 씀)와 Neon 소유자·권한은 옮기지 않는다.
# - pg_trgm 은 받는 쪽 public 에 새로 설치된다(인덱스가 public.gin_trgm_ops 를 씀). pgcrypto·uuid-ossp 는
#   Supabase 가 extensions 스키마에 이미 깔아 두어 그대로 쓴다(덤프가 public.* 로 부르는 곳 없음 — 확인함).
# - 끝나면 모든 표의 행 수를 양쪽에서 정확히 세어 비교한다. 하나라도 다르면 실패로 끝난다.
# - 옮기는 동안 원본에 들어온 쓰기는 빠지므로, 예약 작업을 멈춘 뒤 돌린다.
set -euo pipefail
P=/opt/homebrew/opt/libpq/bin
: "${SRC_URL:?SRC_URL 필요}" "${DST_URL:?DST_URL 필요}"
DRY=${1:-}
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

echo "▶ 받는 쪽 비어 있는지"
n=$("$P/psql" "$DST_URL" -Atc "select count(*) from pg_tables where schemaname='public'")
[ "$n" = 0 ] || { echo "받는 쪽 public 에 표가 ${n}개 있음 — 멈춤"; exit 1; }

echo "▶ 원본 덤프(읽기만)"
# 디렉터리 형식 + 4개 동시(같은 스냅숏을 나눠 읽음) — 2026-11-24 리허설에서 한 줄로 받으니 랭큐 296MB 에 9분 넘게 걸렸다
"$P/pg_dump" -Fd -j 4 --no-owner --no-acl -N neon_auth -d "$SRC_URL" -f "$WORK/db.dump"
du -sh "$WORK/db.dump" | awk '{print "  덤프 크기", $1}'
[ "$DRY" = dry ] && { echo "dry: 여기까지"; exit 0; }

echo "▶ 받는 쪽에 넣기"
"$P/pg_restore" --no-owner --no-acl --exit-on-error -j 4 -d "$DST_URL" "$WORK/db.dump"

echo "▶ 시퀀스·통계"
"$P/psql" "$DST_URL" -q -c "analyze"

echo "▶ 표마다 행 수 비교"
count_sql="select string_agg(format('select %L t, count(*) n from public.%I', tablename, tablename), ' union all ' order by tablename) from pg_tables where schemaname='public'"
q=$("$P/psql" "$SRC_URL" -Atc "$count_sql")
"$P/psql" "$SRC_URL" -At -F' ' -c "$q order by 1" > "$WORK/src.txt"
"$P/psql" "$DST_URL" -At -F' ' -c "$q order by 1" > "$WORK/dst.txt"
if diff -u "$WORK/src.txt" "$WORK/dst.txt"; then
  echo "✅ 표 $(wc -l < "$WORK/src.txt")개 행 수 모두 같음"
else
  echo "❌ 행 수가 다른 표가 있음(위)"; exit 1
fi
