/**
 * 등산 자료 적재(2026-10-13) — 받은 자료(산 목록 · 소개 글 · 길 위의 지점 · 코스 파일)를 hiking_mountains · hiking_courses · hiking_pois 에 싣는다.
 *
 *   npx tsx --env-file=.env server/scripts/hiking-import.ts <산 자료 폴더> <코스 파일 폴더> [--apply] [--only <산 이름>]
 *
 *   <산 자료 폴더>   mountains_master.json · mountain_guides.json · mountain_pois.json 이 있는 곳(오너의 콘텐츠 작업 폴더의 out/mountains)
 *   <코스 파일 폴더> 한국등산트레킹지원센터 '전국 주요 봉우리 코스'를 푼 곳 — 폴더 이름이 '<봉우리 번호>_<이름>', 그 안에 GPX
 *
 * --apply 가 없으면 세기만 한다(아무것도 쓰지 않는다). 다시 돌려도 같은 줄을 고쳐 쓴다(지우지 않는다).
 * ⚠️ 표가 먼저 있어야 한다: migrations/hiking_base.sql (더하기만).
 *
 * 싣는 산: 명산 목록의 산(tier 1) · 백과 문서가 있는 산(tier 2) · 코스가 이어진 산. 그 밖의 이름뿐인 봉우리는 싣지 않는다(빈 페이지가 된다).
 * 산과 코스를 잇는 법: ① 받은 자료가 이어 둔 것(지점 묶음의 masterId) ② 못 이은 명산은 폴더 이름의 알맹이('설악산(대청봉)' → 설악산 · 대청봉)가
 *   산의 이름 · 봉우리 이름과 같고 정상이 코스 상자에서 3km 안일 때 ③ 그래도 코스가 없는 명산은, 아직 안 이어진 묶음 가운데 그 산의 정상 150m 안을 지나는 것.
 *   (이미 다른 산에 이어진 코스 가운데 정상을 지나는 것은 옮기지 않고 hiking-link-courses.ts 가 잇는다 — 이 스크립트를 돌린 뒤 그것도 다시 돌린다.)
 * ⚠️ 맥의 폴더 이름은 풀어쓴 한글(NFD)이다 — 반드시 NFC 로 바꿔 견준다.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { pool } from "../db";
import { assignMountainSlugs, hikingRegionOf, hikingTraits, isHikingListId } from "../../shared/hikingMountains";
import { courseStats, distM, nearestOnLine, packLine, thinLine, withKm, type LinePoint } from "../../shared/hikingGeo";
import { cleanMountainGuide } from "../../shared/hikingGuide";
import { hikingPoiKind } from "../../shared/hikingPois";
import { HIKING_SUMMIT_FIXES, applySummitFix } from "../../shared/hikingSummitFix";
import { bundleCourses } from "./lib/hikingGpx";
import { isTwinFrom, twinGuideSource } from "../../shared/hikingTwins";

const args = process.argv.slice(2);
const flagAt = (f: string) => args.indexOf(f);
const positional = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--only");
const [contentDir, gpxDir] = positional;
const apply = args.includes("--apply");
const only = flagAt("--only") >= 0 ? args[flagAt("--only") + 1] : null;
const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);

/** 정상이 코스 선에서 이 안이면 그 코스가 정상을 지난다 */
const SUMMIT_ON_COURSE_M = 150;
/** 지점이 코스 선에서 이 안이면 그 코스 위의 지점이다 */
const POI_ON_COURSE_M = 60;
/** 이름으로 잇는 명산 — 정상이 코스 선에서 이 안 */
const NAME_MATCH_KM = 3;
/**
 * 같은 이름이 드문 큰 산(지리산 · 설악산 …)은 넓게 본다 — 산줄기가 수십 km 라 받은 코스 묶음이 정상에서 멀리 있기도 하다
 * ('지리산(천왕봉)' 묶음의 코스 28개는 천왕봉에서 8km 밖이다). 같은 이름이 흔한 산(백운산 · 국사봉)은 좁게 — 남의 산을 잇지 않게.
 */
const NAME_MATCH_WIDE_KM = 12;
const RARE_NAME_MAX = 3;

const nfc = (s: string) => s.normalize("NFC");
const json = (p: string) => JSON.parse(readFileSync(p, "utf8"));

function parseGpx(file: string): [number, number, number][] {
    const t = readFileSync(file, "utf8");
    const out: [number, number, number][] = [];
    const re = /<trkpt\s+lat="([-\d.]+)"\s+lon="([-\d.]+)"\s*>(?:\s*<ele>([-\d.]+)<\/ele>)?/g;
    for (let m; (m = re.exec(t)); ) out.push([Number(m[1]), Number(m[2]), m[3] == null ? 0 : Number(m[3])]);
    return out;
}

/** keep: 칸 → admin_keep 의 열쇠 — 그 열쇠가 있는 줄은 그 칸을 덮지 않는다(어드민에서 고친 값) */
async function upsert(table: string, cols: readonly [string, string][], key: string, rows: Record<string, unknown>[], size: number, touch = true, keep: Readonly<Record<string, string>> = {}) {
    const names = cols.map(([c]) => c);
    for (let i = 0; i < rows.length; i += size) {
        const batch = rows.slice(i, i + size);
        const set = names.filter((c) => c !== key)
            .map((c) => (keep[c] ? `${c} = case when coalesce(${table}.admin_keep, '{}'::jsonb) ? '${keep[c]}' then ${table}.${c} else excluded.${c} end` : `${c} = excluded.${c}`))
            .concat(touch ? ["updated_at = now()"] : []).join(", ");
        await pool.query(
            `insert into ${table} (${names.join(", ")}) select ${names.join(", ")} from jsonb_to_recordset($1::jsonb) as x(${cols.map(([c, t]) => `${c} ${t}`).join(", ")})
             on conflict (${key}) do update set ${set}`,
            [JSON.stringify(batch)],
        );
    }
}

async function main() {
    if (!contentDir || !gpxDir) { console.error("산 자료 폴더와 코스 파일 폴더의 경로를 적어 주세요."); process.exitCode = 1; return; }
    // 정상 자리 바로잡기(shared/hikingSummitFix — 공식 목록 · 코스 기록으로 판정한 14곳)를 읽은 자료 위에 덮어쓴다.
    // 이 자리로 '정상을 지나는 코스'를 다시 고르므로, 코스가 없던 100대 명산에 코스가 붙는다.
    const master: any[] = (json(join(contentDir, "mountains_master.json")) as any[]).map(applySummitFix);
    // 어드민에서 고친 칸(hiking_mountains.admin_keep, 2026-10-17)은 받은 자료보다 먼저다 — 이 자리로 '정상을 지나는 코스'도 고른다
    const kept = await pool.query(`select id, lat, lng, height_m, peak_name, admin_keep from hiking_mountains where admin_keep is not null`).then((r) => r.rows).catch(() => [] as any[]);
    for (const k of kept) {
        const m = master.find((x) => x.id === k.id);
        if (!m) continue;
        if (k.admin_keep?.coords && k.lat != null && k.lng != null) { m.lat = Number(k.lat); m.lon = Number(k.lng); }
        if (k.admin_keep?.height && k.height_m != null) m.elevationM = Number(k.height_m);
        if (k.admin_keep?.peak) m.peakName = k.peak_name ?? null;
    }
    if (kept.length) console.log("어드민에서 고친 산:", kept.length);
    console.log("정상 자리 고침:", HIKING_SUMMIT_FIXES.filter((f) => master.some((m) => m.id === f.id && m.lat === f.lat && m.lon === f.lng)).length, "/", HIKING_SUMMIT_FIXES.length);
    const guides: any[] = json(join(contentDir, "mountain_guides.json"));
    const bundles: any[] = json(join(contentDir, "mountain_pois.json"));
    const byId = new Map<string, any>(master.map((m) => [m.id, m]));
    const guideOf = new Map<string, any>(guides.map((g) => [g.id, g]));

    // 코스 폴더 — 봉우리 번호 → { 이름 알맹이들, 파일들 }
    const folders = new Map<string, { dir: string; base: string; inner: string[]; files: string[] }>();
    for (const d of readdirSync(gpxDir)) {
        const p = join(gpxDir, d);
        if (!statSync(p).isDirectory()) continue;
        const name = nfc(d);
        const us = name.indexOf("_");
        if (us < 0) continue;
        const label = name.slice(us + 1);
        folders.set(name.slice(0, us), {
            dir: p, base: label.replace(/\(.*?\)/g, "").trim(), inner: Array.from(label.matchAll(/\((.*?)\)/g)).map((m) => m[1].trim()),
            files: readdirSync(p).filter((f) => f.toLowerCase().endsWith(".gpx")).sort(),
        });
    }

    // ① 받은 자료가 이어 둔 것
    const link = new Map<string, string>();   // 봉우리 번호 → 산 id
    for (const b of bundles) if (b.masterId && byId.has(b.masterId) && folders.has(b.frtrlId)) link.set(b.frtrlId, b.masterId);
    const linkedMountains = new Set(link.values());

    // ② 명산 — 이름 알맹이 + 거리. 받은 자료는 '설악산(대청봉)' 폴더를 봉우리(대청봉)에 이어 두기도 한다 — 폴더의 앞 이름이 명산의 이름과 같고
    //    정상이 코스에서 가까우면 그 명산의 코스로 본다(명산끼리는 뺏지 않는다). 괄호 안 이름 · 봉우리 이름은 아직 안 이어진 폴더에만 쓴다.
    const lineCache = new Map<string, LinePoint[][]>();
    const linesOf = (frtrlId: string): LinePoint[][] => {
        let v = lineCache.get(frtrlId);
        if (!v) { const f = folders.get(frtrlId)!; v = f.files.map((x) => withKm(parseGpx(join(f.dir, x)))).filter((l) => l.length >= 2); lineCache.set(frtrlId, v); }
        return v;
    };
    const rank = (m: any) => [m.tier, (m.lists ?? []).some((l: any) => l.list === "kfs100") ? 0 : 1, (m.lists ?? []).some((l: any) => l.list === "kfs100plus") ? 0 : 1, -(m.elevationM ?? 0)];
    const byRank = (a: any, b: any) => { const x = rank(a), y = rank(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i]; return String(a.id).localeCompare(String(b.id)); };
    const byBase = new Map<string, string[]>(), byInner = new Map<string, string[]>();
    folders.forEach((f, id) => { byBase.set(f.base, [...(byBase.get(f.base) ?? []), id]); for (const k of f.inner) byInner.set(k, [...(byInner.get(k) ?? []), id]); });
    const nearM = (fid: string, m: any) => Math.min(...linesOf(fid).map((l) => nearestOnLine(l, m.lat, m.lon)?.offM ?? Infinity));
    let byName = 0;
    for (const m of master.filter((x) => x.tier === 1 && x.lat != null).sort(byRank)) {
        const names = new Set<string>([m.name, String(m.name).replace(/\(.*?\)/g, "").trim(), ...(m.aliases ?? [])].filter(Boolean));
        for (const n of names) for (const fid of byBase.get(n) ?? []) {
            const cur = link.get(fid);
            if (cur === m.id || (cur && byId.get(cur)?.tier === 1)) continue;
            if (nearM(fid, m) <= ((m.sameNameCount ?? 99) <= RARE_NAME_MAX ? NAME_MATCH_WIDE_KM : NAME_MATCH_KM) * 1000) { link.set(fid, m.id); byName++; }
        }
        for (const n of [m.name, m.peakName].filter(Boolean)) for (const fid of byInner.get(n) ?? []) {
            if (link.has(fid)) continue;
            if (nearM(fid, m) <= NAME_MATCH_KM * 1000) { link.set(fid, m.id); byName++; }
        }
    }

    // ③ 아직 안 이어진 묶음 가운데, 코스가 **제 코스 없는 명산의 정상(150m 안)을 지나는** 것 — 묶음의 이름이 봉우리(용문봉 · 추월산보리암 · 사량도지리산)라
    //    이름으로는 못 이었지만 길은 그 산의 정상을 지난다(2026-10-13). 이미 이어진 묶음은 건드리지 않는다(남의 코스를 뺏지 않는다).
    let bySummit = 0;
    {
        const has = new Set(link.values());
        const bare = master.filter((x) => x.tier === 1 && x.lat != null && !has.has(x.id)).sort(byRank);
        if (bare.length) for (const fid of folders.keys()) {
            if (link.has(fid)) continue;
            const lines = linesOf(fid);
            if (lines.length === 0) continue;
            let la0 = Infinity, la1 = -Infinity, lo0 = Infinity, lo1 = -Infinity;
            for (const l of lines) for (const p of l) { if (p[0] < la0) la0 = p[0]; if (p[0] > la1) la1 = p[0]; if (p[1] < lo0) lo0 = p[1]; if (p[1] > lo1) lo1 = p[1]; }
            const m = bare.find((x) => x.lat >= la0 - 0.003 && x.lat <= la1 + 0.003 && x.lon >= lo0 - 0.004 && x.lon <= lo1 + 0.004 && nearM(fid, x) <= SUMMIT_ON_COURSE_M);
            if (m) { link.set(fid, m.id); bySummit++; }
        }
    }

    // 싣는 산
    const withCourse = new Set(link.values());
    // 두 줄로 들어온 산의 자리 없는 쪽은 싣지 않는다(shared/hikingTwins) — 글은 아래에서 자리 있는 쪽에 붙인다
    let mountains = master.filter((m) => (m.tier === 1 || m.tier === 2 || withCourse.has(m.id)) && !isTwinFrom(m.id));
    if (only) mountains = mountains.filter((m) => m.name === only);
    const loaded = new Set(mountains.map((m) => m.id));
    // 주소 — 이미 실린 산은 그 주소 그대로(다시 적재해도 주소가 바뀌지 않게). 새 산은 명산 · 높은 산부터 이름 그대로를 갖는다
    const taken = new Map<string, string>(await pool.query(`select id, slug from hiking_mountains`).then((r) => r.rows.map((x: any) => [x.id, x.slug] as [string, string])).catch(() => []));
    const slugs = assignMountainSlugs(master.filter((m) => m.tier === 1 || m.tier === 2 || withCourse.has(m.id)).sort(byRank)
        .map((m) => ({ id: m.id, name: m.name, sigungu: m.sigungu, dong: m.dong })), taken);

    // 코스 · 지점
    const courseRows: Record<string, unknown>[] = [];
    const poiRows: Record<string, unknown>[] = [];
    const perMountain = new Map<string, { n: number; min: number; max: number; counts: Record<string, number> }>();
    const stat = (id: string) => { let s = perMountain.get(id); if (!s) { s = { n: 0, min: Infinity, max: 0, counts: {} }; perMountain.set(id, s); } return s; };
    const bundleOf = new Map<string, any>(bundles.map((b) => [b.frtrlId, b]));
    let shortLines = 0, offCourse = 0;
    for (const [frtrlId, mid] of link) {
        if (!loaded.has(mid)) continue;
        const m = byId.get(mid);
        // 코스 — 조각이 하나인 파일은 그대로 한 코스, 조각이 여럿인 파일(등산로 그물)은 이어서 들머리 → 정상의 길들로(scripts/lib/hikingGpx · shared/hikingRoutes).
        // 예전에는 파일의 점을 전부 한 줄로 이어 붙여, 조각 사이를 건너뛴 거리까지 코스의 길이에 들어갔다(292m 객산이 29.6km).
        // 이미 실린 것을 바꾸는 일은 hiking-reroute.ts 가 한다(이 스크립트는 지우지 않는다 — 옛 줄 "<번호>-<파일 순번>" 은 거기서 지운다).
        const f = folders.get(frtrlId)!;
        const built = bundleCourses(f.dir, f.files, frtrlId, m.lat != null ? { lat: m.lat, lng: m.lon } : null);
        const lines: LinePoint[][] = [], ids: string[] = [];
        for (const c of built) {
            const s = courseStats(c.line);
            if (s.km < 0.2) { shortLines++; continue; }
            lines.push(c.line); ids.push(c.id);
            const top = m.lat != null ? nearestOnLine(c.line, m.lat, m.lon) : null;
            courseRows.push({
                id: c.id, mountain_id: mid, frtrl_id: frtrlId, seq: c.built ? c.file * 100 + Number(c.id.split("r").pop()) : c.file, km: Math.round(s.km * 100) / 100, gain_m: s.gainM, loss_m: s.lossM, min_m: s.minM, max_m: s.maxM, loop: s.loop,
                summit_km: top && top.offM <= SUMMIT_ON_COURSE_M ? Math.round(top.km * 1000) / 1000 : null, line: packLine(thinLine(c.line)),
            });
            const st = stat(mid); st.n++; st.min = Math.min(st.min, s.km); st.max = Math.max(st.max, s.km);
        }
        for (const p of bundleOf.get(frtrlId)?.pois ?? []) {
            if (typeof p.lat !== "number" || typeof p.lon !== "number") continue;
            const kind = hikingPoiKind(String(p.type ?? ""), String(p.name ?? ""));
            let best: { id: string; km: number; off: number } | null = null;
            lines.forEach((line, i) => { if (!ids[i]) return; const on = nearestOnLine(line, p.lat, p.lon); if (on && on.offM <= POI_ON_COURSE_M && (!best || on.offM < best.off)) best = { id: ids[i], km: on.km, off: on.offM }; });
            if (!best) offCourse++;
            const b = best as { id: string; km: number; off: number } | null;
            poiRows.push({
                id: `${frtrlId}:${p.id}`, mountain_id: mid, frtrl_id: frtrlId, type: kind, name: String(p.name ?? "").slice(0, 80), note: p.note ? String(p.note).slice(0, 200) : null,
                lat: p.lat, lng: p.lon, alt_m: typeof p.altM === "number" ? Math.round(p.altM) : null, course_id: b?.id ?? null, km: b ? Math.round(b.km * 1000) / 1000 : null,
            });
            const st = stat(mid); st.counts[kind] = (st.counts[kind] ?? 0) + 1;
        }
    }

    let guideKept = 0, guideDropped = 0;
    const mountainRows = mountains.map((m) => {
        const h = m.elevationM != null ? Math.round(m.elevationM) : null;
        const raw = guideOf.get(m.id) ?? guideOf.get(twinGuideSource(m.id) ?? "");
        const guide = raw ? cleanMountainGuide(raw, today) : null;
        if (raw) guide ? guideKept++ : guideDropped++;
        const st = perMountain.get(m.id);
        return {
            id: m.id, slug: slugs.get(m.id)!, name: m.name, peak_name: m.peakName ?? null, aliases: m.aliases ?? [], lat: m.lat ?? null, lng: m.lon ?? null, height_m: h,
            sido: m.sido ?? null, sigungu: m.sigungu ?? null, dong: m.dong ?? null, region: hikingRegionOf(m.sido), tier: m.tier,
            lists: (m.lists ?? []).filter((l: any) => isHikingListId(l.list)).map((l: any) => ({ list: l.list, no: l.no ?? null })),
            traits: hikingTraits({ heightM: h, sigungu: m.sigungu }), guide,
            course_count: st?.n ?? 0, course_min_km: st && st.n ? Math.round(st.min * 100) / 100 : null, course_max_km: st && st.n ? Math.round(st.max * 100) / 100 : null, poi_counts: st?.counts ?? {},
        };
    });

    const famousN = mountainRows.filter((m) => m.tier === 1);
    console.log(`산 ${mountainRows.length}(명산 ${famousN.length} · 코스 있는 산 ${mountainRows.filter((m) => m.course_count > 0).length} · 코스 있는 명산 ${famousN.filter((m) => m.course_count > 0).length} · 글 ${guideKept}${guideDropped ? ` · 걸러져 못 실은 글 ${guideDropped}` : ""})`);
    console.log(`코스 ${courseRows.length}(이름으로 이은 폴더 ${byName} · 정상을 지나서 이은 폴더 ${bySummit} · 너무 짧아 뺀 선 ${shortLines}) · 지점 ${poiRows.length}(코스 선 밖 ${offCourse})`);
    console.log("산림청 100 가운데 코스 있는 산:", mountainRows.filter((m) => m.lists.some((l: any) => l.list === "kfs100") && m.course_count > 0).length, "| 주소 예:", mountainRows.slice(0, 6).map((m) => m.slug).join(", "));
    const dup = mountainRows.length - new Set(mountainRows.map((m) => m.slug)).size;
    if (dup) { console.error("주소가 겹친다:", dup); process.exitCode = 1; return; }
    if (!apply) { console.log("미리 보기 — 아무것도 쓰지 않았다(--apply 로 싣는다)"); return; }

    await upsert("hiking_mountains", [["id", "text"], ["slug", "text"], ["name", "text"], ["peak_name", "text"], ["aliases", "jsonb"], ["lat", "double precision"], ["lng", "double precision"], ["height_m", "integer"],
        ["sido", "text"], ["sigungu", "text"], ["dong", "text"], ["region", "text"], ["tier", "integer"], ["lists", "jsonb"], ["traits", "jsonb"], ["guide", "jsonb"],
        ["course_count", "integer"], ["course_min_km", "numeric"], ["course_max_km", "numeric"], ["poi_counts", "jsonb"]], "id", mountainRows, 300, true,
        { lat: "coords", lng: "coords", height_m: "height", peak_name: "peak" });
    await upsert("hiking_courses", [["id", "text"], ["mountain_id", "text"], ["frtrl_id", "text"], ["seq", "integer"], ["km", "numeric"], ["gain_m", "integer"], ["loss_m", "integer"], ["min_m", "integer"], ["max_m", "integer"],
        ["loop", "boolean"], ["summit_km", "numeric"], ["line", "jsonb"]], "id", courseRows, 60);
    await upsert("hiking_pois", [["id", "text"], ["mountain_id", "text"], ["frtrl_id", "text"], ["type", "text"], ["name", "text"], ["note", "text"], ["lat", "double precision"], ["lng", "double precision"],
        ["alt_m", "integer"], ["course_id", "text"], ["km", "numeric"]], "id", poiRows, 1500, false);
    const n = (await pool.query(`select (select count(*) from hiking_mountains)::int m, (select count(*) from hiking_courses)::int c, (select count(*) from hiking_pois)::int p`)).rows[0];
    console.log("실었다 — 산", n.m, "· 코스", n.c, "· 지점", n.p);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => pool.end());
