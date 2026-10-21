// 인허가 자료의 전화로 비어 있는 매장 전화를 채운다(2026-10-21 — 처음 한 번. 그 뒤로는 매일 크론이 바뀐 줄을 따라간다).
//   npx tsx server/scripts/backfill-hall-phones.ts          (미리 보기 — 몇 곳이 채워지는지만)
//   npx tsx server/scripts/backfill-hall-phones.ts --apply
// 지역번호 · 070 · 050 만(shared/billiardHalls hallPhone). 이미 전화가 있는 행 · 사장님 인증 매장은 건드리지 않는다. 번호는 찍지 않는다.
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { fetchBilliardHalls } from "../services/billiardHalls.js";
import { govHallOf, type GovHall } from "../../shared/billiardHalls.js";

const apply = process.argv.includes("--apply");
const got = await fetchBilliardHalls({ "cond[SALS_STTS_CD::EQ]": "01" });
if (got.error || got.rows.length < got.total * 0.9) { console.error("덜 받음", got.error, got.rows.length, got.total); process.exit(1); }
const withPhone = got.rows.map(govHallOf).filter((g): g is GovHall => !!g && !!g.phone);
const rowsOf = (r: any) => (r.rows ?? r) as any[];
const empty = rowsOf(await db.execute(sql`select gov_key, source from store_listings where gov_key is not null and phone is null and not claimed`));
const byKey = new Map(empty.map((r) => [String(r.gov_key), String(r.source)]));
const fill = withPhone.filter((g) => byKey.has(g.key));
const gov = fill.filter((g) => byKey.get(g.key) === "gov").length;
console.log(JSON.stringify({ fetched: got.rows.length, withPhone: withPhone.length, emptyRows: empty.length, fill: fill.length, gov, collected: fill.length - gov }));
if (!apply || !fill.length) process.exit(0);
const at = new Date().toISOString();
for (let i = 0; i < fill.length; i += 300) {
    const part = fill.slice(i, i + 300);
    const vals = sql.join(part.map((g) => sql`(${g.key}, ${g.phone})`), sql`, `);
    await db.execute(sql`update store_listings s set phone = v.tel, updated_at = ${at}::timestamp
        from (values ${vals}) as v(key, tel) where s.gov_key = v.key and s.phone is null and not s.claimed`);
}
console.log("APPLIED", fill.length);
process.exit(0);
