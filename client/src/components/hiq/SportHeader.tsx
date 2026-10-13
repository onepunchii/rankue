/**
 * 세 종목이 같이 쓰는 홈 머리줄(2026-10-13 오너: "헤더가 다 따로따로잖아 — 등산 헤더로 통일하자 · 왼쪽은 '랭큐 등산' 대신 2번 로고 ·
 * 종목마다 색 — 등산은 살구색, 골프는 주황색, 당구는 녹색").
 *
 * 한 줄: [rankue 워드마크] ······ [당구 | 골프 | 등산] [알림 또는 로그인] [전체 메뉴]
 *
 * **치수는 종목과 상관없이 하나다**(같은 날 오너: "헤더 크기가 일정하지 않다 — 카테고리를 바꾸더라도 이질감 없이 버튼이 고정되어 있는
 * 깔끔함 · 등산의 헤더가 제일 마음에 든다"). 등산의 것을 그대로 기준으로 삼았다: 화면 맨 위에 붙는 높이 56 의 띠, 옆 여백 16,
 * 워드마크 높이 13, 알약 높이 32 · 옆 여백 10, 둥근 단추 34, 사이 4. 종목에 따라 바뀌는 것은 색뿐이다 — 조건에 따라 크기를 줄이는 가지를 두지 않는다.
 *  - 그래서 당구에만 있는 언어 단추는 이 줄에 없다. 줄에 넣으면 종목 전환과 종이 그만큼 밀린다(어긋남의 원인이었다) —
 *    당구 홈의 이름 줄 오른쪽에 놓는다(dashboard/DashboardHeader).
 *  - 워드마크는 그림 한 장(client/public/brand/rankue-wordmark.png — 글자 모양만 남긴 투명 그림)에 종목의 색을 입힌다(mask).
 *  - 종목 전환은 그 사람이 볼 수 있는 종목만: 골프(useGolfVisible) · 등산(useHikingAccess)은 **한국어 화면에서만** 열린다 —
 *    다른 언어에서는 당구 하나뿐이라 전환 자리를 그리지 않는다.
 *  - 비로그인: 알림은 회원의 것이라 종 자리에 '로그인' 단추(알림 수도 부르지 않는다).
 * 색은 전부 리터럴이다 — 골프 테마는 bg-white · text-black 같은 유틸의 색을 바꿔 끼우므로(index.css) 유틸로 색을 주면 뒤집힌다.
 *
 * 놓는 법: 화면 맨 위에 붙어 따라온다(sticky). 홈의 바탕 상자에 옆 · 위 여백이 있으면 그만큼을 bleed · lift 로 알려 준다 —
 * 띠가 그 여백을 벗어나 화면 끝에서 끝까지, 맨 위부터 놓인다(당구 px-5 → bleed 20, 골프 p-6 → bleed 24 · lift 24, 등산은 0).
 * 아이폰 앱의 상태바: #root 가 이미 그만큼 내려와 있으므로(index.css) 띠를 그만큼 끌어올리고 같은 만큼 안쪽 여백을 준다 —
 * 맨 위에서도, 내려 본 뒤에도 줄은 상태바 바로 밑이고 띠의 색이 상태바 밑까지 이어진다(rk-no-safe: 전역 규칙이 한 번 더 밀지 않게).
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { LucideBell, LucideMenu } from "@/lib/icons";
import { NotificationInbox, UNREAD_COUNT_KEY } from "@/components/hiq/menu/NotificationInbox";
import { goLogin } from "@/components/hiq/LoginGate";
import { useAuth } from "@/hooks/useAuth";
import { useGolfVisible } from "@/hooks/useGolfAccess";
import { useHikingAccess } from "@/hooks/useHikingAccess";
import { useSport } from "@/contexts/SportContext";
import { useT } from "@/lib/i18n";

export type HeaderSport = "BILLIARDS" | "GOLF" | "HIKING";

/** 종목의 색 — 워드마크 · 고른 종목의 알약(당구 녹색 · 골프 주황 · 등산 살구) */
export const SPORT_HEADER_THEME: Readonly<Record<HeaderSport, { brand: string; onBrand: string; text: string; soft: string; pill: string; iconBg: string; bar: string; ring: string; line: string }>> = {
    BILLIARDS: { brand: "#006241", onBrand: "#FFFFFF", text: "#1A1A1A", soft: "#1A1A1A99", pill: "#0000000D", iconBg: "#0062411A", bar: "#F2F0EB", ring: "#F2F0EB", line: "#0000000F" },
    GOLF: { brand: "#FF6B00", onBrand: "#1A0A00", text: "#FFFFFF", soft: "#FFFFFFB3", pill: "#FFFFFF14", iconBg: "#FFFFFF0F", bar: "#0A0A0A", ring: "#0A0A0A", line: "#FFFFFF14" },
    HIKING: { brand: "#F28C6A", onBrand: "#2A1208", text: "#F4EFE3", soft: "#F4EFE3B3", pill: "#FFFFFF0F", iconBg: "#FFFFFF0F", bar: "#0B1F26", ring: "#0B1F26", line: "#FFFFFF14" },
};

/** rankue 워드마크 — 글자 모양의 그림에 색을 입힌다. 높이를 주면 너비는 비율대로 */
export function RankueWordmark({ color, height = 15, className }: { color: string; height?: number; className?: string }) {
    const mask = "url(/brand/rankue-wordmark.png)";
    return (
        <span role="img" aria-label="rankue" className={`block shrink-0 ${className ?? ""}`} data-testid="rankue-wordmark"
            style={{ height, aspectRatio: "1026 / 168", backgroundColor: color, WebkitMaskImage: mask, maskImage: mask, WebkitMaskSize: "contain", maskSize: "contain", WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat", WebkitMaskPosition: "left center", maskPosition: "left center" }} />
    );
}

/** 머리줄의 치수 — 세 종목이 같은 값을 쓴다(바꾸면 셋이 같이 바뀐다) */
export const SPORT_HEADER_SIZE = { row: 56, side: 16, wordmark: 13, pill: 32, button: 34, gap: 4 } as const;

export function SportHeader({ sport, bleed = 0, lift = 0, className }: { sport: HeaderSport; /** 홈 바탕 상자의 옆 여백(px) */ bleed?: number; /** 홈 바탕 상자의 윗여백(px) */ lift?: number; className?: string }) {
    const { t } = useT();
    const { setSport } = useSport();
    const [, setLocation] = useLocation();
    const { member, isGuest } = useAuth();
    const golfVisible = useGolfVisible();
    const hikingOk = useHikingAccess();
    const [notifOpen, setNotifOpen] = useState(false);
    // 숫자 하나만 받는다(목록이 아니다). 종목을 붙여야 그 종목의 알림이 세어진다. 비로그인은 부르지 않는다 — 401 만 쌓인다.
    const { data: notifCount } = useQuery<{ unread: number }>({ queryKey: [UNREAD_COUNT_KEY, { sport }], refetchInterval: 60_000, staleTime: 30_000, enabled: !!member });
    const unread = notifCount?.unread || 0;
    const c = SPORT_HEADER_THEME[sport];
    const z = SPORT_HEADER_SIZE;

    // 볼 수 있는 종목만 — 하나뿐이면 전환 자리를 그리지 않는다
    const sports: { id: HeaderSport; label: string }[] = [
        { id: "BILLIARDS", label: t("dashboardHeader.billiardsMode") },
        ...(golfVisible || sport === "GOLF" ? [{ id: "GOLF" as const, label: t("dashboardHeader.golfMode") }] : []),
        ...(hikingOk || sport === "HIKING" ? [{ id: "HIKING" as const, label: "등산" }] : []),
    ];
    const icon = "flex shrink-0 items-center justify-center rounded-full active:scale-95 transition-transform";
    const iconSize = { width: z.button, height: z.button };
    const iconColor = sport === "BILLIARDS" ? c.brand : c.text;

    return (
        <>
            <header className={`rk-no-safe sticky top-0 z-40 backdrop-blur-md ${className ?? ""}`}
                style={{
                    background: `${c.bar}E6`, borderBottom: `1px solid ${c.line}`,
                    marginLeft: -bleed, marginRight: -bleed,
                    marginTop: `calc(${-lift}px - env(safe-area-inset-top, 0px))`, paddingTop: "env(safe-area-inset-top, 0px)",
                }}
                data-testid="sport-header" data-sport-header={sport}>
                <div className={`flex items-center ${sport === "HIKING" ? "mx-auto max-w-[720px]" : ""}`} style={{ height: z.row, paddingLeft: z.side, paddingRight: z.side, gap: z.gap }}>
                    <RankueWordmark color={c.brand} height={z.wordmark} />
                    <span className="min-w-0 flex-1" />
                    {sports.length > 1 && (
                        <div className="flex shrink-0 items-center rounded-full p-[3px]" style={{ background: c.pill }} role="group" aria-label="종목 바꾸기" data-testid="sport-switch">
                            {sports.map((s) => (s.id === sport ? (
                                <span key={s.id} className="flex items-center rounded-full px-2.5 text-[13px] font-semibold" style={{ height: z.pill, background: c.brand, color: c.onBrand }} aria-current="true">{s.label}</span>
                            ) : (
                                // 고른 것과 같은 굵기의 자리를 미리 잡아 둔다(보이지 않는 겹 글자) — 종목을 바꿔도 알약의 폭이 달라지지 않는다
                                <button key={s.id} type="button" onClick={() => setSport(s.id)} className="relative rounded-full px-2.5 text-[13px] active:opacity-70" style={{ height: z.pill, color: c.soft }}
                                    data-testid={`sport-to-${s.id.toLowerCase()}`}>
                                    <span className="invisible font-semibold" aria-hidden>{s.label}</span>
                                    <span className="absolute inset-0 flex items-center justify-center">{s.label}</span>
                                </button>
                            )))}
                        </div>
                    )}
                    {isGuest ? (
                        // 알림 종 자리에 로그인 — 끝나면 지금 보던 홈으로 돌아온다(goLogin 이 지금 주소를 기억한다)
                        <button type="button" onClick={() => goLogin(setLocation)} className="shrink-0 rounded-full px-3 text-[13.5px] font-semibold active:scale-95 transition-transform" style={{ height: z.button, background: c.iconBg, color: iconColor }} data-testid="sport-header-login">
                            {sport === "BILLIARDS" ? t("guestHome.login") : "로그인"}
                        </button>
                    ) : (
                        <button type="button" onClick={() => setNotifOpen(true)} title={t("dashboardHeader.notifications")} aria-label={unread > 0 ? `${t("dashboardHeader.notifications")} ${unread}` : t("dashboardHeader.notifications")}
                            className={`relative ${icon}`} style={{ ...iconSize, background: c.iconBg, color: iconColor }} data-testid={sport === "HIKING" ? "hk-home-bell" : "sport-header-bell"}>
                            <LucideBell className="h-[20px] w-[20px]" />
                            {unread > 0 && <span className="absolute right-[7px] top-[7px] h-2.5 w-2.5 rounded-full" style={{ background: sport === "HIKING" ? c.brand : "#EF4444", boxShadow: `0 0 0 2px ${c.ring}` }} aria-hidden />}
                        </button>
                    )}
                    <button type="button" onClick={() => setLocation("/menu")} title={t("dashboardHeader.menu")} aria-label={t("dashboardHeader.menu")} className={icon} style={{ ...iconSize, background: c.iconBg, color: iconColor }} data-testid="sport-header-menu">
                        <LucideMenu className="h-[20px] w-[20px]" />
                    </button>
                </div>
            </header>
            {/* 알림함은 회원에게만 붙인다 — 방문자에게는 열 단추가 없다. 띠 밖에 둔다(띠의 흐림 효과가 고정 요소의 기준 상자가 된다) */}
            {!isGuest && <NotificationInbox open={notifOpen} onClose={() => setNotifOpen(false)} />}
        </>
    );
}

export default SportHeader;
