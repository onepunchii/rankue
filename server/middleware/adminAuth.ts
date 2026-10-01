import { storage } from "../storage/index.js";
import { sendError } from "../utils/response.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/**
 * 관리자 콘솔 가드 — 서명된 파트너 쿠키(hiq_partner_auth = profile id)의 role 이 super_admin 또는 admin.
 * 예전엔 admin.ts 안에만 있었다. 골프 관리 화면(2026-10-01)이 라우터를 따로 두면서 같은 가드를 쓰려고 여기로 뺐다.
 * 위조 값은 signedCookies 가 거른다.
 */
export const checkSuperAdmin = asyncHandler(async (req: any, res: any, next: any) => {
    const profileId = req.signedCookies?.hiq_partner_auth;
    if (!profileId) return sendError(res, 401, "로그인이 필요합니다 (Admin)");
    const profile = await storage.getProfile(profileId);
    if (!profile || (profile.role !== "super_admin" && profile.role !== "admin")) {
        return sendError(res, 403, "관리자 권한이 없습니다.");
    }
    next();
});

/** 감사 로그 한 줄(서버 로그) — admin.ts 의 console.info("[admin] …") 와 같은 꼴. 누가 했는지 파트너 쿠키로 남긴다 */
export function adminLog(req: any, action: string, detail: Record<string, unknown>) {
    console.info("[admin]", action, JSON.stringify({ ...detail, by: req.signedCookies?.hiq_partner_auth ?? null }));
}
