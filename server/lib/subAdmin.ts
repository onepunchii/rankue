import { isSuperAdminRole } from "../../shared/adminRole.js";
import { hasSocialLogin } from "./adminRole.js";

/**
 * 관리자(보기 전용) 임명·해제를 받아도 되는가(2026-10-07 오너: "회원관리에 부관리자 설정할 수 있는 버튼 … 내가 임명을 하면").
 * 라우트(POST /admin/members/:id/sub-admin)가 역할을 바꾸기 전에 이 판정을 지난다. 순수 함수 — DB 를 읽지 않는다.
 *
 *  - 임명·해제는 **슈퍼관리자만** 한다.
 *  - 자기 자신의 역할은 여기서 바꾸지 않는다(슈퍼관리자가 스스로를 내리는 사고를 막는다).
 *  - 임명은 카카오·구글·애플이 연결된 일반 회원만: 관리자 계정은 번호 + PIN 으로 로그인할 수 없다(lib/adminRole) —
 *    연결이 없는 계정을 임명하면 그 사람이 다음부터 들어오지 못한다. 정지된 계정도 안 된다.
 *  - 사장님·부킹매니저·슈퍼관리자인지는 여기서 가르지 않는다 — 역할을 바꾸는 한 문장(setSubAdminRole: 지금 값이 from 일 때만)이
 *    거르고, 그 결과(blocked)의 안내 문구는 아래 subAdminBlockedMessage 가 만든다.
 */
export type SubAdminCheck = { ok: true } | { ok: false; status: number; message: string; code?: string };

export interface SubAdminInput {
    actorRole: unknown;
    actorProfileId: string | null | undefined;
    on: unknown;
    member: { profileId?: string | null } | null | undefined;
    profile: { id: string; role?: string | null; status?: string | null; googleSub?: string | null; appleSub?: string | null; kakaoSub?: string | null } | null | undefined;
}

export function checkSubAdminRequest(i: SubAdminInput): SubAdminCheck {
    if (!isSuperAdminRole(i.actorRole)) return { ok: false, status: 403, message: "슈퍼관리자만 관리자를 임명할 수 있습니다" };
    if (typeof i.on !== "boolean") return { ok: false, status: 400, message: "임명할지 해제할지(on)를 보내 주세요" };
    if (!i.member) return { ok: false, status: 404, message: "회원을 찾을 수 없습니다" };
    if (!i.member.profileId) return { ok: false, status: 409, message: "로그인 계정이 연결되지 않은 회원이라 임명할 수 없습니다" };
    if (i.actorProfileId && i.member.profileId === i.actorProfileId) return { ok: false, status: 409, message: "자기 자신의 역할은 여기서 바꾸지 않습니다" };
    if (!i.profile) return { ok: false, status: 404, message: "계정을 찾을 수 없습니다" };
    if (i.on) {
        if (i.profile.status === "banned") return { ok: false, status: 409, message: "정지된 계정은 임명할 수 없습니다" };
        if (i.profile.role === "user" && !hasSocialLogin(i.profile)) {
            return {
                ok: false, status: 409, code: "SUB_ADMIN_NEEDS_SOCIAL",
                message: "카카오·Google·Apple 로그인이 연결된 계정만 임명할 수 있습니다 — 관리자 계정은 전화번호 + PIN 으로 로그인할 수 없어서, 연결이 없으면 그분이 들어오지 못합니다",
            };
        }
    }
    return { ok: true };
}

/** 역할이 user·admin 이 아니라 바꾸지 않았을 때의 안내 */
export function subAdminBlockedMessage(role: string | null | undefined): string {
    if (role === "store_owner") return "매장 사장님 계정입니다 — 임명하면 사장님 권한이 지워져서 여기서는 바꾸지 않습니다";
    if (role === "booking_manager") return "부킹매니저 계정입니다 — 부킹매니저를 먼저 풀고 임명해 주세요";
    if (role === "super_admin") return "슈퍼관리자 계정은 여기서 바꾸지 않습니다";
    return `지금 역할(${role ?? "-"})에서는 바꾸지 않습니다`;
}
