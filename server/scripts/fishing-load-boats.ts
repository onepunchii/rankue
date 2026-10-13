/**
 * 낚시어선 명부를 받아 fishing_boats 표에 싣는다(해양수산부 낚시 어선업 신고정보 — 공공데이터포털, 키 DATA_GO_KR_KEY).
 *   npx tsx server/scripts/fishing-load-boats.ts [--apply]
 * --apply 가 없으면 받기만 하고 무엇을 실을지 보여 준다.
 * 지역으로 거르는 변수가 없어 전부(5천 척쯤)를 100줄씩 받는다. 한 번에 3초쯤 걸리고, 한 번에 하나씩만 부른다(여럿을 한꺼번에 부르면 막힌다).
 * 받은 값은 shared/fishingBoats(boatRow)로 읽는다 — 번호 · 이름이 없는 줄은 버린다. 같은 배의 신고가 여러 줄이면 유효기간이 더 늦은 줄을 남긴다
 * (2026-10-14: 4,981줄 → 3,993척). 표에 있던 배가 이번에 안 오면 그대로 둔다(지우지 않는다).
 */
import { sql } from "drizzle-orm";
import { db, pool } from "../db.js";
import { boatRow, type FishingBoat } from "../../shared/fishingBoats.js";

const apply = process.argv.includes("--apply");
const key = process.env.DATA_GO_KR_KEY;
if (!key) { console.error("DATA_GO_KR_KEY 가 없어요"); process.exit(1); }
const enc = /%[0-9A-Fa-f]{2}/.test(key) ? key : encodeURIComponent(key);
const URL0 = "https://apis.data.go.kr/1192000/select0230List/getselect0230List";

async function page(no: number): Promise<{ total: number; items: any[] } | null> {
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const r = await fetch(`${URL0}?type=json&numOfRows=100&pageNo=${no}&serviceKey=${enc}`, { signal: AbortSignal.timeout(20_000) });
            const j: any = await r.json().catch(() => null);
            const h = j?.responseJson?.header, items = j?.responseJson?.body?.item;
            if (h?.resultCode === "00") return { total: Number(h.totalCount) || 0, items: Array.isArray(items) ? items : items ? [items] : [] };
            if (h?.resultCode === "03") return { total: 0, items: [] };
        } catch { /* 다시 */ }
        await new Promise((r) => setTimeout(r, 2500 * (attempt + 1)));
    }
    return null;
}

const first = await page(1);
if (!first) { console.error("첫 쪽을 받지 못했어요"); process.exit(1); }
const pages = Math.ceil(first.total / 100);
const boats = new Map<string, FishingBoat>();
let dropped = 0, failed = 0;
// 같은 배의 신고가 여러 줄로 온다(해마다 다시 신고한다) — 유효기간이 더 늦은 줄을 남긴다
const take = (items: any[]) => {
    for (const it of items) {
        const b = boatRow(it);
        if (!b) { dropped++; continue; }
        const had = boats.get(b.id);
        if (!had || (b.validUntil ?? "") >= (had.validUntil ?? "")) boats.set(b.id, b);
    }
};
take(first.items);
for (let no = 2; no <= pages; no++) {
    const p = await page(no);
    if (!p) { failed++; console.log(`  ${no}쪽 못 받음`); continue; }
    take(p.items);
    if (no % 10 === 0) console.log(`  ${no}/${pages}쪽 · ${boats.size}척`);
    await new Promise((r) => setTimeout(r, 300));
}
const list = [...boats.values()];
const byRegion = new Map<string, number>();
for (const b of list) byRegion.set(b.region.split(" ")[0] || "(없음)", (byRegion.get(b.region.split(" ")[0] || "(없음)") ?? 0) + 1);
console.log(`전체 ${first.total}줄 · ${pages}쪽 → 받은 배 ${list.length} · 버린 줄 ${dropped} · 못 받은 쪽 ${failed} · 정원 있는 배 ${list.filter((b) => b.passengers).length} · 유효기간 있는 배 ${list.filter((b) => b.validUntil).length}`);
console.log([...byRegion.entries()].sort((a, b) => b[1] - a[1]).map(([r, n]) => `${r} ${n}`).join(" · "));

if (apply && list.length) {
    for (let i = 0; i < list.length; i += 200) {
        const chunk = list.slice(i, i + 200);
        await db.execute(sql`
            insert into fishing_boats (id, name, region, port, tons, passengers, valid_until, updated_at)
            values ${sql.join(chunk.map((b) => sql`(${b.id}, ${b.name}, ${b.region}, ${b.port}, ${b.tons}, ${b.passengers}, ${b.validUntil}, now())`), sql`, `)}
            on conflict (id) do update set name = excluded.name, region = excluded.region, port = excluded.port, tons = excluded.tons, passengers = excluded.passengers, valid_until = excluded.valid_until, updated_at = now()`);
    }
    const rows = await db.execute(sql`select count(*)::int as n from fishing_boats`);
    console.log("표의 배:", ((rows as any).rows ?? rows)[0].n);
} else if (!apply) console.log("(--apply 가 없어 싣지 않았어요)");
await pool.end();
