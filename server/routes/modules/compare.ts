import { Router, type Response } from "express";
import { storage } from "../../storage/index.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { requireAuth, type AuthRequest } from "../../middleware/auth.js";
import { nearestPros, nextPro, normalizeAvg, proTier, type CompareAvgResponse, type CompareMeResponse, type RealCompareResponse, type RealSide } from "../../../shared/proCompare.js";
import { HANDI_MIN_GAMES, nextHandicap } from "../../../shared/realHandicap.js";

/**
 * "나와 비교하기"(2026-09-27, 선수 페이지 PBA·UMB).
 *   GET /compare/avg?avg=0.80&exclude=<memCode>  공개 — 가입 전 방문자가 넣은 에버리지: 랭큐 회원 중 순위·상위 %, 비슷한 프로 2명
 *   GET /compare/me?exclude=<memCode>            회원 — 내 3쿠션 요약(경기·하이런·승률·월평균 변화) + 같은 순위·비슷한 프로
 *   GET /compare/real                            회원 — 홈 "내 실전 핸디"(3쿠션·4구): 핸디·다음 핸디까지·회원 순위, 3쿠션은 닮은 프로·재미 등급, 4구는 같은 핸디 회원
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

router.get("/real", requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    res.set("Cache-Control", "private, no-store");
    const me = await storage.getMemberById(req.userId!);
    if (!me) return sendError(res, 404, "err.member.notFound");
    const pool = await storage.pba.comparePros();
    const side = async (type: "3c" | "4c"): Promise<RealSide> => {
        const [stats, basis] = await Promise.all([storage.compare.myStats(me.id, type), storage.compare.handiBasis(me.id, type)]);
        const handi = (type === "3c" ? me.handi3c : me.handi4c) ?? null;
        const ready = basis.ranked >= HANDI_MIN_GAMES && !!stats && handi != null && handi > 0;
        const empty: RealSide = {
            type, games: basis.ranked, needed: HANDI_MIN_GAMES, ready: false,
            avg: null, handiAvg: null, highRun: null, winRate: null, handi: null, members: null, nextHandi: null,
            pro: null, next: null, tier: null, pos: null, peers: null,
        };
        if (!ready || !stats) return empty;
        const up = basis.avg != null ? nextHandicap(basis.avg, type) : null;
        const [members, peers] = await Promise.all([
            storage.compare.memberRank(stats.avg, type),
            type === "4c" ? storage.compare.peers("4c", handi!) : Promise.resolve(null),
        ]);
        const [pro] = type === "3c" ? nearestPros(pool, stats.avg, 1) : [];
        const tier = type === "3c" ? proTier(pool, stats.avg) : null;
        return {
            ...empty, ready: true,
            avg: stats.avg, handiAvg: basis.avg, highRun: stats.highRun, winRate: stats.winRate, handi,
            members,
            nextHandi: up && basis.avg != null ? { handi: up.handi, avg: up.avg, gap: Math.max(0.001, up.avg - basis.avg) } : null,
            pro: pro ?? null,
            next: type === "3c" ? nextPro(pool, stats.avg, pro?.memCode ?? null) : null,
            tier: tier?.tier ?? null, pos: tier?.pos ?? null,
            peers,
        };
    };
    const [c3, c4] = await Promise.all([side("3c"), side("4c")]);
    // 기본 탭 — 준비된 쪽, 둘 다면 공식 경기가 많은 쪽(같으면 3쿠션)
    const preferred: "3c" | "4c" = c3.ready !== c4.ready ? (c3.ready ? "3c" : "4c") : (c4.games > c3.games ? "4c" : "3c");
    const body: RealCompareResponse = { "3c": c3, "4c": c4, preferred };
    return sendSuccess(res, body);
}));

export default router;
