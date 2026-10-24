/**
 * 랭큐 굿즈샵 출시 알림(2026-10-24) — 규칙 shared/goodsShop · 표 goods_shop_interest(migrations/goods_shop_interest.sql).
 * GET  /goods-shop/me        { items, total } 내가 고른 것 · 기다리는 사람 수(고른 것이 하나라도 있는 줄)
 * POST /goods-shop/interest  { items } 고르기(비우면 거두기) → { items, total }
 */
import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "../../db.js";
import { requireAuth, type AuthRequest } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendError, sendSuccess } from "../../utils/response.js";
import { cleanShopItems } from "../../../shared/goodsShop.js";

const router = Router();
const rowsOf = (r: any) => (r.rows ?? r) as any[];

async function waiting(): Promise<number> {
    const [r] = rowsOf(await db.execute(sql`select count(*)::int as n from goods_shop_interest where cardinality(items) > 0`));
    return Number(r?.n ?? 0);
}

router.get("/goods-shop/me", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const [mine] = rowsOf(await db.execute(sql`select items from goods_shop_interest where member_id = ${req.userId}::uuid`));
    res.setHeader("Cache-Control", "private, no-store");
    return sendSuccess(res, { items: cleanShopItems(mine?.items ?? []) ?? [], total: await waiting() });
}));

router.post("/goods-shop/interest", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const items = cleanShopItems(req.body?.items);
    if (!items) return sendError(res, 400, "err.goodsShop.items");
    await db.execute(sql`
        insert into goods_shop_interest (member_id, items) values (${req.userId}::uuid, ${`{${items.join(",")}}`}::text[])
        on conflict (member_id) do update set items = excluded.items, updated_at = now()`);
    return sendSuccess(res, { items, total: await waiting() });
}));

export default router;
