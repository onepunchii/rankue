/** PBA 수동 동기화(크론과 같은 로직). `npx tsx scripts/pba-sync-now.ts` */
import "dotenv/config";
import { syncPba } from "../server/services/pbaSync";
const t0 = Date.now();
const r = await syncPba();
console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s · 시즌:`, JSON.stringify(r.seasons), "· 상세 갱신:", r.detailsUpdated, "· UMB 매칭:", r.umbMatched);
process.exit(0);
