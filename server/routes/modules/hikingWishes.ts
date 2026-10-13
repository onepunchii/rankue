/**
 * 등산 — 가고 싶은 산(2026-10-13). /api/hiq/hiking 아래에 등산 라우트(modules/hiking)와 나란히 걸린다.
 * 등산을 쓸 수 있는 회원만(읽기 · 쓰기 모두). 규칙은 shared/hikingWish, 저장은 storage/hikingWishes.
 */
import { Router } from "express";
import { sendError, sendSuccess } from "../../utils/response.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { requireHikingAccess } from "../../middleware/hikingAccess.js";
import type { AuthRequest } from "../../middleware/auth.js";
import { allMountains, mountainBySlug } from "../../storage/hiking.js";
import { addWish, listWishes, removeWish } from "../../storage/hikingWishes.js";
import { HIKING_WISH_LABEL } from "../../../shared/hikingWish.js";

const router = Router();

/** 내가 담은 산(새로 담은 것부터) — 사라진 산(다시 적재로 id 가 없어진 것)은 빼고 준다 */
router.get("/me/wishes", ...requireHikingAccess, asyncHandler(async (req: AuthRequest, res: any) => {
    res.set("Cache-Control", "no-store");
    const ids = await listWishes(req.userId!);
    // 이름 · 높이 · 권역을 같이 준다 — 명산이 아닌 산도 담을 수 있어서 화면이 허브의 명산 목록만으로는 못 찾는다
    const by = new Map((await allMountains()).map((m) => [m.id, m]));
    const items = ids.map((id) => by.get(id)).filter((m): m is NonNullable<typeof m> => !!m)
        .map((m) => ({ id: m.id, slug: m.slug, name: m.name, heightM: m.heightM, region: m.region, kfs: m.lists.includes("kfs100") }));
    return sendSuccess(res, { ids: items.map((m) => m.id), items });
}));

/** 담기 — 여러 번 눌러도 한 줄 */
router.put("/mountains/:slug/wish", ...requireHikingAccess, asyncHandler(async (req: AuthRequest, res: any) => {
    const m = await mountainBySlug(String(req.params.slug));
    if (!m) return sendError(res, 404, "없는 산이에요");
    const r = await addWish(req.userId!, m.id);
    if (r === "full") return sendError(res, 409, HIKING_WISH_LABEL.full, "WISH_FULL");
    return sendSuccess(res, { wished: true, mountainId: m.id });
}));

/** 빼기 — 내 것만 */
router.delete("/mountains/:slug/wish", ...requireHikingAccess, asyncHandler(async (req: AuthRequest, res: any) => {
    const m = await mountainBySlug(String(req.params.slug));
    if (!m) return sendError(res, 404, "없는 산이에요");
    await removeWish(req.userId!, m.id);
    return sendSuccess(res, { wished: false, mountainId: m.id });
}));

export default router;
