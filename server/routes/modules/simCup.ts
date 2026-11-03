/**
 * 월대회 주소(2026-10-12 오너 "추천대로" · 2026-11-03 운영자가 여는 대회로). 규칙은 shared/simCup, 읽고 쓰는 것은 storage/simCup.repo, 굴림과 알림은 services/simCupService.
 *
 *  GET  /sim/cup?gameType=3c           대진 화면 — 가장 최근에 연 대회(대진 · 출전자 · 내 판)와 이번 달 '지금 이대로면' 추천. 열 때 대진을 한 번 굴린다.
 *  POST /sim/cup/games/:id/ready       입장 · 대기실에 있음 — 경기 10분 전부터 15분 뒤까지. 화면은 대기실에 있는 동안 5초마다 다시 보낸다.
 *                                      상대도 지금 대기실에 있으면 서버가 판을 만들고 바로 시작한다(startCupMatch) — 한 사람만 있는 채로 시작되지 않는다.
 *
 * 대회 판은 두 사람이 앉은 채로 시작된 공개 방이라 관전할 수 있고, 다른 사람은 들어오지 못한다(simMatch joinAndStart 의 가드도 그대로).
 * 대기실에 있는 동안 다른 판은 못 친다 — 진행 중인 판이 있으면 '기권하고 입장할까요?'를 묻는다(HAS_PLAYING → forfeitPlaying).
 */
import { Router } from "express";
import { storage } from "../../storage/index.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { requireAuth, AuthRequest } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { PLACEMENT_MATCHES } from "../../../shared/sim/rank.js";
import { CUP_GAMES, cupPresent, cupWindow } from "../../../shared/simCup.js";
import { notifyEntered, rollCups } from "../../services/simCupService.js";
import { forfeitPlaying, playingGate, startCupMatch } from "./simMatch.js";

const router = Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get("/sim/cup", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    // 대회를 여는 종목만(3쿠션) — 다른 종목을 물어도 3쿠션으로 답한다
    const want = req.query.gameType === "4c" ? "4c" as const : "3c" as const;
    const gameType = CUP_GAMES.includes(want) ? want : CUP_GAMES[0];
    // 화면을 열 때 대진을 굴린다 — 끝난 판의 승자 · 입장 시간이 지난 판이 바로 반영되게. 실패해도 지금 적힌 대로 보여 준다.
    await rollCups(Date.now()).catch((e: unknown) => console.error("[cup roll]", e));
    return sendSuccess(res, await storage.simCup.view(req.userId!, gameType, Date.now(), PLACEMENT_MATCHES));
}));

router.post("/sim/cup/games/:id/ready", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!UUID.test(String(req.params.id))) return sendError(res, 404, "err.sim.cupGameNotFound");
    const now = Date.now();
    await rollCups(now).catch((e: unknown) => console.error("[cup roll]", e));
    const found = await storage.simCup.game(req.params.id);
    if (!found) return sendError(res, 404, "err.sim.cupGameNotFound");
    const { cup, game } = found;
    const me = req.userId!;
    const side = game.p1Id === me ? "p1" as const : game.p2Id === me ? "p2" as const : null;
    // 남의 판은 '없는 판'으로 답한다 — 대진 칸 id 로 누가 치는지 알아내는 길이 되지 않게
    if (!side) return sendError(res, 404, "err.sim.cupGameNotFound");
    if (cup.status !== "running" || game.outcome) return sendError(res, 409, "err.sim.cupGameClosed", "CUP_CLOSED");
    const opponentId = side === "p1" ? game.p2Id : game.p1Id;
    if (!opponentId) return sendError(res, 409, "err.sim.cupNoOpponent", "CUP_NO_OPPONENT");

    // 이미 시작된 판 — 그 판으로(입장 시간과 상관없이 이어 친다)
    const info = game.matchId ? (await storage.simMatch.cupMatchInfo([game.matchId])).get(game.matchId) ?? null : null;
    if (info?.status === "playing" || info?.status === "finished") return sendSuccess(res, { matchId: game.matchId, state: "playing" });

    const window = cupWindow(game.scheduledMs, now);
    if (window === "unscheduled") return sendError(res, 409, "err.sim.cupUnscheduled", "CUP_UNSCHEDULED");
    if (window === "early") return sendError(res, 409, "err.sim.cupEarly", "CUP_EARLY");
    if (window === "closed") return sendError(res, 409, "err.sim.cupGameClosed", "CUP_CLOSED");

    // 진행 중인 다른 판이 있으면 묻는다 — 대회 판이 시작되면 그쪽은 시계가 돌아 지게 된다
    const playing = await playingGate(me, req.body?.forfeitPlaying === true);
    if (playing === "ask") return sendError(res, 409, "err.sim.hasPlaying", "HAS_PLAYING");

    const checked = await storage.simCup.checkIn(game.id, side, now);
    if (!checked) return sendError(res, 409, "err.sim.cupGameClosed", "CUP_CLOSED");
    if (playing.length) await forfeitPlaying(me, playing, "");
    const g = checked.game;
    // 처음 들어왔고 상대가 아직 없다 — 상대에게 '들어왔어요'(한 번)
    if (checked.firstTime && !cupPresent(side === "p1" ? g.p2SeenMs : g.p1SeenMs, now)) {
        const meRow = await storage.getMemberById(me).catch(() => null);
        await notifyEntered(opponentId, String(meRow?.name ?? "")).catch(() => undefined);
    }
    // 상대도 지금 대기실에 있다 — 판을 연다(이미 열렸으면 그 판)
    if (cupPresent(side === "p1" ? g.p2SeenMs : g.p1SeenMs, now) && g.p1Id && g.p2Id) {
        const matchId = await startCupMatch({ gameType: cup.gameType }, { id: g.id, p1Id: g.p1Id, p2Id: g.p2Id, matchId: g.matchId });
        if (matchId) return sendSuccess(res, { matchId, state: "playing" });
    }
    return sendSuccess(res, { matchId: null, state: "waiting", opponentPresent: false, opponentReady: (side === "p1" ? g.p2ReadyMs : g.p1ReadyMs) !== null });
}));

export default router;
