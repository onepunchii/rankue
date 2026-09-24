import { Router, type Response } from "express";
import { sendSuccess, sendError } from "../../utils/response.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { tournamentsRepo } from "../../storage/tournaments.repo.js";
import { parseSeasonSeg, parseTourCodeSeg, UMB_SLUG_RE } from "../../../shared/tournamentMeta.js";

// 당구 대회 허브 공개 API(2026-09-24) — /tournaments 화면들이 읽는다. 전부 비로그인 읽기(검색 유입용 공개 화면).
// 봇에게는 같은 저장소 함수로 server/seo/tournaments.ts 가 HTML 을 낸다.
const router = Router();

// UMB·PBA 라우트와 같은 분리 캐시 — 브라우저는 매번 재검증(ETag), CDN 만 10분.
// (stale-while-revalidate 를 Cache-Control 에 넣으면 브라우저도 낡은 JSON 을 그대로 보여 준다 — umb.ts 실측)
router.use((_req, res, next) => {
    res.set("Cache-Control", "public, max-age=0, must-revalidate");
    res.set("CDN-Cache-Control", "public, s-maxage=600, stale-while-revalidate=86400");
    next();
});

const NOT_FOUND = "대회를 찾을 수 없습니다";

// GET /tournaments — 허브(다가오는 대회 · PBA 시즌별 · UMB 해별)
router.get("/", asyncHandler(async (_req: any, res: Response) => {
    return sendSuccess(res, await tournamentsRepo.getHub());
}));

// GET /tournaments/pba/:season — 시즌 한 개(행이 없는 시즌은 404)
router.get("/pba/:season", asyncHandler(async (req: any, res: Response) => {
    const season = parseSeasonSeg(req.params.season);
    if (!season) return sendError(res, 404, NOT_FOUND);
    const data = await tournamentsRepo.getPbaSeasonPage(season);
    if (!data) return sendError(res, 404, NOT_FOUND);
    return sendSuccess(res, data);
}));

// GET /tournaments/pba/:season/:tourCode — 대회 한 개. 주소의 시즌이 틀려도 대회는 준다(화면이 정본 주소로 고친다 — 프리렌더는 301)
router.get("/pba/:season/:tourCode", asyncHandler(async (req: any, res: Response) => {
    const code = parseTourCodeSeg(req.params.tourCode);
    if (!parseSeasonSeg(req.params.season) || !code) return sendError(res, 404, NOT_FOUND);
    const data = await tournamentsRepo.getPbaTourPage(code);
    if (!data) return sendError(res, 404, NOT_FOUND);
    return sendSuccess(res, data);
}));

// GET /tournaments/umb/:slug — UMB 대회 한 개(부문별 포인트 표)
router.get("/umb/:slug", asyncHandler(async (req: any, res: Response) => {
    const slug = String(req.params.slug ?? "");
    if (slug.length > 80 || !UMB_SLUG_RE.test(slug)) return sendError(res, 404, NOT_FOUND);
    const data = await tournamentsRepo.getUmbEventDetail(slug);
    if (!data) return sendError(res, 404, NOT_FOUND);
    return sendSuccess(res, data);
}));

export default router;
