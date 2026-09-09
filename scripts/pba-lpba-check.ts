/** LPBA 2026 시즌이 원본에 있는지 확인(읽기만). `npx tsx scripts/pba-lpba-check.ts` */
import "dotenv/config";
import { fetchSeasonRanking, currentPbaSeason } from "../server/services/pbaService";
const cur = new Date().getMonth() + 1 >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1;
for (const league of ["PBA", "LPBA"] as const) {
  for (const season of [cur, cur - 1]) {
    try {
      const rows = await fetchSeasonRanking(league, season);
      console.log(`${league} ${season}: ${rows.length}명` + (rows[0] ? ` · 1위 ${rows[0].nameKo} (상금순위 ${rows[0].prizeRank})` : ""));
    } catch (e: any) { console.log(`${league} ${season}: 실패 ${e?.message}`); }
  }
}
process.exit(0);
