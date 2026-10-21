// 골프장 사진(2026-10-21) — 한국관광공사 TourAPI(국문 관광정보 서비스_GW, KorService2)의 골프장(분류 LS010400) 사진을
// 우리 골프장 페이지(golf_course_pages)에 맞춰 server/data/golfTourPhotos.ts 로 쓴다(운영 DB 는 읽기만).
//   npx tsx server/scripts/fetch-golf-tour-photos.ts            (미리 보기 — 몇 곳이 맞는지만)
//   npx tsx server/scripts/fetch-golf-tour-photos.ts --write    (파일로)
// 맞추기: 이름이 같으면(괄호 · 'CC/골프클럽' 같은 꼬리 떼고) 8km 안, 한쪽 이름이 다른 쪽을 품으면 2km 안, 아니면 0.3km 안.
//   미니 · 파크골프 · 체육 · 연습장 · 스크린은 받지 않는다. 눈으로 본 다른 곳 다섯은 EXCLUDE(같은 리조트의 다른 코스 · 좌표가 겹친 다른 골프장).
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
const EXCLUDE = new Set(["사이언스대덕골프장", "제일컨트리클럽", "휘닉스 태기산CC", "용평 나인 골프클럽", "히든밸리GC"]);
const SKIP = /미니|파크골프|체육|센터|센타|연습장|스크린/;
const LIC = new Set(["Type1", "Type3"]);

async function get(url: string): Promise<any> {
    for (let t = 0; t < 3; t++) {
        try { const r = await fetch(url, { signal: AbortSignal.timeout(20_000) }); return await r.json(); } catch { await new Promise((r) => setTimeout(r, 1200)); }
    }
    return null;
}
const items = (j: any) => { const x = j?.response?.body?.items?.item; return Array.isArray(x) ? x : x ? [x] : []; };

const tour: any[] = [];
for (let page = 1; page < 20; page++) {
    const j = await get(`${BASE}/areaBasedList2?${common}&numOfRows=100&pageNo=${page}&contentTypeId=28&lclsSystm1=LS&lclsSystm2=LS01&lclsSystm3=LS010400&arrange=A`);
    const it = items(j); tour.push(...it);
    if (!it.length || tour.length >= Number(j?.response?.body?.totalCount ?? 0)) break;
}
const rowsOf = (r: any) => (r.rows ?? r) as any[];
const pages = rowsOf(await db.execute(sql`select slug, name, lat, lng, aliases from golf_course_pages`));
const norm = (s: string) => String(s ?? "").replace(/\(.*?\)/g, "").replace(/\s+/g, "")
    .replace(/(컨트리클럽|골프클럽|골프&리조트|골프앤리조트|골프리조트|골프장|골프코스|cc|gc|c\.c\.?|g\.c\.?|리조트|퍼블릭|대중제|회원제)$/gi, "")
    .replace(/(컨트리클럽|골프클럽|골프장|cc|gc)/gi, "").toLowerCase();
const km = (a: number, b: number, c: number, d: number) => { const t = Math.PI / 180, x = (d - b) * t * Math.cos(((a + c) / 2) * t), y = (c - a) * t; return Math.sqrt(x * x + y * y) * 6371; };

const match = new Map<string, any>();   // slug → tour 한 줄(같은 골프장에 둘이 맞으면 가까운 것)
for (const t of tour) {
    if (SKIP.test(t.title) || EXCLUDE.has(t.title)) continue;
    const tn = norm(t.title), lat = Number(t.mapy), lng = Number(t.mapx);
    const cands = pages.map((p) => ({ p, d: p.lat != null ? km(lat, lng, Number(p.lat), Number(p.lng)) : 99, names: [p.name, ...(Array.isArray(p.aliases) ? p.aliases : [])].map(norm) }));
    const exact = cands.filter((x) => x.names.some((n: string) => n && n === tn) && x.d < 8).sort((a, b) => a.d - b.d)[0];
    const inc = exact ? null : cands.filter((x) => x.names.some((n: string) => n.length >= 2 && tn.length >= 2 && (n.includes(tn) || tn.includes(n))) && x.d < 2).sort((a, b) => a.d - b.d)[0];
    const near = exact || inc ? null : cands.filter((x) => x.d < 0.3).sort((a, b) => a.d - b.d)[0];
    const hit = exact ?? inc ?? near;
    if (!hit) continue;
    const prev = match.get(hit.p.slug);
    if (!prev || hit.d < prev.d) match.set(hit.p.slug, { t, d: hit.d });
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
    const file = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../data/golfTourPhotos.ts");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const body = `/**\n * 골프장 사진 — 한국관광공사 TourAPI(KorService2 · 골프장 LS010400) · 공공누리 제1 · 3유형만.\n * server/scripts/fetch-golf-tour-photos.ts --write 로 만든 파일(손으로 고치지 말 것). 만든 날 ${new Date().toISOString().slice(0, 10)}.\n * 출처 표시: 화면에 '사진 한국관광공사 · 공공누리 제N유형'. 3유형은 변경 금지 — 자르지 않고 그대로 그린다.\n */\nexport interface GolfTourPhoto { url: string; thumb: string | null; lic: "Type1" | "Type3" }\nexport const GOLF_TOUR_PHOTOS: Readonly<Record<string, { contentId: string; title: string; photos: GolfTourPhoto[] }>> = ${JSON.stringify(out, null, 0)};\n`;
    fs.writeFileSync(file, body);
    console.log("wrote", file, Math.round(body.length / 1024), "KB");
}
process.exit(0);
