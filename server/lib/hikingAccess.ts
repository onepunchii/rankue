/**
 * 등산을 쓸 수 있는가 — **서버만** 안다(2026-10-13). 골프의 문(server/lib/golfAccess.ts)과 같은 모양이다.
 *
 * 지금은 운영자(슈퍼관리자)와 시험 계정에게만 연다. 시험 계정은 코드를 고치지 않고 환경변수 HIKING_TESTER_IDS(쉼표로 구분한
 * 회원 id · 프로필 id)에 더한다. 전면 공개는 shared/hikingAccess 의 HIKING_PUBLIC, 또는 환경변수 HIKING_PUBLIC=true.
 * 전화번호 · 이메일로 판단하지 않는다 — 역할은 profiles.role, 사람은 id 로만.
 */
import { HIKING_PUBLIC } from "../../shared/hikingAccess.js";
import { isSuperAdminRole } from "../../shared/adminRole.js";

const testerIds = (): Set<string> => new Set((process.env.HIKING_TESTER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean));

/** 등산이 모두에게 열렸는가 — 산악회를 사이트맵에 싣는 것처럼 '사람'이 없는 판단에 쓴다 */
export const hikingOpenToAll = (): boolean => HIKING_PUBLIC || process.env.HIKING_PUBLIC === "true";

/** 이 회원이 등산을 쓸 수 있는가. 회원을 모르면(비로그인 등) 못 쓴다. role 은 profiles.role */
export function hikingAllowed(member: { id?: string | null; profileId?: string | null } | null | undefined, role?: string | null): boolean {
    if (hikingOpenToAll()) return true;
    if (!member) return false;
    if (isSuperAdminRole(role)) return true;
    const ids = testerIds();
    return (!!member.id && ids.has(member.id)) || (!!member.profileId && ids.has(member.profileId));
}
