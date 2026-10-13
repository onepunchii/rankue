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
import { addWish, crewWishes, isCrewMember, listWishes, removeWish } from "../../storage/hikingWishes.js";
import { CREW_WISH_LABEL, CREW_WISH_MIN, HIKING_WISH_LABEL, pickCrewWishes } from "../../../shared/hikingWish.js";

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

// ── 우리 산악회가 가고 싶은 산 ─────────────────────────────────────────
const CREW_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * 산악회 회원 여럿(CREW_WISH_MIN 명 이상)이 담아 둔 산 — 산악회 홈이 그린다.
 * '함께 오른 산'과 달리 **회원만** 본다: 담아 둔 산은 아직 가지 않은 계획이라 모임 안의 것이다. 가입 대기 중인 사람도 못 본다.
 * 싣는 것은 산과 사람 수뿐 — 누가 담았는지는 싣지 않는다.
 */
router.get("/crews/:id/wishes", ...requireHikingAccess, asyncHandler(async (req: AuthRequest, res: any) => {
    res.set("Cache-Control", "no-store");
    const crewId = String(req.params.id);
    if (!CREW_ID.test(crewId)) return sendError(res, 404, "없는 산악회예요");
    // 회원인지부터 묻는다 — 아니면 담은 산을 읽지도 않는다
    if (!(await isCrewMember(crewId, req.userId!))) return sendError(res, 403, CREW_WISH_LABEL.membersOnly, "CREW_MEMBERS_ONLY");
    const [list, all] = await Promise.all([crewWishes(crewId, CREW_WISH_MIN), allMountains()]);
    const by = new Map(all.map((m) => [m.id, m]));
    return sendSuccess(res, {
        min: CREW_WISH_MIN,
        // 사라진 산(다시 적재로 id 가 없어진 것)은 빼고 준다
        mountains: pickCrewWishes(list).flatMap((x) => {
            const m = by.get(x.mountainId);
            return m ? [{ mountainId: x.mountainId, count: x.count, name: m.name, slug: m.slug, heightM: m.heightM, region: m.region, kfs100: m.lists.includes("kfs100") }] : [];
        }),
    });
}));

export default router;
