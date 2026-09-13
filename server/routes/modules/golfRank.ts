import { Router } from "express";
import type { NextFunction, Response } from "express";
import { requireAuth, type AuthRequest } from "../../middleware/auth.js";
import { requireTermsAccepted } from "../../middleware/terms.js";
import { checkContent, maskContacts } from "../../utils/contentFilter.js";
import { storage } from "../../storage/index.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { isGolfTour, type GolfTour } from "../../../shared/golfTours.js";

/**
 * 골프 랭킹 공개 API(2026-09-13 오너: "골프는 공개 전체"). 골프 접근 통제(requireGolfAccess)를 **타지 않는다** —
 * 검색 유입용 공개 화면이라 비로그인 읽기가 기본이다. 쓰기(팔로우·응원글)만 로그인.
 * UMB 라우트(umb.ts)와 같은 캐시 규칙: 브라우저는 매번 재검증, CDN 은 10분.
 */
const router = Router();

router.use((_req, res, next) => {
    res.set("Cache-Control", "public, max-age=0, must-revalidate");
    res.set("CDN-Cache-Control", "public, s-maxage=600, stale-while-revalidate=86400");
    next();
});

function parseTour(raw: unknown): GolfTour | null {
    return isGolfTour(raw) ? raw : null;
}
const ID_RE = /^\d{1,10}$/;

// GET /golf-rank/rankings?tour=owgr&limit=&offset=&country=KOR&q=
router.get("/rankings", asyncHandler(async (req: any, res: Response) => {
    const tour = parseTour(req.query.tour ?? "owgr");
    if (!tour) return sendError(res, 400, "잘못된 투어입니다");
    const limit = Number(req.query.limit) || 50;
    const offset = Number(req.query.offset) || 0;
    if (!Number.isInteger(limit) || !Number.isInteger(offset) || limit < 1 || limit > 200 || offset < 0) return sendError(res, 400, "잘못된 페이지 값입니다");
    const country = typeof req.query.country === "string" && /^[A-Za-z]{3}$/.test(req.query.country) ? req.query.country.toUpperCase() : undefined;
    const q = typeof req.query.q === "string" ? req.query.q.slice(0, 40) : undefined;
    return sendSuccess(res, await storage.golfRank.getRankings(tour, { limit, offset, country, q }));
}));

// 로그인은 선택 — 공개 페이지지만 로그인한 회원에겐 '팔로우 중' 을 같이 알려 준다(서명 쿠키만 믿는다)
const optionalAuth = (req: AuthRequest, _res: Response, next: NextFunction) => {
    const userId = (req as any).signedCookies?.hiq_user_id;
    if (typeof userId === "string" && userId) req.userId = userId;
    next();
};

// GET /golf-rank/players/:tour/:id — 선수 상세(히스토리·국내 순위판·시즌 기록·팔로워)
router.get("/players/:tour/:id", optionalAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    const tour = parseTour(req.params.tour);
    if (!tour) return sendError(res, 400, "잘못된 투어입니다");
    if (!ID_RE.test(req.params.id)) return sendError(res, 404, "선수를 찾을 수 없습니다");
    const data = await storage.golfRank.getPlayer(tour, req.params.id);
    if (!data) return sendError(res, 404, "선수를 찾을 수 없습니다");
    const following = req.userId ? await storage.umb.isFollowing(req.userId, tour, req.params.id) : false;
    return sendSuccess(res, { ...data, following });
}));

// PUT /golf-rank/players/:tour/:id/follow { on }
router.put("/players/:tour/:id/follow", requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    const tour = parseTour(req.params.tour);
    if (!tour) return sendError(res, 400, "잘못된 투어입니다");
    if (!ID_RE.test(req.params.id)) return sendError(res, 404, "선수를 찾을 수 없습니다");
    const on = req.body?.on === true;
    await storage.umb.setFollowing(req.userId!, tour, req.params.id, on);
    return sendSuccess(res, { following: on });
}));

/* ── 응원글 — UMB 와 같은 문지기(약관·정지 → 욕설·내기 필터 → 연락처 마스킹 → 60초 쿨다운). 같은 표(hiq_player_cheers, category=투어) ── */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHEER_MAX = 200;
const CHEER_COOLDOWN_MS = 60_000;

router.get("/players/:tour/:id/cheers", optionalAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    const tour = parseTour(req.params.tour);
    if (!tour) return sendError(res, 400, "잘못된 투어입니다");
    if (!ID_RE.test(req.params.id)) return sendError(res, 404, "선수를 찾을 수 없습니다");
    return sendSuccess(res, await storage.umb.listCheers(tour, req.params.id, req.userId ?? null));
}));

router.post("/players/:tour/:id/cheers", requireAuth, requireTermsAccepted, asyncHandler(async (req: AuthRequest, res: Response) => {
    const tour = parseTour(req.params.tour);
    if (!tour) return sendError(res, 400, "잘못된 투어입니다");
    if (!ID_RE.test(req.params.id)) return sendError(res, 404, "선수를 찾을 수 없습니다");
    const content = String(req.body?.content ?? "").trim();
    if (!content) return sendError(res, 400, "내용을 입력해주세요");
    if (content.length > CHEER_MAX) return sendError(res, 400, `응원글이 너무 깁니다 (${CHEER_MAX}자 이내)`);
    const filter = checkContent(content);
    if (filter.blocked) return sendError(res, 400, filter.reason!);
    const last = await storage.umb.lastCheerAt(req.userId!, tour, req.params.id);
    if (last && Date.now() - last.getTime() < CHEER_COOLDOWN_MS) return sendError(res, 429, "잠시 뒤에 다시 남겨 주세요", "COOLDOWN");
    const row = await storage.umb.createCheer({ category: tour, playerUmbId: req.params.id, authorId: req.userId!, content: maskContacts(content) });
    return sendSuccess(res, { id: row.id, content: row.content, createdAt: row.createdAt });
}));

router.delete("/players/:tour/:id/cheers/:cheerId", requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!UUID_RE.test(req.params.cheerId)) return sendError(res, 404, "응원글을 찾을 수 없습니다");
    const ok = await storage.umb.deleteCheer(req.params.cheerId, req.userId!);
    if (!ok) return sendError(res, 404, "응원글을 찾을 수 없습니다");
    return sendSuccess(res, { deleted: true });
}));

// GET /golf-rank/movers?tour= — 이번 회차 상승 톱
router.get("/movers", asyncHandler(async (req: any, res: Response) => {
    const tour = parseTour(req.query.tour ?? "owgr");
    if (!tour) return sendError(res, 400, "잘못된 투어입니다");
    return sendSuccess(res, await storage.golfRank.getMovers(tour));
}));

// GET /golf-rank/nations?tour= — 국가별 집계(세계 랭킹)
router.get("/nations", asyncHandler(async (req: any, res: Response) => {
    const tour = parseTour(req.query.tour ?? "owgr");
    if (!tour) return sendError(res, 400, "잘못된 투어입니다");
    return sendSuccess(res, await storage.golfRank.getNations(tour));
}));

// GET /golf-rank/stats?tour=kpga&key=9&limit= — 기록 한 지표의 목록. key 없으면 지표 목록
router.get("/stats", asyncHandler(async (req: any, res: Response) => {
    const tour = parseTour(req.query.tour ?? "kpga");
    if (!tour) return sendError(res, 400, "잘못된 투어입니다");
    const season = (typeof req.query.season === "string" && /^\d{4}$/.test(req.query.season) ? req.query.season : null)
        ?? await storage.golfRank.getDisplaySeason(tour);
    if (!season) return sendSuccess(res, { season: null, keys: [], rows: [] });
    const key = typeof req.query.key === "string" ? req.query.key.slice(0, 40) : "";
    const limit = Math.min(200, Number(req.query.limit) || 50);
    if (!key) return sendSuccess(res, { season, keys: await storage.golfRank.getStatKeys(tour, season), rows: [] });
    return sendSuccess(res, { season, key, rows: await storage.golfRank.getStat(tour, season, key, limit) });
}));

// GET /golf-rank/summary?tour=&fed=KOR — 홈 카드 요약
router.get("/summary", asyncHandler(async (req: any, res: Response) => {
    const tour = parseTour(req.query.tour ?? "owgr");
    if (!tour) return sendError(res, 400, "잘못된 투어입니다");
    const fed = typeof req.query.fed === "string" && /^[A-Za-z]{3}$/.test(req.query.fed) ? req.query.fed.toUpperCase() : "KOR";
    return sendSuccess(res, await storage.golfRank.getSummary(tour, fed));
}));

export default router;
