import { Bell, LucideMenu, LucideChevronDown, LucideTranslate } from "@/lib/icons";
import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { LanguageSheet } from "@/components/hiq/LanguageSheet";
import { useGolfVisible } from "@/hooks/useGolfAccess";
import { useAuth } from "@/hooks/useAuth";
import { goLogin } from "@/components/hiq/LoginGate";
import { NotificationInbox, UNREAD_COUNT_KEY } from "@/components/hiq/menu/NotificationInbox";
import { useT } from "@/lib/i18n";
import { useSport } from "@/contexts/SportContext";

/**
 * 당구 홈 머리 — 종목 전환 알약 · 이름 · 알림 · 언어 · 메뉴.
 * 3쿠션·4구 RP 카드 두 장은 2026-10-04 '내 실전 기록' 카드(RealHandicapCard)의 기록 띠로 합쳤다(오너: "중복, 통합해서 맨 위로").
 *
 * 비로그인(2026-10-05 오너 결정: "홈을 비로그인에 다 열고, 가입 안 한 사람에겐 예시로 보여 준다") —
 * 이름 자리는 "둘러보는 중이에요" 한 줄, 알림 종 자리는 "로그인" 단추다(알림은 회원의 것이라 수도 부르지 않는다).
 * 종목 알약은 '볼 수 있는가'(useGolfVisible)로 가른다 — 한국어 방문자도 골프 홈으로 넘어갈 수 있다. 언어·≡ 전체는 그대로.
 * 회원에게는 예전과 같은 머리다(useGolfVisible 은 회원에게 useGolfAccess 와 같은 값).
 */
interface DashboardHeaderProps {
    member: any;
}

export const DashboardHeader = ({ member }: DashboardHeaderProps) => {
    const { t } = useT();
    const { currentSport, setSport } = useSport();
    const [, setLocation] = useLocation();
    const [notifOpen, setNotifOpen] = useState(false);
    const [langOpen, setLangOpen] = useState(false);
    const golfVisible = useGolfVisible();
    const { isGuest } = useAuth();
    // 숫자 하나만 받는다 — 예전엔 목록 전량을 받아 세느라 오너 계정에서 330KB 가 오갔다(2026-09-23).
    // 캐시 키 앞자리가 목록("/api/hiq/notifications")과 달라야 목록 무효화에 딸려가지 않는다.
    // 비로그인은 부르지 않는다 — 로그인 필수라 401 만 난다.
    const { data: notifCount } = useQuery<{ unread: number }>({ queryKey: [UNREAD_COUNT_KEY, { sport: currentSport }], enabled: !!member });
    const unread = notifCount?.unread || 0;

    return (
        <header className="pt-7 pb-5">
            {/* Top bar: greeting + profile */}
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    {/* 종목 전환(2026-09-23 오너: "더 심플하게. 검정 배경에 흰 글자, 아이콘도 변경, '모드'는 빼고 당구·골프로").
                        색을 토큰이 아니라 **검정·흰색 그대로** 쓰는 게 의도다 — 이 알약은 제 배경의 반대색이어야 눈에 띈다.
                        당구 홈은 밝은 바탕이라 검정 알약, 골프 홈은 어두운 바탕이라 흰 알약(GolfHeader 와 짝). */}
                    {golfVisible && <button
                        type="button" onClick={() => setSport("GOLF")} title={t("dashboardHeader.switchToGolf")}
                        className="inline-flex items-center gap-1 mb-2.5 h-7 pl-3 pr-2 rounded-full bg-[#0a0a0a] active:scale-95 transition-transform"
                    >
                        <span className="text-[12.5px] font-semibold text-white tracking-tight">{t("dashboardHeader.billiardsMode")}</span>
                        <LucideChevronDown className="w-3.5 h-3.5 text-[#ffffff]/55" />
                    </button>}
                    {isGuest ? (
                        // 이름이 없는 방문자 — "님"만 남는 빈 인사말 대신 짧은 한 줄. 오른쪽에 단추 셋(로그인·언어·전체)이 있어 이름(26px)보다 작게 쓴다:
                        // 375px 폭에서 한 줄에 들어가는 크기이고, 더 좁으면 잘리지 않고 두 줄로 접힌다(낱말은 쪼개지 않는다).
                        <h1 className="text-[17px] leading-snug font-bold text-ink-1 tracking-tight break-keep">{t("guestHome.browsing")}</h1>
                    ) : (
                        <h1 className="text-[26px] leading-none font-bold text-ink-1 tracking-tight truncate">
                            {member?.nickname || member?.name}
                            <span className="text-[15px] font-medium text-black/40 ml-1">{t("dashboardHeader.honorific")}</span>
                        </h1>
                    )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {isGuest ? (
                        // 알림 종 자리에 로그인 — 끝나면 지금 보던 홈으로 돌아온다(goLogin 이 지금 주소를 기억한다).
                        // 옆 단추들과 같은 결(옅은 바탕 + 브랜드 글자)이다. 꽉 채운 단추는 아래 가입 안내 한 줄이 쓴다.
                        <button
                            type="button"
                            onClick={() => goLogin(setLocation)}
                            className="h-11 px-4 rounded-full bg-brand/10 text-[14px] font-bold text-brand active:scale-95 transition-transform"
                        >
                            {t("guestHome.login")}
                        </button>
                    ) : (
                        <button
                            onClick={() => setNotifOpen(true)}
                            title={t("dashboardHeader.notifications")}
                            className="relative w-11 h-11 rounded-full bg-brand/10 flex items-center justify-center active:scale-95 transition-transform"
                        >
                            <Bell className="w-[21px] h-[21px] text-brand" />
                            {unread > 0 && (
                                <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-[#f2f0eb]" />
                            )}
                        </button>
                    )}
                    {/* 언어(2026-09-22 오너): 외국인 가입이 늘어 홈에서 바로 바꾸게. 시트는 LanguageSheet.
                        아이콘은 앱 세트(Phosphor duotone)로 — 2026-09-23 오너 "언어 아이콘 퀄리티가 떨어진다".
                        이 자리만 lucide-react 에서 직접 가져와, 옆의 종·메뉴(듀오톤)와 획 굵기·채움이 달랐다. */}
                    <button
                        onClick={() => setLangOpen(true)}
                        title={t("lang.title")}
                        className="w-11 h-11 rounded-full bg-brand/10 flex items-center justify-center active:scale-95 transition-transform"
                    >
                        <LucideTranslate className="w-[21px] h-[21px] text-brand" />
                    </button>
                    {/* 전체(≡)는 여기로 올라왔다 — 하단 탭의 그 자리는 채팅이 쓴다(2026-09-21 오너) */}
                    <button
                        onClick={() => setLocation("/menu")}
                        title={t("dashboardHeader.menu")}
                        className="w-11 h-11 rounded-full bg-brand/10 flex items-center justify-center active:scale-95 transition-transform"
                    >
                        <LucideMenu className="w-[21px] h-[21px] text-brand" />
                    </button>
                </div>
            </div>

            {/* 알림함은 회원에게만 붙인다 — 방문자에게는 열 단추가 없다 */}
            {!isGuest && <NotificationInbox open={notifOpen} onClose={() => setNotifOpen(false)} />}

            <LanguageSheet open={langOpen} onOpenChange={setLangOpen} />

        </header>
    );
};
