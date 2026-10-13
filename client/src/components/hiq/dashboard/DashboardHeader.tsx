import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/lib/i18n";
import { SportHeader } from "@/components/hiq/SportHeader";

/**
 * 당구 홈 머리 — 세 종목이 같이 쓰는 머리줄(SportHeader: 워드마크 · 종목 전환 · 알림 · 언어 · 전체) + 이름 한 줄.
 * 2026-10-13 오너: "헤더가 다 따로따로잖아 — 등산 헤더로 통일하자". 예전의 종목 알약 · 종 · 언어 · ≡ 단추는 SportHeader 로 옮겼다.
 * 3쿠션·4구 RP 카드 두 장은 2026-10-04 '내 실전 기록' 카드(RealHandicapCard)의 기록 띠로 합쳤다(오너: "중복, 통합해서 맨 위로").
 *
 * 비로그인(2026-10-05 오너 결정: "홈을 비로그인에 다 열고, 가입 안 한 사람에겐 예시로 보여 준다") —
 * 이름 자리는 "둘러보는 중이에요" 한 줄이다. 종 자리의 "로그인" 단추와 알림함은 SportHeader 가 맡는다.
 */
interface DashboardHeaderProps {
    member: any;
}

export const DashboardHeader = ({ member }: DashboardHeaderProps) => {
    const { t } = useT();
    const { isGuest } = useAuth();
    return (
        <div className="pb-5">
            {/* 화면의 옆 여백(px-5)을 벗어나 조금 넓게 놓는다 — 종목 셋 · 알림 · 언어 · 전체가 폭 360 에 한 줄로 들어가게 */}
            <SportHeader sport="BILLIARDS" className="-mx-5 px-3 pt-1" />
            <div className="mt-2 min-w-0">
                {isGuest ? (
                    // 이름이 없는 방문자 — "님"만 남는 빈 인사말 대신 짧은 한 줄(낱말은 쪼개지 않는다)
                    <h1 className="text-[17px] leading-snug font-bold text-ink-1 tracking-tight break-keep">{t("guestHome.browsing")}</h1>
                ) : (
                    <h1 className="text-[24px] leading-none font-bold text-ink-1 tracking-tight truncate">
                        {member?.nickname || member?.name}
                        <span className="text-[15px] font-medium text-black/40 ml-1">{t("dashboardHeader.honorific")}</span>
                    </h1>
                )}
            </div>
        </div>
    );
};
