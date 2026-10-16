import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { storage } from "../storage/index.js";
import { scrubAdminDetail } from "../../shared/adminActions.js";
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
    if (req.method !== "GET" && req.method !== "HEAD") recordOnReply(req, res, { id: profile.id, name: String(profile.nickname ?? "관리자") });
    next();
});

/**
 * 관리자 작업 기록(2026-10-16 — 지우기 · 무효 · 수정이 서버 로그에만 남았다). 바꾸는 요청이 **답하기 직전에** 한 줄을 적는다(hiq_admin_actions).
 * 서버리스라 답한 뒤에 적으면 잘릴 수 있어 답을 한 번 기다리게 한다(쓰기 한 번 — 수 ms). 적기가 실패해도 답은 그대로 간다.
 * 한 요청에 가드가 두 번 걸려도(골프 라우터) 한 줄만. 남기지 않는 칸(PIN · 전화 · 계좌 …)은 shared/adminActions 가 지운다.
 */
function recordOnReply(req: any, res: any, admin: { id: string; name: string }) {
    if (req.__adminRecorded) return;
    req.__adminRecorded = true;
    const send = res.json.bind(res);
    res.json = (body: unknown) => {
        const path = String(req.originalUrl ?? req.url ?? "").split("?")[0];
        const detail = scrubAdminDetail({ params: req.params, query: req.query, body: req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body) ? req.body : null });
        let write: Promise<unknown>;
        try {
            write = Promise.resolve(db.execute(sql`insert into hiq_admin_actions (admin_profile_id, admin_name, method, path, status, detail)
                values (${admin.id}::uuid, ${admin.name}, ${String(req.method)}, ${path.slice(0, 300)}, ${Number(res.statusCode) || 200}, ${JSON.stringify(detail)}::jsonb)`));
        } catch (e) { write = Promise.reject(e); }
        write.catch((e: any) => { if ((e?.code ?? e?.cause?.code) !== "42P01") console.warn("[admin] action log failed:", e?.message); })
            .finally(() => send(body));
        return res;
    };
}

/** 감사 로그 한 줄(서버 로그) — admin.ts 의 console.info("[admin] …") 와 같은 꼴. 누가 했는지 파트너 쿠키로 남긴다 */
export function adminLog(req: any, action: string, detail: Record<string, unknown>) {
    console.info("[admin]", action, JSON.stringify({ ...detail, by: req.signedCookies?.hiq_partner_auth ?? null }));
}
