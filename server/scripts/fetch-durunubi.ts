// 코리아둘레길 코스 받기(2026-10-21) — 두루누비 OpenAPI(길 · 코스) + 코스마다의 GPX(durunubi.kr) → server/assets/trails/korea-trails.json.
//   npx tsx server/scripts/fetch-durunubi.ts            (미리 보기 — 몇 개 · 길이가 맞는지)
//   npx tsx server/scripts/fetch-durunubi.ts --write    (파일로)
// 운영 DB 는 건드리지 않는다(파일만). 글은 받은 그대로 태그만 걷는다(지어 쓰지 않는다). 자료 '두루누비(한국관광공사)'.
// GPX 함정(2026-10-21 실측): 20개 파일에 같은 길이 두 번(<trkseg> 둘 — 시작 · 끝이 같은 거의 같은 선) 들어 있다 → 적힌 거리에 가장 가까운 한 토막만 쓴다.
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { courseStats, packLine, thinLine, withKm } from "../../shared/hikingGeo.js";
import { cleanTourText } from "../../shared/festivals.js";
import { TRAIL_ROUTES, parseTrailCourseName, trailRouteByIdx, travelerPoint, type TrailCourseDetail } from "../../shared/koreaTrails.js";

const write = process.argv.includes("--write");
const key = process.env.DATA_GO_KR_KEY;
if (!key) { console.error("DATA_GO_KR_KEY 없음"); process.exit(1); }
const K = /%[0-9A-Fa-f]{2}/.test(key) ? key : encodeURIComponent(key);
const BASE = "https://apis.data.go.kr/B551011/Durunubi";
const common = `serviceKey=${K}&MobileOS=ETC&MobileApp=rankue&_type=json`;
const items = (j: any) => { const x = j?.response?.body?.items?.item; return Array.isArray(x) ? x : x ? [x] : []; };

async function get(url: string, json = true): Promise<any> {
    for (let t = 0; t < 3; t++) {
        try { const r = await fetch(url, { signal: AbortSignal.timeout(25_000) }); if (r.ok) return json ? await r.json() : await r.text(); } catch { /* 다시 */ }
        await new Promise((r) => setTimeout(r, 1500));
    }
    return null;
}

// 길 넷의 소개(두루누비 routeList) — 한 줄(linemsg) · 소개 글(themedescs, 태그만 걷는다)
const routeMeta = items(await get(`${BASE}/routeList?${common}&numOfRows=50&pageNo=1`)).map((x: any) => {
    const r = trailRouteByIdx(String(x.routeIdx));
    return r ? { id: r.id, line: cleanTourText(x.linemsg, 120), desc: cleanTourText(x.themedescs, 1600) } : null;
}).filter(Boolean);
const raw: any[] = [];
for (let page = 1; page <= 5; page++) {
    const j = await get(`${BASE}/courseList?${common}&numOfRows=500&pageNo=${page}`);
    const it = items(j); raw.push(...it);
    if (!it.length || raw.length >= Number(j?.response?.body?.totalCount ?? 0)) break;
}
const r4 = (n: number) => Math.round(n * 1e4) / 1e4;
const out: TrailCourseDetail[] = [];
const skipped: string[] = [];
for (const c of raw) {
    const route = trailRouteByIdx(String(c.routeIdx));
    const nm = parseTrailCourseName(String(c.crsKorNm ?? ""));
    if (!route || !nm) { skipped.push(`${c.crsKorNm} (길 · 번호를 모름)`); continue; }
    const gpxUrl = String(c.gpxpath ?? "").replace(/^http:\/\//, "https://");
    const text: string | null = gpxUrl ? await get(gpxUrl, false) : null;
    await new Promise((r) => setTimeout(r, 120));
    if (!text || !text.includes("<trkpt")) { skipped.push(`${c.crsKorNm} (GPX 없음)`); continue; }
    const want = Number(c.crsDstnc) || null;
    const segs = text.split("<trkseg>").slice(1).map((s) => withKm([...s.matchAll(/<trkpt lat="([-\d.]+)" lon="([-\d.]+)">\s*(?:<ele>([-\d.]+)<\/ele>)?/g)].map((m) => [Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : 0] as [number, number, number])))
        .filter((l) => l.length > 1);
    if (!segs.length) { skipped.push(`${c.crsKorNm} (점 없음)`); continue; }
    const line = want ? [...segs].sort((a, b) => Math.abs(a[a.length - 1][3] - want) - Math.abs(b[b.length - 1][3] - want))[0] : segs[0];
    const st = courseStats(line);
    const a = line[0], b = line[line.length - 1];
    const level = Number(c.crsLevel);
    const minutes = Number(c.crsTotlRqrmHour);
    const traveler = cleanTourText(c.travelerinfo, 1600);
    out.push({
        id: String(c.crsIdx), route: route.id, key: nm.key, no: nm.no, sub: nm.sub, tags: nm.tags,
        name: String(c.crsKorNm).replace(/\s+/g, " ").trim(), km: want ?? Math.round(st.km * 10) / 10,
        minutes: Number.isFinite(minutes) && minutes > 0 ? minutes : null, level: level === 1 || level === 2 || level === 3 ? level : null,
        loop: String(c.crsCycle) === "순환형", sigun: String(c.sigun ?? "").trim() || null,
        start: [r4(a[0]), r4(a[1])], end: [r4(b[0]), r4(b[1])],
        coarse: thinLine(line, 24).map((p) => [r4(p[0]), r4(p[1])] as [number, number]),
        line: packLine(thinLine(line, 180)), gainM: st.gainM, maxM: st.maxM,
        startName: travelerPoint(traveler, "시점"), endName: travelerPoint(traveler, "종점"),
        summary: cleanTourText(c.crsSummary, 1600), contents: cleanTourText(c.crsContents, 2400), tour: cleanTourText(c.crsTourInfo, 1600), traveler,
        gpx: gpxUrl || null,
    });
}
// 같은 길 · 같은 코스 조각이 둘이면(받은 자료의 겹침) 먼저 것만
const seen = new Set<string>();
const courses = out.sort((x, y) => TRAIL_ROUTES.findIndex((r) => r.id === x.route) - TRAIL_ROUTES.findIndex((r) => r.id === y.route) || x.no - y.no || (x.sub ?? 0) - (y.sub ?? 0))
    .filter((c) => { const k = `${c.route}/${c.key}`; if (seen.has(k)) { skipped.push(`${c.name} (같은 코스 번호가 둘)`); return false; } seen.add(k); return true; });
const byRoute = Object.fromEntries(TRAIL_ROUTES.map((r) => [r.id, courses.filter((c) => c.route === r.id).length]));
console.log(JSON.stringify({ got: raw.length, kept: courses.length, byRoute, skipped }));
if (write) {
    const file = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../assets/trails/korea-trails.json");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const body = JSON.stringify({ source: "두루누비(한국관광공사) · data.go.kr 15101974", made: new Date().toISOString().slice(0, 10), routes: routeMeta, courses });
    fs.writeFileSync(file, body);
    console.log("wrote", file, Math.round(body.length / 1024), "KB");
}
process.exit(0);
