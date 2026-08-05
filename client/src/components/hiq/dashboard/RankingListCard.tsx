import { useState } from "react";
import { HiqMember } from "@shared/schema";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { LucideTrophy, LucideTrendingUp, LucideInfo } from "@/lib/icons";
import { motion, AnimatePresence } from "framer-motion";

interface RankingListCardProps {
    rankings: HiqMember[] | undefined;
    activeTab: '3c' | '4c';
    onTabChange: (type: '3c' | '4c') => void;
    currentMemberId: number | string;
    // 대시보드 랭킹 섹션(세계|매장 토글)이 제목을 대신 그릴 때 자체 헤더 생략 —
    // 3c/4c 스위치만 우측 정렬로 남긴다
    hideHeader?: boolean;
}

// 평균은 소스에 따라 2자리("0.43")로 오기도 해서 표시만 3자리로 통일한다.
const formatAvg = (value: unknown) => {
    const n = parseFloat(String(value ?? ""));
    return isNaN(n) ? "0.000" : n.toFixed(3);
};

export const RankingListCard = ({ rankings, activeTab, onTabChange, currentMemberId, hideHeader }: RankingListCardProps) => {
    const { t } = useT();

    // Sort logic (just in case API didn't sort, though it should)
    // 3c -> rating3c desc, 4c -> rating4c desc
    const sortedRankings = rankings ? [...rankings].sort((a, b) => {
        const field = activeTab === '3c' ? 'rating3c' : 'rating4c';
        return ((b[field] || 0) - (a[field] || 0));
    }) : [];

    // rating 컬럼은 notNull default 0이라 `!== undefined`로는 아무도 걸러지지 않았고,
    // 0 RP 회원과 익명화된 탈퇴회원까지 대시보드 랭킹에 노출됐다.
    // 랭킹 페이지(/ranking)와 같은 기준(> 0)으로 맞추고 탈퇴회원도 뺀다.
    const displayRankings = sortedRankings
        .filter(r => ((activeTab === '3c' ? r.rating3c : r.rating4c) || 0) > 0 && r.name !== "탈퇴회원")
        .slice(0, 10);

    return (
        <div className={cn("space-y-4", !hideHeader && "mb-10")}>
            {/* hideHeader(대시보드 랭킹 섹션): 헤더의 [세계|매장] 토글과 겹쳐 보이지 않게
                3쿠션/4구를 세계 카드의 부문 칩과 같은 모양·위치(좌측 칩 줄)로 그린다 */}
            {hideHeader ? (
                <div className="flex gap-1.5">
                    {(["3c", "4c"] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => onTabChange(tab)}
                            className={cn(
                                "h-8 px-3 rounded-full text-[12.5px] font-semibold transition-colors",
                                activeTab === tab ? "bg-ink-1 text-white" : "bg-white text-ink-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                            )}
                        >
                            {t(tab === "3c" ? "rankingListCard.tab3c" : "rankingListCard.tab4c")}
                        </button>
                    ))}
                </div>
            ) : (
            <header className="mb-2 flex items-end justify-between">
                <div>
                    <h2 className="text-[19px] font-bold tracking-tight text-ink-1">{t("rankingListCard.title")}</h2>
                    <p className="text-black/55 text-[13px] mt-1 flex items-center gap-1.5 font-medium">
                        <LucideTrophy className="w-3.5 h-3.5 text-[#cba258]" /> {t("rankingListCard.subtitle")}
                    </p>
                </div>

                {/* Segmented switch — solid green active pill on a light green track */}
                <div className="flex bg-brand/[0.08] p-1 rounded-full relative h-9">
                    <div className={cn(
                        "absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full bg-brand transition-all duration-300 ease-out z-0 shadow-[0_1px_3px_rgba(0,98,65,0.25)]",
                        activeTab === '3c' ? "left-1" : "left-[calc(50%+2px)]"
                    )} />
                    <button
                        onClick={() => onTabChange('3c')}
                        className={cn("px-3.5 rounded-full text-[13px] font-bold relative z-10 transition-colors", activeTab === '3c' ? "text-white" : "text-brand/60")}
                    >{t("rankingListCard.tab3c")}</button>
                    <button
                        onClick={() => onTabChange('4c')}
                        className={cn("px-3.5 rounded-full text-[13px] font-bold relative z-10 transition-colors", activeTab === '4c' ? "text-white" : "text-brand/60")}
                    >{t("rankingListCard.tab4c")}</button>
                </div>
            </header>
            )}

            <div className="flex flex-col gap-2">
                <AnimatePresence mode="popLayout">
                    {displayRankings.map((member, idx) => {
                        const isMe = String(member.id) === String(currentMemberId);
                        const rank = idx + 1;
                        const rp = activeTab === '3c' ? member.rating3c : member.rating4c;
                        return (
                            <motion.div
                                key={member.id}
                                layoutId={member.id.toString()}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 10 }}
                                transition={{ duration: 0.2, delay: idx * 0.05 }}
                                className={cn(
                                    "flex items-center gap-3 px-3.5 py-2.5 rounded-2xl transition-colors",
                                    isMe ? "bg-brand/[0.12]" : "bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                                )}
                            >
                                {/* Rank — only #1 gets a gold badge; the rest are clean numerals */}
                                <div className="w-8 flex justify-center shrink-0">
                                    {rank === 1 ? (
                                        <div className="w-8 h-8 rounded-full bg-[#cba258] flex items-center justify-center font-bold text-[15px] tabular-nums text-white shadow-[0_1px_3px_rgba(203,162,88,0.4)]">
                                            1
                                        </div>
                                    ) : (
                                        <span className={cn("font-bold text-[16px] tabular-nums", isMe ? "text-brand" : "text-black/45")}>{rank}</span>
                                    )}
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <span className={cn("font-semibold text-[15px] truncate", isMe ? "text-brand" : "text-ink-1")}>
                                            {member.name}
                                        </span>
                                        {isMe && <span className="shrink-0 px-1.5 py-px rounded-full text-[11px] font-bold text-white bg-brand">{t("rankingListCard.me")}</span>}
                                    </div>
                                    <span className="block text-[12px] font-medium text-black/40 tabular-nums mt-0.5">{t("rankingListCard.avgPrefix")} {formatAvg(member.average)}</span>
                                </div>

                                {/* Score (RP) */}
                                <div className="flex items-baseline gap-1 shrink-0">
                                    <span className="font-bold text-[19px] tabular-nums tracking-tight text-brand">
                                        {rp || 0}
                                    </span>
                                    <span className="text-[12px] font-semibold text-brand/50">RP</span>
                                </div>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>

                {displayRankings.length === 0 && (
                    <div className="py-12 text-center text-black/40 text-[14px] font-medium">
                        {t("rankingListCard.empty")}
                    </div>
                )}
            </div>
        </div>
    );
};
