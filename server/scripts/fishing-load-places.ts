/**
 * 받은 낚시터 자료(fishing_places.json — ~/Desktop/Antigravity/_content/out/fishing)를 걸러 fishing_places 표에 싣는다.
 *   npx tsx server/scripts/fishing-load-places.ts <fishing_places.json> [--apply]
 * --apply 가 없으면 무엇을 실을지만 보여 준다. 받은 값은 그대로 믿지 않는다:
 *  - 좌표에 표시(flags)가 붙은 곳(주소와 시도/시군구가 다름 · 국내 범위 밖)은 **좌표를 비운다**. '육지 경계 밖'은 바다 위 시설일 수 있어 둔다.
 *  - 이름이 없는 줄은 버린다. 전화번호 · 요금은 원문 그대로(오래된 값일 수 있어 화면이 자료 기준일을 같이 보여 준다).
 */
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { db, pool } from "../db.js";

const [file, flag] = process.argv.slice(2);
if (!file) { console.error("쓰는 법: fishing-load-places.ts <fishing_places.json> [--apply]"); process.exit(1); }
const raw = JSON.parse(readFileSync(file, "utf8")) as any[];
const str = (v: unknown, max: number): string | null => { const s = String(v ?? "").trim(); return s && s !== "None" && s !== "null" ? s.slice(0, max) : null; };
const num = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) && n !== 0 ? n : null; };
const badCoord = (flags: unknown): boolean => (Array.isArray(flags) ? flags : []).some((f) => /다름|범위 밖|좌표 없음/.test(String(f)));

const rows = raw.flatMap((r) => {
    const name = str(r.name, 60), id = str(r.id, 40);
    if (!name || !id) return [];
    const drop = badCoord(r.flags);
    const lat = drop ? null : num(r.lat), lng = drop ? null : num(r.lon);
    const inKorea = lat != null && lng != null && lat > 32.5 && lat < 39 && lng > 124 && lng < 132;
    const species = (Array.isArray(r.species) ? r.species : []).map((x: unknown) => str(x, 20)).filter(Boolean).slice(0, 12);
    return [{ id, name, kind: str(r.type, 10), sido: str(r.sido, 20), sigungu: str(r.sigungu, 20), address: str(r.addressRoad, 120) ?? str(r.addressLot, 120), lat: inKorea ? lat : null, lng: inKorea ? lng : null, species, fee: str(r.feeRaw, 120), tel: str(r.tel, 20), data_date: str(r.dataDate, 10) }];
});
const withCoord = rows.filter((r) => r.lat != null).length;
console.log(`받은 줄 ${raw.length} → 실을 줄 ${rows.length} · 좌표 있는 곳 ${withCoord} · 좌표를 비운 곳 ${rows.length - withCoord} · 어종 적힌 곳 ${rows.filter((r) => r.species.length).length} · 요금 적힌 곳 ${rows.filter((r) => r.fee).length}`);

if (flag === "--apply") {
    for (let i = 0; i < rows.length; i += 300) {
        const part = JSON.stringify(rows.slice(i, i + 300));
        await db.execute(sql`
            insert into fishing_places (id, name, kind, sido, sigungu, address, lat, lng, species, fee, tel, data_date, updated_at)
            select x.id, x.name, x.kind, x.sido, x.sigungu, x.address, x.lat, x.lng, coalesce(array(select jsonb_array_elements_text(x.species)), '{}'), x.fee, x.tel, x.data_date, now()
            from jsonb_to_recordset(${part}::jsonb) as x(id text, name text, kind text, sido text, sigungu text, address text, lat double precision, lng double precision, species jsonb, fee text, tel text, data_date text)
            on conflict (id) do update set name = excluded.name, kind = excluded.kind, sido = excluded.sido, sigungu = excluded.sigungu, address = excluded.address, lat = excluded.lat, lng = excluded.lng,
                species = excluded.species, fee = excluded.fee, tel = excluded.tel, data_date = excluded.data_date, updated_at = now()`);
    }
    const [n] = ((await db.execute(sql`select count(*)::int as n from fishing_places`)) as any).rows ?? [];
    console.log("실었다 — 표의 줄 수", n?.n);
} else {
    console.log("보기만 했다(--apply 를 붙이면 싣는다). 첫 줄:", JSON.stringify(rows[0]).slice(0, 260));
}
await pool.end();
