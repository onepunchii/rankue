// 낚시터 사진(2026-10-21) — 한국관광공사 TourAPI(KorService2)의 낚시(민물 LS020500 · 바다 LS020600) 사진을
// 우리 낚시터(fishing_places)에 맞춰 server/data/fishingTourPhotos.ts 로 쓴다(운영 DB 는 읽기만). 산 · 골프장 사진과 같은 틀.
//   npx tsx server/scripts/fetch-fishing-tour-photos.ts            (미리 보기)
//   npx tsx server/scripts/fetch-fishing-tour-photos.ts --write    (파일로)
// 맞추기: 이름(괄호 · '낚시터 · 낚시공원 · 좌대' 꼬리 뗀 것)이 같고 5km 안, 한쪽이 다른 쪽을 품으면 2km 안, 아니면 0.2km 안(운영 회사 이름으로 등록된 곳).
// 열쇠는 '시도|시군구|이름' — 같은 낚시터가 해마다 새 번호로 다시 올라와도(shared/fishingPlaces dedupePlaces) 같은 열쇠다.
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
for (const code of ["LS020500", "LS020600"]) {
    let got = 0;
    for (let page = 1; page < 20; page++) {
        const j = await get(`${BASE}/areaBasedList2?${common}&numOfRows=100&pageNo=${page}&contentTypeId=28&lclsSystm1=LS&lclsSystm2=LS02&lclsSystm3=${code}&arrange=A`);
        const it = items(j); tour.push(...it); got += it.length;
        if (!it.length || got >= Number(j?.response?.body?.totalCount ?? 0)) break;
    }
}
const rowsOf = (r: any) => (r.rows ?? r) as any[];
const places = rowsOf(await db.execute(sql`select name, sido, sigungu, lat, lng from fishing_places where lat is not null and btrim(name) <> ''`));
const km = (a: number, b: number, c: number, d: number) => { const t = Math.PI / 180, x = (d - b) * t * Math.cos(((a + c) / 2) * t), y = (c - a) * t; return Math.sqrt(x * x + y * y) * 6371; };
const norm = (s: string) => String(s ?? "").replace(/\(.*?\)/g, "").replace(/\s+/g, "").replace(/(유료낚시터|낚시터|낚시공원|낚시|레저타운|좌대)$/g, "").toLowerCase();
const keyOf = (p: any) => `${p.sido ?? ""}|${p.sigungu ?? ""}|${String(p.name).trim()}`;
const match = new Map<string, any>();   // 열쇠 → tour 한 줄(가까운 것)
for (const t of tour) {
    const tn = norm(t.title), lat = Number(t.mapy), lng = Number(t.mapx);
    const cands = places.map((p) => ({ p, d: km(lat, lng, Number(p.lat), Number(p.lng)), n: norm(p.name) }));
    const e = cands.filter((x) => x.n && x.n === tn && x.d < 5).sort((a, b) => a.d - b.d)[0];
    const i = e ? null : cands.filter((x) => x.n.length >= 2 && tn.length >= 2 && (x.n.includes(tn) || tn.includes(x.n)) && x.d < 2).sort((a, b) => a.d - b.d)[0];
    const n = e || i ? null : cands.filter((x) => x.d < 0.2).sort((a, b) => a.d - b.d)[0];
    const hit = e ?? i ?? n;
    if (!hit) continue;
    const k = keyOf(hit.p), prev = match.get(k);
    if (!prev || hit.d < prev.d) match.set(k, { t, d: hit.d });
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
    const file = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../data/fishingTourPhotos.ts");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const body = `/**\n * 낚시터 사진 — 한국관광공사 TourAPI(KorService2 · 민물 LS020500 · 바다 LS020600) · 공공누리 제1 · 3유형만. 열쇠는 '시도|시군구|이름'.\n * server/scripts/fetch-fishing-tour-photos.ts --write 로 만든 파일(손으로 고치지 말 것). 만든 날 ${new Date().toISOString().slice(0, 10)}.\n * 출처 표시: 화면에 '사진 한국관광공사 · 공공누리 제N유형'. 3유형은 변경 금지 — 자르지 않고 그대로 그린다.\n */\nexport interface FishingTourPhoto { url: string; thumb: string | null; lic: "Type1" | "Type3" }\nexport const FISHING_TOUR_PHOTOS: Readonly<Record<string, { contentId: string; title: string; photos: FishingTourPhoto[] }>> = ${JSON.stringify(out, null, 0)};\n`;
    fs.writeFileSync(file, body);
    console.log("wrote", file, Math.round(body.length / 1024), "KB");
}
process.exit(0);
