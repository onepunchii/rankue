import { Router } from "express";
import { Response, NextFunction } from "express";
import { storage } from "../../storage/index.js";
import { requireAuth, AuthRequest } from "../../middleware/auth.js";
import { requireTermsAccepted } from "../../middleware/terms.js";
import { checkContent, maskContacts } from "../../utils/contentFilter.js";
import { msg } from "../../lib/i18n.js";
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
    if (!league) return sendError(res, 400, "err.pba.badLeague");
    const season = Number(req.query.season) || await storage.pba.getDisplaySeason(league, currentPbaSeason());
    if (!Number.isInteger(season) || season < 2019 || season > 2100) return sendError(res, 400, "err.pba.badSeason");
    const by = req.query.by === "point" ? "point" as const : "prize" as const;
    const limit = Math.max(1, Math.min(Math.trunc(Number(req.query.limit)) || 150, 200));
    const rows = await storage.pba.getRankings(league, season, by, limit);
    return sendSuccess(res, { league, season, by, rows });
}));

// GET /pba/records — PBA·LPBA 통산 기록 순위(에버리지·하이런·뱅크샷·승률·상금 톱 20).
// 프리렌더(server/seo/pbaRecords.ts)와 같은 저장소 함수 — 봇과 사람이 같은 순위를 본다.
router.get("/records", asyncHandler(async (_req: any, res: Response) => {
    return sendSuccess(res, await storage.pba.getRecords());
}));

// GET /pba/player/:memCode — 프로필 + 시즌 히스토리 + extra(우승·기록 순위·리그 평균·비슷한 순위·팔로워·UMB 순위·갱신일).
// 공개·CDN 캐시 응답이라 보는 사람마다 다른 값(내 팔로우)은 싣지 않는다 — 그건 아래 /players/pba/:memCode/follow.
router.get("/player/:memCode", asyncHandler(async (req: any, res: Response) => {
    if (!MEM_CODE_RE.test(req.params.memCode)) return sendError(res, 404, "err.umb.playerNotFound");
    const player = await storage.pba.getPlayerProfile(req.params.memCode);
    if (!player) return sendError(res, 404, "err.umb.playerNotFound");
    return sendSuccess(res, player);
}));

/* ── 팔로우·응원글(2026-09-27) — UMB·골프 선수와 같은 표(hiq_player_follows·hiq_player_cheers, category=pba, player_umb_id=memCode).
   보는 사람마다 다른 응답이라 캐시하지 않는다(위 router.use 의 공개 캐시를 덮어쓴다). 경로의 "pba" 는 화면 PlayerCheers 가
   `${basePath}/${category}/${id}/cheers` 로 부르기 때문이다. ── */
const PBA_CAT = "pba" as const;
const noCache = (_req: any, res: Response, next: NextFunction) => {
    res.set("Cache-Control", "private, no-store");
    res.set("CDN-Cache-Control", "no-store");
    next();
};
// 로그인은 선택 — 서명 쿠키만 믿는다(golfRank·umb 와 같다)
const optionalAuth = (req: AuthRequest, _res: Response, next: NextFunction) => {
    const userId = (req as any).signedCookies?.hiq_user_id;
    if (typeof userId === "string" && userId) req.userId = userId;
    next();
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHEER_MAX = 200;
const CHEER_COOLDOWN_MS = 60_000;

// GET /pba/players/pba/:memCode/follow — { following, followers }
router.get("/players/pba/:memCode/follow", noCache, optionalAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!MEM_CODE_RE.test(req.params.memCode)) return sendError(res, 404, "err.umb.playerNotFound");
    const following = req.userId ? await storage.umb.isFollowing(req.userId, PBA_CAT, req.params.memCode) : false;
    const followers = await storage.pba.followerCount(req.params.memCode);
    return sendSuccess(res, { following, followers });
}));

// PUT /pba/players/pba/:memCode/follow { on }
router.put("/players/pba/:memCode/follow", noCache, requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!MEM_CODE_RE.test(req.params.memCode)) return sendError(res, 404, "err.umb.playerNotFound");
    if (!(await storage.pba.exists(req.params.memCode))) return sendError(res, 404, "err.umb.playerNotFound");
    const on = req.body?.on === true;
    await storage.umb.setFollowing(req.userId!, PBA_CAT, req.params.memCode, on);
    return sendSuccess(res, { following: on, followers: await storage.pba.followerCount(req.params.memCode) });
}));

// 응원글 — UMB·골프와 같은 문지기(약관·정지 → 욕설·내기 필터 → 연락처 마스킹 → 60초 쿨다운)
router.get("/players/pba/:memCode/cheers", noCache, optionalAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!MEM_CODE_RE.test(req.params.memCode)) return sendError(res, 404, "err.umb.playerNotFound");
    return sendSuccess(res, await storage.umb.listCheers(PBA_CAT, req.params.memCode, req.userId ?? null));
}));

router.post("/players/pba/:memCode/cheers", noCache, requireAuth, requireTermsAccepted, asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!MEM_CODE_RE.test(req.params.memCode)) return sendError(res, 404, "err.umb.playerNotFound");
    if (!(await storage.pba.exists(req.params.memCode))) return sendError(res, 404, "err.umb.playerNotFound");
    const content = String(req.body?.content ?? "").trim();
    if (!content) return sendError(res, 400, "err.umb.cheerEmpty");
    if (content.length > CHEER_MAX) return sendError(res, 400, msg("err.umb.cheerTooLong", { max: CHEER_MAX }));
    const filter = checkContent(content);
    if (filter.blocked) return sendError(res, 400, filter.reason!);
    const last = await storage.umb.lastCheerAt(req.userId!, PBA_CAT, req.params.memCode);
    if (last && Date.now() - last.getTime() < CHEER_COOLDOWN_MS) return sendError(res, 429, "err.umb.cheerCooldown", "COOLDOWN");
    const row = await storage.umb.createCheer({ category: PBA_CAT, playerUmbId: req.params.memCode, authorId: req.userId!, content: maskContacts(content) });
    return sendSuccess(res, { id: row.id, content: row.content, createdAt: row.createdAt });
}));

router.delete("/players/pba/:memCode/cheers/:cheerId", noCache, requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!UUID_RE.test(req.params.cheerId)) return sendError(res, 404, "err.umb.cheerNotFound");
    const ok = await storage.umb.deleteCheer(req.params.cheerId, req.userId!);
    if (!ok) return sendError(res, 404, "err.umb.cheerNotFound");
    return sendSuccess(res, { deleted: true });
}));

// GET /pba/schedule — 다가오는 대회 (라이브 프록시 + CDN 캐시, DB 저장 없음).
// 프로세스 캐시 1시간 — pbatour 장애 시 캐시분으로 버티고, 완전 실패면 빈 배열.
let scheduleCache: { at: number; data: any[] } | null = null;
router.get("/schedule", asyncHandler(async (_req: any, res: Response) => {
    if (!scheduleCache || Date.now() - scheduleCache.at > 60 * 60 * 1000) {
        try {
            const { fetchSchedule } = await import("../../services/pbaService.js");
            const season = currentPbaSeason();
            // 시즌 경계에서 다음 시즌 일정이 먼저 올라오는 경우까지 커버
            const events = [...await fetchSchedule(season), ...await fetchSchedule(season + 1).catch(() => [])];
            scheduleCache = { at: Date.now(), data: events };
        } catch (e) {
            console.warn("[pba] schedule 수집 실패:", (e as Error)?.message);
            if (!scheduleCache) scheduleCache = { at: Date.now(), data: [] };
        }
    }
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = scheduleCache.data
        .filter((e: any) => e.endDate >= today)
        .sort((a: any, b: any) => a.startDate.localeCompare(b.startDate))
        .slice(0, 8);
    return sendSuccess(res, { upcoming });
}));

// GET /pba/benchmark — 리그별 통산 에버리지 분포 (유저 "프로와 나" 비교 카드용)
router.get("/benchmark", asyncHandler(async (_req: any, res: Response) => {
    const { db } = await import("../../db.js");
    const { pbaPlayers } = await import("../../../shared/schema.js");
    const { and, eq, isNotNull, sql, desc } = await import("drizzle-orm");
    const bench: Record<string, any> = {};
    for (const league of LEAGUES) {
        const [agg] = await db.select({
            avg: sql<number>`round(avg(average)::numeric, 3)::float8`,
            top: sql<number>`max(average)::float8`,
        }).from(pbaPlayers).where(and(eq(pbaPlayers.league, league), isNotNull(pbaPlayers.average)));
        const [topPlayer] = await db.select({ nameKo: pbaPlayers.nameKo, memCode: pbaPlayers.memCode, average: pbaPlayers.average })
            .from(pbaPlayers).where(and(eq(pbaPlayers.league, league), isNotNull(pbaPlayers.average)))
            .orderBy(desc(pbaPlayers.average)).limit(1);
        bench[league] = { avg: agg?.avg ?? null, top: topPlayer ?? null };
    }
    return sendSuccess(res, bench);
}));

// GET /pba/summary?league= — 표시 시즌 1위 요약 (홈 카드용)
router.get("/summary", asyncHandler(async (req: any, res: Response) => {
    const league = parseLeague(req.query.league ?? "PBA");
    if (!league) return sendError(res, 400, "err.pba.badLeague");
    const season = await storage.pba.getDisplaySeason(league, currentPbaSeason());
    return sendSuccess(res, await storage.pba.getSummary(league, season));
}));

export default router;
