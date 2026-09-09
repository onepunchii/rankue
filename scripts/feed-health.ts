/** 랭킹 수집 건강 점검(읽기만, 알림 없음). `npx tsx scripts/feed-health.ts` */
import "dotenv/config";
import { checkUmbHealth, checkPbaHealth, summarize } from "../server/services/feedHealth";
const [umb, pba] = await Promise.all([checkUmbHealth(), checkPbaHealth()]);
const all = [...umb, ...pba];
console.log(all.length === 0 ? "정상 — 두 수집기 모두 최신입니다" : "문제: " + summarize(all));
process.exit(0);
