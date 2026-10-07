import { storage } from "../storage/index.js";
import { sendError } from "../utils/response.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ADMIN_VIEW_ONLY_CODE, ADMIN_VIEW_ONLY_MESSAGE, isConsoleRole, isSuperAdminRole, viewOnlyAllows } from "../../shared/adminRole.js";

/**
 * 관리자 콘솔 가드 — 서명된 파트너 쿠키(hiq_partner_auth = profile id)의 role 로 가른다(shared/adminRole.ts).
 *   super_admin  전부 통과
 *   admin        **보기 전용**(2026-10-07 오너: "해당 부관리자는 볼 수만 있어 … 슈퍼관리자(나) 수정 모든 권한 > 관리자(보기만 가능)")
 *                — GET·HEAD 와 '조회용 POST'(VIEW_ONLY_ALLOWED_POSTS)만 통과, 나머지는 403 ADMIN_VIEW_ONLY
 * 이름이 checkSuperAdmin 인 것은 옛 이름이다(부르는 곳이 많아 그대로 둔다) — 뜻은 '관리자 콘솔 가드'.
 * 새 라우트를 만들 때 따로 할 일은 없다: 고치는 요청을 GET 으로 만들지만 않으면 보기 전용 관리자는 여기서 막힌다.
 * 예전엔 admin.ts 안에만 있었다. 골프 관리 화면(2026-10-01)이 라우터를 따로 두면서 같은 가드를 쓰려고 여기로 뺐다.
 * 위조 값은 signedCookies 가 거른다.
 */
export const checkSuperAdmin = asyncHandler(async (req: any, res: any, next: any) => {
    const profileId = req.signedCookies?.hiq_partner_auth;
    if (!profileId) return sendError(res, 401, "로그인이 필요합니다 (Admin)");
    const profile = await storage.getProfile(profileId);
    if (!profile || !isConsoleRole(profile.role)) {
        return sendError(res, 403, "관리자 권한이 없습니다.");
    }
    req.adminRole = profile.role;
    req.adminProfileId = profile.id;
    if (!isSuperAdminRole(profile.role) && !viewOnlyAllows(req.method, String(req.originalUrl ?? req.url ?? ""))) {
        return sendError(res, 403, ADMIN_VIEW_ONLY_MESSAGE, ADMIN_VIEW_ONLY_CODE);
    }
    next();
});

/** 감사 로그 한 줄(서버 로그) — admin.ts 의 console.info("[admin] …") 와 같은 꼴. 누가 했는지 파트너 쿠키로 남긴다 */
export function adminLog(req: any, action: string, detail: Record<string, unknown>) {
    console.info("[admin]", action, JSON.stringify({ ...detail, by: req.signedCookies?.hiq_partner_auth ?? null }));
}
