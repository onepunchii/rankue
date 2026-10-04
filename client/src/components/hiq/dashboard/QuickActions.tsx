/**
 * 당구 홈의 구역들(2026-10-04 오너: "빠른 실행보다 각 섹션별로 — 점수판 / 온라인게임 / 기타").
 *
 * 예전엔 '빠른 실행' 한 상자에 혼자 연습·매칭 대결·핀 참여·온라인게임·닮은 프로·매장·커뮤니티가 섞여 있었고,
 * 노란 '매칭 대결'(칼 아이콘·"실력이 맞는 상대와 1:1 랭킹 경기")이 사실은 **점수판**이라는 게 안 보였다
 * (오너: "매칭대결이라 하니 헷갈린다"). 앱이 상대를 찾아 주는 게 아니라 눈앞의 상대와 칠 점수판을 여는 버튼이고,
 * 2~4인이며 앱이 없는 상대는 이름만 넣으면 된다.
 *  - 점수판 구역: 큰 점수판 카드 + 혼자 연습 + PIN으로 합류. 세 입구가 다 같은 점수판이다(다마·전적은 맨 위 '내 실전 기록' 카드에만).
 *    공 세 개 색을 그대로 쓴다 — 혼자 연습 흰 공, 점수판 노란 공, PIN 빨간 공.
 *  - 둘러보기 구역: 매장 찾기 + 커뮤니티.
 *  - 구역 머리 오른쪽 '설명' → HomeGuideDialog(실제 점수판 사진·쓰는 법).
 * 당구 게임 구역(혼자 치기·같이 치기)은 OnlineGameCard, 내 온라인 실력은 LookalikeProCard(dashboard.tsx).
 */
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import type { RealCompareResponse } from "@shared/proCompare";
import { useLocation } from "wouter";
import { Target, LogIn, LucideMessageCircle, LucideStore, LucideInfo, LucideChevronRight } from "@/lib/icons";
import { useT } from "@/lib/i18n";
import { BallCluster } from "@/components/hiq/ui/BilliardBall";

/** 구역 머리 — 제목·한 줄 설명, 오른쪽에 '설명' 단추(또는 다른 조작) */
export function HomeSectionHeader({ title, desc, onGuide, children }: { title: string; desc?: string; onGuide?: () => void; children?: ReactNode }) {
    const { t } = useT();
    return (
        <header className="mb-3.5 flex items-end justify-between gap-3">
            <div className="min-w-0">
                <h2 className="text-[19px] font-bold tracking-tight text-ink-1">{title}</h2>
                {desc && <p className="text-[13px] font-medium text-black/55 mt-1 break-keep">{desc}</p>}
            </div>
            {onGuide && (
                <button
                    type="button"
                    onClick={onGuide}
                    className="shrink-0 h-8 pl-2 pr-3 rounded-full bg-black/[0.05] flex items-center gap-1 text-[12.5px] font-semibold text-black/60 hover:bg-black/[0.08] active:scale-95 transition-all"
                >
                    <LucideInfo className="w-4 h-4" />
                    {t("home.guideBtn")}
                </button>
            )}
            {children}
        </header>
    );
}

/**
 * 노란 점수판 카드 맨 위 **내 다마** 판(2026-10-04 오너: "점수판에 내 다마가 빠져 있다" — 다시 넣음).
 * 흰 판에 '내 다마 · 자동' 머리 + 3쿠션 | 4구 두 칸. 칸마다 공 묶음 · 숫자 · 근거 한 줄(최근 공식 n판 에버).
 * 온라인게임 '내 다마수' 카드와 같은 짜임이라 두 곳이 같은 말로 읽힌다(값은 실전 기록 — 온라인 다마와 따로).
 * 값은 '내 실전 기록' 카드와 같은 /api/hiq/compare/real(캐시 공유 — 요청이 늘지 않는다).
 * 4구 스케일(3~50)이 '150다마' 같은 말과 달라 단위는 붙이지 않는다(실전 카드 비교표의 핸디 줄과 같은 숫자).
 */
function MyDamaPanel() {
    const { t } = useT();
    const { member } = useAuth();
    const q = useQuery<RealCompareResponse>({ queryKey: ["/api/hiq/compare/real"], enabled: !!member, staleTime: 60_000, retry: false });
    const cell = (type: "3c" | "4c") => {
        const s = q.data?.[type];
        const ready = !!(s?.ready && s.handi);
        return (
            <div className="flex-1 min-w-0 px-3.5 pt-2 pb-3">
                <div className="flex items-center gap-1.5">
                    <BallCluster colors={type === "3c" ? ["white", "yellow", "red"] : ["white", "yellow", "red", "red"]} size={15} />
                    <span className="text-[12.5px] font-bold text-[#5B4A1E]">{t(type === "3c" ? "real.tab3c" : "real.tab4c")}</span>
                </div>
                <span className={`block mt-1.5 text-[28px] leading-none font-bold tabular-nums tracking-tight ${ready ? "text-[#141414]" : "text-[#D9CFB5]"}`}>
                    {ready ? s!.handi : "—"}
                </span>
                <span className="block mt-1.5 text-[11.5px] leading-snug font-semibold text-[#8A7A55] truncate">
                    {!s ? "\u00a0"
                        : ready && s.handiAvg != null
                            ? t("sim.entry.handicapAvg").replace("{n}", String(Math.min(s.games, 10))).replace("{avg}", s.handiAvg.toFixed(3))
                            : t("home.damaNeed").replace("{n}", String(Math.max(1, s.needed - s.games)))}
                </span>
            </div>
        );
    };
    return (
        <div className="rounded-2xl bg-[#ffffff] shadow-[0_2px_10px_rgba(122,86,0,0.18)]">
            <div className="flex items-center justify-between gap-2 px-3.5 pt-2.5">
                <span className="text-[13px] font-bold text-[#7A5600]">{t("home.damaTitle")}</span>
                <span className="text-[11px] font-semibold text-[#9A8A66]">{t("sim.entry.handicapAuto")}</span>
            </div>
            <div className="flex divide-x divide-[#F1E7CD]">
                {cell("3c")}
                {cell("4c")}
            </div>
        </div>
    );
}

/** 점수판 구역의 입구 셋 — 큰 점수판 카드 + 혼자 연습 + PIN으로 합류 */
export function ScoreboardActions({ onStartGame, onJoinGame }: { onStartGame: (mode: "practice" | "match") => void; onJoinGame: () => void }) {
    const { t } = useT();
    return (
        <div className="grid grid-cols-2 gap-3">
            {/* 점수판 — 노란 공. 글씨는 흰색(2026-09-08 오너).
                맨 위 내 다마(오너 10/4 "점수판에 내 다마가 빠져 있다") · 이름 · 한 줄 설명 · 꽉 찬 '경기 시작'. */}
            <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => onStartGame("match")}
                className="col-span-2 rounded-3xl bg-[#F5B721] p-4 pb-5 text-left shadow-[0_8px_24px_rgba(245,183,33,0.35)] transition-colors hover:bg-[#F0B01A]"
            >
                <MyDamaPanel />
                <span className="block mt-4 px-1 text-[22px] font-bold text-white leading-tight">{t("quickActions.matchTitle")}</span>
                <span className="block mt-1 px-1 text-[13px] font-medium text-white/90 leading-snug break-keep">
                    {t("quickActions.matchDescLine1")} · {t("quickActions.matchDescLine2")}
                </span>
                <span className="ml-1 mt-2.5 inline-flex items-center h-6 px-2.5 rounded-full bg-black/[0.14] text-[11.5px] font-semibold text-white">
                    {t("quickActions.matchChip")}
                </span>
                <span className="mt-4 h-12 w-full rounded-full bg-[#ffffff] text-[15px] font-bold text-[#7A5600] flex items-center justify-center gap-1 shadow-[0_2px_8px_rgba(122,86,0,0.16)]">
                    {t("quickActions.matchCta")}
                    <LucideChevronRight className="w-4 h-4" />
                </span>
            </motion.button>

            {/* 혼자 연습 — 흰 공 */}
            <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => onStartGame("practice")}
                className="h-[120px] rounded-3xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] flex flex-col justify-between p-[18px] text-left transition-colors hover:bg-black/[0.015]"
            >
                <div className="w-10 h-10 rounded-2xl bg-brand/10 flex items-center justify-center">
                    <Target className="w-[21px] h-[21px] text-brand" strokeWidth={2} />
                </div>
                <div>
                    <span className="block text-[15px] font-semibold text-ink-1 leading-tight">{t("quickActions.practiceTitle")}</span>
                    <span className="block text-[12.5px] font-medium text-black/50 mt-0.5">{t("quickActions.practiceDesc")}</span>
                </div>
            </motion.button>

            {/* PIN으로 합류 — 빨간 공 */}
            <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={onJoinGame}
                className="h-[120px] rounded-3xl bg-[#E02D2D] flex flex-col justify-between p-[18px] text-left shadow-[0_4px_14px_rgba(224,45,45,0.35)] transition-colors hover:bg-[#D42828]"
            >
                <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center">
                    <LogIn className="w-[21px] h-[21px] text-white" strokeWidth={2} />
                </div>
                <div>
                    <span className="block text-[15px] font-semibold text-white leading-tight">{t("quickActions.pinTitle")}</span>
                    <span className="block text-[12.5px] font-medium text-white/80 mt-0.5">{t("quickActions.pinDesc")}</span>
                </div>
            </motion.button>
        </div>
    );
}

/** 둘러보기 구역 — 매장 찾기 + 커뮤니티 */
export function ExploreActions() {
    const { t } = useT();
    const [, setLocation] = useLocation();
    const items = [
        { to: "/stores", Icon: LucideStore, title: t("quickActions.storeTitle"), desc: t("quickActions.storeDesc") },
        { to: "/community", Icon: LucideMessageCircle, title: t("quickActions.communityTitle"), desc: t("quickActions.communityDesc") },
    ];
    return (
        <div className="grid grid-cols-2 gap-3">
            {items.map(({ to, Icon, title, desc }) => (
                <motion.button
                    key={to}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setLocation(to)}
                    className="h-[120px] rounded-3xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] flex flex-col justify-between p-[18px] text-left transition-colors hover:bg-black/[0.015]"
                >
                    <div className="w-10 h-10 rounded-2xl bg-brand/10 flex items-center justify-center">
                        <Icon className="w-[21px] h-[21px] text-brand" strokeWidth={2} />
                    </div>
                    <div>
                        <span className="block text-[15px] font-semibold text-ink-1 leading-tight">{title}</span>
                        <span className="block text-[12.5px] font-medium text-black/50 mt-0.5 truncate">{desc}</span>
                    </div>
                </motion.button>
            ))}
        </div>
    );
}
