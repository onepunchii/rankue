/**
 * 등산 — 공개 읽기(2026-10-13). 산 허브 · 목록 · 산 한 곳 · 산의 날씨. 로그인 없이 열리고 아무것도 쓰지 않는다.
 * 자료는 server/storage/hiking(표 hiking_*), 규칙은 shared/hikingMountains · hikingPage.
 * 당구 · 골프의 라우트와 섞지 않는다 — 등산은 /api/hiq/hiking 아래에만 산다.
 */
import { Router } from "express";
import { sendError, sendSuccess } from "../../utils/response.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { allMountains, getMountainDetail, mountainBySlug, nearbyMountains, type MountainSummary } from "../../storage/hiking.js";
import { getCourseWeather } from "../../services/golfWeather.js";
import { HIKING_LISTS, HIKING_REGIONS, HIKING_TRAITS, hikingGroup, hikingRegion, inHikingGroup } from "../../../shared/hikingMountains.js";

const router = Router();
const PUBLIC_CACHE = "public, max-age=300, s-maxage=1800, stale-while-revalidate=86400";
/** 목록 한 번에 주는 산의 수 — 권역 하나가 700곳쯤이다 */
const LIST_MAX = 1000;

/** 허브 — 명산(지도에 찍는 산) · 권역마다의 수 · 목록마다의 수 */
router.get("/hub", asyncHandler(async (_req: any, res: any) => {
    const all = await allMountains();
    const famous = all.filter((m) => m.tier === 1);
    res.set("Cache-Control", PUBLIC_CACHE);
    return sendSuccess(res, {
        counts: { total: all.length, famous: famous.length, courses: all.reduce((a, m) => a + m.courses, 0), withCourse: all.filter((m) => m.courses > 0).length },
        famous,
        regions: HIKING_REGIONS.map((r) => ({ id: r.id, name: r.name, total: all.filter((m) => m.region === r.id).length, famous: famous.filter((m) => m.region === r.id).length })),
        lists: HIKING_LISTS.map((l) => ({ id: l.id, name: l.name, short: l.short, count: all.filter((m) => m.lists.includes(l.id)).length })),
        traits: HIKING_TRAITS.map((t) => ({ id: t.id, name: t.name, how: t.how, count: all.filter((m) => m.traits.includes(t.id)).length })),
    });
}));

/** 목록 — 권역 · 목록 · 특성 · 이름으로 거른다. 명산 먼저, 높은 산부터(저장소의 순서) */
router.get("/mountains", asyncHandler(async (req: any, res: any) => {
    const region = hikingRegion(String(req.query.region ?? ""))?.id ?? null;
    // list 는 공식 목록이거나 특성(높이 · 섬)이다 — 화면의 주소(/hiking/lists/<id>)가 둘을 같이 쓴다
    const group = hikingGroup(String(req.query.list ?? ""));
    const q = String(req.query.q ?? "").trim().toLowerCase().slice(0, 30);
    let out: MountainSummary[] = await allMountains();
    if (region) out = out.filter((m) => m.region === region);
    if (group) out = out.filter((m) => inHikingGroup(group, m));
    if (q) out = out.filter((m) => m.name.toLowerCase().includes(q));
    // 목록의 산은 그 목록의 높이 순이 읽기 좋다(100대 명산은 저장소가 이미 목록 순번으로 준다)
    if (group && group.id !== "kfs100") out = [...out].sort((a, b) => (b.heightM ?? 0) - (a.heightM ?? 0));
    res.set("Cache-Control", q ? "public, max-age=60" : PUBLIC_CACHE);
    return sendSuccess(res, { total: out.length, items: out.slice(0, LIST_MAX) });
}));

/** 산 한 곳 — 글 · 코스(선) · 지점 · 가까운 산 */
router.get("/mountains/:slug", asyncHandler(async (req: any, res: any) => {
    const d = await getMountainDetail(String(req.params.slug));
    if (!d) return sendError(res, 404, "없는 산이에요");
    const near = nearbyMountains(await allMountains(), d);
    res.set("Cache-Control", PUBLIC_CACHE);
    return sendSuccess(res, { ...d, nearby: near });
}));

/** 산의 날씨 — 정상 좌표의 격자(기상청 단기 · 중기). 받아 둔 것이 낡았으면 그 자리에서 새로 받는다 */
router.get("/mountains/:slug/weather", asyncHandler(async (req: any, res: any) => {
    const m = await mountainBySlug(String(req.params.slug));
    if (!m) return sendError(res, 404, "없는 산이에요");
    const weather = m.lat != null && m.lng != null ? await getCourseWeather({ lat: m.lat, lng: m.lng }, { fetch: true }).catch((e) => { console.error("[HikingWeather]", e); return null; }) : null;
    res.set("Cache-Control", weather ? "public, max-age=300, s-maxage=600, stale-while-revalidate=1800" : "no-store");
    return sendSuccess(res, weather);
}));

export default router;
