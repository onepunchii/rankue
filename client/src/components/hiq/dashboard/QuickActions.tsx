/**
 * 당구 홈의 구역들(2026-10-04 오너: "빠른 실행보다 각 섹션별로 — 점수판 / 온라인게임 / 기타").
 *
 * 예전엔 '빠른 실행' 한 상자에 혼자 연습·매칭 대결·핀 참여·온라인게임·닮은 프로·매장·커뮤니티가 섞여 있었고,
 * 노란 '매칭 대결'(칼 아이콘·"실력이 맞는 상대와 1:1 랭킹 경기")이 사실은 **점수판**이라는 게 안 보였다
 * (오너: "매칭대결이라 하니 헷갈린다"). 앱이 상대를 찾아 주는 게 아니라 눈앞의 상대와 칠 점수판을 여는 버튼이고,
 * 2~4인이며 앱이 없는 상대는 이름만 넣으면 된다.
 *  - 점수판 구역: 큰 점수판 카드(맨 위에 내 3구·4구 다마) + 혼자 연습 + PIN으로 합류. 세 입구가 다 같은 점수판이다.
 *    공 세 개 색을 그대로 쓴다 — 혼자 연습 흰 공, 점수판 노란 공, PIN 빨간 공.
 *  - 둘러보기 구역: 매장 찾기 + 커뮤니티.
 *  - 구역 머리 오른쪽 '설명' → HomeGuideDialog(실제 점수판 사진·쓰는 법).
 * 온라인게임 구역은 OnlineGameCard·LookalikeProCard 를 그대로 쓴다(dashboard.tsx).
 */
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import type { RealCompareResponse, RealSide } from "@shared/proCompare";
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
 * 노란 점수판 카드 위의 **내 다마** 판(2026-10-04 오너 두 번: 장식 숫자 18 : 14 는 "의미가 없다 → 나와 연동되는 3구·4구 다마로",
 * 그다음 점수판 모양은 "이해가 안 간다 → 점수판 말고 내 다마를 잘 표현하는 디자인으로").
 * 흰 판에 '내 다마' 머리 + 3구 | 4구 두 칸. 칸마다 위쪽 RP 카드와 같은 공 묶음(3구 흰·노랑·빨강, 4구 + 빨강 하나)이라 종목이 바로 읽힌다.
 * 값은 아래 '내 실전 핸디' 카드와 같은 /api/hiq/compare/real 의 handi(캐시 공유 — 요청이 늘지 않는다).
 * 서버가 공식 경기 기록으로 매기는 값이라 홈 안에서 두 숫자가 어긋나지 않는다. 공식 5경기 전이면 "공식 N경기 더 치면 나와요".
 */
export function MyDamaPanel() {
    const { t } = useT();
    const { member } = useAuth();
    const q = useQuery<RealCompareResponse>({ queryKey: ["/api/hiq/compare/real"], enabled: !!member, staleTime: 60_000, retry: false });
    const d = q.data;
    const value = (s?: RealSide) => (s?.ready && s.handi ? String(s.handi) : "—");
    const cell = (type: "3c" | "4c") => {
        const s = d?.[type];
        const ready = !!(s?.ready && s.handi);
        return (
            <div className="flex-1 min-w-0 px-3.5 pt-2 pb-3">
                <div className="flex items-center gap-1.5">
                    <BallCluster colors={type === "3c" ? ["white", "yellow", "red"] : ["white", "yellow", "red", "red"]} size={15} />
                    <span className="text-[12.5px] font-bold text-[#5B4A1E]">{t(type === "3c" ? "home.mini3c" : "home.mini4c")}</span>
                </div>
                {ready ? (
                    <span className="block mt-1.5 text-[30px] leading-none font-bold tabular-nums tracking-tight text-[#141414]">{s!.handi}</span>
                ) : s ? (
                    <span className="block mt-1.5 text-[12.5px] leading-snug font-semibold text-[#8A7A55] break-keep">
                        {fill(t("home.miniNeed"), { n: Math.max(1, s.needed - s.games) })}
                    </span>
                ) : (
                    <span className="block mt-1.5 text-[30px] leading-none font-bold text-[#D9CFB5]">—</span>
                )}
            </div>
        );
    };
    return (
        <div
            role="group"
            aria-label={fill(t("home.miniAria"), { a: value(d?.["3c"]), b: value(d?.["4c"]) })}
            className="rounded-2xl bg-[#ffffff] shadow-[0_2px_10px_rgba(122,86,0,0.18)]"
        >
            <div className="flex items-center justify-between gap-2 px-3.5 pt-2.5">
                <span className="text-[13px] font-bold text-[#7A5600]">{t("home.miniMine")}</span>
                <span className="text-[11px] font-medium text-[#9A8A66] truncate">{t("home.miniBasis")}</span>
            </div>
            <div className="flex divide-x divide-[#F1E7CD]">
                {cell("3c")}
                {cell("4c")}
            </div>
        </div>
    );
}

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));

/** 점수판 구역의 입구 셋 — 큰 점수판 카드 + 혼자 연습 + PIN으로 합류 */
export function ScoreboardActions({ onStartGame, onJoinGame }: { onStartGame: (mode: "practice" | "match") => void; onJoinGame: () => void }) {
    const { t } = useT();
    return (
        <div className="grid grid-cols-2 gap-3">
            {/* 점수판 — 노란 공. 글씨는 흰색(2026-09-08 오너), 아이콘 자리에 실제 점수판을 줄인 그림 */}
            <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => onStartGame("match")}
                className="col-span-2 rounded-3xl bg-[#F5B721] p-4 pb-[18px] text-left shadow-[0_8px_24px_rgba(245,183,33,0.35)] transition-colors hover:bg-[#F0B01A]"
            >
                <MyDamaPanel />
                <div className="mt-3.5 flex items-center justify-between gap-3 px-1">
                    <span className="text-[22px] font-bold text-white leading-tight">{t("quickActions.matchTitle")}</span>
                    <span className="shrink-0 h-10 pl-4 pr-3 rounded-full bg-[#ffffff] text-[14px] font-bold text-[#7A5600] flex items-center gap-0.5 shadow-[0_2px_6px_rgba(122,86,0,0.18)]">
                        {t("quickActions.matchCta")}
                        <LucideChevronRight className="w-4 h-4" />
                    </span>
                </div>
                <span className="block px-1 mt-1 text-[13px] font-medium text-white/90 leading-snug break-keep">
                    {t("quickActions.matchDescLine1")} · {t("quickActions.matchDescLine2")}
                </span>
                <span className="ml-1 mt-2.5 inline-flex items-center h-6 px-2.5 rounded-full bg-black/[0.14] text-[11.5px] font-semibold text-white">
                    {t("quickActions.matchChip")}
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
