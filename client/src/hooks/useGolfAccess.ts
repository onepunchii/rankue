import { useAuth } from "@/hooks/useAuth";
import { golfAllowed } from "@shared/golfAccess";

/**
 * 이 사람이 골프를 쓸 수 있는가. 판단 근거는 shared/golfAccess.ts 하나뿐이고 서버도 같은 걸 쓴다.
 * 로그인 확인이 끝나기 전에는 false — 잠깐 골프가 보였다 사라지는 것보다 안 보이는 게 낫다.
 */
export function useGolfAccess(): boolean {
    const { member, isLoading } = useAuth();
    if (isLoading) return false;
    return golfAllowed(member?.phone);
}
