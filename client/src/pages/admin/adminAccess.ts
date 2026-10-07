/**
 * 지금 관리자 콘솔에 들어온 사람의 권한(2026-10-07 오너: "슈퍼관리자(나) 수정 모든 권한 > 관리자(보기만 가능)").
 *
 * 서버(GET /api/hiq/admin/whoami)가 파트너 쿠키의 역할을 알려 준다 — 화면은 이걸로 '보기 전용' 표시와 임명 단추를 가른다.
 * ⚠️ 여기서 가리는 것은 편의일 뿐이다. 막는 것은 서버의 가드(middleware/adminAuth.ts)다: 보기 전용 관리자의 고치는 요청은 403 ADMIN_VIEW_ONLY.
 * 답이 오기 전에는 '고칠 수 없음'으로 본다 — 슈퍼관리자 전용 단추가 잠깐이라도 잘못 보이지 않게.
 */
import { useQuery } from "@tanstack/react-query";

export const ADMIN_WHOAMI_KEY = ["/api/hiq/admin/whoami"] as const;

export interface AdminAccess {
    role: string | null;
    /** 고칠 수 있는가 — 슈퍼관리자만 */
    canWrite: boolean;
    /** 보기 전용 관리자인가(답이 온 뒤에만 true) */
    viewOnly: boolean;
    loading: boolean;
}

export function useAdminAccess(): AdminAccess {
    const q = useQuery<{ role: string; canWrite: boolean }>({ queryKey: ADMIN_WHOAMI_KEY, staleTime: 60_000 });
    const role = q.data?.role ?? null;
    const canWrite = q.data?.canWrite === true;
    return { role, canWrite, viewOnly: !!q.data && !canWrite, loading: q.isLoading };
}
