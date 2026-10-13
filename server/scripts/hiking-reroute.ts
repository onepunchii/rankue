/**
 * 등산로 그물을 코스로 다시 잇기(2026-10-13) — 옛 묶음의 GPX 가운데 조각이 여럿인 파일을 한 줄로 이어 붙여 실었던 코스를,
 * 들머리에서 정상까지의 길들로 바꾼다(shared/hikingRoutes · scripts/lib/hikingGpx).
 *
 *   npx tsx --env-file=.env server/scripts/hiking-reroute.ts <코스 파일 폴더> [--apply] [--only <봉우리 번호>]
 *
 * --apply 가 없으면 세기만 한다(아무것도 쓰지 않는다). 다시 돌려도 같다(이미 바꾼 봉우리는 같은 줄을 고쳐 쓴다).
 * 건드리는 것: 조각이 여럿인 파일에서 온 코스 줄(지우고 새 줄을 넣는다) · 그 봉우리의 지점이 붙은 코스와 거리 · 산의 코스 수와 길이 범위.
 * 건드리지 않는 것: 조각 하나짜리 파일의 코스(id · 내용 그대로) · 산림청 100대 명산에서 따로 넣은 코스(k100-…).
 * ⚠️ 지운 코스에 걸려 있던 이음(hiking_course_links)은 같이 지워진다 — 이 스크립트 뒤에 hiking-link-courses.ts --apply 를 다시 돌린다.
 */
import { appendFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { pool } from "../db";
import { courseStats, nearestOnLine, packLine, thinLine } from "../../shared/hikingGeo";
import { bundleCourses, type BundleCourse } from "./lib/hikingGpx";

const args = process.argv.slice(2);
const gpxDir = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--only" && args[i - 1] !== "--report");
const apply = args.includes("--apply");
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
/** --report <파일> — 바뀌는 봉우리마다 한 줄(JSON)을 적는다(적용 전에 훑어보려고) */
const report = args.includes("--report") ? args[args.indexOf("--report") + 1] : null;
const SUMMIT_ON_COURSE_M = 150, POI_ON_COURSE_M = 60;
const nfc = (s: string) => s.normalize("NFC");

async function main() {
    if (!gpxDir) { console.error("코스 파일 폴더를 적어 주세요."); process.exitCode = 1; return; }
    const folders = new Map<string, { dir: string; files: string[] }>();
    for (const d of readdirSync(gpxDir)) {
        const p = join(gpxDir, d);
        if (!statSync(p).isDirectory()) continue;
        const name = nfc(d), us = name.indexOf("_");
        if (us < 0) continue;
        folders.set(name.slice(0, us), { dir: p, files: readdirSync(p).filter((f) => f.toLowerCase().endsWith(".gpx")).sort() });
    }
    // 실린 봉우리 — 봉우리 번호 → 산(정상의 자리)
    const bundles = (await pool.query(
        `select c.frtrl_id, c.mountain_id, m.name, m.lat, m.lng, m.height_m, array_agg(c.id order by c.id) as ids
         from hiking_courses c join hiking_mountains m on m.id = c.mountain_id where c.frtrl_id not like 'k100-%' group by 1, 2, 3, 4, 5, 6`)).rows;
    let seen = 0, changed = 0, newRows = 0, oldRows = 0, noFolder = 0;
    const kinds: Record<string, number> = { summit: 0, span: 0 };
    const before: number[] = [], after: number[] = [];
    const touched = new Set<string>();
    const samples: string[] = [];
    for (const b of bundles) {
        if (only && b.frtrl_id !== only) continue;
        const f = folders.get(b.frtrl_id);
        if (!f) { noFolder++; continue; }
        seen++;
        const summit = b.lat != null && b.lng != null ? { lat: Number(b.lat), lng: Number(b.lng) } : null;
        const courses = bundleCourses(f.dir, f.files, b.frtrl_id, summit);
        const built = courses.filter((c) => c.built);
        // 새 줄(너무 짧은 길은 코스가 되지 않는다)
        const rows = built.map((c) => rowOf(c, b.mountain_id, summit)).filter((r): r is NonNullable<typeof r> => !!r);
        const fresh = new Set(rows.map((r) => r.id));
        // 지우는 줄 — **조각이 여럿인 파일에서 온 것만**: 예전에 한 줄로 이어 붙여 실은 줄("<번호>-<그 파일의 순번>")과, 전에 이 스크립트가 만든 줄 가운데
        // 지금은 나오지 않는 것("…r<n>"). 조각 하나짜리 파일의 코스와 그 밖의 줄은 이름이 맞지 않아 절대 지워지지 않는다.
        const multi = new Set(built.map((c) => `${b.frtrl_id}-${c.file}`));
        const stale = (b.ids as string[]).filter((id) => multi.has(id) || (/^.+-\d+r\d+$/.test(id) && !fresh.has(id)));
        if (!rows.length && !stale.length) continue;
        const keep = new Set([...courses.filter((c) => !c.built).map((c) => c.id), ...rows.map((r) => r.id)]);
        changed++; newRows += rows.length; oldRows += stale.length; touched.add(b.mountain_id);
        for (const c of built) kinds[c.kind] = (kinds[c.kind] ?? 0) + 1;
        const oldKm = (await pool.query(`select id, km from hiking_courses where id = any($1)`, [stale])).rows.map((r: any) => Number(r.km));
        before.push(...oldKm); after.push(...rows.map((r) => r.km));
        if (samples.length < 14 || only) samples.push(`${b.name}(${b.height_m ?? "?"}m · ${b.frtrl_id}): ${oldKm.map((k) => `${k}km`).join(" · ") || "-"} → ${rows.map((r) => `${r.km}km${r.summit_km != null ? "▲" : ""}`).join(" · ") || "(코스 없음)"}`);
        if (report) appendFileSync(report, JSON.stringify({ frtrl: b.frtrl_id, name: b.name, heightM: b.height_m, kind: built[0]?.kind ?? null, old: oldKm, next: rows.map((r) => ({ km: r.km, top: r.summit_km != null, gain: r.gain_m })) }) + "\n");
        if (!apply) continue;
        const client = await pool.connect();
        try {
            await client.query("begin");
            if (stale.length) await client.query(`delete from hiking_courses where id = any($1)`, [stale]);
            // 새 줄 — 한 번에(줄마다 왕복하지 않는다)
            if (rows.length) {
                await client.query(
                    `insert into hiking_courses (id, mountain_id, frtrl_id, seq, km, gain_m, loss_m, min_m, max_m, loop, summit_km, line)
                     select x.id, x.mountain_id, $2, x.seq, x.km, x.gain_m, x.loss_m, x.min_m, x.max_m, x.loop, x.summit_km, x.line
                     from jsonb_to_recordset($1::jsonb) as x(id text, mountain_id text, seq integer, km numeric, gain_m integer, loss_m integer, min_m integer, max_m integer, loop boolean, summit_km numeric, line jsonb)
                     on conflict (id) do update set mountain_id = excluded.mountain_id, seq = excluded.seq, km = excluded.km, gain_m = excluded.gain_m, loss_m = excluded.loss_m,
                        min_m = excluded.min_m, max_m = excluded.max_m, loop = excluded.loop, summit_km = excluded.summit_km, line = excluded.line, updated_at = now()`,
                    [JSON.stringify(rows), b.frtrl_id]);
            }
            // 지점 — 이 봉우리의 코스(그대로 둔 것 + 새 것) 가운데 가장 가까운 선에 붙인다(적재와 같은 기준). 한 번에 고친다
            const usable = courses.filter((c) => keep.has(c.id));
            const pois = (await client.query(`select id, lat, lng from hiking_pois where frtrl_id = $1`, [b.frtrl_id])).rows;
            const moved = pois.map((p: any) => {
                let best: { id: string; km: number; off: number } | null = null;
                for (const c of usable) { const on = nearestOnLine(c.line, Number(p.lat), Number(p.lng)); if (on && on.offM <= POI_ON_COURSE_M && (!best || on.offM < best.off)) best = { id: c.id, km: on.km, off: on.offM }; }
                const hit = best as { id: string; km: number; off: number } | null;
                return { id: p.id, c: hit?.id ?? null, k: hit ? Math.round(hit.km * 1000) / 1000 : null };
            });
            if (moved.length) await client.query(`update hiking_pois p set course_id = x.c, km = x.k from jsonb_to_recordset($1::jsonb) as x(id text, c text, k numeric) where p.id = x.id`, [JSON.stringify(moved)]);
            await client.query("commit");
        } catch (e) { await client.query("rollback"); throw e; } finally { client.release(); }
    }
    if (apply && touched.size) {
        // 산의 코스 수 · 길이 범위를 다시 센다
        await pool.query(
            `update hiking_mountains m set course_count = s.n, course_min_km = s.lo, course_max_km = s.hi, updated_at = now()
             from (select m2.id, count(c.id)::int as n, min(c.km) as lo, max(c.km) as hi from hiking_mountains m2 left join hiking_courses c on c.mountain_id = m2.id where m2.id = any($1) group by m2.id) s
             where m.id = s.id`, [[...touched]]);
    }
    const med = (a: number[]) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);
    console.log(`${apply ? "적용" : "세기만"} — 본 봉우리 ${seen}(폴더 없음 ${noFolder}) · 바뀌는 봉우리 ${changed} · 산 ${touched.size} · 지우는 코스 ${oldRows} → 새 코스 ${newRows}`);
    console.log(`만든 길: 들머리 → 정상 ${kinds.summit} · 끝에서 끝 ${kinds.span}`);
    console.log(`길이(가운데 값) ${med(before)}km → ${med(after)}km · 가장 긴 것 ${Math.max(0, ...before)}km → ${Math.max(0, ...after)}km · 10km 넘는 코스 ${before.filter((k) => k > 10).length} → ${after.filter((k) => k > 10).length}`);
    for (const s of samples) console.log("  " + s);

    function rowOf(c: BundleCourse, mountainId: string, top: { lat: number; lng: number } | null) {
        const s = courseStats(c.line);
        if (s.km < 0.2) return null;
        const on = top ? nearestOnLine(c.line, top.lat, top.lng) : null;
        return {
            // 순번 — 파일 순번 × 100 + 길 순번(같은 파일의 길들이 나란히 놓인다)
            id: c.id, mountain_id: mountainId, seq: c.file * 100 + Number(c.id.split("r").pop()), km: Math.round(s.km * 100) / 100, gain_m: s.gainM, loss_m: s.lossM, min_m: s.minM, max_m: s.maxM, loop: s.loop,
            summit_km: on && on.offM <= SUMMIT_ON_COURSE_M ? Math.round(on.km * 1000) / 1000 : null, line: packLine(thinLine(c.line)),
        };
    }
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => pool.end());
