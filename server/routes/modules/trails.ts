/**
 * 코리아둘레길 — 공개 읽기(2026-10-21). 길 넷 · 코스 목록 · 코스 한 곳(앞 · 뒤 코스 · 근처 축제) · 코스 시작점의 날씨.
 * 로그인 없이 열리고 아무것도 쓰지 않는다. 자료는 storage/koreaTrails(두루누비 파일), 규칙은 shared/koreaTrails.
 */
import { Router } from "express";
import { sendError, sendSuccess } from "../../utils/response.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { toSummary, trailCourse, trailCourses, trailRouteCounts, trailRouteMeta } from "../../storage/koreaTrails.js";
import { TRAIL_ROUTES, trailRouteOf } from "../../../shared/koreaTrails.js";
import { thinLine } from "../../../shared/hikingGeo.js";
import { tourFestivals, kstYmd } from "../../services/tourFestivals.js";
import { nearbyFestivals } from "../../../shared/tourFestivals.js";
import { getCourseWeather } from "../../services/golfWeather.js";

const router = Router();
const PUBLIC_CACHE = "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400";

router.get("/", asyncHandler(async (_req, res) => {
    const counts = trailRouteCounts();
    const meta = new Map(trailRouteMeta().map((m) => [m.id, m]));
    res.set("Cache-Control", PUBLIC_CACHE);
    return sendSuccess(res, {
        routes: TRAIL_ROUTES.map((r) => ({ ...r, line: meta.get(r.id)?.line ?? null, desc: meta.get(r.id)?.desc ?? null, have: counts[r.id].courses, haveKm: Math.round(counts[r.id].km) })),
        courses: trailCourses().map(toSummary),
    });
}));

/** 코스 한 곳 — 앞 · 뒤 코스는 지도에 옅게 그릴 선(60점)까지. 근처 축제는 코스의 가운데 자리에서 20km · 45일 */
router.get("/:route/:key", asyncHandler(async (req, res) => {
    if (!trailRouteOf(String(req.params.route))) return sendError(res, 404, "없는 길이에요");
    const hit = trailCourse(String(req.params.route), String(req.params.key));
    if (!hit) return sendError(res, 404, "없는 코스예요");
    const { course, prev, next } = hit;
    const mid = course.line[Math.floor(course.line.length / 2)];
    const festivals = mid ? nearbyFestivals(await tourFestivals().catch(() => []), mid[0], mid[1], kstYmd()) : [];
    const side = (c: typeof prev) => (c ? { ...toSummary(c), line: thinLine(c.line as unknown as [number, number, number, number][], 60).map((p) => [...p]) } : null);
    res.set("Cache-Control", PUBLIC_CACHE);
    return sendSuccess(res, { course, prev: side(prev), next: side(next), festivals });
}));

/** 코스 시작점의 날씨(골프장 · 산 · 축제와 같은 기상청 예보 저장 · 같은 셈). 못 받으면 null */
router.get("/:route/:key/weather", asyncHandler(async (req, res) => {
    const hit = trailCourse(String(req.params.route), String(req.params.key));
    if (!hit) return sendError(res, 404, "없는 코스예요");
    const [lat, lng] = hit.course.start;
    const wx = await getCourseWeather({ lat, lng }, { fetch: true }).catch((e) => { console.error("[TrailWeather]", e); return null; });
    res.set("Cache-Control", wx ? "public, max-age=300, s-maxage=900, stale-while-revalidate=3600" : "no-store");
    return sendSuccess(res, wx ? { days: wx.days.slice(0, 7), area: wx.midArea } : null);
}));

export default router;
