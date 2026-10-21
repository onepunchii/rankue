// 전국 축제 처음 채우기(2026-10-21) — 목록 전부 + 상세를 많이(기본 600곳). 매일은 크론(/api/cron/billiard-halls 뒤에 얹음)이 40곳씩.
//   npx tsx server/scripts/sync-festivals.ts            (목록 + 상세 600곳)
//   npx tsx server/scripts/sync-festivals.ts 100        (상세 100곳만)
//   npx tsx server/scripts/sync-festivals.ts 0 --no-list (목록은 건너뛰고 아무것도 안 함 — 셈 확인용)
// 개발 계정은 기능마다 하루 1,000번 — 상세는 한 곳에 두 기능을 한 번씩 부른다.
import { syncFestivals } from "../services/festivalSync.js";

const n = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 600);
const r = await syncFestivals({ detailMax: n, list: !process.argv.includes("--no-list") });
console.log(JSON.stringify(r));
process.exit(r.error ? 1 : 0);
