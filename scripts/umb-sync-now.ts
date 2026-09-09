/** UMB 랭킹 수동 동기화(크론과 같은 로직). `npx tsx scripts/umb-sync-now.ts [부문당최대]` */
import "dotenv/config";
import { syncUmbRankings } from "../server/services/umbSync";
const max = Number(process.argv[2] || 2);
const t0 = Date.now();
const r = await syncUmbRankings({ maxPerCategory: Number.isFinite(max) && max > 0 ? max : 2 });
console.log("확인한 회차:", r.checked, `· ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log("적재:", JSON.stringify(r.ingested));
console.log("실패:", JSON.stringify(r.errors));
if (r.namesAdded) console.log("한글 이름 추가:", r.namesAdded);
process.exit(0);
