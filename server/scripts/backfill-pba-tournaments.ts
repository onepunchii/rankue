// PBA 대회 전 시즌(2019~다음 시즌) 백필 — 일정 + 투어 목록(우승자)을 pba_tournaments 에 적재.
//   node --env-file=.env --import tsx server/scripts/backfill-pba-tournaments.ts
//   (특정 시즌만: ... backfill-pba-tournaments.ts 2024 2025)
// 멱등: id upsert 라 재실행 안전. 시즌당 요청 2개 + 300ms 간격 — 전 시즌 20요청 남짓.
// 먼저 migrations/pba_tournaments.sql 을 적용할 것. 우승자 링크의 '그 시즌 상금 랭킹' 후보는 pba_season_ranks 를 쓰므로
// PBA 랭킹 백필(server/scripts/backfill-pba.ts)이 된 DB 에서 돌린다.
import { syncPbaTournaments, fetchPbaSeasonCodes } from "../services/pbaTournaments.js";

const args = process.argv.slice(2).map(Number).filter((n) => Number.isInteger(n) && n >= 2019 && n <= 2100);
const seasons = args.length ? args : await fetchPbaSeasonCodes();
console.log("시즌:", seasons.join(", "));
const result = await syncPbaTournaments({ seasons });
for (const [season, r] of Object.entries(result.seasons)) {
    console.log(season, r === "empty" ? "일정 없음" : `행 ${r.rows} · 우승자 ${r.winners} · 선수 연결 ${r.linked} · 정리 ${r.removed}`);
}
if (result.errors.length) console.warn("실패:", result.errors);
process.exit(result.errors.length ? 1 : 0);
