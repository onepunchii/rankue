/** 골프 랭킹 수동 동기화(크론과 같은 로직). `npx tsx scripts/golf-sync-now.ts [owgr|rolex|kpga|klpga|all] [--force]` */
import "dotenv/config";
import { GOLF_TOURS, isGolfTour, type GolfTour } from "../shared/golfTours";
import { syncGolfTours } from "../server/services/golf/golfSync";
import { notifyGolfFollowers } from "../server/services/playerFollowAlerts";

const arg = process.argv[2] || "all";
const force = process.argv.includes("--force");
const tours: GolfTour[] = arg === "all" ? [...GOLF_TOURS] : isGolfTour(arg) ? [arg] : [];
if (!tours.length) { console.error("투어: owgr | rolex | kpga | klpga | all"); process.exit(1); }

const t0 = Date.now();
const results = await syncGolfTours(tours, { force });
for (const r of results) console.log(JSON.stringify(r));
// 새 회차가 생긴 투어는 관심 선수 알림까지(크론과 같게)
const alerts = await notifyGolfFollowers(results.filter((r) => r.newEdition).map((r) => r.tour));
console.log("관심 선수 알림:", JSON.stringify(alerts), `· ${((Date.now() - t0) / 1000).toFixed(1)}s`);
process.exit(0);
