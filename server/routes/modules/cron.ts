import { Router } from "express";
import { runReminders } from "../../services/notificationScheduler.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { storage } from "../../storage/index.js";

const router = Router();

// Vercel Cron 전용 엔드포인트. 서버리스에는 상주 프로세스가 없어 node-cron이 돌지 않으므로
// vercel.json의 crons가 이 경로를 호출해 리마인더를 실행한다.
//
// 인증: Vercel Cron은 `Authorization: Bearer $CRON_SECRET` 헤더를 붙여 호출한다.
// CRON_SECRET이 설정돼 있으면 반드시 일치해야 하고, 미설정이면 외부 호출을 전부 거부한다
// (공개 엔드포인트로 방치되면 누구나 대량 푸시를 유발할 수 있다).
router.post("/reminders", asyncHandler(async (req: any, res: any) => {
    const secret = process.env.CRON_SECRET;
    if (!secret) return sendError(res, 503, "CRON_SECRET 미설정");
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${secret}`) return sendError(res, 401, "인증 실패");

    const result = await runReminders();
    return sendSuccess(res, result);
}));

// Vercel Cron은 GET으로 호출한다(문서 기준). 동일 핸들러를 재사용.
router.get("/reminders", asyncHandler(async (req: any, res: any) => {
    const secret = process.env.CRON_SECRET;
    if (!secret) return sendError(res, 503, "CRON_SECRET 미설정");
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${secret}`) return sendError(res, 401, "인증 실패");

    const result = await runReminders();
    return sendSuccess(res, result);
}));

// UMB 세계랭킹 일일 동기화 — 새 회차가 있으면 부문당 최대 2개 적재
async function handleUmbSync(req: any, res: any) {
    const secret = process.env.CRON_SECRET;
    if (!secret) return sendError(res, 503, "CRON_SECRET 미설정");
    if (req.headers.authorization !== `Bearer ${secret}`) return sendError(res, 401, "인증 실패");
    const { syncUmbRankings } = await import("../../services/umbSync.js");
    const result = await syncUmbRankings();
    // 새 회차가 들어온 부문만 — 관심 선수 순위 변동 알림(2026-09-13 오너 제안 7번). 적재가 없는 날은 조용하다.
    const { notifyFollowersOfNewEditions } = await import("../../services/playerFollowAlerts.js");
    const followAlerts = await notifyFollowersOfNewEditions(result.ingested.map((i) => i.category));
    // 동기화 직후에 "새 데이터가 들어왔나"를 확인하고, 밀려 있으면 운영자에게 알린다(하루 한 번).
    const { checkUmbHealth, alertIfUnhealthy } = await import("../../services/feedHealth.js");
    const issues = await checkUmbHealth();
    const alerted = await alertIfUnhealthy(issues);
    return sendSuccess(res, { ...result, followAlerts, health: issues, alerted });
}
router.get("/umb-sync", asyncHandler(handleUmbSync));
router.post("/umb-sync", asyncHandler(handleUmbSync));

// PBA 투어 일일 동기화 — 현재 시즌 랭킹 + 선수 상세 회전 갱신(60명/회)
async function handlePbaSync(req: any, res: any) {
    const secret = process.env.CRON_SECRET;
    if (!secret) return sendError(res, 503, "CRON_SECRET 미설정");
    if (req.headers.authorization !== `Bearer ${secret}`) return sendError(res, 401, "인증 실패");
    const { syncPba } = await import("../../services/pbaSync.js");
    const result = await syncPba();
    const { checkPbaHealth, alertIfUnhealthy } = await import("../../services/feedHealth.js");
    const issues = await checkPbaHealth();
    const alerted = await alertIfUnhealthy(issues);
    return sendSuccess(res, { ...result, health: issues, alerted });
}
router.get("/pba-sync", asyncHandler(handlePbaSync));
router.post("/pba-sync", asyncHandler(handlePbaSync));

// PBA 대회 일일 동기화(2026-09-24, /tournaments) — 현재 + 다음 시즌 일정·투어 목록(우승자)을 pba_tournaments 에 쓴다.
// 요청 4번(시즌당 일정 1 + 투어 목록 1). 지난 시즌 전체는 server/scripts/backfill-pba-tournaments.ts 로 한 번 채운다.
// pba-sync(21:30)가 pbatour.org 를 먼저 두드리고 끝난 뒤인 21:45 에 돈다(vercel.json).
async function handlePbaTournaments(req: any, res: any) {
    const secret = process.env.CRON_SECRET;
    if (!secret) return sendError(res, 503, "CRON_SECRET 미설정");
    if (req.headers.authorization !== `Bearer ${secret}`) return sendError(res, 401, "인증 실패");
    const { runPbaTournamentsCron } = await import("../../services/pbaTournaments.js");
    return sendSuccess(res, await runPbaTournamentsCron());
}
router.get("/pba-tournaments", asyncHandler(handlePbaTournaments));
router.post("/pba-tournaments", asyncHandler(handlePbaTournaments));

// 골프 랭킹 동기화(2026-09-13) — 투어별로 따로 부른다(?tour=owgr|rolex|kpga|klpga). 한 번에 넷을 돌리면
// KPGA 40여 개·KLPGA 20여 개 요청이 서버리스 시간 제한에 걸린다. tour 가 없으면 넷 다(수동용).
async function handleGolfSync(req: any, res: any) {
    const secret = process.env.CRON_SECRET;
    if (!secret) return sendError(res, 503, "CRON_SECRET 미설정");
    if (req.headers.authorization !== `Bearer ${secret}`) return sendError(res, 401, "인증 실패");
    const { GOLF_TOURS, isGolfTour } = await import("../../../shared/golfTours.js");
    const t = typeof req.query.tour === "string" ? req.query.tour : "";
    const tours = t ? (isGolfTour(t) ? [t] : null) : [...GOLF_TOURS];
    if (!tours) return sendError(res, 400, "잘못된 투어");
    const { syncGolfTours } = await import("../../services/golf/golfSync.js");
    const results = await syncGolfTours(tours);
    // 새 회차가 생긴 투어만 관심 선수 알림
    const { notifyGolfFollowers } = await import("../../services/playerFollowAlerts.js");
    const followAlerts = await notifyGolfFollowers(results.filter((r) => r.newEdition).map((r) => r.tour));
    return sendSuccess(res, { results, followAlerts });
}
router.get("/golf-sync", asyncHandler(handleGolfSync));
router.post("/golf-sync", asyncHandler(handleGolfSync));

// 골프 외부 적재(2026-09-14): rolexrankings.com 이 Vercel IP 를 403 으로 막아, GitHub 러너(.github/workflows/golf-rolex-sync.yml)가
// 받은 JSON 을 그대로 보내면 여기서 같은 규칙으로 적재한다. 인증은 크론과 같은 CRON_SECRET.
router.post("/golf-ingest", asyncHandler(async (req: any, res: any) => {
    const secret = process.env.CRON_SECRET;
    if (!secret) return sendError(res, 503, "CRON_SECRET 미설정");
    if (req.headers.authorization !== `Bearer ${secret}`) return sendError(res, 401, "인증 실패");
    if (req.query.tour !== "rolex") return sendError(res, 400, "지원하지 않는 투어");
    if (!req.body || typeof req.body !== "object") return sendError(res, 400, "본문이 JSON 이 아닙니다");
    const { rolexSnapshotFromJson } = await import("../../services/golf/sources.js");
    const { ingestSnapshot } = await import("../../services/golf/golfSync.js");
    const result = await ingestSnapshot(await rolexSnapshotFromJson(req.body));
    const { notifyGolfFollowers } = await import("../../services/playerFollowAlerts.js");
    const followAlerts = await notifyGolfFollowers(result.newEdition ? [result.tour] : []);
    return sendSuccess(res, { result, followAlerts });
}));

// 골프 회원권 시세 매일 동기화(2026-09-24) — TGM 이 20시 KST 에 시세를 갱신·재배포한 뒤 그 피드
// (env TGM_FEED_URL, 키 TGM_FEED_KEY)를 받아 golf_membership_prices·이력에 쓴다. 피드가 죽었거나 종목이 너무 적으면
// **아무것도 쓰지 않고** 실패로 답한다(반쯤 빈 피드로 덮어쓰면 골프장 페이지의 시세가 사라진다). ?dry=1 이면 쓰지 않고 결과만.
async function handleGolfPrices(req: any, res: any) {
    const secret = process.env.CRON_SECRET;
    if (!secret) return sendError(res, 503, "CRON_SECRET 미설정");
    if (req.headers.authorization !== `Bearer ${secret}`) return sendError(res, 401, "인증 실패");
    const { syncMembershipPrices } = await import("../../services/golfPriceSync.js");
    const result = await syncMembershipPrices({ dryRun: req.query.dry === "1" });
    if (!result.ok) {
        console.error("[GolfPriceSync]", result.reason);
        return sendError(res, 502, result.reason, "GOLF_PRICE_FEED");
    }
    return sendSuccess(res, result);
}
router.get("/golf-prices", asyncHandler(handleGolfPrices));
router.post("/golf-prices", asyncHandler(handleGolfPrices));

/** 알림함 보존 기간(오너 결정 2026-09-23). 읽은 것도 안 읽은 것도 이 날짜가 지나면 지운다. */
const NOTIFICATION_KEEP_DAYS = 7;

// 매일 도는 정리 크론. 이름은 sim-cleanup 이지만 "하루 한 번 치우는 것들"을 같이 태운다 —
// Vercel 요금제가 크론 개수를 세기 때문에 정리마다 항목을 새로 만들지 않는다(vercel.json 참고).
//  · 시뮬레이터: 방치된 playing 세션(6시간) → abandoned, 상대가 안 들어온 waiting 대전(24시간) → canceled.
//    실전 경기·성적과 무관한 시뮬 테이블만 건드린다.
//  · 알림함: 7일 지난 알림 삭제. **안 읽은 것도 지운다**(오너 결정 2026-09-23) — 안 읽은 걸 남기면
//    546건 중 388건이 안 읽음인 계정은 알림함이 영원히 줄지 않는다.
async function handleSimCleanup(req: any, res: any) {
    const secret = process.env.CRON_SECRET;
    if (!secret) return sendError(res, 503, "CRON_SECRET 미설정");
    if (req.headers.authorization !== `Bearer ${secret}`) return sendError(res, 401, "unauthorized");
    const sessions = await storage.sim.cleanupStale(6);
    const matches = await storage.simMatch.cleanupStaleWaiting(24);
    // 몇 건이 걷혔는지 응답에 싣는다 — 크론 결과 화면만 보고도 청소가 도는지 알 수 있어야 한다.
    const notifications = await storage.notifs.deleteOlderThan(NOTIFICATION_KEEP_DAYS);
    return sendSuccess(res, { sessions, matches, notifications });
}
router.get("/sim-cleanup", asyncHandler(handleSimCleanup));
router.post("/sim-cleanup", asyncHandler(handleSimCleanup));

export default router;
