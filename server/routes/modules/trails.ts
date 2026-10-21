/**
 * 코리아둘레길 — 공개 읽기(2026-10-21). 길 넷 · 코스 목록 · 코스 한 곳(앞 · 뒤 코스 · 근처 축제) · 코스 시작점의 날씨.
 * 읽기는 로그인 없이 열리고, 코스 도장(같은 날 더함 — 두 끝에서 위치 확인, shared/trailStamps)만 등산 회원의 쓰기다.
 * 자료는 storage/koreaTrails(두루누비 파일), 규칙은 shared/koreaTrails.
 */
import { Router } from "express";
import { sendError, sendSuccess } from "../../utils/response.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { toSummary, trailCourse, trailCourses, trailRouteCounts, trailRouteMeta, trailSpotsOf } from "../../storage/koreaTrails.js";
import { TRAIL_ROUTES, trailRouteOf } from "../../../shared/koreaTrails.js";
import { thinLine } from "../../../shared/hikingGeo.js";
import { tourFestivals, kstYmd } from "../../services/tourFestivals.js";
import { nearbyFestivals } from "../../../shared/tourFestivals.js";
import { festiveTrails } from "../../../shared/trailFestivals.js";
import { getCourseWeather } from "../../services/golfWeather.js";
import { requireHikingAccess } from "../../middleware/hikingAccess.js";
import type { AuthRequest } from "../../middleware/auth.js";
import { isLoopCourse, judgeTrailEnd, trailHint, trailPairs, type TrailEnds } from "../../../shared/trailStamps.js";
import { signTrailStampShare, trailStampCardPath } from "../../lib/trailStampShare.js";
import { addTrailCheck, addTrailStamp, myOpenTrailChecks, myTrailStamps, recentTrailChecks, trailChecksToday } from "../../storage/trailStamps.js";

const router = Router();
const PUBLIC_CACHE = "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400";

router.get("/", asyncHandler(async (_req, res) => {
    const counts = trailRouteCounts();
    const meta = new Map(trailRouteMeta().map((m) => [m.id, m]));
    const courses = trailCourses().map(toSummary);
    // 축제가 열리는 둘레길(10/21) — 축제 표를 못 읽으면 빈 줄(허브는 그 구역을 그리지 않는다)
    const festive = festiveTrails(courses, await tourFestivals().catch(() => []), kstYmd());
    res.set("Cache-Control", PUBLIC_CACHE);
    return sendSuccess(res, {
        routes: TRAIL_ROUTES.map((r) => ({ ...r, line: meta.get(r.id)?.line ?? null, desc: meta.get(r.id)?.desc ?? null, have: counts[r.id].courses, haveKm: Math.round(counts[r.id].km) })),
        courses,
        festive,
    });
}));

/** 내 코스 도장 · 도장이 안 된 출발 확인 — 허브 · 길 · 코스 화면이 이것 하나로 그린다 */
router.get("/me", ...requireHikingAccess, asyncHandler(async (req: AuthRequest, res: any) => {
    const now = Date.now();
    const [stamps, open] = await Promise.all([myTrailStamps(req.userId!), myOpenTrailChecks(req.userId!, now)]);
    res.set("Cache-Control", "no-store");
    return sendSuccess(res, {
        stamps: stamps.map((s) => ({ courseId: s.courseId, route: s.route, key: s.key, firstEnd: s.firstEnd, startedAt: new Date(s.startedMs).toISOString(), doneAt: new Date(s.doneMs).toISOString() })),
        open: open.map((o) => ({ courseId: o.courseId, route: o.route, key: o.key, end: o.end, at: new Date(o.atMs).toISOString() })),
    });
}));

/** 하루에 남기는 확인의 상한(누름 장난) */
const CHECKS_PER_DAY = 30;
const ends = (c: { start: [number, number]; end: [number, number]; loop: boolean; minutes: number | null }): TrailEnds => ({ start: c.start, end: c.end, loop: isLoopCourse(c), minutes: c.minutes });

/**
 * 코스 끝에서 '여기 왔어요' — 지금 위치가 코스의 시작이나 끝 200m 안이면 그 끝의 확인을 남기고,
 * 36시간 안에 반대쪽 끝(순환은 같은 자리 · 시간이 지난 뒤)의 확인이 있으면 코스 도장. **좌표는 저장하지 않는다.**
 */
router.post("/:route/:key/check", ...requireHikingAccess, asyncHandler(async (req: AuthRequest, res: any) => {
    const hit = trailCourse(String(req.params.route), String(req.params.key));
    if (!hit) return sendError(res, 404, "없는 코스예요");
    const c = hit.course;
    const lat = Number(req.body?.lat), lng = Number(req.body?.lng);
    const acc = req.body?.accuracy == null ? null : Number(req.body.accuracy);
    const e = ends(c);
    const judged = judgeTrailEnd(e, Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng, accuracy: acc } : null);
    if (!judged.at) return sendSuccess(res, { state: "far", reason: judged.reason, bucket: judged.bucket, hint: trailHint(judged), end: null, stamped: false });
    const now = Date.now();
    if ((await trailChecksToday(req.userId!, now - 24 * 3_600_000)) >= CHECKS_PER_DAY) return sendError(res, 429, "오늘은 확인을 너무 많이 했어요. 내일 다시 눌러 주세요.");
    const earlier = await recentTrailChecks(req.userId!, c.id, now);
    await addTrailCheck(req.userId!, c, judged.at, now);
    const pair = trailPairs(e, earlier.map((x) => ({ end: x.end, atMs: x.atMs })), { end: judged.at, atMs: now });
    if (!pair.done || !pair.from) return sendSuccess(res, { state: "half", reason: "ok", bucket: judged.bucket, hint: null, end: judged.at, at: new Date(now).toISOString(), stamped: false });
    const added = await addTrailStamp(req.userId!, c, pair.from, now);
    return sendSuccess(res, { state: "done", reason: "ok", bucket: judged.bucket, hint: null, end: judged.at, at: new Date(now).toISOString(), stamped: added, startedAt: new Date(pair.from.atMs).toISOString() });
}));

/**
 * 코스 도장 카드의 공유 주소(2026-10-21) — **본인의, 받은 도장만**. 서명된 주소를 만들어 줄 뿐 아무것도 저장하지 않는다(골프 도장첩 카드의 GET /golf/stamp-share 와 같다).
 * 주소는 30일 뒤 닫힌다(server/lib/trailStampShare).
 */
router.get("/:route/:key/share", ...requireHikingAccess, asyncHandler(async (req: AuthRequest, res: any) => {
    const hit = trailCourse(String(req.params.route), String(req.params.key));
    if (!hit) return sendError(res, 404, "없는 코스예요");
    const mine = (await myTrailStamps(req.userId!)).some((s) => s.courseId === hit.course.id);
    if (!mine) return sendError(res, 404, "도장을 받은 코스만 카드로 만들 수 있어요");
    const signed = signTrailStampShare(req.userId!, hit.course.id);
    if (!signed) return sendError(res, 503, "지금은 공유 링크를 만들 수 없어요");
    // 주소 자체가 열쇠다 — 어디에도 캐시되지 않게
    res.set("Cache-Control", "no-store");
    return sendSuccess(res, { url: trailStampCardPath(req.userId!, hit.course.id, signed.token), expiresAt: new Date(signed.exp * 1000).toISOString() });
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
    // 코스 근처 볼거리(10/21) — 관광공사 관광지 · 사진(near-spots.json)
    return sendSuccess(res, { course, prev: side(prev), next: side(next), festivals, spots: trailSpotsOf(course.id) });
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
