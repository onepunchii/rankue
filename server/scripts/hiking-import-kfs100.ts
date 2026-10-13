/**
 * 등산 — 산림청 100대 명산 코스 파일 적재(2026-10-13).
 *
 *   npx tsx --env-file=.env server/scripts/hiking-import-kfs100.ts <받은 폴더> [--apply] [--only <산 이름>]
 *
 *   <받은 폴더>  공공데이터포털 '한국등산트레킹지원센터_산림청 100대명산'(15098177)을 푼 곳 — '<산 이름>/<산 이름>_<순번>.gpx' 607개.
 *               같은 이름의 산은 폴더가 '백운산(광양)' · '지리산(통영)' 꼴이다.
 *
 * 무엇을 싣나
 *  - 코스 선: 파일 하나가 코스 하나. 구간(trkseg)이 여럿인 파일은 **가장 긴 구간(본선)** 만 쓴다 — 나머지는 본선의 중간에서 갈라지는 곁길이라
 *    한 줄로 이으면 선이 건너뛴다(구간 사이 327곳 가운데 281곳이 60m 넘게 떨어져 있다).
 *  - 길의 종류: 점마다 적힌 구간 종류(오솔길 · 계단 · 너덜길 …)를 코스마다 더한다(shared/hikingSurface → hiking_courses.surface).
 *  - 길 위의 지점: 화장실 · 약수터 · 주차장 · 들머리 · 조망점 · 갈림길 … (shared/hikingPois hikingPoiKindOfGpx — 가게 이름과 이름뿐인 경관은 싣지 않는다).
 *    본선에서 60m 안이면 그 코스의 지점으로(출발부터의 거리), 아니면 산의 지점으로만.
 *  - 이미 있는 코스(전국 주요 봉우리 코스에서 온 것)와 **같은 길이면 새로 싣지 않는다** — 길이가 10% 안이고 서로의 선 위를 걷는 것.
 *
 * 싣지 않는 것: 높이 기록이 없는 선(대암산 — 점마다 0m) · 정상에서 5km 넘게 떨어진 폴더(천성산 폴더의 길은 14km 밖의 토곡산이다 — 공식 좌표도 같은 곳을 가리킨다).
 * 산은 건드리지 않는다(이름 · 주소 그대로) — 코스 수 · 가장 짧은/긴 코스 · 지점 수만 다시 센다. 정상 자리는 shared/hikingSummitFix 의 표와 다르면 그 값으로 맞춘다.
 * --apply 가 없으면 세기만 한다. 다시 돌려도 같은 줄을 고쳐 쓴다(코스 id 'k100-<산 id>-<순번>' · 지점 id 'k100:<받은 번호>').
 *
 * ⚠️ 먼저: migrations/hiking_course_surface.sql(칸 하나 더하기).
 * ⚠️ 순서: hiking-import.ts(산의 코스 수를 제 묶음의 수로 되돌린다) → **이것** → hiking-link-courses.ts --apply(제 코스가 생긴 산의 이어 둔 줄을 치운다).
 * ⚠️ 맥의 폴더 이름은 풀어쓴 한글(NFD)이다 — 반드시 NFC 로 바꿔 견준다. 받은 파일은 읽기만 한다.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { pool } from "../db";
import { courseStats, distM, nearestOnLine, packLine, thinLine, withKm, type LinePoint } from "../../shared/hikingGeo";
import { hikingPoiKindOfGpx, signpostNote } from "../../shared/hikingPois";
import { HIKING_SUMMIT_FIXES } from "../../shared/hikingSummitFix";
import { SURFACE_MIN_COVER, packSurface, surfaceOfNames, type SurfaceId } from "../../shared/hikingSurface";

const args = process.argv.slice(2);
const flagAt = (f: string) => args.indexOf(f);
const [dir] = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--only");
const apply = args.includes("--apply");
const only = flagAt("--only") >= 0 ? args[flagAt("--only") + 1] : null;

/** 정상이 코스 선에서 이 안이면 그 코스가 정상을 지난다(hiking-import.ts 와 같다) */
const SUMMIT_ON_COURSE_M = 150;
/** 지점이 코스 선에서 이 안이면 그 코스 위의 지점이다 */
const POI_ON_COURSE_M = 60;
/** 이보다 짧은 선은 코스가 아니다 */
const MIN_KM = 0.2;
/** 같은 길로 보는 기준 — 길이의 차이 · 서로의 선에서 떨어진 거리 · 그 안에 드는 점의 몫 */
const SAME_KM_RATIO = 0.1, SAME_OFF_M = 100, SAME_SHARE = 0.9, SAME_SAMPLES = 24;
/** 산의 정상이 그 폴더의 코스에서 이보다 멀면 그 산의 길이 아니다 — 그 폴더는 싣지 않는다 */
const FOLDER_FAR_KM = 5;

const nfc = (s: string) => s.normalize("NFC");
const cdata = (s: string | undefined | null) => (s == null ? "" : s.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim());
const tag = (body: string, name: string) => { const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(body); return m ? cdata(m[1]) : ""; };

interface RawPoint { lat: number; lng: number; ele: number; rt: string }
interface RawWpt { sym: string; lat: number; lng: number; ele: number | null; name: string; category: string; signs: string[] }
function parseFile(file: string): { segs: RawPoint[][]; wpts: RawWpt[]; rtName: Map<string, string> } {
    const t = readFileSync(file, "utf8");
    const rtName = new Map<string, string>();
    for (const m of t.matchAll(/<rtsc\b[^>]*\brtcd="(\d+)"[^>]*>\s*<name>([\s\S]*?)<\/name>/g)) if (!rtName.has(m[1])) rtName.set(m[1], cdata(m[2]));
    const segs: RawPoint[][] = [];
    for (const s of t.matchAll(/<trkseg>([\s\S]*?)<\/trkseg>/g)) {
        const pts: RawPoint[] = [];
        for (const m of s[1].matchAll(/<trkpt\s+lat="([-\d.]+)"\s+lon="([-\d.]+)"\s*>([\s\S]*?)<\/trkpt>/g)) {
            // 구간 번호는 여럿이 겹쳐 적히기도 한다("1;3" — 오솔길 위의 계단)
            const ele = /<ele>([-\d.]+)<\/ele>/.exec(m[3]), rt = /<rtcd>([\d;]+)<\/rtcd>/.exec(m[3]);
            const lat = Number(m[1]), lng = Number(m[2]);
            if (Number.isFinite(lat) && Number.isFinite(lng)) pts.push({ lat, lng, ele: ele ? Number(ele[1]) : 0, rt: rt ? rt[1] : "" });
        }
        if (pts.length >= 2) segs.push(pts);
    }
    const wpts: RawWpt[] = [];
    for (const m of t.matchAll(/<wpt\s+lat="([-\d.]+)"\s+lon="([-\d.]+)"\s*>([\s\S]*?)<\/wpt>/g)) {
        const body = m[3], ele = /<ele>([-\d.]+)<\/ele>/.exec(body);
        const signs = [1, 2, 3, 4].map((i) => tag(body, `signpost${i}`).split(";")[0]);
        wpts.push({ sym: tag(body, "sym"), lat: Number(m[1]), lng: Number(m[2]), ele: ele ? Number(ele[1]) : null, name: tag(body, "name"), category: tag(body, "category"), signs });
    }
    return { segs, wpts, rtName };
}
const lineOf = (pts: readonly RawPoint[]): LinePoint[] => withKm(pts.map((p) => [p.lat, p.lng, p.ele] as const));

/** a 의 점들이 b 의 선 위에 있는 몫 */
function shareOn(a: readonly LinePoint[], b: readonly LinePoint[]): number {
    let hit = 0;
    for (let i = 0; i < SAME_SAMPLES; i++) {
        const p = a[Math.round((i / (SAME_SAMPLES - 1)) * (a.length - 1))];
        const on = nearestOnLine(b, p[0], p[1]);
        if (on && on.offM <= SAME_OFF_M) hit++;
    }
    return hit / SAME_SAMPLES;
}
const sameRoute = (a: readonly LinePoint[], akm: number, b: readonly LinePoint[], bkm: number) =>
    Math.abs(akm - bkm) / Math.max(akm, bkm) <= SAME_KM_RATIO && shareOn(a, b) >= SAME_SHARE && shareOn(b, a) >= SAME_SHARE;

async function upsert(table: string, cols: readonly [string, string][], key: string, rows: Record<string, unknown>[], size: number, client: { query: (q: string, v: unknown[]) => Promise<unknown> }, touch = true) {
    const names = cols.map(([c]) => c);
    for (let i = 0; i < rows.length; i += size) {
        const batch = rows.slice(i, i + size);
        const set = names.filter((c) => c !== key).map((c) => `${c} = excluded.${c}`).concat(touch ? ["updated_at = now()"] : []).join(", ");
        await client.query(
            `insert into ${table} (${names.join(", ")}) select ${names.join(", ")} from jsonb_to_recordset($1::jsonb) as x(${cols.map(([c, t]) => `${c} ${t}`).join(", ")})
             on conflict (${key}) do update set ${set}`,
            [JSON.stringify(batch)],
        );
    }
}

async function main() {
    if (!dir) { console.error("받은 폴더의 경로를 적어 주세요."); process.exitCode = 1; return; }
    const mountains: any[] = (await pool.query(`select id, name, slug, sido, sigungu, lat, lng from hiking_mountains where lists @> '[{"list":"kfs100"}]'`)).rows;
    console.log("산림청 100대 명산(우리 표):", mountains.length);
    // 정상 자리 — 바로잡기 표와 다르면 그 값으로(이 자리로 '정상을 지나는가'를 잰다)
    const moved: { id: string; lat: number; lng: number; name: string; m: number }[] = [];
    for (const m of mountains) {
        const f = HIKING_SUMMIT_FIXES.find((x) => x.id === m.id && x.name === m.name);
        if (!f) continue;
        const d = m.lat == null ? Infinity : distM(Number(m.lat), Number(m.lng), f.lat, f.lng);
        if (d > 1) { moved.push({ id: m.id, lat: f.lat, lng: f.lng, name: m.name, m: Math.round(d) }); m.lat = f.lat; m.lng = f.lng; }
    }
    if (moved.length) console.log("정상 자리를 표에 맞춘다:", moved.map((x) => `${x.name} ${x.m}m`).join(" · "));

    // 폴더 → 산. 같은 이름이 여럿이면 괄호 안의 지역으로 가른다(백운산(광양) · 지리산(통영)); 괄호 없는 폴더는 남은 산 가운데 코스에서 가까운 산
    const folders = readdirSync(dir).filter((d) => statSync(join(dir, d)).isDirectory()).map((d) => {
        const name = nfc(d);
        return { dir: join(dir, d), name, base: name.replace(/\(.*?\)/g, "").trim(), hint: /\((.*?)\)/.exec(name)?.[1]?.trim() ?? null, files: readdirSync(join(dir, d)).filter((f) => f.toLowerCase().endsWith(".gpx")).sort() };
    }).sort((a, b) => (a.hint ? 0 : 1) - (b.hint ? 0 : 1) || a.name.localeCompare(b.name));
    const parsed = new Map<string, ReturnType<typeof parseFile>[]>();
    const filesOf = (f: (typeof folders)[number]) => { let v = parsed.get(f.name); if (!v) { v = f.files.map((x) => parseFile(join(f.dir, x))); parsed.set(f.name, v); } return v; };
    const nearKm = (f: (typeof folders)[number], m: any) => {
        let best = Infinity;
        for (const file of filesOf(f)) for (const seg of file.segs) for (const p of seg) { const d = distM(m.lat, m.lng, p.lat, p.lng); if (d < best) best = d; }
        return best / 1000;
    };
    const claimed = new Set<string>();
    const match = new Map<string, any>();
    const unmatched: string[] = [];
    for (const f of folders) {
        const cands = mountains.filter((m) => String(m.name).replace(/\(.*?\)/g, "").trim() === f.base && !claimed.has(m.id));
        let m: any = null;
        if (f.hint) m = cands.find((c) => `${c.sido ?? ""} ${c.sigungu ?? ""} ${c.slug}`.includes(f.hint!)) ?? null;
        else if (cands.length === 1) m = cands[0];
        else if (cands.length > 1) m = cands.map((c) => ({ c, d: nearKm(f, c) })).sort((a, b) => a.d - b.d)[0].c;
        if (!m) { unmatched.push(f.name); continue; }
        claimed.add(m.id); match.set(f.name, m);
    }
    console.log(`폴더 ${folders.length} · 이은 산 ${match.size}${unmatched.length ? ` · 못 이은 폴더: ${unmatched.join(", ")}` : ""}`);
    const far = folders.filter((f) => match.has(f.name)).map((f) => ({ f: f.name, km: nearKm(f, match.get(f.name)) })).filter((x) => x.km > 1.5).sort((a, b) => b.km - a.km);
    if (far.length) console.log("정상이 코스에서 1.5km 넘게 떨어진 산:", far.map((x) => `${x.f} ${x.km.toFixed(1)}km`).join(" · "));
    const skipFolder = new Set(far.filter((x) => x.km > FOLDER_FAR_KM).map((x) => x.f));
    if (skipFolder.size) console.log(`정상에서 ${FOLDER_FAR_KM}km 넘게 떨어져 싣지 않는 폴더:`, [...skipFolder].join(", "));
    if (unmatched.length || match.size !== mountains.length) console.log("⚠️ 100곳이 다 이어지지 않았다");

    // 이미 있는 코스(다른 묶음에서 온 것) — 같은 길을 가리는 데 쓴다
    const existing = new Map<string, { id: string; km: number; line: LinePoint[] }[]>();
    for (const r of (await pool.query(`select id, mountain_id, km, line from hiking_courses where mountain_id = any($1::text[]) and frtrl_id not like 'k100-%'`, [[...claimed]])).rows) {
        existing.set(r.mountain_id, [...(existing.get(r.mountain_id) ?? []), { id: r.id, km: Number(r.km), line: r.line as LinePoint[] }]);
    }

    const courseRows: Record<string, unknown>[] = [], poiRows: Record<string, unknown>[] = [];
    const touched = new Set<string>();
    const rtNames = new Map<string, Map<string, number>>();
    let files = 0, tooShort = 0, flat = 0, noSurface = 0, same = 0, branchKm = 0, branchFiles = 0, mainKm = 0, wptAll = 0, wptSkipped = 0, wptOff = 0, noSummit = 0;
    const sameList: string[] = [], perFolder: string[] = [], kindCount: Record<string, number> = {};
    for (const f of folders) {
        const m = match.get(f.name);
        if (!m || skipFolder.has(f.name) || (only && m.name !== only && f.name !== only)) continue;
        const frtrl = `k100-${m.id}`;
        let kept = 0;
        filesOf(f).forEach((file, i) => {
            files++;
            for (const [code, name] of file.rtName) { const c = rtNames.get(code) ?? new Map<string, number>(); c.set(name, (c.get(name) ?? 0) + 1); rtNames.set(code, c); }
            const n = Number(/_(\d+)\.gpx$/i.exec(nfc(f.files[i]))?.[1] ?? i + 1);
            const lines = file.segs.map((s) => ({ s, line: lineOf(s) })).sort((a, b) => b.line[b.line.length - 1][3] - a.line[a.line.length - 1][3]);
            if (lines.length === 0) { tooShort++; return; }
            const main = lines[0];
            if (lines.length > 1) { branchFiles++; branchKm += lines.slice(1).reduce((k, x) => k + x.line[x.line.length - 1][3], 0); }
            const s = courseStats(main.line);
            if (s.km < MIN_KM) { tooShort++; return; }
            // 높이 기록이 없는 선(점마다 0m) — 오르막 · 높낮이 그림이 거짓이 된다
            if (s.maxM === 0 && s.minM === 0) { flat++; return; }
            const dup = (existing.get(m.id) ?? []).find((e) => sameRoute(main.line, s.km, e.line, e.km));
            if (dup) { same++; sameList.push(`${f.name} ${n}(${s.km.toFixed(1)}km) = ${dup.id}`); return; }
            const id = `${frtrl}-${n}`;
            const top = m.lat != null ? nearestOnLine(main.line, m.lat, m.lng) : null;
            const onSummit = !!top && top.offM <= SUMMIT_ON_COURSE_M;
            if (!onSummit) noSummit++;
            // 길의 종류 — 점과 점 사이의 거리를 뒤 점의 종류에 더한다. 구간이 겹친 점은 더 구체적인 길로, 조사하지 않은 점은 세지 않는다
            const parts: [SurfaceId, number][] = [];
            for (let k = 1; k < main.s.length; k++) {
                const kind = surfaceOfNames(main.s[k].rt.split(";").map((c) => file.rtName.get(c)));
                if (kind) parts.push([kind, main.line[k][3] - main.line[k - 1][3]]);
            }
            const covered = parts.reduce((x, [, km]) => x + km, 0) / s.km >= SURFACE_MIN_COVER;
            if (!covered) noSurface++;
            courseRows.push({
                id, mountain_id: m.id, frtrl_id: frtrl, seq: n, km: Math.round(s.km * 100) / 100, gain_m: s.gainM, loss_m: s.lossM, min_m: s.minM, max_m: s.maxM, loop: s.loop,
                summit_km: onSummit ? Math.round(top!.km * 1000) / 1000 : null, line: packLine(thinLine(main.line)), surface: covered ? packSurface(parts) : null,
            });
            kept++; mainKm += s.km; touched.add(m.id);
            for (const w of file.wpts) {
                wptAll++;
                const kind = hikingPoiKindOfGpx(w.category, w.name);
                if (!kind || !w.sym || !Number.isFinite(w.lat) || !Number.isFinite(w.lng)) { wptSkipped++; continue; }
                const on = nearestOnLine(main.line, w.lat, w.lng);
                const hit = on && on.offM <= POI_ON_COURSE_M ? on : null;
                if (!hit) wptOff++;
                kindCount[kind] = (kindCount[kind] ?? 0) + 1;
                poiRows.push({
                    id: `k100:${w.sym}`, mountain_id: m.id, frtrl_id: frtrl, type: kind, name: w.name.slice(0, 80), note: kind === "SIGN" ? signpostNote(w.signs) : null,
                    lat: w.lat, lng: w.lng, alt_m: w.ele != null && Number.isFinite(w.ele) ? Math.round(w.ele) : null, course_id: hit ? id : null, km: hit ? Math.round(hit.km * 1000) / 1000 : null,
                });
            }
        });
        perFolder.push(`${f.name} ${kept}/${f.files.length}`);
    }
    const odd = [...rtNames].filter(([, names]) => names.size > 1).map(([code, names]) => `${code}: ${[...names.keys()].join("/")}`);
    console.log(`파일 ${files} → 실을 코스 ${courseRows.length}(본선 ${mainKm.toFixed(0)}km) · 이미 있는 길이라 뺀 것 ${same} · 너무 짧아 뺀 것 ${tooShort} · 높이 기록이 없어 뺀 것 ${flat} · 곁길을 뗀 파일 ${branchFiles}(곁길 ${branchKm.toFixed(0)}km) · 정상을 안 지나는 코스 ${noSummit} · 길의 종류가 조사되지 않은 코스 ${noSurface}`);
    console.log(`지점 ${wptAll} → 실을 것 ${poiRows.length}(코스 선 밖 ${wptOff}) · 싣지 않는 것 ${wptSkipped} ·`, JSON.stringify(kindCount));
    if (odd.length) console.log("구간 번호가 파일마다 다른 이름을 가리킨다(파일 안의 이름으로 읽었다):", odd.join(" | "));
    if (sameList.length) console.log("같은 길:", sameList.slice(0, 40).join(" · "), sameList.length > 40 ? `… 외 ${sameList.length - 40}` : "");
    console.log("산마다(실을 것/파일):", perFolder.join(" · "));
    const dupPoi = poiRows.length - new Set(poiRows.map((p) => p.id)).size;
    if (dupPoi) { console.error("지점 번호가 겹친다:", dupPoi); process.exitCode = 1; return; }
    const bare = [...match.values()].filter((m) => !touched.has(m.id) && !(existing.get(m.id) ?? []).length).map((m) => m.name);
    console.log("이 뒤에도 제 코스가 없는 100대 명산:", bare.length ? bare.join(", ") : "없음");
    if (!apply) { console.log("미리 보기 — 아무것도 쓰지 않았다(--apply 로 싣는다)"); return; }

    const client = await pool.connect();
    try {
        await client.query("begin");
        for (const x of moved) await client.query(`update hiking_mountains set lat = $2, lng = $3, updated_at = now() where id = $1`, [x.id, x.lat, x.lng]);
        await upsert("hiking_courses", [["id", "text"], ["mountain_id", "text"], ["frtrl_id", "text"], ["seq", "integer"], ["km", "numeric"], ["gain_m", "integer"], ["loss_m", "integer"], ["min_m", "integer"], ["max_m", "integer"],
            ["loop", "boolean"], ["summit_km", "numeric"], ["line", "jsonb"], ["surface", "jsonb"]], "id", courseRows, 60, client);
        await upsert("hiking_pois", [["id", "text"], ["mountain_id", "text"], ["frtrl_id", "text"], ["type", "text"], ["name", "text"], ["note", "text"], ["lat", "double precision"], ["lng", "double precision"],
            ["alt_m", "integer"], ["course_id", "text"], ["km", "numeric"]], "id", poiRows, 1500, client, false);
        // 산의 숫자 — 제 코스 전부(두 묶음)로 다시 센다. 지점은 같은 자리(30m 칸)의 같은 종류를 한 번만
        await client.query(`
            update hiking_mountains m set
                course_count = c.n, course_min_km = c.min_km, course_max_km = c.max_km, updated_at = now()
            from (select mountain_id, count(*)::int n, min(km) min_km, max(km) max_km from hiking_courses where mountain_id = any($1::text[]) group by 1) c
            where m.id = c.mountain_id`, [[...touched]]);
        await client.query(`
            update hiking_mountains m set poi_counts = p.counts
            from (select mountain_id, jsonb_object_agg(type, n) counts from (
                    select mountain_id, type, count(distinct (round(lat::numeric * 3600), round(lng::numeric * 2900)))::int n from hiking_pois where mountain_id = any($1::text[]) group by 1, 2) x group by 1) p
            where m.id = p.mountain_id`, [[...touched]]);
        await client.query("commit");
    } catch (e) { await client.query("rollback"); throw e; } finally { client.release(); }
    const n = (await pool.query(`select (select count(*) from hiking_courses)::int c, (select count(*) from hiking_courses where frtrl_id like 'k100-%')::int k, (select count(*) from hiking_pois)::int p,
        (select count(*) from hiking_mountains where lists @> '[{"list":"kfs100"}]' and course_count > 0)::int famous`)).rows[0];
    console.log("실었다 — 코스", n.c, "(이 자료", n.k, ") · 지점", n.p, "· 코스 있는 100대 명산", n.famous);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => pool.end());
