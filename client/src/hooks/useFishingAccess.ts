import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/lib/i18n";

/**
 * 이 사람이 낚시(네 번째 종목)를 쓸 수 있는가(2026-10-14). **서버가 판단해** GET /api/hiq/me 의 fishingAccess 로 알려 준다
 * (server/lib/fishingAccess.ts — 지금은 운영자만. 전면 공개는 shared/fishing 의 FISHING_PUBLIC).
 * 로그인 확인이 끝나기 전 · 비로그인 · 한국어가 아닌 화면에서는 false(화면이 한국어뿐이다) — 등산의 문(useHikingAccess)과 같은 꼴이다.
 */
export function useFishingAccess(): boolean {
    const { member, isLoading } = useAuth();
    const { locale } = useT();
    if (isLoading || locale !== "ko") return false;
    return (member as { fishingAccess?: boolean } | undefined)?.fishingAccess === true;
}
