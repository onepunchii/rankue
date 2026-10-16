/**
 * 받은 선물 한 장(2026-10-16) — 어드민이 증정한 굿즈의 '받은 화면'(/gift/:id). 알림을 누르면 여기로 온다.
 * 받은 사람 본인만 · 회수한 것은 404. 증정한 까닭(reason)은 운영 메모라 내보내지 않고, 받는 사람에게 남긴 한마디(message)만.
 */
import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "../../db.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendError, sendSuccess } from "../../utils/response.js";
import { requireAuth, type AuthRequest } from "../../middleware/auth.js";
import { goodsCollectionUrl, goodsItem, type GiftView, type GoodsSport } from "../../../shared/goods.js";

const router = Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get("/gifts/:id", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!UUID.test(req.params.id)) return sendError(res, 404, "선물을 찾을 수 없어요");
    const rows = ((await db.execute(sql`select sport, item, serial, message, created_at from hiq_goods_grants where id = ${req.params.id}::uuid and member_id = ${req.userId!}::uuid and revoked_at is null`)) as any).rows ?? [];
    const g = rows[0];
    const item = g ? goodsItem(g.sport as GoodsSport, String(g.item)) : null;
    if (!g || !item) return sendError(res, 404, "선물을 찾을 수 없어요");
    res.setHeader("Cache-Control", "private, no-store");
    return sendSuccess(res, {
        id: req.params.id, sport: item.sport, key: item.key, name: item.name, groupName: item.groupName, image: item.image, shape: item.shape,
        serial: g.serial == null ? null : Number(g.serial), limit: item.limit ?? null, message: g.message ?? null,
        url: goodsCollectionUrl(item.sport, item.key), at: new Date(g.created_at).toISOString(),
    } satisfies GiftView);
}));

export default router;
