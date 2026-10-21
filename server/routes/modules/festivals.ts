/**
 * 전국 축제 — 공개 읽기(2026-10-21). 목록 · 종목에 맞는 축제 · 축제 한 곳(가는 길에 들를 산 · 골프장 · 낚시터 · 근처 축제).
 * 로그인 없이 열리고 아무것도 쓰지 않는다. 자료는 표 tour_festivals(storage/festivals), 규칙은 shared/festivals.
 */
import { Router } from "express";
import { sendError, sendSuccess } from "../../utils/response.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { allFestivals, getFestival, golfPoints } from "../../storage/festivals.js";
import { allMountains } from "../../storage/hiking.js";
import { allPlaces } from "../../storage/fishingPlaces.js";
import { MOUNTAIN_TOUR_PHOTOS } from "../../data/mountainTourPhotos.js";
import { FESTIVAL_METRO_GOLF_KM, FESTIVAL_METRO_REGIONS, FISHING_FESTIVAL_WORDS, HIKING_FESTIVAL_WORDS, addDays, festivalKm, festivalWeatherDays, kstToday, liveFestivals, type FestivalRow } from "../../../shared/festivals.js";
import { getCourseWeather } from "../../services/golfWeather.js";

const router = Router();
const PUBLIC_CACHE = "public, max-age=300, s-maxage=1800, stale-while-revalidate=86400";
const r1 = (n: number) => Math.round(n * 10) / 10;
/** 서울 · 광역시 — 도심 축제는 골프 · 산 둘레로 넓게 잡지 않는다(shared/festivals FESTIVAL_METRO_REGIONS — 화면의 '가까운 골프장' 줄과 같은 묶음) */
const METRO_REGIONS = FESTIVAL_METRO_REGIONS;

/** 축제 둘레 — 산(명산 25km) · 골프장(40km — 차로 간다) · 낚시터(20km) · 근처 축제(30km, 열렸거나 곧 열리는 것). 화면과 검색용 화면이 같이 쓴다 */
export async function festivalAround(f: FestivalRow, today: string) {
    const [mountains, golf, places, all] = await Promise.all([allMountains().catch(() => []), golfPoints(), allPlaces().catch(() => []), allFestivals()]);
    const mts = mountains.filter((m) => m.tier === 1 && m.lat != null && m.lng != null)
        .map((m) => ({ m, km: festivalKm(f, { lat: m.lat!, lng: m.lng! }) })).filter((x) => x.km <= 25).sort((a, b) => a.km - b.km).slice(0, 4)
        .map(({ m, km }) => { const ph = MOUNTAIN_TOUR_PHOTOS[m.slug]?.photos[0]; return { slug: m.slug, name: m.name, heightM: m.heightM, lat: m.lat!, lng: m.lng!, km: r1(km), photo: ph ? { url: ph.thumb ?? ph.url, lic: ph.lic } : null }; });
    const gc = golf.map((g) => ({ g, km: festivalKm(f, g) })).filter((x) => x.km <= 40).sort((a, b) => a.km - b.km).slice(0, 3)
        .map(({ g, km }) => ({ slug: g.slug, name: g.name, logo: g.logo, lat: g.lat, lng: g.lng, km: r1(km) }));
    const fp = places.filter((p) => p.lat != null && p.lng != null).map((p) => ({ p, km: festivalKm(f, { lat: p.lat!, lng: p.lng! }) })).filter((x) => x.km <= 20).sort((a, b) => a.km - b.km).slice(0, 3)
        .map(({ p, km }) => ({ id: p.id, name: p.name, kind: p.kind, lat: p.lat!, lng: p.lng!, km: r1(km) }));
    const fests = liveFestivals(all.filter((x) => x.id !== f.id), today, 60).map((x) => ({ ...x, km: r1(festivalKm(f, x)) })).filter((x) => x.km <= 30)
        .sort((a, b) => a.km - b.km).slice(0, 4);
    return { mountains: mts, golf: gc, fishing: fp, festivals: fests };
}

router.get("/", asyncHandler(async (_req, res) => {
    const items = await allFestivals();
    res.set("Cache-Control", PUBLIC_CACHE);
    return sendSuccess(res, { today: kstToday(), items });
}));

/**
 * 종목에 맞는 축제(등산 · 낚시 홈) — 열렸거나 곧 열리는 것만.
 *  · HIKING: '산행 길에 들를 축제' — 100대 명산(+플러스) 정상 5km 안에서 열리는 것만, 그 산을 같이 준다. 꽃 · 단풍 · 억새 · 눈꽃 축제를 앞에.
 *    (2026-10-21 화면 확인: 이름 낱말만으로 고르면 강가의 억새축제가, 4km 안만으로 '산에서 열리는 축제'라 부르면 김밥축제가 섞였다 — 제목을 사실대로 바꾸고 산을 꼭 붙인다)
 *  · FISHING: 이름에 낚시 · 산천어 · 송어 · 빙어 · 루어 — 겨울 축제라 넉 달 앞까지
 *  · GOLF: 골프장 10km 안(아래) — 응답의 mountain 칸에 그 골프장을 싣는다(칸 이름은 등산 때 정한 것 그대로 — 화면은 '가까운 곳'으로 읽는다) 본다
 */
router.get("/picks", asyncHandler(async (req, res) => {
    const sport = String(req.query.sport ?? "");
    const today = kstToday();
    const all = await allFestivals();
    res.set("Cache-Control", PUBLIC_CACHE);
    if (sport === "FISHING") {
        const items = liveFestivals(all, today, 120).filter((f) => FISHING_FESTIVAL_WORDS.test(f.title)).slice(0, 8).map((f) => ({ ...f, mountain: null }));
        return sendSuccess(res, { today, items });
    }
    // GOLF: '라운드 길에 들를 축제' — 골프장 10km 안에서 열리는 것, 그 골프장을 같이 준다. 열린 것 먼저, 그다음 골프장에 가까운 것.
    // 서울 · 광역시의 축제는 골프장 3km 안만(2026-10-21 화면 확인: 경복궁 별빛야행이 고양의 6홀 골프장 9.7km 로 걸렸다 — 라운드 길이 아니다)
    if (sport === "GOLF") {
        const golf = await golfPoints();
        const items = liveFestivals(all, today, 45).map((f) => {
            const near = golf.map((g) => ({ g, km: festivalKm(f, g) })).filter((x) => x.km <= (METRO_REGIONS.has(f.region ?? "") ? FESTIVAL_METRO_GOLF_KM : 10)).sort((a, b) => a.km - b.km)[0];
            return { ...f, mountain: near ? { slug: near.g.slug, name: near.g.name, km: r1(near.km) } : null };
        }).filter((f) => f.mountain).sort((a, b) => Number(b.start <= today) - Number(a.start <= today) || a.mountain!.km - b.mountain!.km).slice(0, 8);
        return sendSuccess(res, { today, items });
    }
    if (sport !== "HIKING") return sendError(res, 400, "종목을 골라 주세요");
    const famous = (await allMountains().catch(() => [])).filter((m) => m.lat != null && m.lng != null && m.lists.some((l) => l === "kfs100" || l === "kfs100plus"));
    const items = liveFestivals(all, today, 60).map((f, i) => {
        const near = famous.map((m) => ({ m, km: festivalKm(f, { lat: m.lat!, lng: m.lng! }) })).filter((x) => x.km <= 5).sort((a, b) => a.km - b.km)[0];
        return { f: { ...f, mountain: near ? { slug: near.m.slug, name: near.m.name, km: r1(near.km) } : null }, i, word: HIKING_FESTIVAL_WORDS.test(f.title) };
    }).filter((x) => x.f.mountain).sort((a, b) => Number(b.word) - Number(a.word) || a.i - b.i).slice(0, 8).map((x) => x.f);
    return sendSuccess(res, { today, items });
}));

/**
 * 종목의 자리(2026-10-21 — 종목마다의 축제 화면) — 지도 밑에 옅게 깔고, 목록 줄에 '가까운 골프장 ○○ 4km'를 적는 데 쓴다.
 * GOLF = 골프장 페이지 · HIKING = 명산(tier 1) · FISHING = 낚시터. 이름 · 좌표(소수 넷째 자리) · 주소 열쇠만, 짧게.
 */
router.get("/layer", asyncHandler(async (req, res) => {
    const sport = String(req.query.sport ?? "");
    const r4 = (n: number) => Math.round(n * 1e4) / 1e4;
    let items: { n: string; a: number; o: number; k: string }[] = [];
    if (sport === "GOLF") items = (await golfPoints()).map((g) => ({ n: g.name, a: r4(g.lat), o: r4(g.lng), k: g.slug }));
    else if (sport === "HIKING") items = (await allMountains().catch(() => [])).filter((m) => m.tier === 1 && m.lat != null && m.lng != null).map((m) => ({ n: m.name, a: r4(m.lat!), o: r4(m.lng!), k: m.slug }));
    else if (sport === "FISHING") items = (await allPlaces().catch(() => [])).filter((p) => p.lat != null && p.lng != null).map((p) => ({ n: p.name, a: r4(p.lat!), o: r4(p.lng!), k: p.id }));
    else return sendError(res, 400, "종목을 골라 주세요");
    res.set("Cache-Control", PUBLIC_CACHE);
    return sendSuccess(res, { items });
}));

/**
 * 축제 날 날씨(2026-10-21) — 축제 자리의 기상청 예보(골프장 · 산과 같은 격자 저장 · 같은 셈)에서 축제 기간과 겹치는 날만.
 * 끝났거나 열하루 뒤에 여는 축제는 부르지 않는다(빈 답). 못 받으면 빈 답 — 화면은 그 칸을 그리지 않는다.
 */
router.get("/:id/weather", asyncHandler(async (req, res) => {
    const f = await getFestival(String(req.params.id));
    if (!f) return sendError(res, 404, "없는 축제예요");
    const today = kstToday();
    if (f.end < today || f.start > addDays(today, 10)) { res.set("Cache-Control", PUBLIC_CACHE); return sendSuccess(res, { days: [], area: null }); }
    const wx = await getCourseWeather({ lat: f.lat, lng: f.lng }, { fetch: true }).catch((e) => { console.error("[FestivalWeather]", e); return null; });
    res.set("Cache-Control", wx ? "public, max-age=300, s-maxage=900, stale-while-revalidate=3600" : "no-store");
    return sendSuccess(res, { days: wx ? festivalWeatherDays(wx.days, f) : [], area: wx?.midArea ?? null });
}));

router.get("/:id", asyncHandler(async (req, res) => {
    const f = await getFestival(String(req.params.id));
    if (!f) return sendError(res, 404, "없는 축제예요");
    const today = kstToday();
    res.set("Cache-Control", PUBLIC_CACHE);
    return sendSuccess(res, { today, festival: f, around: await festivalAround(f, today) });
}));

export default router;
