/**
 * 어드민 · 굿즈 · 배지 증정(2026-10-16 오너: "어드민에 굿즈 내역 · 증정 · 수정 가능하게 · 이쁘게"). 목록 shared/goods · 저장 storage/goodsGrants.
 * 결정: 네 종목 전부 · 증정한 것만 회수 + 사유 기록 · 알림 + 열면 받은 화면(/gift/:id). 밤(한국 21~08시)에는 기기를 울리지 않고 알림함에만.
 *
 * GET  /admin/goods/member/:id   한 회원이 가진 것(자동 + 증정)
 * GET  /admin/goods/log          증정 기록(최근 100 · ?memberId=)
 * POST /admin/goods/grant        { memberId, sport, key, reason, message?, notify }
 * POST /admin/goods/revoke       { grantId, reason }
 * 바꾸는 요청은 가드가 작업 기록에도 남긴다(보기 전용 관리자는 가드가 막는다).
 */
import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { db } from "../../db.js";
import { hiqMembers } from "../../../shared/schema.js";
import { checkSuperAdmin } from "../../middleware/adminAuth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendError, sendSuccess } from "../../utils/response.js";
import { storage } from "../../storage/index.js";
import { msg, normalizeLocale, tr } from "../../lib/i18n.js";
import { notificationService } from "../../services/notificationService.js";
import { isGolfQuietHour } from "../../../shared/golfPushQuiet.js";
import { caseItem } from "../../../shared/cueCase.js";
import { GOODS_SPORT_CATEGORY, goodsItem, isGoodsSport, type GoodsGrantRow, type GoodsSport } from "../../../shared/goods.js";
import { grantGoods, ownedGoods, revokeGrant } from "../../storage/goodsGrants.js";

const router = Router();
router.use(checkSuperAdmin);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const rowsOf = (r: any) => (r.rows ?? r) as any[];
const iso = (v: unknown) => (v == null ? null : new Date(v as string).toISOString());

/**
 * 굿즈샵 출시 알림 신청(2026-10-24, shared/goodsShop) — 품목별 수 · 고른 것이 있는 사람 수 · 최근 신청 50.
 * 표가 아직 없으면 빈 값.
 */
router.get("/shop-interest", asyncHandler(async (_req: any, res: any) => {
    res.set("Cache-Control", "private, no-store");
    try {
        const rows = rowsOf(await db.execute(sql`
            select g.member_id, g.items, g.updated_at, m.name from goods_shop_interest g left join hiq_members m on m.id = g.member_id
            where cardinality(g.items) > 0 order by g.updated_at desc`));
        const byItem: Record<string, number> = {};
        for (const r of rows) for (const it of (Array.isArray(r.items) ? r.items : [])) byItem[it] = (byItem[it] ?? 0) + 1;
        const recent = rows.slice(0, 50).map((r) => ({ memberId: String(r.member_id), name: String(r.name ?? ""), items: Array.isArray(r.items) ? r.items.map(String) : [], at: new Date(r.updated_at).getTime() }));
        return sendSuccess(res, { total: rows.length, byItem, recent });
    } catch (e: any) {
        if ((e?.code ?? e?.cause?.code) === "42P01") return sendSuccess(res, { total: 0, byItem: {}, recent: [] });
        throw e;
    }
}));

router.get("/member/:id", asyncHandler(async (req: any, res: any) => {
    if (!UUID.test(req.params.id)) return sendError(res, 404, "회원을 찾을 수 없어요");
    const [m] = await db.select({ id: hiqMembers.id, name: hiqMembers.name, locale: hiqMembers.locale }).from(hiqMembers).where(eq(hiqMembers.id, req.params.id)).limit(1);
    if (!m) return sendError(res, 404, "회원을 찾을 수 없어요");
    res.set("Cache-Control", "private, no-store");
    return sendSuccess(res, { member: { id: m.id, name: m.name, locale: m.locale ?? null }, owned: await ownedGoods(m.id) });
}));

router.get("/log", asyncHandler(async (req: any, res: any) => {
    const memberId = typeof req.query.memberId === "string" && UUID.test(req.query.memberId) ? req.query.memberId : null;
    let rows: any[] = [];
    try {
        rows = rowsOf(await db.execute(sql`
            select g.*, coalesce(m.name, '회원') as member_name from hiq_goods_grants g left join hiq_members m on m.id = g.member_id
            where (${memberId}::uuid is null or g.member_id = ${memberId}::uuid) order by g.created_at desc limit 100`));
    } catch (e: any) { if ((e?.code ?? e?.cause?.code) !== "42P01") throw e; }
    res.set("Cache-Control", "private, no-store");
    return sendSuccess(res, rows.map((r): GoodsGrantRow => ({
        id: String(r.id), memberId: String(r.member_id), memberName: String(r.member_name), sport: r.sport, key: String(r.item),
        name: goodsItem(r.sport as GoodsSport, String(r.item))?.name ?? String(r.item), serial: r.serial == null ? null : Number(r.serial),
        reason: String(r.reason), message: r.message ?? null, notified: r.notified === true, adminName: String(r.admin_name ?? "관리자"), at: iso(r.created_at)!,
        revokedAt: iso(r.revoked_at), revokedBy: r.revoked_by ?? null, revokeReason: r.revoke_reason ?? null,
    })));
}));

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

router.post("/grant", asyncHandler(async (req: any, res: any) => {
    const memberId = String(req.body?.memberId ?? ""), sport = req.body?.sport, key = clean(req.body?.key, 80);
    const reason = clean(req.body?.reason, 200), message = clean(req.body?.message, 120) || null, notify = req.body?.notify !== false;
    if (!UUID.test(memberId)) return sendError(res, 400, "회원을 골라 주세요");
    if (!isGoodsSport(sport) || !goodsItem(sport, key)) return sendError(res, 400, "굿즈를 골라 주세요");
    if (!reason) return sendError(res, 400, "증정하는 까닭을 적어 주세요");
    const [m] = await db.select({ id: hiqMembers.id, locale: hiqMembers.locale, phone: hiqMembers.phone }).from(hiqMembers).where(eq(hiqMembers.id, memberId)).limit(1);
    if (!m || String(m.phone ?? "").startsWith("deleted:")) return sendError(res, 404, "회원을 찾을 수 없어요");
    const admin = await storage.getProfile(req.adminProfileId).catch(() => null);
    const out = await grantGoods({ memberId, sport, key, reason, message, notify, adminId: req.adminProfileId ?? null, adminName: String((admin as any)?.nickname ?? "관리자") });
    if (!out.ok) return sendError(res, 409, out.reason === "have" ? "이미 가진 굿즈예요" : out.reason === "soldOut" ? "다 나간 한정 굿즈예요" : "굿즈를 찾을 수 없어요");
    if (notify) {
        const item = goodsItem(sport, key)!;
        const loc = (m.locale ?? "ko") as "ko" | "en" | "es" | "vi" | "tr";
        const name = sport === "billiards" ? caseItem(key)?.name[loc] ?? item.name : item.name;
        const base = {
            memberId, category: GOODS_SPORT_CATEGORY[sport], type: "GIFT",
            title: msg("notif.gift.title"), body: message ? msg("notif.gift.bodyMsg", { name, message }) : msg("notif.gift.body", { name }),
            params: { url: `/gift/${out.id}` },
        };
        try {
            // 밤에는 알림함에만 — 서비스를 거치면 기기가 울리므로 받는 사람 언어로 풀어 직접 넣는다
            if (isGolfQuietHour(Date.now())) await storage.createNotification({ ...base, title: tr(normalizeLocale(loc), "notif.gift.title"), body: message ? tr(normalizeLocale(loc), "notif.gift.bodyMsg", { name, message }) : tr(normalizeLocale(loc), "notif.gift.body", { name }), isRead: false } as any);
            else await notificationService.sendAndSaveNotification(base);
        } catch (e) { console.warn("[goods] notify failed:", (e as Error)?.message); }
    }
    return sendSuccess(res, { id: out.id, serial: out.serial });
}));

router.post("/revoke", asyncHandler(async (req: any, res: any) => {
    const grantId = String(req.body?.grantId ?? ""), reason = clean(req.body?.reason, 200);
    if (!UUID.test(grantId)) return sendError(res, 404, "증정 기록을 찾을 수 없어요");
    if (!reason) return sendError(res, 400, "회수하는 까닭을 적어 주세요");
    const admin = await storage.getProfile(req.adminProfileId).catch(() => null);
    const out = await revokeGrant({ grantId, reason, adminName: String((admin as any)?.nickname ?? "관리자") });
    if (!out.ok) return sendError(res, out.reason === "revoked" ? 409 : 404, out.reason === "revoked" ? "이미 회수했어요" : "증정 기록을 찾을 수 없어요");
    return sendSuccess(res, { ok: true });
}));

export default router;
