// 코리아둘레길 코스 근처 볼거리(2026-10-21) — 한국관광공사 TourAPI(KorService2 locationBasedList2 · 관광지 12) → server/assets/trails/near-spots.json.
//   npx tsx server/scripts/fetch-trail-spots.ts            (미리 보기 — 코스마다 몇 곳)
//   npx tsx server/scripts/fetch-trail-spots.ts --write    (파일로)
// 코스의 시작 · 가운데 · 끝에서 2km 안(코스마다 세 번 — 170코스면 510번, 개발 계정은 하루 1,000번). 사진이 공공누리 1 · 3유형인 곳만,
// 시작 · 가운데 · 끝 묶음에서 차례로 여섯 곳(묶음마다 코스 선에 가까운 순). 운영 DB 는 건드리지 않는다(파일만). 이름 · 주소 · 좌표 · 사진 주소를 받은 그대로.
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import type { TrailCourseDetail } from "../../shared/koreaTrails.js";
import { pickTrailSpots, type TrailSpot } from "../../shared/trailSpots.js";

const write = process.argv.includes("--write");
const key = process.env.DATA_GO_KR_KEY;
if (!key) { console.error("DATA_GO_KR_KEY 없음"); process.exit(1); }
const K = /%[0-9A-Fa-f]{2}/.test(key) ? key : encodeURIComponent(key);
const BASE = "https://apis.data.go.kr/B551011/KorService2";
const common = `serviceKey=${K}&MobileOS=ETC&MobileApp=rankue&_type=json`;
const items = (j: any) => { const x = j?.response?.body?.items?.item; return Array.isArray(x) ? x : x ? [x] : []; };
async function get(url: string): Promise<any> {
    for (let t = 0; t < 3; t++) {
        try { const r = await fetch(url, { signal: AbortSignal.timeout(20_000) }); if (r.ok) return await r.json(); } catch { /* 다시 */ }
        await new Promise((r) => setTimeout(r, 1200));
    }
    return null;
}

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const data = JSON.parse(fs.readFileSync(path.join(root, "server/assets/trails/korea-trails.json"), "utf8")) as { courses: TrailCourseDetail[] };
const file = path.join(root, "server/assets/trails/near-spots.json");
// 앞서 받은 것 — 이번에 받기가 끊긴 코스는 그대로 둔다(하루 1,000번을 넘기면 뒤쪽 코스가 비어 버린다 — 2026-10-21 두 번째 받기에서 겪음)
const prev: Record<string, TrailSpot[]> = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")).spots ?? {}) : {};
const out: Record<string, TrailSpot[]> = {};
let calls = 0, failed = 0, kept = 0;
for (const c of data.courses) {
    const probes = [c.start, c.coarse[Math.floor(c.coarse.length / 2)] ?? c.start, c.end];
    const groups: Record<string, unknown>[][] = [];
    let miss = false;
    for (const [lat, lng] of probes) {
        calls++;
        const j = await get(`${BASE}/locationBasedList2?${common}&mapX=${lng}&mapY=${lat}&radius=2000&contentTypeId=12&arrange=S&numOfRows=20&pageNo=1`);
        if (!j || j?.response?.header?.resultCode && j.response.header.resultCode !== "0000") { failed++; miss = true; continue; }
        groups.push(items(j));
    }
    // 하나라도 못 받았으면 앞서 받은 것을 둔다
    if (miss && prev[c.id]) { out[c.id] = prev[c.id]; kept++; continue; }
    // 시작 · 가운데 · 끝 묶음마다 차례로(한 끝에 몰리지 않게)
    out[c.id] = pickTrailSpots(groups, c.coarse);
}
const counts = Object.values(out).map((x) => x.length);
console.log(JSON.stringify({ courses: data.courses.length, calls, failed, kept, withSpots: counts.filter((n) => n > 0).length, spots: counts.reduce((a, b) => a + b, 0) }));
if (write) {
    const body = JSON.stringify({ source: "한국관광공사 TourAPI(국문 관광정보) · 공공누리", made: new Date().toISOString().slice(0, 10), spots: out });
    fs.writeFileSync(file, body);
    console.log("wrote", file, Math.round(body.length / 1024), "KB");
}
process.exit(0);
