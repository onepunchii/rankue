// PBA 전 시즌(2019~현재) 백필 — 랭킹 + 전체 선수 통산 스탯 + UMB 교차 매칭.
//   DATABASE_URL=... npx tsx server/scripts/backfill-pba.ts
// 멱등: (memCode, season) upsert라 재실행 안전.
import { syncPba } from "../services/pbaSync.js";

const result = await syncPba({ fullBackfill: true });
console.log("시즌별 적재:", result.seasons);
console.log(`선수 상세 갱신 ${result.detailsUpdated}명 | UMB 교차 매칭 ${result.umbMatched}명`);
process.exit(0);
