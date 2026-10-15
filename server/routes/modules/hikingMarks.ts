/**
 * 등산 — 내 표시 지점(2026-10-15). 나만 본다.
 *   GET    /api/hiq/hiking/me/marks?mountainId=   그 산의 내 표시
 *   POST   /api/hiq/hiking/me/marks               하나 남기기(사진은 작은 한 장, 이 회원이 올린 것만)
 *   DELETE /api/hiq/hiking/me/marks/:id           지우기(사진도 저장소에서 지운다)
 */
import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "../../db.js";
import { sendError, sendSuccess } from "../../utils/response.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { requireHikingAccess } from "../../middleware/hikingAccess.js";
import type { AuthRequest } from "../../middleware/auth.js";
import { deleteBlobs, isOnOwnBlobHost } from "../../utils/blob.js";
import { HIKING_THUMB_CATEGORY, isOwnHikingPhotoUrl } from "../../../shared/hikingPhotos.js";
import { MARKS_PER_MOUNTAIN, cleanMark, type HikingMark } from "../../../shared/hikingMarks.js";

const router = Router();
const rowsOf = (r: any) => (r.rows ?? r) as any[];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const view = (r: any): HikingMark => ({
    id: String(r.id), mountainId: String(r.mountain_id), kind: r.kind, lat: Number(r.lat), lng: Number(r.lng),
    note: r.note ?? null, photoUrl: r.photo_url ?? null, createdAt: new Date(r.created_at).toISOString(),
});

router.get("/me/marks", ...requireHikingAccess, asyncHandler(async (req: AuthRequest, res: any) => {
    res.set("Cache-Control", "no-store");
    const mountainId = String(req.query.mountainId ?? "");
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(mountainId)) return sendError(res, 400, "산을 골라 주세요");
    const rows = rowsOf(await db.execute(sql`select * from hiking_marks where member_id = ${req.userId!}::uuid and mountain_id = ${mountainId} order by created_at desc limit ${MARKS_PER_MOUNTAIN}`));
    return sendSuccess(res, rows.map(view));
}));

router.post("/me/marks", ...requireHikingAccess, asyncHandler(async (req: AuthRequest, res: any) => {
    const m = cleanMark(req.body);
    if (!m.ok) return sendError(res, 400, m.error);
    const v = m.value;
    let photo: string | null = null;
    if (v.photoUrl != null && v.photoUrl !== "") {
        if (!isOwnHikingPhotoUrl(v.photoUrl, req.userId!, HIKING_THUMB_CATEGORY) || !isOnOwnBlobHost(v.photoUrl)) return sendError(res, 400, "사진 주소가 올바르지 않아요");
        photo = v.photoUrl;
    }
    const [{ n }] = rowsOf(await db.execute(sql`select count(*)::int as n from hiking_marks where member_id = ${req.userId!}::uuid and mountain_id = ${v.mountainId}`));
    if (Number(n) >= MARKS_PER_MOUNTAIN) return sendError(res, 400, `한 산에 ${MARKS_PER_MOUNTAIN}개까지 표시할 수 있어요`);
    const [row] = rowsOf(await db.execute(sql`
        insert into hiking_marks (member_id, mountain_id, kind, lat, lng, note, photo_url)
        values (${req.userId!}::uuid, ${v.mountainId}, ${v.kind}, ${v.lat}, ${v.lng}, ${v.note}, ${photo}) returning *`));
    return sendSuccess(res, view(row));
}));

router.delete("/me/marks/:id", ...requireHikingAccess, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!UUID.test(req.params.id)) return sendError(res, 404, "표시를 찾을 수 없어요");
    const gone = rowsOf(await db.execute(sql`delete from hiking_marks where id = ${req.params.id}::uuid and member_id = ${req.userId!}::uuid returning photo_url`));
    if (!gone.length) return sendError(res, 404, "표시를 찾을 수 없어요");
    if (gone[0].photo_url) void deleteBlobs([gone[0].photo_url]).catch((e) => console.warn("[hiking marks] 사진을 지우지 못했다", e instanceof Error ? e.message : e));
    return sendSuccess(res, { id: req.params.id });
}));

export default router;
