/**
 * 두 줄로 실린 산을 하나로(2026-10-13) — shared/hikingTwins 의 쌍마다 글을 자리 있는 줄로 옮기고 자리 없는 줄을 지운다.
 *
 *   npx tsx --env-file=.env server/scripts/hiking-fold-twins.ts [--apply]
 *
 * --apply 가 없으면 세기만 한다(아무것도 쓰지 않는다). 다시 돌려도 같다(이미 합친 쌍은 건너뛴다).
 * 지키는 것:
 *   · 자리 있는 줄에 이미 글이 있으면 덮어쓰지 않는다.
 *   · 자리 없는 줄에 무엇이든 걸려 있으면(정상 도장 · 가고 싶은 산 · 사진 · 산행 · 코스 · 지점) 지우지 않고 알린다.
 *   · 쌍의 두 줄이 목록과 다르면(주소가 바뀌었거나, 자리 없는 줄에 자리가 생겼으면) 그 쌍은 건드리지 않는다.
 * hiking-import.ts 도 같은 목록을 본다 — 다시 적재해도 지운 줄이 되살아나지 않고 글은 남는 줄에 붙는다.
 */
import { pool } from "../db";
import { HIKING_TWINS } from "../../shared/hikingTwins";

const apply = process.argv.includes("--apply");
/** 산을 가리키는 표들 — 자리 없는 줄에 걸린 것이 하나라도 있으면 지우지 않는다 */
const REF_TABLES = ["hiking_courses", "hiking_pois", "hiking_course_links", "hiking_summits", "hiking_wishes", "hiking_photos", "hiking_trips"];

async function refs(id: string): Promise<number> {
    let n = 0;
    for (const t of REF_TABLES) {
        try { n += (await pool.query(`select count(*)::int as n from ${t} where mountain_id = $1`, [id])).rows[0].n; }
        catch (e: any) { if (!/does not exist/.test(String(e?.message))) throw e; }
    }
    return n;
}

async function main() {
    let moved = 0, removed = 0, done = 0, held = 0;
    for (const t of HIKING_TWINS) {
        const rows = (await pool.query(`select id, slug, name, sido, (guide is not null) as has_guide from hiking_mountains where id = any($1)`, [[t.from, t.into]])).rows;
        const from = rows.find((r: any) => r.id === t.from), into = rows.find((r: any) => r.id === t.into);
        if (!into || into.slug !== t.intoSlug || !into.sido) { held++; console.log("보류(남는 줄이 목록과 다름):", t.intoSlug); continue; }
        if (!from) { done++; continue; }
        if (from.slug !== t.fromSlug || from.sido || from.name !== into.name) { held++; console.log("보류(지울 줄이 목록과 다름):", t.fromSlug); continue; }
        const n = await refs(t.from);
        if (n > 0) { held++; console.log("보류(걸린 줄", n, "):", t.fromSlug); continue; }
        const give = from.has_guide && !into.has_guide;
        if (!apply) { if (give) moved++; removed++; continue; }
        const c = await pool.connect();
        try {
            await c.query("begin");
            if (give) { await c.query(`update hiking_mountains set guide = (select guide from hiking_mountains where id = $1), updated_at = now() where id = $2 and guide is null`, [t.from, t.into]); moved++; }
            await c.query(`delete from hiking_mountains where id = $1 and sido is null`, [t.from]);
            await c.query("commit");
            removed++;
        } catch (e) { await c.query("rollback"); throw e; } finally { c.release(); }
    }
    console.log(`${apply ? "적용" : "세기만"} — 쌍 ${HIKING_TWINS.length} · 글 옮김 ${moved} · 지움 ${removed} · 이미 합쳐짐 ${done} · 보류 ${held}`);
    const left = (await pool.query(`select count(*)::int as n, count(*) filter (where guide is not null)::int as g from hiking_mountains where sido is null`)).rows[0];
    console.log("자리 없는 산:", left.n, "(글 있는 것", left.g, ")");
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => pool.end());
