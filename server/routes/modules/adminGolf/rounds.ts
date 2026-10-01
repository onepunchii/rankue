import { Router } from "express";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { sendError, sendSuccess } from "../../../utils/response.js";
import { adminLog } from "../../../middleware/adminAuth.js";
import { storage } from "../../../storage/index.js";
import {
    abandonStaleWaiting, deleteRoundHistory, listRounds, parseListQuery, readGolfStats, recountMembers,
    resetGolfStatsIfNoOfficial, roundCounts, roundDetail, staleWaitingRounds, summarizePlayers, CLEANUP_WAITING_HOURS,
} from "../../../storage/adminGolfRounds.js";

/**
 * 골프 관리 — 라운드(2026-10-01 오너: "골프 부분이 어드민에 많이 빠져 있다 — 넣을 수 있는 거 다 넣자").
 * index.ts 가 checkSuperAdmin 뒤에 /api/hiq/admin/golf/rounds 로 붙인다. 읽기·셈은 storage/adminGolfRounds.ts.
 *
 *   GET  /                 목록 — status · stale=1 · days · q · limit/offset. 상태 칩 숫자(counts)를 같이 준다
 *   POST /cleanup-stale    { dryRun, ids? } 24시간 넘게 시작 안 한 **대기방만** 접는다. dryRun 이 false 가 아니면 미리 보기만
 *   GET  /:id              상세 — 점수판·정산(읽기 전용)·현장 확인·사진 수·기록
 *   POST /:id/abandon      대기·진행 중 방 접기(기록은 남지 않는다)
 *   POST /:id/void         끝난 라운드의 기록 무효화 — 평균·등급·랭킹·여권 도장에서 뺀다. 되돌릴 수 없다
 *   POST /:id/finish       멈춘 라운드를 기록으로 끝내기 — 사용자 '라운드 끝내기'와 같은 길. 현장 인증 규칙(9/30) 전에
 *                          시작한 라운드는 옛 기록(on_site NULL)으로 둔다 — 기존 도장을 인정한 원칙과 같다(2026-10-01 오너)
 *
 * 쓰기는 전부 adminLog 로 남긴다. 고정 경로(/cleanup-stale)를 /:id 보다 먼저 둔다.
 */
const router = Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get("/", asyncHandler(async (req: any, res: any) => {
    const f = parseListQuery(req.query ?? {});
    const [page, counts] = await Promise.all([listRounds(f), roundCounts(f)]);
    return sendSuccess(res, { ...page, counts, offset: f.offset, limit: f.limit });
}));

router.post("/cleanup-stale", asyncHandler(async (req: any, res: any) => {
    const body = req.body ?? {};
    // 잘못 보낸 요청이 방을 접지 않게 — false 를 똑똑히 보낸 때만 실제로 접는다
    const dryRun = body.dryRun !== false;
    let ids: string[] | undefined;
    if (body.ids !== undefined) {
        if (!Array.isArray(body.ids) || body.ids.length > 500 || !body.ids.every((x: unknown) => typeof x === "string" && UUID.test(x))) {
            return sendError(res, 400, "정리할 방 목록이 올바르지 않습니다.");
        }
        ids = body.ids as string[];
    }
    if (dryRun) {
        const rows = await staleWaitingRounds(ids);
        return sendSuccess(res, { dryRun: true, hours: CLEANUP_WAITING_HOURS, count: rows.length, rounds: rows });
    }
    const abandoned = await abandonStaleWaiting(ids);
    adminLog(req, "golf.round.cleanup-stale", { abandoned: abandoned.length, ids: abandoned });
    return sendSuccess(res, { dryRun: false, hours: CLEANUP_WAITING_HOURS, count: abandoned.length, ids: abandoned });
}));

router.get("/:id", asyncHandler(async (req: any, res: any) => {
    if (!UUID.test(req.params.id)) return sendError(res, 404, "라운드를 찾을 수 없습니다.");
    const session = await storage.golf.getGolfMatchSession(req.params.id);
    if (!session) return sendError(res, 404, "라운드를 찾을 수 없습니다.");
    return sendSuccess(res, await roundDetail(session));
}));

router.post("/:id/abandon", asyncHandler(async (req: any, res: any) => {
    if (!UUID.test(req.params.id)) return sendError(res, 404, "라운드를 찾을 수 없습니다.");
    const session = await storage.golf.getGolfMatchSession(req.params.id);
    if (!session) return sendError(res, 404, "라운드를 찾을 수 없습니다.");
    if (session.status !== "waiting" && session.status !== "playing") {
        return sendError(res, 409, "대기·진행 중인 방만 접을 수 있습니다.");
    }
    // 사용자 '방 접기'와 같은 저장소 함수 — 상태를 UPDATE 조건으로 다시 본다(그 사이 끝났으면 409). 기록은 쓰지 않는다.
    const done = await storage.golf.abandonGolfMatchSession(req.params.id);
    const sum = summarizePlayers(session.players);
    adminLog(req, "golf.round.abandon", {
        sessionId: req.params.id, from: session.status, holesEntered: sum.holesEntered, members: sum.members, guests: sum.guests,
    });
    return sendSuccess(res, { id: done.id, status: done.status, previous: session.status });
}));

/** 현장 인증 규칙이 생긴 때(2026-09-30 00:00 KST). 그 전에 시작한 라운드는 '규칙 전 기록'으로 남긴다 */
const ONSITE_RULE_START = Date.parse("2026-09-30T00:00:00+09:00");

router.post("/:id/finish", asyncHandler(async (req: any, res: any) => {
    if (!UUID.test(req.params.id)) return sendError(res, 404, "라운드를 찾을 수 없습니다.");
    const session = await storage.golf.getGolfMatchSession(req.params.id);
    if (!session) return sendError(res, 404, "라운드를 찾을 수 없습니다.");
    if (session.status !== "playing") return sendError(res, 409, "진행 중인 라운드만 기록으로 끝낼 수 있습니다.");
    const detail = await roundDetail(req.params.id);
    if (!detail?.actions.finish) return sendError(res, 409, "18홀을 다 적은 회원이 없습니다 — 기록할 게 없어 '접기'를 쓰세요.");
    // 사용자 '라운드 끝내기'와 같은 저장소 함수 — 18홀을 다 적은 회원만 기록, 정산 저장, 현장 판정까지 한 트랜잭션
    const done: any = await storage.golf.finishGolfMatchSession(req.params.id);
    const recorded: string[] = Array.isArray(done?.recordedMemberIds) ? done.recordedMemberIds : [];
    const startedMs = Date.parse(String(session.startedAt ?? session.createdAt ?? ""));
    const legacy = Number.isFinite(startedMs) && startedMs < ONSITE_RULE_START;
    if (legacy && recorded.length) {
        // 규칙 전 라운드 — 확인이 없어 '미인증'으로 굳은 값을 옛 기록(NULL)으로 되돌리고 평균·등급을 다시 센다
        const { db } = await import("../../../db.js");
        const { sql } = await import("drizzle-orm");
        await db.execute(sql`update hiq_game_history set on_site = null
            where golf_session_id = ${req.params.id} and sport_category = 'GOLF' and on_site = false`);
        for (const mid of recorded) await storage.updateGolfStats(mid).catch((e: unknown) => console.error("[admin] golf finish recount", e));
    }
    adminLog(req, "golf.round.finish", { sessionId: req.params.id, recorded: recorded.length, legacy });
    return sendSuccess(res, { id: req.params.id, status: "finished", recordedMemberIds: recorded, legacy });
}));

router.post("/:id/void", asyncHandler(async (req: any, res: any) => {
    if (!UUID.test(req.params.id)) return sendError(res, 404, "라운드를 찾을 수 없습니다.");
    const r = await deleteRoundHistory(req.params.id);
    if (!r.ok) {
        if (r.reason === "not-found") return sendError(res, 404, "라운드를 찾을 수 없습니다.");
        return sendError(res, 409, "끝난 라운드만 무효화할 수 있습니다.");
    }
    // 커밋 뒤 — 평균·등급은 남은 공식 라운드로 다시 센다. 하나도 안 남으면 기본값으로(updateGolfStats 는 그때 아무것도 안 쓴다)
    const recount = await recountMembers(r.targets, (mid) => storage.golf.updateGolfStats(mid), resetGolfStatsIfNoOfficial);
    const after = await readGolfStats(r.targets);
    const removed = new Set(r.removed);
    const members = r.targets
        .filter((id) => r.before.has(id) || after.has(id))
        .map((id) => {
            const b = r.before.get(id) ?? null;
            const a = after.get(id) ?? null;
            const strip = (s: typeof a) => s && { avg: s.avg, best: s.best, grade: s.grade, rounds: s.rounds };
            return {
                id,
                name: a?.name || b?.name || "",
                removedRound: removed.has(id),
                before: strip(b),
                after: strip(a),
                reset: recount.get(id)?.reset ?? false,
                error: recount.get(id)?.error ?? null,
            };
        })
        .sort((x, y) => Number(y.removedRound) - Number(x.removedRound));

    adminLog(req, "golf.round.void", {
        sessionId: req.params.id,
        deletedRows: r.deletedRows,
        detachedPosts: r.detachedPosts,
        members: members.map((m) => ({ id: m.id, avgBefore: m.before?.avg ?? null, avgAfter: m.after?.avg ?? null, reset: m.reset, error: m.error })),
    });
    return sendSuccess(res, { sessionId: req.params.id, deletedRows: r.deletedRows, detachedPosts: r.detachedPosts, members });
}));

export default router;
