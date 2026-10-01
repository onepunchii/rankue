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
