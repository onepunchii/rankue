// 산 사진(2026-10-21) — 한국관광공사 TourAPI(국문 관광정보 서비스_GW, KorService2)의 자연관광지 '산'(분류 NA010100) 사진을
// 우리 산(hiking_mountains)에 맞춰 server/data/mountainTourPhotos.ts 로 쓴다(운영 DB 는 읽기만). 골프장 사진(fetch-golf-tour-photos)과 같은 틀.
//   npx tsx server/scripts/fetch-mountain-tour-photos.ts            (미리 보기)
//   npx tsx server/scripts/fetch-mountain-tour-photos.ts --write    (파일로)
// 맞추기: 이름(괄호 뗀 제목)이 산 이름 · 다른 이름과 같고 8km 안, 아니면 제목의 첫 낱말('북한산 백운대' → 북한산)이 같고 8km 안.
//   같은 이름의 다른 산이 많아(남산 · 가제산 …) 거리를 꼭 본다.
// 사진: 공공누리 제1 · 3유형으로 표시된 것만(표시 없는 것은 쓰지 않는다), 한 곳에 넷까지. 3유형은 변경 금지라 화면은 자르지 않고 그대로 그린다.
import { sql } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { db } from "../db.js";

const write = process.argv.includes("--write");
const key = process.env.DATA_GO_KR_KEY;
if (!key) { console.error("DATA_GO_KR_KEY 없음"); process.exit(1); }
const K = /%[0-9A-Fa-f]{2}/.test(key) ? key : encodeURIComponent(key);
const BASE = "https://apis.data.go.kr/B551011/KorService2";
const common = `serviceKey=${K}&MobileOS=ETC&MobileApp=rankue&_type=json`;
const LIC = new Set(["Type1", "Type3"]);

async function get(url: string): Promise<any> {
    for (let t = 0; t < 3; t++) {
        try { const r = await fetch(url, { signal: AbortSignal.timeout(20_000) }); return await r.json(); } catch { await new Promise((r) => setTimeout(r, 1200)); }
    }
    return null;
}
const items = (j: any) => { const x = j?.response?.body?.items?.item; return Array.isArray(x) ? x : x ? [x] : []; };

const tour: any[] = [];
for (let page = 1; page < 40; page++) {
    const j = await get(`${BASE}/areaBasedList2?${common}&numOfRows=100&pageNo=${page}&contentTypeId=12&lclsSystm1=NA&lclsSystm2=NA01&lclsSystm3=NA010100&arrange=A`);
    const it = items(j); tour.push(...it);
    if (!it.length || tour.length >= Number(j?.response?.body?.totalCount ?? 0)) break;
}
const rowsOf = (r: any) => (r.rows ?? r) as any[];
const mts = rowsOf(await db.execute(sql`select slug, name, aliases, lat, lng from hiking_mountains where lat is not null`));
const km = (a: number, b: number, c: number, d: number) => { const t = Math.PI / 180, x = (d - b) * t * Math.cos(((a + c) / 2) * t), y = (c - a) * t; return Math.sqrt(x * x + y * y) * 6371; };
const clean = (s: string) => String(s ?? "").replace(/\(.*?\)/g, "").trim();
const match = new Map<string, any>();   // slug → tour 한 줄(같은 산에 여럿이 맞으면 제목이 산 이름과 같은 것, 그다음 가까운 것)
for (const t of tour) {
    const title = clean(t.title), head = title.split(/\s+/)[0], lat = Number(t.mapy), lng = Number(t.mapx);
    const cands = mts.map((m) => ({ m, d: km(lat, lng, Number(m.lat), Number(m.lng)), names: [m.name, ...(Array.isArray(m.aliases) ? m.aliases : [])] }));
    const ex = cands.filter((x) => x.names.includes(title) && x.d < 8).sort((a, b) => a.d - b.d)[0];
    const pf = ex ? null : cands.filter((x) => x.names.includes(head) && x.d < 8).sort((a, b) => a.d - b.d)[0];
    const hit = ex ?? pf;
    if (!hit) continue;
    const prev = match.get(hit.m.slug);
    const score = (ex ? 0 : 100) + hit.d;
    if (!prev || score < prev.score) match.set(hit.m.slug, { t, d: hit.d, score });
}

const out: Record<string, { contentId: string; title: string; photos: { url: string; thumb: string | null; lic: "Type1" | "Type3" }[] }> = {};
let calls = 0;
for (const [slug, { t }] of match) {
    const photos: { url: string; thumb: string | null; lic: "Type1" | "Type3" }[] = [];
    if (t.firstimage && LIC.has(t.cpyrhtDivCd)) photos.push({ url: t.firstimage, thumb: t.firstimage2 || null, lic: t.cpyrhtDivCd });
    const j = await get(`${BASE}/detailImage2?${common}&numOfRows=20&pageNo=1&contentId=${t.contentid}&imageYN=Y`); calls++;
    for (const im of items(j)) {
        if (photos.length >= 4) break;
        if (!im.originimgurl || !LIC.has(im.cpyrhtDivCd) || photos.some((p) => p.url === im.originimgurl)) continue;
        photos.push({ url: im.originimgurl, thumb: im.smallimageurl || null, lic: im.cpyrhtDivCd });
    }
    // http 로 오면 https 로(같은 서버가 https 로도 준다 — 화면이 https 라 http 그림은 막힌다)
    for (const p of photos) { p.url = p.url.replace(/^http:\/\//, "https://"); if (p.thumb) p.thumb = p.thumb.replace(/^http:\/\//, "https://"); }
    if (photos.length) out[slug] = { contentId: String(t.contentid), title: String(t.title), photos };
    await new Promise((r) => setTimeout(r, 80));
}
const n = Object.keys(out).length, total = Object.values(out).reduce((a, x) => a + x.photos.length, 0);
console.log(JSON.stringify({ tour: tour.length, matched: match.size, withPhotos: n, photos: total, detailCalls: calls }));
if (write) {
    const file = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../data/mountainTourPhotos.ts");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const body = `/**\n * 산 사진 — 한국관광공사 TourAPI(KorService2 · 자연관광지 산 NA010100) · 공공누리 제1 · 3유형만.\n * server/scripts/fetch-mountain-tour-photos.ts --write 로 만든 파일(손으로 고치지 말 것). 만든 날 ${new Date().toISOString().slice(0, 10)}.\n * 출처 표시: 화면에 '사진 한국관광공사 · 공공누리 제N유형'. 3유형은 변경 금지 — 자르지 않고 그대로 그린다.\n */\nexport interface MountainTourPhoto { url: string; thumb: string | null; lic: "Type1" | "Type3" }\nexport const MOUNTAIN_TOUR_PHOTOS: Readonly<Record<string, { contentId: string; title: string; photos: MountainTourPhoto[] }>> = ${JSON.stringify(out, null, 0)};\n`;
    fs.writeFileSync(file, body);
    console.log("wrote", file, Math.round(body.length / 1024), "KB");
}
process.exit(0);
