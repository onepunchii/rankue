import { Router } from "express";
import { Response } from "express";
import { storage } from "../../storage/index.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import type { UmbCategory } from "../../services/umbService.js";

// UMB 세계랭킹 공개 API — 출처 표기(UMB) 하에 사실 데이터를 제공한다.
// 전부 비로그인 읽기 허용: 세계 랭킹 페이지는 검색 유입용 공개 화면이다.
const router = Router();

// 주 1회 갱신 데이터 — CDN(s-maxage)이 반복 요청을 흡수해 Neon을 보호한다.
// 크론 적재 후 최대 10분 내 자연 갱신 + stale-while-revalidate로 무정지.
router.use((_req, res, next) => {
    res.set("Cache-Control", "public, s-maxage=600, stale-while-revalidate=86400");
    next();
});

const CATEGORIES = ["players", "ladies", "juniors"] as const;

function parseCategory(raw: unknown): UmbCategory | null {
    return CATEGORIES.includes(raw as any) ? (raw as UmbCategory) : null;
}

// GET /umb/rankings?category=players&limit=&offset=&fed=KR&q=
router.get("/rankings", asyncHandler(async (req: any, res: Response) => {
    const category = parseCategory(req.query.category ?? "players");
    if (!category) return sendError(res, 400, "잘못된 부문입니다");
    const limit = Number(req.query.limit) || 50;
    const offset = Number(req.query.offset) || 0;
    if (!Number.isInteger(limit) || !Number.isInteger(offset) || limit < 1 || offset < 0) {
        return sendError(res, 400, "잘못된 페이지 값입니다");
    }
    const fed = typeof req.query.fed === "string" && /^[A-Za-z]{2}$/.test(req.query.fed) ? req.query.fed : undefined;
    const q = typeof req.query.q === "string" ? req.query.q.slice(0, 40) : undefined;
    const data = await storage.umb.getRankings(category, { limit, offset, fed, q });
    return sendSuccess(res, data);
}));

// GET /umb/players/:category/:umbId — 선수 상세 + 히스토리 + 대회 레전드
router.get("/players/:category/:umbId", asyncHandler(async (req: any, res: Response) => {
    const category = parseCategory(req.params.category);
    if (!category) return sendError(res, 400, "잘못된 부문입니다");
    if (!/^\d{1,6}$/.test(req.params.umbId)) return sendError(res, 404, "선수를 찾을 수 없습니다");
    const data = await storage.umb.getPlayerHistory(category, req.params.umbId);
    if (!data) return sendError(res, 404, "선수를 찾을 수 없습니다");
    return sendSuccess(res, data);
}));

// GET /umb/movers?category= — 이번 주 순위 상승 톱
router.get("/movers", asyncHandler(async (req: any, res: Response) => {
    const category = parseCategory(req.query.category ?? "players");
    if (!category) return sendError(res, 400, "잘못된 부문입니다");
    const movers = await storage.umb.getMovers(category);
    return sendSuccess(res, movers);
}));

// GET /umb/summary?category= — 홈 섹션 요약 (총 인원·한국 선수·1위·한국 최고)
router.get("/summary", asyncHandler(async (req: any, res: Response) => {
    const category = parseCategory(req.query.category ?? "players");
    if (!category) return sendError(res, 400, "잘못된 부문입니다");
    const summary = await storage.umb.getSummary(category);
    return sendSuccess(res, summary);
}));

export default router;
