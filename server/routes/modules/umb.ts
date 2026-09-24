import { Router } from "express";
import { requireAuth, type AuthRequest } from "../../middleware/auth.js";
import { requireTermsAccepted } from "../../middleware/terms.js";
import { checkContent, maskContacts } from "../../utils/contentFilter.js";
import type { NextFunction } from "express";
import { Response } from "express";
import { storage } from "../../storage/index.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { msg } from "../../lib/i18n.js";
import type { UmbCategory } from "../../services/umbService.js";
import { normalizeFed } from "../../../shared/umbCountryMeta.js";

// UMB 세계랭킹 공개 API — 출처 표기(UMB) 하에 사실 데이터를 제공한다.
// 전부 비로그인 읽기 허용: 세계 랭킹 페이지는 검색 유입용 공개 화면이다.
const router = Router();

// 주 1회 갱신 데이터 — CDN이 반복 요청을 흡수해 Neon을 보호한다.
// 주의: Cache-Control에 stale-while-revalidate를 넣으면 **브라우저도** 하루짜리
// 낡은 응답을 그대로 보여준다(실측: 새 필드가 배포돼도 옛 JSON이 렌더됨).
// 브라우저는 매번 재검증(ETag 304라 저렴), CDN 캐시는 Vercel 전용 헤더로 분리한다.
router.use((_req, res, next) => {
    res.set("Cache-Control", "public, max-age=0, must-revalidate");
    res.set("CDN-Cache-Control", "public, s-maxage=600, stale-while-revalidate=86400");
    next();
});

const CATEGORIES = ["players", "ladies", "juniors"] as const;

function parseCategory(raw: unknown): UmbCategory | null {
    return CATEGORIES.includes(raw as any) ? (raw as UmbCategory) : null;
}

// GET /umb/rankings?category=players&limit=&offset=&fed=KR&q=
router.get("/rankings", asyncHandler(async (req: any, res: Response) => {
    const category = parseCategory(req.query.category ?? "players");
    if (!category) return sendError(res, 400, "err.umb.badCategory");
    const limit = Number(req.query.limit) || 50;
    const offset = Number(req.query.offset) || 0;
    if (!Number.isInteger(limit) || !Number.isInteger(offset) || limit < 1 || offset < 0) {
        return sendError(res, 400, "err.umb.badPage");
    }
    const fed = typeof req.query.fed === "string" && /^[A-Za-z]{2}$/.test(req.query.fed) ? req.query.fed : undefined;
    const q = typeof req.query.q === "string" ? req.query.q.slice(0, 40) : undefined;
    const data = await storage.umb.getRankings(category, { limit, offset, fed, q });
    return sendSuccess(res, data);
}));

// GET /umb/players/:category/:umbId — 선수 상세 + 히스토리 + 대회 레전드
// 로그인은 선택 — 공개 페이지지만 로그인한 회원에겐 '팔로우 중' 을 같이 알려 준다(서명 쿠키만 믿는다)
const optionalAuth = (req: AuthRequest, _res: Response, next: NextFunction) => {
    const userId = (req as any).signedCookies?.hiq_user_id;
    if (typeof userId === "string" && userId) req.userId = userId;
    next();
};

router.get("/players/:category/:umbId", optionalAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    const category = parseCategory(req.params.category);
    if (!category) return sendError(res, 400, "err.umb.badCategory");
    if (!/^\d{1,6}$/.test(req.params.umbId)) return sendError(res, 404, "err.umb.playerNotFound");
    const data = await storage.umb.getPlayerHistory(category, req.params.umbId);
    if (!data) return sendError(res, 404, "err.umb.playerNotFound");
    const following = req.userId ? await storage.umb.isFollowing(req.userId, category, req.params.umbId) : false;
    return sendSuccess(res, { ...data, following });
}));

// PUT /umb/players/:category/:umbId/follow { on: boolean } — 관심 선수 켜기/끄기(2026-09-13 오너)
router.put("/players/:category/:umbId/follow", requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    const category = parseCategory(req.params.category);
    if (!category) return sendError(res, 400, "err.umb.badCategory");
    if (!/^\d{1,6}$/.test(req.params.umbId)) return sendError(res, 404, "err.umb.playerNotFound");
    const on = req.body?.on === true;
    await storage.umb.setFollowing(req.userId!, category, req.params.umbId, on);
    return sendSuccess(res, { following: on });
}));

/* ── 응원글(2026-09-13 오너 제안 11번). 실존 인물에 대한 공개 글이라 커뮤니티 댓글과 같은 문지기를 전부 탄다. ── */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHEER_MAX = 200;
const CHEER_COOLDOWN_MS = 60_000;

// GET /umb/players/:category/:umbId/cheers — 최신 30개. 로그인했으면 내 글 표시·차단한 사람 글 제외.
router.get("/players/:category/:umbId/cheers", optionalAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    const category = parseCategory(req.params.category);
    if (!category) return sendError(res, 400, "err.umb.badCategory");
    if (!/^\d{1,6}$/.test(req.params.umbId)) return sendError(res, 404, "err.umb.playerNotFound");
    return sendSuccess(res, await storage.umb.listCheers(category, req.params.umbId, req.userId ?? null));
}));

// POST /umb/players/:category/:umbId/cheers { content } — 약관 동의·정지 문지기 → 욕설·내기 필터 → 연락처 마스킹 → 60초 쿨다운
router.post("/players/:category/:umbId/cheers", requireAuth, requireTermsAccepted, asyncHandler(async (req: AuthRequest, res: Response) => {
    const category = parseCategory(req.params.category);
    if (!category) return sendError(res, 400, "err.umb.badCategory");
    if (!/^\d{1,6}$/.test(req.params.umbId)) return sendError(res, 404, "err.umb.playerNotFound");
    const content = String(req.body?.content ?? "").trim();
    if (!content) return sendError(res, 400, "err.umb.cheerEmpty");
    if (content.length > CHEER_MAX) return sendError(res, 400, msg("err.umb.cheerTooLong", { max: CHEER_MAX }));
    const filter = checkContent(content);
    if (filter.blocked) return sendError(res, 400, filter.reason!);
    const last = await storage.umb.lastCheerAt(req.userId!, category, req.params.umbId);
    if (last && Date.now() - last.getTime() < CHEER_COOLDOWN_MS) return sendError(res, 429, "err.umb.cheerCooldown", "COOLDOWN");
    const row = await storage.umb.createCheer({ category, playerUmbId: req.params.umbId, authorId: req.userId!, content: maskContacts(content) });
    return sendSuccess(res, { id: row.id, content: row.content, createdAt: row.createdAt });
}));

// DELETE /umb/players/:category/:umbId/cheers/:id — 내 글만
router.delete("/players/:category/:umbId/cheers/:id", requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!UUID_RE.test(req.params.id)) return sendError(res, 404, "err.umb.cheerNotFound");
    const ok = await storage.umb.deleteCheer(req.params.id, req.userId!);
    if (!ok) return sendError(res, 404, "err.umb.cheerNotFound");
    return sendSuccess(res, { deleted: true });
}));

// GET /umb/movers?category= — 이번 주 순위 상승 톱
router.get("/movers", asyncHandler(async (req: any, res: Response) => {
    const category = parseCategory(req.query.category ?? "players");
    if (!category) return sendError(res, 400, "err.umb.badCategory");
    const movers = await storage.umb.getMovers(category);
    return sendSuccess(res, movers);
}));

// GET /umb/weekly-movers — 순위 변동 페이지(/world-ranking/movers, 2026-09-24). 최신 vs 직전 회차, 남자·여자.
// /movers(세계랭킹 화면의 무버 띠 5명)와 응답 모양이 달라 경로를 나눴다 — 그 띠를 깨지 않으려고.
router.get("/weekly-movers", asyncHandler(async (_req: any, res: Response) => {
    return sendSuccess(res, await storage.umb.getMoversReport());
}));

// GET /umb/country/:fed — 국가별 세계랭킹(/world-ranking/country/:fed, 2026-09-24). 코드 모양이 아니거나
// 어느 부문 최신 회차에도 선수가 없으면 404. 소문자 코드도 받는다(화면 주소는 대문자로 고친다).
router.get("/country/:fed", asyncHandler(async (req: any, res: Response) => {
    const fed = normalizeFed(req.params.fed);
    if (!fed) return sendError(res, 404, "err.umb.countryNotFound");
    const data = await storage.umb.getCountryReport(fed);
    if (!data) return sendError(res, 404, "err.umb.countryNotFound");
    return sendSuccess(res, data);
}));

// GET /umb/nations?category= — 국가별 집계 (당구 강국 랭킹)
router.get("/nations", asyncHandler(async (req: any, res: Response) => {
    const category = parseCategory(req.query.category ?? "players");
    if (!category) return sendError(res, 400, "err.umb.badCategory");
    const data = await storage.umb.getNations(category);
    return sendSuccess(res, data);
}));

// GET /umb/calendar?category= — 대회 일정 (레전드 파싱, D-day는 클라이언트 계산)
router.get("/calendar", asyncHandler(async (req: any, res: Response) => {
    const category = parseCategory(req.query.category ?? "players");
    if (!category) return sendError(res, 400, "err.umb.badCategory");
    const events = await storage.umb.getCalendar(category);
    return sendSuccess(res, events);
}));

// GET /umb/no1-history?category= — 역대 세계 1위 계보 (재임 구간·주수)
// GET /umb/briefing?date=YYYY-MM-DD — 당구 한 줄 (역사 속 오늘 / 1·2위 격차). 무날짜 = 오늘
router.get("/briefing", asyncHandler(async (req: any, res: Response) => {
    let date: string | undefined;
    if (typeof req.query.date === "string" && req.query.date) {
        const { todayKst } = await import("../../../shared/briefingMeta.js");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(req.query.date)) return sendError(res, 400, "err.umb.badDate");
        // 미래 판정은 KST 기준 — UTC 로 비교하면 한국 새벽에 '오늘'이 404 가 된다
        if (req.query.date > todayKst() || Number(req.query.date.slice(0, 4)) < 2024) {
            return sendError(res, 404, "err.umb.noBriefing");
        }
        date = req.query.date;
    }
    return sendSuccess(res, await storage.umb.getBriefing(date));
}));

router.get("/no1-history", asyncHandler(async (req: any, res: Response) => {
    const category = parseCategory(req.query.category ?? "players");
    if (!category) return sendError(res, 400, "err.umb.badCategory");
    const reigns = await storage.umb.getNo1History(category);
    return sendSuccess(res, reigns);
}));

// GET /umb/summary?category=&fed= — 홈 섹션 요약 (총 인원·1위 + 뷰어 국가의 선수 수·최고)
router.get("/summary", asyncHandler(async (req: any, res: Response) => {
    const category = parseCategory(req.query.category ?? "players");
    if (!category) return sendError(res, 400, "err.umb.badCategory");
    const fed = typeof req.query.fed === "string" && /^[A-Za-z]{2}$/.test(req.query.fed)
        ? req.query.fed.toUpperCase() : "KR";
    const summary = await storage.umb.getSummary(category, fed);
    return sendSuccess(res, summary);
}));

export default router;
