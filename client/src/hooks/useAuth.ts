import { useQuery } from "@tanstack/react-query";
import type { HiqMember } from "@shared/schema";

// GET /api/hiq/me 는 member 행에 profile 쪽 표시 필드를 얹어서 준다(server/routes/modules/member.ts).
// 스키마 타입만 쓰면 nickname·profileImageUrl 이 없다고 나오므로 응답 형태를 그대로 적는다.
export type AuthMember = HiqMember & {
    role?: string;
    nickname?: string | null;
    profileImageUrl?: string | null;
    handle?: string | null;
    countryCode?: string | null;
    connections?: { phone: boolean; google: boolean; apple: boolean };
};

// 로그인 상태 단일 진입점. 검색으로 들어온 비로그인 방문자가 개인 화면(홈·기록·라이벌)에
// 도달했을 때 "데이터 0건"이 아니라 "로그인이 필요하다"를 그릴 수 있어야 한다.
//
// 재시도 정책이 401 과 네트워크 오류를 구분해야 하는 이유:
//  - 401 은 재시도해도 401 이다. 한 번 더 왕복하면 게스트 화면만 그만큼 늦게 뜬다.
//  - 반대로 순간적인 네트워크 오류까지 즉시 "게스트"로 단정하면, 로그인해 쓰던 사람이
//    지하철에서 잠깐 끊겼을 때 로그인 안내를 보게 된다. 그건 한 번 더 시도해야 한다.
export function useAuth() {
    const { data: member, isLoading } = useQuery<AuthMember>({
        queryKey: ["/api/hiq/me"],
        retry: (failureCount, error: any) => (error?.status === 401 ? false : failureCount < 1),
        staleTime: 5 * 60 * 1000,
    });

    return {
        member,
        isLoading,
        isLoggedIn: !!member,
        /** 확인이 끝났고 로그인되어 있지 않음 — 이때만 로그인 안내를 그린다(확인 중엔 스피너). */
        isGuest: !isLoading && !member,
    };
}
