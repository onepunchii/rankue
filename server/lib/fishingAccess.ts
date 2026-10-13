/**
 * 낚시를 쓸 수 있는가(2026-10-14) — 지금은 운영자(슈퍼관리자)만. 오너: "낚시는 일단 나만 볼 수 있게 하고".
 * 역할은 profiles.role 에서만 온다(전화번호 · 이메일로 가르지 않는다). 전면 공개는 shared/fishing 의 FISHING_PUBLIC, 또는 env FISHING_PUBLIC=true.
 */
import { FISHING_PUBLIC } from "../../shared/fishing.js";
import { isSuperAdminRole } from "../../shared/adminRole.js";

export const fishingOpenToAll = (): boolean => FISHING_PUBLIC || process.env.FISHING_PUBLIC === "true";

export function fishingAllowed(member: { id?: string | null } | null | undefined, role?: string | null): boolean {
    if (!member) return false;
    return fishingOpenToAll() || isSuperAdminRole(role);
}
