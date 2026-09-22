import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/lib/i18n";

/**
 * 이 사람이 골프를 쓸 수 있는가. **서버가 판단해** GET /api/hiq/me 의 golfAccess 로 알려 준다
 * (허용 목록은 server/lib/golfAccess.ts — 번호가 화면 번들에 실리지 않게 서버에만 둔다. 2026-09-11).
 * 로그인 확인이 끝나기 전에는 false — 잠깐 골프가 보였다 사라지는 것보다 안 보이는 게 낫다.
 */
export function useGolfAccess(): boolean {
    const { member, isLoading } = useAuth();
    // 골프는 한국에서만 열린 서비스라 화면이 한국어로만 돼 있다(2026-09-22 오너: "다른 나라 언어면 골프 모드 가리기").
    // 앱 언어가 한국어가 아니면 골프 모드(홈 전환·메뉴·골프 전용 화면)를 감춘다. 공개 페이지(골프 선수·랭킹)는 GolfOnly 밖이라 그대로.
    const { locale } = useT();
    if (isLoading || locale !== "ko") return false;
    return (member as any)?.golfAccess === true;
}
