import { Router } from "express";
import { Response } from "express";
import { storage } from "../../storage/index.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { currentPbaSeason } from "../../services/pbaSync.js";

// PBA 투어 공개 API — pbatour.org 공개 데이터의 재가공(사실 정보), 출처 표기 하 제공.
// 전부 비로그인 읽기: 검색 유입용 공개 화면이다.
const router = Router();

// 주간 갱신 데이터 — UMB 라우트와 같은 분리 캐시 전략 (브라우저 재검증 + CDN 10분)
router.use((_req, res, next) => {
    res.set("Cache-Control", "public, max-age=0, must-revalidate");
    res.set("CDN-Cache-Control", "public, s-maxage=600, stale-while-revalidate=86400");
    next();
});

const LEAGUES = ["PBA", "LPBA"] as const;
const MEM_CODE_RE = /^[A-Za-z0-9_-]{1,20}$/;

function parseLeague(raw: unknown): "PBA" | "LPBA" | null {
    return LEAGUES.includes(raw as any) ? (raw as "PBA" | "LPBA") : null;
}

// GET /pba/seasons — 리그별 가용 시즌. current 는 "DB에 실존하는 최신 시즌"
// (시즌 롤오버 직후 신시즌 랭킹 미발행 기간에도 화면이 비지 않게 — 달력 기준 금지)
router.get("/seasons", asyncHandler(async (_req: any, res: Response) => {
    const current = await storage.pba.getDisplaySeason("PBA", currentPbaSeason());
    return sendSuccess(res, { seasons: await storage.pba.getSeasons(), current });
}));

// GET /pba/rankings?league=PBA&season=2025&by=prize|point&limit=
router.get("/rankings", asyncHandler(async (req: any, res: Response) => {
    const league = parseLeague(req.query.league ?? "PBA");
    if (!league) return sendError(res, 400, "잘못된 리그입니다");
    const season = Number(req.query.season) || await storage.pba.getDisplaySeason(league, currentPbaSeason());
    if (!Number.isInteger(season) || season < 2019 || season > 2100) return sendError(res, 400, "잘못된 시즌입니다");
    const by = req.query.by === "point" ? "point" as const : "prize" as const;
    const limit = Math.max(1, Math.min(Math.trunc(Number(req.query.limit)) || 150, 200));
    const rows = await storage.pba.getRankings(league, season, by, limit);
    return sendSuccess(res, { league, season, by, rows });
}));

// GET /pba/player/:memCode — 프로필 + 시즌 히스토리
router.get("/player/:memCode", asyncHandler(async (req: any, res: Response) => {
    if (!MEM_CODE_RE.test(req.params.memCode)) return sendError(res, 404, "선수를 찾을 수 없습니다");
    const player = await storage.pba.getPlayer(req.params.memCode);
    if (!player) return sendError(res, 404, "선수를 찾을 수 없습니다");
    return sendSuccess(res, player);
}));

// GET /pba/summary?league= — 표시 시즌 1위 요약 (홈 카드용)
router.get("/summary", asyncHandler(async (req: any, res: Response) => {
    const league = parseLeague(req.query.league ?? "PBA");
    if (!league) return sendError(res, 400, "잘못된 리그입니다");
    const season = await storage.pba.getDisplaySeason(league, currentPbaSeason());
    return sendSuccess(res, await storage.pba.getSummary(league, season));
}));

export default router;
