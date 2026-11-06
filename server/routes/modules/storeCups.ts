/**
 * 매장 대회 — 손님 쪽(2026-11-06 — shared/storeCup). /api/hiq/store-cups
 *  · GET  /?store=<매장 코드>   그 매장의 대회 목록(매장 페이지 '이 매장 대회') — 공개
 *  · GET  /:id                  대회 화면(참가자 · 대진표) — 공개. 참가비 체크는 싣지 않는다(사장님만)
 *  · POST /:id/join · DELETE /:id/join   참가 신청 · 취소(회원) — 크루원이 아니어도 된다(그 매장의 공개 대회)
 * 대회 표는 크루 대회와 같다(storage/tournament.repo). 매장 대회는 store_id 가 있는 줄만 여기서 다룬다.
 */
import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../../db.js";
import { storage } from "../../storage/index.js";
import { hiqStores, storeListings } from "../../../shared/schema.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { requireAuth, type AuthRequest } from "../../middleware/auth.js";
import { requireTermsAccepted } from "../../middleware/terms.js";
import { notificationService } from "../../services/notificationService.js";
import { msg } from "../../lib/i18n.js";
import { storeCupPath } from "../../../shared/storeCup.js";

const router = Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE_RE = /^[A-Za-z0-9_-]{1,20}$/;

/** 손님에게 보이는 대회 한 줄 */
export function publicCup(t: any) {
    return {
        id: t.id, title: t.title, description: t.description ?? null, status: t.status, gameType: t.gameType,
        maxPlayers: t.maxPlayers, bestOf: t.bestOf, recruitEnd: t.recruitEnd ?? null, startAt: t.startAt ?? null,
        prize: t.prize ?? null, entryFee: t.entryFee ?? null, championId: t.championId ?? null,
        participantCount: t.participantCount ?? undefined, championName: t.championName ?? undefined,
    };
}

/** 매장 대회만(크루 대회는 크루 라우트가 다룬다) */
async function cupDetail(id: string) {
    if (!UUID_RE.test(id)) return null;
    const d = await storage.tournaments.getDetail(id);
    if (!d || !d.tournament.storeId || d.tournament.status === "canceled") return null;
    return d;
}

router.get("/", asyncHandler(async (req: any, res: any) => {
    const code = String(req.query.store ?? "");
    if (!CODE_RE.test(code)) return sendError(res, 400, "매장을 찾을 수 없습니다");
    const [l] = await db.select({ storeId: storeListings.claimedStoreId }).from(storeListings).where(eq(storeListings.code, code)).limit(1);
    if (!l?.storeId) return sendSuccess(res, []);
    res.set("Cache-Control", "public, max-age=0, must-revalidate");
    res.set("CDN-Cache-Control", "public, s-maxage=60, stale-while-revalidate=600");
    return sendSuccess(res, (await storage.tournaments.listByStore(l.storeId)).map(publicCup));
}));

router.get("/:id", asyncHandler(async (req: any, res: any) => {
    const d = await cupDetail(req.params.id);
    if (!d) return sendError(res, 404, "대회를 찾을 수 없어요");
    const [st] = await db.select({ name: hiqStores.name, slug: hiqStores.slug }).from(hiqStores).where(eq(hiqStores.id, d.tournament.storeId!)).limit(1);
    const [l] = await db.select({ code: storeListings.code }).from(storeListings).where(eq(storeListings.claimedStoreId, d.tournament.storeId!)).limit(1);
    res.set("Cache-Control", "private, no-store");
    return sendSuccess(res, {
        cup: publicCup(d.tournament),
        store: { name: st?.name ?? "", listingCode: l?.code ?? null },
        participants: d.participants.map(({ feePaid: _fee, ...p }: any) => p),
        matches: d.matches,
    });
}));

router.post("/:id/join", requireAuth, requireTermsAccepted, asyncHandler(async (req: AuthRequest, res: any) => {
    const d = await cupDetail(req.params.id);
    if (!d) return sendError(res, 404, "대회를 찾을 수 없어요");
    const row = await storage.tournaments.join(d.tournament.id, req.userId!);
    // 사장님께 알림(대회를 연 회원) — 실패해도 신청은 끝났다
    try {
        if (d.tournament.creatorId !== req.userId) {
            const joiner = await storage.getMemberById(req.userId!);
            await notificationService.sendAndSaveNotification({
                memberId: d.tournament.creatorId,
                title: msg("notif.crew.tournamentJoin.title"),
                body: msg("notif.crew.tournamentJoin.body", { name: joiner?.name ?? "", title: d.tournament.title }),
                category: "BILLIARDS", type: "TOURNAMENT",
                params: { url: "/partner/dashboard?tab=tournaments", cupId: d.tournament.id },
            });
        }
    } catch (e) { console.error("[StoreCup] 참가 알림:", (e as Error)?.message); }
    return sendSuccess(res, row);
}));

router.delete("/:id/join", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const d = await cupDetail(req.params.id);
    if (!d) return sendError(res, 404, "대회를 찾을 수 없어요");
    await storage.tournaments.leave(d.tournament.id, req.userId!);
    return sendSuccess(res, { success: true });
}));

export { storeCupPath };
export default router;
