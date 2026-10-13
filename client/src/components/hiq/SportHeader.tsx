/**
 * 세 종목이 같이 쓰는 홈 머리줄(2026-10-13 오너: "헤더가 다 따로따로잖아 — 등산 헤더로 통일하자 · 왼쪽은 '랭큐 등산' 대신 2번 로고 ·
 * 종목마다 색 — 등산은 살구색, 골프는 주황색, 당구는 녹색").
 *
 * 한 줄: [rankue 워드마크] ······ [당구 | 골프 | 등산] [알림 또는 로그인] [언어(당구만)] [전체 메뉴]
 *  - 워드마크는 그림 한 장(client/public/brand/rankue-wordmark.png — 글자 모양만 남긴 투명 그림)에 종목의 색을 입힌다(mask).
 *  - 종목 전환은 그 사람이 볼 수 있는 종목만: 골프(useGolfVisible) · 등산(useHikingAccess)은 **한국어 화면에서만** 열린다 —
 *    다른 언어에서는 당구 하나뿐이라 전환 자리를 그리지 않는다.
 *  - 언어 단추는 당구에만 있다(골프 · 등산은 한국어 전용이다).
 *  - 비로그인: 알림은 회원의 것이라 종 자리에 '로그인' 단추(알림 수도 부르지 않는다).
 * 색은 전부 리터럴이다 — 골프 테마는 bg-white · text-black 같은 유틸의 색을 바꿔 끼우므로(index.css) 유틸로 색을 주면 뒤집힌다.
 * 등산은 위에 붙어 따라오고(sticky), 당구 · 골프는 화면의 흐름 안에 놓인다(두 홈의 기존 자리 그대로).
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { LucideBell, LucideMenu, LucideTranslate } from "@/lib/icons";
import { LanguageSheet } from "@/components/hiq/LanguageSheet";
import { NotificationInbox, UNREAD_COUNT_KEY } from "@/components/hiq/menu/NotificationInbox";
import { goLogin } from "@/components/hiq/LoginGate";
import { useAuth } from "@/hooks/useAuth";
import { useGolfVisible } from "@/hooks/useGolfAccess";
import { useHikingAccess } from "@/hooks/useHikingAccess";
import { useSport } from "@/contexts/SportContext";
import { useT } from "@/lib/i18n";

export type HeaderSport = "BILLIARDS" | "GOLF" | "HIKING";

/** 종목의 색 — 워드마크 · 고른 종목의 알약(당구 녹색 · 골프 주황 · 등산 살구) */
export const SPORT_HEADER_THEME: Readonly<Record<HeaderSport, { brand: string; onBrand: string; text: string; soft: string; pill: string; iconBg: string; bar: string; ring: string }>> = {
    BILLIARDS: { brand: "#006241", onBrand: "#FFFFFF", text: "#1A1A1A", soft: "#1A1A1A99", pill: "#0000000D", iconBg: "#0062411A", bar: "#F2F0EB", ring: "#F2F0EB" },
    GOLF: { brand: "#FF6B00", onBrand: "#1A0A00", text: "#FFFFFF", soft: "#FFFFFFB3", pill: "#FFFFFF14", iconBg: "#FFFFFF0F", bar: "#0A0A0A", ring: "#0A0A0A" },
    HIKING: { brand: "#F28C6A", onBrand: "#2A1208", text: "#F4EFE3", soft: "#F4EFE3B3", pill: "#FFFFFF0F", iconBg: "#FFFFFF0F", bar: "#0B1F26", ring: "#0B1F26" },
};

/** rankue 워드마크 — 글자 모양의 그림에 색을 입힌다. 높이를 주면 너비는 비율대로 */
export function RankueWordmark({ color, height = 15, className }: { color: string; height?: number; className?: string }) {
    const mask = "url(/brand/rankue-wordmark.png)";
    return (
        <span role="img" aria-label="rankue" className={`block shrink-0 ${className ?? ""}`} data-testid="rankue-wordmark"
            style={{ height, aspectRatio: "1026 / 168", backgroundColor: color, WebkitMaskImage: mask, maskImage: mask, WebkitMaskSize: "contain", maskSize: "contain", WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat", WebkitMaskPosition: "left center", maskPosition: "left center" }} />
    );
}

export function SportHeader({ sport, className }: { sport: HeaderSport; className?: string }) {
    const { t } = useT();
    const { setSport } = useSport();
    const [, setLocation] = useLocation();
    const { member, isGuest } = useAuth();
    const golfVisible = useGolfVisible();
    const hikingOk = useHikingAccess();
    const [notifOpen, setNotifOpen] = useState(false);
    const [langOpen, setLangOpen] = useState(false);
    // 숫자 하나만 받는다(목록이 아니다). 종목을 붙여야 그 종목의 알림이 세어진다. 비로그인은 부르지 않는다 — 401 만 쌓인다.
    const { data: notifCount } = useQuery<{ unread: number }>({ queryKey: [UNREAD_COUNT_KEY, { sport }], refetchInterval: 60_000, staleTime: 30_000, enabled: !!member });
    const unread = notifCount?.unread || 0;
    const c = SPORT_HEADER_THEME[sport];

    // 볼 수 있는 종목만 — 하나뿐이면 전환 자리를 그리지 않는다
    const sports: { id: HeaderSport; label: string }[] = [
        { id: "BILLIARDS", label: t("dashboardHeader.billiardsMode") },
        ...(golfVisible || sport === "GOLF" ? [{ id: "GOLF" as const, label: t("dashboardHeader.golfMode") }] : []),
        ...(hikingOk || sport === "HIKING" ? [{ id: "HIKING" as const, label: "등산" }] : []),
    ];
    const showLang = sport === "BILLIARDS";
    // 폭 360 에서 빠듯한 때만 조금씩 줄인다 — 종목이 셋일 때, 또는 방문자의 당구 홈(로그인 단추 + 언어 단추가 같이 놓인다)
    const tight = sports.length === 3 || (isGuest && showLang && sports.length > 1);
    // 종목 알약의 옆 여백 — 종목 셋에 언어 단추까지 놓이는 당구(한국어 · 등산이 열린 회원)가 가장 빠듯하다
    const pad = sports.length === 3 && showLang ? "px-2" : tight ? "px-2.5" : "px-3";
    const icon = "flex shrink-0 items-center justify-center rounded-full active:scale-95 transition-transform";
    const iconSize = tight ? { width: 34, height: 34 } : { width: 38, height: 38 };

    return (
        <header className={`${sport === "HIKING" ? "sticky top-0 z-40 backdrop-blur-md" : "relative z-10"} ${className ?? ""}`}
            style={sport === "HIKING" ? { background: `${c.bar}E6`, borderBottom: "1px solid #FFFFFF14", paddingTop: "env(safe-area-inset-top)" } : undefined}
            data-testid="sport-header" data-sport-header={sport}>
            <div className={`mx-auto flex h-14 max-w-[720px] items-center ${tight ? "gap-1" : "gap-1.5"} ${sport === "HIKING" ? "px-4" : ""}`}>
                <RankueWordmark color={c.brand} height={tight ? 13 : 15} />
                <span className="min-w-1 flex-1" />
                {sports.length > 1 && (
                    <div className="flex shrink-0 items-center rounded-full p-[3px]" style={{ background: c.pill }} role="group" aria-label="종목 바꾸기" data-testid="sport-switch">
                        {sports.map((s) => (s.id === sport ? (
                            <span key={s.id} className={`flex h-8 items-center rounded-full ${pad} text-[13px] font-semibold`} style={{ background: c.brand, color: c.onBrand }} aria-current="true">{s.label}</span>
                        ) : (
                            <button key={s.id} type="button" onClick={() => setSport(s.id)} className={`h-8 rounded-full ${pad} text-[13px] active:opacity-70`} style={{ color: c.soft }}
                                data-testid={`sport-to-${s.id.toLowerCase()}`}>{s.label}</button>
                        )))}
                    </div>
                )}
                {isGuest ? (
                    // 알림 종 자리에 로그인 — 끝나면 지금 보던 홈으로 돌아온다(goLogin 이 지금 주소를 기억한다)
                    <button type="button" onClick={() => goLogin(setLocation)} className={`shrink-0 rounded-full ${tight ? "h-[34px] px-3" : "h-[38px] px-3.5"} text-[13.5px] font-semibold active:scale-95 transition-transform`} style={{ background: c.iconBg, color: sport === "BILLIARDS" ? c.brand : c.text }} data-testid="sport-header-login">
                        {sport === "BILLIARDS" ? t("guestHome.login") : "로그인"}
                    </button>
                ) : (
                    <button type="button" onClick={() => setNotifOpen(true)} title={t("dashboardHeader.notifications")} aria-label={unread > 0 ? `${t("dashboardHeader.notifications")} ${unread}` : t("dashboardHeader.notifications")}
                        className={`relative ${icon}`} style={{ ...iconSize, background: c.iconBg, color: sport === "BILLIARDS" ? c.brand : c.text }} data-testid={sport === "HIKING" ? "hk-home-bell" : "sport-header-bell"}>
                        <LucideBell className="h-[20px] w-[20px]" />
                        {unread > 0 && <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full" style={{ background: sport === "HIKING" ? c.brand : "#EF4444", boxShadow: `0 0 0 2px ${c.ring}` }} aria-hidden />}
                    </button>
                )}
                {showLang && (
                    // 언어는 당구에만 — 골프 · 등산은 한국어 화면에서만 열린다
                    <button type="button" onClick={() => setLangOpen(true)} title={t("lang.title")} aria-label={t("lang.title")} className={icon} style={{ ...iconSize, background: c.iconBg, color: c.brand }} data-testid="sport-header-lang">
                        <LucideTranslate className="h-[20px] w-[20px]" />
                    </button>
                )}
                <button type="button" onClick={() => setLocation("/menu")} title={t("dashboardHeader.menu")} aria-label={t("dashboardHeader.menu")} className={icon} style={{ ...iconSize, background: c.iconBg, color: sport === "BILLIARDS" ? c.brand : c.text }} data-testid="sport-header-menu">
                    <LucideMenu className="h-[20px] w-[20px]" />
                </button>
            </div>
            {/* 알림함은 회원에게만 붙인다 — 방문자에게는 열 단추가 없다 */}
            {!isGuest && <NotificationInbox open={notifOpen} onClose={() => setNotifOpen(false)} />}
            {showLang && <LanguageSheet open={langOpen} onOpenChange={setLangOpen} />}
        </header>
    );
}

export default SportHeader;
