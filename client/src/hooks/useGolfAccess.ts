import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/lib/i18n";
import { GOLF_PUBLIC } from "@shared/golfAccess";

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

/**
 * 골프를 **볼 수 있는가**(2026-10-05 오너 결정: "홈을 비로그인에 다 열고, 가입 안 한 사람에겐 예시로 보여 준다").
 * 회원의 골프 허용(useGolfAccess) 또는 한국어로 보는 비로그인 방문자 — 방문자는 골프 홈을 예시 숫자로 둘러본다.
 * '보는 것'만 연다. 쓰기와 골프 전용 화면의 문은 여전히 useGolfAccess 다(비로그인은 거기서 false).
 * 회원에게는 로그인 확인이 끝나면 useGolfAccess 와 같은 값이라 달라지는 게 없다.
 *
 * 한국어 화면에서는 **로그인 확인을 기다리지 않는다**: 골프가 전면 공개(GOLF_PUBLIC)인 동안 서버는 모든 회원에게 골프를 허용하므로
 * 확인이 회원으로 끝나든 방문자로 끝나든 답은 '볼 수 있다'다. 기다리면 골프를 저장해 둔 방문자(비로그인의 '나 = 없음'은 저장되지 않는다)가
 * 새로 열 때마다 당구 테마·당구 하단 탭을 먼저 봤다가 골프로 뒤집힌다(/dashboard·/club·/community·/menu).
 * 공개를 되돌리면(GOLF_PUBLIC=false) 예전처럼 확인 중에는 false — 골프가 잠깐 보였다 사라지지 않게.
 */
export function useGolfVisible(): boolean {
    const access = useGolfAccess();
    const { isGuest, isLoading } = useAuth();
    const { locale } = useT();
    if (locale !== "ko") return false;
    if (GOLF_PUBLIC) return true;
    if (isLoading) return false;
    return access || isGuest;
}
