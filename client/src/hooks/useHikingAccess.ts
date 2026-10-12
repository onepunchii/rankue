import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/lib/i18n";

/**
 * 이 사람이 등산(세 번째 종목)을 쓸 수 있는가(2026-10-13). **서버가 판단해** GET /api/hiq/me 의 hikingAccess 로 알려 준다
 * (server/lib/hikingAccess.ts — 지금은 운영자와 시험 계정만. 전면 공개는 shared/hikingAccess 의 HIKING_PUBLIC).
 * 로그인 확인이 끝나기 전 · 비로그인 · 한국어가 아닌 화면에서는 false(산 자료가 국내뿐이고 화면이 한국어뿐이다).
 * 공개 산 화면(/hiking …)은 이 문과 무관하게 열려 있다.
 */
export function useHikingAccess(): boolean {
    const { member, isLoading } = useAuth();
    const { locale } = useT();
    if (isLoading || locale !== "ko") return false;
    return (member as { hikingAccess?: boolean } | undefined)?.hikingAccess === true;
}
