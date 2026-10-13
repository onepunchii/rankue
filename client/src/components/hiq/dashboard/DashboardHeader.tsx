import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/lib/i18n";
import { LucideTranslate } from "@/lib/icons";
import { LanguageSheet } from "@/components/hiq/LanguageSheet";
import { SportHeader, SPORT_HEADER_SIZE, SPORT_HEADER_THEME } from "@/components/hiq/SportHeader";

/**
 * 당구 홈 머리 — 세 종목이 같이 쓰는 머리줄(SportHeader: 워드마크 · 종목 전환 · 알림 · 전체) + 이름 한 줄.
 * 2026-10-13 오너: "헤더가 다 따로따로잖아 — 등산 헤더로 통일하자". 예전의 종목 알약 · 종 · ≡ 단추는 SportHeader 로 옮겼다.
 * 3쿠션·4구 RP 카드 두 장은 2026-10-04 '내 실전 기록' 카드(RealHandicapCard)의 기록 띠로 합쳤다(오너: "중복, 통합해서 맨 위로").
 *
 * 언어 단추는 이름 줄의 오른쪽에 있다(같은 날 오너: "헤더 크기가 일정하지 않다 — 카테고리를 바꾸더라도 버튼이 고정되어 있게").
 * 머리줄에 넣으면 당구에서만 종목 전환과 종이 그만큼 밀린다 — 언어는 당구에만 있는 것(골프 · 등산은 한국어 전용)이라 당구 홈의 줄에 둔다.
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
    const [langOpen, setLangOpen] = useState(false);
    const c = SPORT_HEADER_THEME.BILLIARDS;
    return (
        <>
            {/* 화면의 옆 여백(px-5)을 벗어나 끝에서 끝까지 — 머리줄은 화면 상자의 바로 아래 자식이어야 내려 볼 때 위에 붙어 따라온다 */}
            <SportHeader sport="BILLIARDS" bleed={20} />
            <div className="flex items-center justify-between gap-3 pt-4 pb-5">
                <div className="min-w-0">
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
                {/* 언어 — 머리줄의 둥근 단추와 같은 크기 · 같은 색. 오른쪽 끝을 머리줄의 전체 메뉴 단추와 맞춘다(화면 여백 20 − 머리줄 여백 16) */}
                <button type="button" onClick={() => setLangOpen(true)} title={t("lang.title")} aria-label={t("lang.title")}
                    className="flex shrink-0 items-center justify-center rounded-full active:scale-95 transition-transform"
                    style={{ width: SPORT_HEADER_SIZE.button, height: SPORT_HEADER_SIZE.button, marginRight: SPORT_HEADER_SIZE.side - 20, background: c.iconBg, color: c.brand }} data-testid="home-lang">
                    <LucideTranslate className="h-[20px] w-[20px]" />
                </button>
            </div>
            <LanguageSheet open={langOpen} onOpenChange={setLangOpen} />
        </>
    );
};
