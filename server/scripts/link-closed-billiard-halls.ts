// 우리 수집 매장 중 인허가 자료에 폐업 · 휴업으로 나온 곳을 잇는다(2026-10-20, 오너 "목록 · 지도에서 빼고 페이지엔 안내") — 처음 한 번.
//   npx tsx server/scripts/link-closed-billiard-halls.ts          (미리 보기)
//   npx tsx server/scripts/link-closed-billiard-halls.ts --apply
import { fetchBilliardHalls, linkClosedHalls } from "../services/billiardHalls.js";
import type { GovHallRow } from "../../shared/billiardHalls.js";
const apply = process.argv.includes("--apply");
const rows: GovHallRow[] = [];
for (const code of ["03", "02"]) {
    const r = await fetchBilliardHalls({ "cond[SALS_STTS_CD::EQ]": code });
    if (r.error) { console.error("못 받음", code, r.error); process.exit(1); }
    rows.push(...r.rows);
}
console.log(apply ? "APPLIED" : "DRY", JSON.stringify(await linkClosedHalls(rows, Date.now(), { dry: !apply })));
process.exit(0);
