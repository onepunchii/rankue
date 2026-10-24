/**
 * 어드민 · 당구 · 당구대 광고(2026-10-24 오너: "어드민에 해당 사진 교체해서 광고") — 규칙 shared/tableBrand · 저장소 storage/tableBrands.
 * adminBilliards 안에 걸린다(슈퍼관리자만).
 *
 * GET    /admin/billiards/table-brands             줄 전부 + 테이블마다 지금 걸린 것
 * POST   /admin/billiards/table-brands             { title, image, opacity?, scale?, place?, tone?, tables?, sponsor?, startsAt?, endsAt?, enabled? } 새 캠페인
 * PATCH  /admin/billiards/table-brands/:id         고칠 칸만
 * DELETE /admin/billiards/table-brands/:id         지우기(올린 그림이면 다른 줄이 안 쓸 때 저장소에서도 지운다)
 * POST   /admin/billiards/table-brands/image       { png: base64 } 그림 올리기 — 화면이 캔버스로 다시 그린 PNG 만(긴 변 1024 · 1.5MB) → { url }
 */
import { Router } from "express";
import { put } from "@vercel/blob";
import { randomBytes } from "node:crypto";
import { adminLog } from "../../middleware/adminAuth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendError, sendSuccess } from "../../utils/response.js";
import { stripImageMetadata } from "../../utils/imageMeta.js";
import { deleteBlobs } from "../../utils/blob.js";
import { BRAND_FOLDER, BRAND_MAX_BYTES, BRAND_MAX_PX, cleanBrandInput, isUploadedBrandImage } from "../../../shared/tableBrand.js";
import { createBrand, deleteBrand, listBrands, liveBrands, updateBrand } from "../../storage/tableBrands.js";

const router = Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get("/", asyncHandler(async (_req: any, res: any) => {
    const now = Date.now();
    const [rows, live] = await Promise.all([listBrands(), liveBrands(now)]);
    res.set("Cache-Control", "no-store");
    return sendSuccess(res, { rows, live, now });
}));

router.post("/", asyncHandler(async (req: any, res: any) => {
    const c = cleanBrandInput(req.body, false);
    if (!c.ok) return sendError(res, 400, c.error);
    const row = await createBrand(c.value as Parameters<typeof createBrand>[0]);
    adminLog(req, "billiards.tableBrand.create", { id: row.id, title: row.title, image: row.image, sponsor: row.sponsor, tables: row.tables });
    return sendSuccess(res, row, 201);
}));

router.patch("/:id", asyncHandler(async (req: any, res: any) => {
    if (!UUID_RE.test(String(req.params.id))) return sendError(res, 404, "없는 캠페인입니다");
    const c = cleanBrandInput(req.body, true);
    if (!c.ok) return sendError(res, 400, c.error);
    try {
        const r = await updateBrand(String(req.params.id), c.value);
        if (!r) return sendError(res, 404, "없는 캠페인입니다");
        // 그림을 바꿨으면 앞의 올린 그림은 다른 줄이 안 쓸 때 지운다
        if (r.before.image !== r.after.image && isUploadedBrandImage(r.before.image) && !(await listBrands()).some((x) => x.image === r.before.image)) await deleteBlobs(r.before.image);
        adminLog(req, "billiards.tableBrand.update", { id: r.after.id, changed: Object.keys(c.value) });
        return sendSuccess(res, r.after);
    } catch (e: any) {
        if (e?.status === 400) return sendError(res, 400, e.message);
        throw e;
    }
}));

router.delete("/:id", asyncHandler(async (req: any, res: any) => {
    if (!UUID_RE.test(String(req.params.id))) return sendError(res, 404, "없는 캠페인입니다");
    const gone = await deleteBrand(String(req.params.id));
    if (!gone) return sendError(res, 404, "없는 캠페인입니다");
    if (isUploadedBrandImage(gone.image) && !(await listBrands()).some((x) => x.image === gone.image)) await deleteBlobs(gone.image);
    adminLog(req, "billiards.tableBrand.delete", { id: gone.id, title: gone.title, image: gone.image });
    return sendSuccess(res, { id: gone.id });
}));

router.post("/image", asyncHandler(async (req: any, res: any) => {
    const png = typeof req.body?.png === "string" ? req.body.png : "";
    if (!png) return sendError(res, 400, "올릴 그림이 없습니다");
    const b64 = png.replace(/^data:image\/png;base64,/, "");
    if (b64.length > Math.ceil(BRAND_MAX_BYTES / 3) * 4 + 4) return sendError(res, 413, "그림이 너무 큽니다");
    const clean = stripImageMetadata(Buffer.from(b64, "base64"));
    if (clean.type !== "png" || clean.buffer.length < 33) return sendError(res, 400, "PNG 그림만 올릴 수 있습니다");
    if (clean.buffer.length > BRAND_MAX_BYTES) return sendError(res, 413, "그림이 너무 큽니다");
    const width = clean.buffer.readUInt32BE(16), height = clean.buffer.readUInt32BE(20);
    if (width < 32 || height < 16 || width > BRAND_MAX_PX || height > BRAND_MAX_PX) return sendError(res, 400, `그림 크기가 맞지 않습니다(긴 변 ${BRAND_MAX_PX}px 까지)`);
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) return sendError(res, 503, "그림 저장소가 설정되지 않았습니다");
    const saved = await put(`${BRAND_FOLDER}/b-${randomBytes(8).toString("hex")}.png`, clean.buffer, { access: "public", contentType: "image/png", addRandomSuffix: false, token });
    if (!isUploadedBrandImage(saved.url)) {
        await deleteBlobs(saved.url);
        return sendError(res, 500, "그림을 저장하지 못했습니다");
    }
    adminLog(req, "billiards.tableBrand.image", { url: saved.url, bytes: clean.buffer.length, width, height });
    return sendSuccess(res, { url: saved.url, width, height }, 201);
}));

export default router;
