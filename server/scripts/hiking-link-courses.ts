/**
 * 등산 — 코스가 없는 명산에 이웃 봉우리의 코스를 잇는다(2026-10-13).
 *
 *   npx tsx --env-file=.env server/scripts/hiking-link-courses.ts [--apply]
 *
 * 받은 코스 묶음은 봉우리마다 묶여 있어, 명산(tier 1) 가운데 제 이름의 코스가 없는 산이 있다(산림청 100대 명산 40곳).
 * 그런데 이웃 봉우리의 코스 가운데 그 명산의 **정상을 지나는** 것이 있다 — 그 코스를 옮기지 않고 이어서(hiking_course_links) 명산 화면에도 보여 준다.
 *
 *  - 대상: 제 코스가 하나도 없는 명산(tier 1). 제 코스가 있는 산에는 잇지 않는다(화면이 코스로 넘친다).
 *  - 잇는 코스: 코스 선이 그 산의 정상에서 LINK_NEAR_M 안을 지나고(정상 인증이 되는 거리), 길이가 LINK_MAX_KM 아래인 것.
 *    수십 km 의 종주 기록은 그 산의 코스라고 하기 어렵다.
 *  - 이은 산의 course_count · course_min_km · course_max_km 를 이은 코스로 채운다(목록의 "코스 n개").
 *
 * --apply 가 없으면 세기만 한다. 다시 돌리면 대상 산의 줄을 지우고 새로 잇는다.
 * ⚠️ 표가 먼저 있어야 한다: migrations/hiking_course_links.sql. ⚠️ hiking-import.ts 를 다시 돌리면 course_count 가 제 코스 수(0)로 돌아가니 그 뒤에 이것을 다시 돌린다.
 */
import { pool } from "../db";
import { distM } from "../../shared/hikingGeo";
import { SUMMIT_RADIUS_M } from "../../shared/hikingStamps";

const apply = process.argv.includes("--apply");
/** 정상에서 이 안을 지나야 잇는다(m) — 정상 인증의 반경과 같다 */
const LINK_NEAR_M = SUMMIT_RADIUS_M;
/** 이보다 긴 코스는 잇지 않는다(km) */
const LINK_MAX_KM = 35;

async function main() {
    const mountains = (await pool.query(`select id, name, tier, lat, lng, (select count(*)::int from hiking_courses c where c.mountain_id = m.id) as own from hiking_mountains m`)).rows;
    const names = new Map<string, string>(mountains.map((m: any) => [m.id, m.name]));
    const targets = mountains.filter((m: any) => Number(m.tier) === 1 && Number(m.own) === 0 && m.lat != null && m.lng != null);
    const courses = (await pool.query(`select id, mountain_id, km, line from hiking_courses`)).rows;
    console.log(`제 코스가 없는 명산 ${targets.length}곳 · 코스 ${courses.length}개 · 정상 ${LINK_NEAR_M}m 안 · ${LINK_MAX_KM}km 아래`);

    const links: { mountainId: string; name: string; courseId: string; via: string; km: number; summitKm: number; d: number }[] = [];
    for (const t of targets) {
        for (const c of courses) {
            if (Number(c.km) > LINK_MAX_KM) continue;
            let best = Infinity, at = 0;
            for (const p of c.line as number[][]) {
                // 정상에서 1km 넘게 떨어진 점은 재지 않는다
                if (Math.abs(p[0] - t.lat) > 0.01 || Math.abs(p[1] - t.lng) > 0.012) continue;
                const d = distM(t.lat, t.lng, p[0], p[1]);
                if (d < best) { best = d; at = p[3]; }
            }
            if (best <= LINK_NEAR_M) links.push({ mountainId: t.id, name: t.name, courseId: c.id, via: names.get(c.mountain_id) ?? "?", km: Number(c.km), summitKm: Math.round(at * 1000) / 1000, d: Math.round(best) });
        }
    }
    const byMountain = new Map<string, typeof links>();
    for (const l of links) byMountain.set(l.mountainId, [...(byMountain.get(l.mountainId) ?? []), l]);
    for (const [id, ls] of byMountain) console.log(`  ${names.get(id)} — ${ls.map((l) => `${l.via} ${l.km}km(정상 ${l.d}m)`).join(" · ")}`);
    console.log(`이을 것: 산 ${byMountain.size}곳 · 코스 ${links.length}개 · 여전히 코스가 없는 명산 ${targets.length - byMountain.size}곳`);
    if (!apply) { console.log("세기만 했다 — 쓰려면 --apply"); return; }

    const client = await pool.connect();
    try {
        await client.query("begin");
        // 대상 산의 옛 줄을 지우고 새로 잇는다(제 코스가 생긴 산의 줄도 같이 치운다)
        await client.query(`delete from hiking_course_links where mountain_id = any($1::text[]) or mountain_id in (select mountain_id from hiking_courses)`, [targets.map((t: any) => t.id)]);
        for (const l of links) await client.query(`insert into hiking_course_links (mountain_id, course_id, summit_km) values ($1, $2, $3) on conflict (mountain_id, course_id) do update set summit_km = excluded.summit_km`, [l.mountainId, l.courseId, l.summitKm]);
        for (const [id, ls] of byMountain) {
            const kms = ls.map((l) => l.km);
            await client.query(`update hiking_mountains set course_count = $2, course_min_km = $3, course_max_km = $4, updated_at = now() where id = $1`, [id, ls.length, Math.min(...kms), Math.max(...kms)]);
        }
        await client.query("commit");
        console.log(`적었다 — 줄 ${links.length}개 · 산 ${byMountain.size}곳의 코스 수를 고쳤다`);
    } catch (e) {
        await client.query("rollback");
        throw e;
    } finally {
        client.release();
    }
}
main().then(() => pool.end()).catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });
