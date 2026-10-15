/**
 * 등산 — 올해의 목표(2026-10-15). GET /api/hiq/hiking/me/goal?year= · PUT /api/hiq/hiking/me/goal. 내 것만. 규칙은 shared/hikingGoal.
 */
import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "../../db.js";
import { sendError, sendSuccess } from "../../utils/response.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { requireHikingAccess } from "../../middleware/hikingAccess.js";
import type { AuthRequest } from "../../middleware/auth.js";
import { cleanGoal, type HikingGoal } from "../../../shared/hikingGoal.js";

const router = Router();
const rowsOf = (r: any) => (r.rows ?? r) as any[];
const kstYear = () => new Date(Date.now() + 9 * 3_600_000).getUTCFullYear();
const view = (r: any): HikingGoal => ({ year: Number(r.year), climbs: r.climbs ?? null, heightM: r.height_m ?? null, kfs: r.kfs ?? null });

router.get("/me/goal", ...requireHikingAccess, asyncHandler(async (req: AuthRequest, res: any) => {
    res.set("Cache-Control", "no-store");
    const year = Number(req.query.year) || kstYear();
    const [row] = rowsOf(await db.execute(sql`select * from hiking_goals where member_id = ${req.userId!}::uuid and year = ${year}`));
    return sendSuccess(res, row ? view(row) : null);
}));

router.put("/me/goal", ...requireHikingAccess, asyncHandler(async (req: AuthRequest, res: any) => {
    const g = cleanGoal(req.body, kstYear());
    if (!g.ok) return sendError(res, 400, g.error);
    const v = g.value;
    const [row] = rowsOf(await db.execute(sql`
        insert into hiking_goals (member_id, year, climbs, height_m, kfs) values (${req.userId!}::uuid, ${v.year}, ${v.climbs}, ${v.heightM}, ${v.kfs})
        on conflict (member_id, year) do update set climbs = excluded.climbs, height_m = excluded.height_m, kfs = excluded.kfs, updated_at = now()
        returning *`));
    return sendSuccess(res, view(row));
}));

export default router;
