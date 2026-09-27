import { Router, type Response } from "express";
import { storage } from "../../storage/index.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { requireAuth, type AuthRequest } from "../../middleware/auth.js";
import { nearestPros, normalizeAvg, type CompareAvgResponse, type CompareMeResponse } from "../../../shared/proCompare.js";

/**
 * "나와 비교하기"(2026-09-27, 선수 페이지 PBA·UMB).
 *   GET /compare/avg?avg=0.80&exclude=<memCode>  공개 — 가입 전 방문자가 넣은 에버리지: 랭큐 회원 중 순위·상위 %, 비슷한 프로 2명
 *   GET /compare/me?exclude=<memCode>            회원 — 내 3쿠션 요약(경기·하이런·승률·월평균 변화) + 같은 순위·비슷한 프로
 * 공개 쪽은 입력이 소수 둘째 자리로 잘려 캐시가 잘 맞는다. 회원 쪽은 사람마다 달라 캐시하지 않는다.
 */
const router = Router();
const MEM_CODE_RE = /^[A-Za-z0-9_-]{1,20}$/;
const excludeOf = (v: unknown) => (typeof v === "string" && MEM_CODE_RE.test(v) ? v : null);

router.get("/avg", asyncHandler(async (req: any, res: Response) => {
    const avg = normalizeAvg(req.query.avg);
    if (avg == null) return sendError(res, 400, "err.compare.badAvg");
    const [members, pool] = await Promise.all([storage.compare.memberRank(avg), storage.pba.comparePros()]);
    res.set("Cache-Control", "public, max-age=0, must-revalidate");
    res.set("CDN-Cache-Control", "public, s-maxage=600, stale-while-revalidate=86400");
    const body: CompareAvgResponse = { avg, members, pros: nearestPros(pool, avg, 2, excludeOf(req.query.exclude)) };
    return sendSuccess(res, body);
}));

router.get("/me", requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    res.set("Cache-Control", "private, no-store");
    const stats = await storage.compare.myStats(req.userId!);
    const [members, pool] = stats
        ? await Promise.all([storage.compare.memberRank(stats.avg), storage.pba.comparePros()])
        : [null, []];
    const body: CompareMeResponse = { stats, members, pros: stats ? nearestPros(pool, stats.avg, 2, excludeOf(req.query.exclude)) : [] };
    return sendSuccess(res, body);
}));

export default router;
