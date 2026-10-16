import { Router } from "express";
import { runReminders } from "../../services/notificationScheduler.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { storage } from "../../storage/index.js";
import { sql } from "drizzle-orm";
import { db } from "../../db.js";
import { TRAIL_KEEP_DAYS } from "../../../shared/uiTrail.js";

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
    return sendSuccess(res, { ...result, golfEve: await golfEveQuietly(), hikingEve: await hikingEveQuietly(), cup: await cupQuietly() });
}));

// Vercel Cron은 GET으로 호출한다(문서 기준). 동일 핸들러를 재사용.
router.get("/reminders", asyncHandler(async (req: any, res: any) => {
    const secret = process.env.CRON_SECRET;
    if (!secret) return sendError(res, 503, "CRON_SECRET 미설정");
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${secret}`) return sendError(res, 401, "인증 실패");

    const result = await runReminders();
    return sendSuccess(res, { ...result, golfEve: await golfEveQuietly(), hikingEve: await hikingEveQuietly(), cup: await cupQuietly() });
}));

// 라운드 전날 저녁 브리핑(2026-10-05) — 매시 도는 리마인더에 얹는다(크론 항목을 늘리지 않는다: Vercel 요금제가 개수를 센다).
// 한국 시각 19~20시대에만 일하고 나머지 시간엔 아무것도 읽지 않는다. 여기서 터져도 크루 리마인더의 응답은 깨지 않는다.
// 월대회 굴리기(2026-10-12) — 기한이 지난 판의 기권을 가리고, 기한 하루 전인 판을 알린다. 매시 도는 리마인더에 얹는다(크론 항목을 늘리지 않는다).
// 치르는 중인 대회가 없으면 표 하나를 읽고 끝난다. 여기서 터져도 리마인더의 응답은 깨지 않는다.
async function cupQuietly(): Promise<unknown> {
    const { recordCronRun, errorText } = await import("../../storage/cronRuns.js");
    try {
        const { rollCups, remindDue } = await import("../../services/simCupService.js");
        const rolled = await rollCups(Date.now());
        const out = { ...rolled, reminded: await remindDue(Date.now()) };
        // 치르는 중인 대회가 있을 때만 적는다(실행 기록 — 어드민 현황)
        if (out.cups > 0 || out.reminded > 0) await recordCronRun("cup_roll", true, out);
        return out;
    } catch (e) {
        console.error("[CupRoll]", e);
        await recordCronRun("cup_roll", false, { error: errorText(e) });
        return { error: true };
    }
}

// 산행 전날 저녁 브리핑(2026-10-13) — 내일 산악회 산행에 가는 사람에게(services/hikingEve). 골프의 것과 같은 시간대, 같은 크론에 얹는다.
// 보낼 시간(due)에 돈 것과 실패만 hiq_cron_runs 에 적는다 — 어드민 › 등산 › 현황이 '어젯밤 브리핑이 나갔나'를 본다
async function hikingEveQuietly(): Promise<unknown> {
    const { recordCronRun, errorText } = await import("../../storage/cronRuns.js");
    try {
        const { runHikingEve } = await import("../../services/hikingEve.js");
        const out = await runHikingEve();
        if (out.due) await recordCronRun("hiking_eve", out.failed === 0, out);
        return out;
    } catch (e) {
        console.error("[HikingEve]", e);
        await recordCronRun("hiking_eve", false, { error: errorText(e) });
        return { error: true };
    }
}
// 점검용 — ?dry=1 은 보내지 않고 무엇이 갈지 세기만(시간 밖에서도 본다). vercel.json 크론에는 없다.
async function handleHikingEve(req: any, res: any) {
    const secret = process.env.CRON_SECRET;
    if (!secret) return sendError(res, 503, "CRON_SECRET 미설정");
    if (req.headers.authorization !== `Bearer ${secret}`) return sendError(res, 401, "인증 실패");
    const { runHikingEve } = await import("../../services/hikingEve.js");
    const dry = req.query.dry === "1";
    return sendSuccess(res, await runHikingEve(Date.now(), { dry, force: dry }));
}

async function golfEveQuietly(): Promise<unknown> {
    const { recordCronRun, errorText } = await import("../../storage/cronRuns.js");
    try {
        const { runGolfRoundEve } = await import("../../services/golfRoundEve.js");
        const out = await runGolfRoundEve();
        if (out.due) await recordCronRun("golf_eve", out.failed === 0, out);
        return out;
    } catch (e) {
        console.error("[GolfRoundEve]", e);
        await recordCronRun("golf_eve", false, { error: errorText(e) });
        return { error: true };
    }
}
// 점검용 — 지금 돌리면 누구에게 무엇이 갈지(?dry=1 은 보내지 않고 세기만, 시간 밖에서도 본다). vercel.json 크론에는 없다.
// ?dry 없이 부르면 실제 실행과 같다(보낼 시간이 아니면 아무 일도 하지 않는다).
async function handleGolfRoundEve(req: any, res: any) {
    const secret = process.env.CRON_SECRET;
    if (!secret) return sendError(res, 503, "CRON_SECRET 미설정");
    if (req.headers.authorization !== `Bearer ${secret}`) return sendError(res, 401, "인증 실패");
    const { runGolfRoundEve } = await import("../../services/golfRoundEve.js");
    const dry = req.query.dry === "1";
    return sendSuccess(res, await runGolfRoundEve(Date.now(), { dry, force: dry }));
}
router.get("/golf-round-eve", asyncHandler(handleGolfRoundEve));
router.post("/golf-round-eve", asyncHandler(handleGolfRoundEve));
router.get("/hiking-eve", asyncHandler(handleHikingEve));
router.post("/hiking-eve", asyncHandler(handleHikingEve));

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
    // 밀림 알림에 **왜** 안 들어갔는지를 붙인다(2026-09-30). 예전엔 "밀림"만 와서, pdfjs 워커가 빠진 채 두 달을 몰랐다 —
    // 적재 오류는 이 응답 JSON 에만 있었고 크론 응답은 아무도 안 본다. 부문마다 첫 오류 한 줄만.
    const firstError = new Map<string, string>();
    for (const e of result.errors) if (!firstError.has(e.category)) firstError.set(e.category, e.error);
    const withCause = issues.map((i) => (i.kind === "stale" && firstError.has(i.scope)
        ? { ...i, detail: `${i.detail} · 원인: ${firstError.get(i.scope)!.slice(0, 90)}` }
        : i));
    const alerted = await alertIfUnhealthy(withCause);
    return sendSuccess(res, { ...result, followAlerts, health: withCause, alerted });
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
    // 골프 랭킹 수집 상태 점검(2026-10-01 오너 "응 다 고치고") — 수집이 멈췄거나 세계 투어 회차가 늦으면 운영자에게 하루 한 번.
    // KPGA·KLPGA 의 '늦음'은 대회 없는 주가 있어 알리지 않고 어드민 골프 현황에만 띄운다(feedHealth.checkGolfHealth).
    let golfHealth: unknown = null;
    try {
        const { checkGolfHealth, alertIfUnhealthy, GOLF_ALERT_TITLE, GOLF_ALERT_URL } = await import("../../services/feedHealth.js");
        const health = await checkGolfHealth();
        const alerted = await alertIfUnhealthy(health, { title: GOLF_ALERT_TITLE, url: GOLF_ALERT_URL });
        golfHealth = { issues: health, alerted };
    } catch (e) {
        console.error("[cron] golf health", e);
    }
    return sendSuccess(res, { results, followAlerts, golfHealth });
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

// 골프장 날씨 데우기(2026-10-05) — 20분마다. 기상청 단기예보 한 번이 1초 남짓이라 격자 393개를 한 번에 못 돈다:
// 가장 낡은 격자부터 조금씩 새로 받고, 나머지는 다음 차례에 이어서 돈다. 사람이 여는 골프장은
// 상세 API 가 그 자리에서 새로 받으므로(services/golfWeather.getCourseWeather) 이 크론은 검색엔진용 화면을 위한 것이다.
// 시간: 서버리스 시간 제한을 10초로 보고 넉넉히 그 안에 끝낸다. 식은 인스턴스는 이 함수가 불리기 전 준비에만 2초쯤 들고
// (운영 실측: 할 일이 없을 때도 3초), 그건 여기서 잴 수 없다 — 그래서 '7초 - 여기서 쓴 시간 - 마지막 호출이 끝날 여유 2.5초'만 쓴다. 한 번에 20격자 남짓.
async function handleGolfWeather(req: any, res: any) {
    const t0 = Date.now();
    const secret = process.env.CRON_SECRET;
    if (!secret) return sendError(res, 503, "CRON_SECRET 미설정");
    if (req.headers.authorization !== `Bearer ${secret}`) return sendError(res, 401, "인증 실패");
    const { loadGolfCourseSummary } = await import("./golfCourses.js");
    const { warmWeather } = await import("../../services/golfWeather.js");
    const s = await loadGolfCourseSummary();
    const manual = Number(req.query.budget); // 손으로 부를 때만(?budget=) — 로컬·점검용
    const budget = manual > 0 ? Math.min(20_000, manual) : Math.max(1000, 7000 - (Date.now() - t0) - 2500);
    const result = await warmWeather(s.pages, { budgetMs: budget });
    return sendSuccess(res, { ...result, budgetMs: budget, tookMs: Date.now() - t0 });
}
router.get("/golf-weather", asyncHandler(handleGolfWeather));
router.post("/golf-weather", asyncHandler(handleGolfWeather));

// 골프장 공식 사이트의 남은 티(2026-10-13) — 20분마다. 볼 때가 된 날(가까운 날 4시간 · 먼 날 8시간)만 시간 예산만큼 받고 나머지는 다음 차례에.
// 밤(23 ~ 06시)에는 쉰다. 받는 곳 · 규칙은 shared/golfOpenTee, 끄려면 GOLF_OPEN_TEES=false. 시간 예산은 날씨 크론과 같은 셈(서버리스 10초).
// 손으로 부를 때: ?only=<slug>(한 곳만) · ?force=1(때가 안 됐어도 · 밤에도) · ?budget=<ms>
async function handleGolfOpenTees(req: any, res: any) {
    const t0 = Date.now();
    const secret = process.env.CRON_SECRET;
    if (!secret) return sendError(res, 503, "CRON_SECRET 미설정");
    if (req.headers.authorization !== `Bearer ${secret}`) return sendError(res, 401, "인증 실패");
    const { collectOpenTees } = await import("../../services/golfOpenTees.js");
    const manual = Number(req.query.budget);
    const budget = manual > 0 ? Math.min(20_000, manual) : Math.max(1000, 7000 - (Date.now() - t0) - 2500);
    const result = await collectOpenTees({ budgetMs: budget, force: req.query.force === "1", only: req.query.only ? String(req.query.only).normalize("NFC") : undefined });
    return sendSuccess(res, { ...result, budgetMs: budget, tookMs: Date.now() - t0 });
}
router.get("/golf-open-tees", asyncHandler(handleGolfOpenTees));
router.post("/golf-open-tees", asyncHandler(handleGolfOpenTees));

/** 알림함 보존 기간(오너 결정 2026-09-23). 읽은 것도 안 읽은 것도 이 날짜가 지나면 지운다. */
const NOTIFICATION_KEEP_DAYS = 7;

// 매일 도는 정리 크론. 이름은 sim-cleanup 이지만 "하루 한 번 치우는 것들"을 같이 태운다 —
// Vercel 요금제가 크론 개수를 세기 때문에 정리마다 항목을 새로 만들지 않는다(vercel.json 참고).
//  · 시뮬레이터: 방치된 playing 세션(6시간) → abandoned, 상대가 안 들어온 waiting 대전(24시간) → canceled,
//    둘 다 떠난 playing 대전(7일) → canceled(stale, 레이팅 무관).
//    실전 경기·성적과 무관한 시뮬 테이블만 건드린다.
//  · 방문자 발자국: 60일 지난 줄 삭제(2026-10-08).
//  · 장식장: 끝난 달 마감(2026-10-12) — 이달의 랭킹 메달 · 그 달의 등급 배지를 한 번 준다.
//  · 월대회: 달 마감 뒤 대회 열기(2026-10-12) — 굴리기(기한 · 기권)는 매시 도는 /reminders 에 얹었다.
//  · 알림함: 7일 지난 알림 삭제. **안 읽은 것도 지운다**(오너 결정 2026-09-23) — 안 읽은 걸 남기면
//    546건 중 388건이 안 읽음인 계정은 알림함이 영원히 줄지 않는다.
async function handleSimCleanup(req: any, res: any) {
    const secret = process.env.CRON_SECRET;
    if (!secret) return sendError(res, 503, "CRON_SECRET 미설정");
    if (req.headers.authorization !== `Bearer ${secret}`) return sendError(res, 401, "unauthorized");
    const sessions = await storage.sim.cleanupStale(6);
    const matches = await storage.simMatch.cleanupStaleWaiting(24);
    const stalePlaying = await storage.simMatch.cleanupStalePlaying(7);
    // 몇 건이 걷혔는지 응답에 싣는다 — 크론 결과 화면만 보고도 청소가 도는지 알 수 있어야 한다.
    const notifications = await storage.notifs.deleteOlderThan(NOTIFICATION_KEEP_DAYS);
    // 방문자 발자국(2026-10-08) — 60일 지난 줄을 지운다(shared/uiTrail TRAIL_KEEP_DAYS). 표가 없거나 실패해도 다른 청소 결과는 그대로 보낸다
    const trail = await db.execute(sql`delete from ui_events where created_at < now() - make_interval(days => ${TRAIL_KEEP_DAYS})`)
        .then((r: any) => Number(r?.rowCount ?? 0)).catch((e: unknown) => { console.error("[trail purge]", e); return -1; });
    // 장식장(2026-10-12) — 끝난 달을 마감해 그 달의 메달 · 등급 배지를 준다(shared/simShelf). 달마다 한 번뿐이고, 밀린 달이 있으면 같이 마감한다.
    // 매일 03:15(한국 시각)에 도니 1일 새벽에 지난달이 마감된다. 실패해도 다른 청소 결과는 그대로 보낸다 — 다음 날 다시 마감한다.
    const shelf = await storage.simShelf.closeMonths(Date.now())
        .then((r) => r.closed).catch((e: unknown) => { console.error("[shelf close]", e); return null; });
    // 월대회(2026-10-12) — 달이 마감됐으면 그 달의 성적으로 대회를 열고 출전자에게 알린다(shared/simCup). 종목마다 달에 한 번뿐이다.
    // 마감 바로 뒤에 둔다 — 메달 · 배지와 같은 자료로 출전자를 정한다. 실패해도 다른 결과는 그대로 보낸다(다음 날 다시 연다).
    const cups = await import("../../services/simCupService.js").then((m) => m.openAndAnnounce(Date.now()))
        .catch((e: unknown) => { console.error("[cup open]", e); return null; });
    return sendSuccess(res, { sessions, matches, stalePlaying, notifications, trail, shelf, cups });
}
router.get("/sim-cleanup", asyncHandler(handleSimCleanup));
router.post("/sim-cleanup", asyncHandler(handleSimCleanup));

export default router;
