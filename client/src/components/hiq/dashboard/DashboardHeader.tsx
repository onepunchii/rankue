import { ChevronsUp, HelpCircle, Bell, LucideMenu, LucideChevronDown, LucideTranslate } from "@/lib/icons";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { BallCluster } from "../ui/BilliardBall";
import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { LanguageSheet } from "@/components/hiq/LanguageSheet";
import { useGolfAccess } from "@/hooks/useGolfAccess";
import { NotificationInbox, UNREAD_COUNT_KEY } from "@/components/hiq/menu/NotificationInbox";
import { useT } from "@/lib/i18n";
import { useSport } from "@/contexts/SportContext";

interface DashboardHeaderProps {
    member: any;
    onOpenRpGuide: () => void;
    liveAvg3c: string;
    liveAvg4c: string;
    getPercentile: (type: '3c' | '4c') => number | null;
    getTrend: () => { label: string, color: string, icon: React.ReactNode };
    tier: { label: string, class: string, icon: string };
}

export const DashboardHeader = ({
    member,
    onOpenRpGuide,
    liveAvg3c,
    liveAvg4c,
    getPercentile,
    getTrend,
    tier
}: DashboardHeaderProps) => {
    const { t } = useT();
    const { currentSport, setSport } = useSport();
    const pct3c = getPercentile('3c');
    const trend = getTrend();
    const [, setLocation] = useLocation();
    const [notifOpen, setNotifOpen] = useState(false);
    const [langOpen, setLangOpen] = useState(false);
    const golfOk = useGolfAccess();
    // 숫자 하나만 받는다 — 예전엔 목록 전량을 받아 세느라 오너 계정에서 330KB 가 오갔다(2026-09-23).
    // 캐시 키 앞자리가 목록("/api/hiq/notifications")과 달라야 목록 무효화에 딸려가지 않는다.
    const { data: notifCount } = useQuery<{ unread: number }>({ queryKey: [UNREAD_COUNT_KEY, { sport: currentSport }] });
    const unread = notifCount?.unread || 0;

    return (
        <header className="pt-7 pb-2">
            {/* Top bar: greeting + profile */}
            <div className="flex items-center justify-between mb-7 gap-3">
                <div className="min-w-0">
                    {/* 종목 전환(2026-09-23 오너: "더 심플하게. 검정 배경에 흰 글자, 아이콘도 변경, '모드'는 빼고 당구·골프로").
                        색을 토큰이 아니라 **검정·흰색 그대로** 쓰는 게 의도다 — 이 알약은 제 배경의 반대색이어야 눈에 띈다.
                        당구 홈은 밝은 바탕이라 검정 알약, 골프 홈은 어두운 바탕이라 흰 알약(GolfHeader 와 짝). */}
                    {golfOk && <button
                        type="button" onClick={() => setSport("GOLF")} title={t("dashboardHeader.switchToGolf")}
                        className="inline-flex items-center gap-1 mb-2.5 h-7 pl-3 pr-2 rounded-full bg-[#0a0a0a] active:scale-95 transition-transform"
                    >
                        <span className="text-[12.5px] font-semibold text-white tracking-tight">{t("dashboardHeader.billiardsMode")}</span>
                        <LucideChevronDown className="w-3.5 h-3.5 text-[#ffffff]/55" />
                    </button>}
                    <h1 className="text-[26px] leading-none font-bold text-ink-1 tracking-tight truncate">
                        {member?.nickname || member?.name}
                        <span className="text-[15px] font-medium text-black/40 ml-1">{t("dashboardHeader.honorific")}</span>
                    </h1>
                </div>

                <div className="flex items-center gap-2 shrink-0">
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

            <NotificationInbox open={notifOpen} onClose={() => setNotifOpen(false)} />

            <LanguageSheet open={langOpen} onOpenChange={setLangOpen} />

            {/* Rating cards — clean flat white, single green accent */}
            <div className="grid grid-cols-2 gap-3">
                {/* 3-Cushion */}
                <motion.div
                    whileTap={{ scale: 0.98 }}
                    className="rounded-2xl p-5 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                >
                    <div className="flex items-start justify-between mb-3">
                        <span className="text-[14px] font-bold text-brand tracking-tight">{t("dashboardHeader.threeCushion")}</span>
                        <BallCluster colors={["white", "yellow", "red"]} size={22} />
                    </div>

                    <div className="flex items-baseline gap-1.5">
                        <span className="text-[42px] leading-[0.9] font-bold text-ink-1 tabular-nums tracking-tight">{member.rating3c || 0}</span>
                        <span className="text-[14px] font-bold text-brand">RP</span>
                        <button onClick={onOpenRpGuide} className="ml-0.5 text-brand/40 hover:text-brand transition-colors">
                            <HelpCircle className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="mt-4 flex flex-col items-start gap-2">
                        <span className="text-[12px] font-medium text-black/45 tabular-nums shrink-0">{t("dashboardHeader.average")} {liveAvg3c}</span>
                        {pct3c ? (
                            <span className="inline-flex items-center gap-0.5 px-2 py-1 rounded-full bg-brand/10 text-[12px] font-semibold text-brand">
                                <ChevronsUp className="w-3.5 h-3.5" />
                                {t("dashboardHeader.topPrefix")} {pct3c}%
                            </span>
                        ) : (
                            <span className="inline-flex items-center px-2 py-1 rounded-full bg-brand/10 text-[12px] font-semibold text-brand">
                                {t("dashboardHeader.analyzing")}
                            </span>
                        )}
                    </div>
                </motion.div>

                {/* 4-Ball */}
                <motion.div
                    whileTap={{ scale: 0.98 }}
                    className="rounded-2xl p-5 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                >
                    <div className="flex items-start justify-between mb-3">
                        <span className="text-[14px] font-bold text-ink-1 tracking-tight">{t("dashboardHeader.fourBall")}</span>
                        <BallCluster colors={["white", "yellow", "red", "red"]} size={22} />
                    </div>

                    <div className="flex items-baseline gap-1.5">
                        <span className="text-[42px] leading-[0.9] font-bold text-ink-1 tabular-nums tracking-tight">{member.rating4c || 0}</span>
                        <span className="text-[14px] font-bold text-brand">RP</span>
                        <button onClick={onOpenRpGuide} className="ml-0.5 text-brand/40 hover:text-brand transition-colors">
                            <HelpCircle className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="mt-4 flex flex-col items-start gap-2">
                        <span className="text-[12px] font-medium text-black/45 tabular-nums shrink-0">{t("dashboardHeader.average")} {liveAvg4c}</span>
                        <span className={cn(
                            "inline-flex items-center gap-0.5 px-2 py-1 rounded-full bg-brand/[0.07] text-[12px] font-semibold",
                            trend.color
                        )}>
                            {trend.icon}
                            {trend.label}
                        </span>
                    </div>
                </motion.div>
            </div>
        </header>
    );
};
