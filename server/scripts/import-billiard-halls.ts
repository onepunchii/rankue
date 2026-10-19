// 전국 당구장 인허가 자료를 매장 디렉토리에 처음 한 번 넣는다(2026-10-19) — 영업 중 전부 · 우리 매장과 같은 곳은 gov_* 열만.
//   npx tsx server/scripts/import-billiard-halls.ts          (미리 보기 — 쓰지 않는다)
//   npx tsx server/scripts/import-billiard-halls.ts --apply  (쓴다)
// 그 뒤로는 매일 크론(/api/cron/billiard-halls)이 최근 사흘 사이 바뀐 줄만 받는다. 셈은 shared/billiardHalls, 쓰는 법은 services/billiardHalls.
import { syncBilliardHalls } from "../services/billiardHalls.js";
const apply = process.argv.includes("--apply");
const r = await syncBilliardHalls("full", Date.now(), { dry: !apply });
console.log(apply ? "APPLIED" : "DRY", JSON.stringify(r));
process.exit(0);
