/**
 * 당구 홈의 구역들(2026-10-04 오너: "빠른 실행보다 각 섹션별로 — 점수판 / 온라인게임 / 기타").
 *
 * 예전엔 '빠른 실행' 한 상자에 혼자 연습·매칭 대결·핀 참여·온라인게임·닮은 프로·매장·커뮤니티가 섞여 있었고,
 * 노란 '매칭 대결'(칼 아이콘·"실력이 맞는 상대와 1:1 랭킹 경기")이 사실은 **점수판**이라는 게 안 보였다
 * (오너: "매칭대결이라 하니 헷갈린다"). 앱이 상대를 찾아 주는 게 아니라 눈앞의 상대와 칠 점수판을 여는 버튼이고,
 * 2~4인이며 앱이 없는 상대는 이름만 넣으면 된다.
 *  - 점수판 구역: 2026-10-24 새 홈부터 실제 점수판 모양의 ScoreboardHero(따로 둔 파일). 내 다마는 맨 위 '내 실력' 카드로.
 *  - 둘러보기 구역: 매장 찾기 + 커뮤니티.
 *  - 구역 머리 오른쪽 '설명' → HomeGuideDialog(실제 점수판 사진·쓰는 법).
 * 당구 게임 구역(혼자 치기·같이 치기)은 OnlineGameCard, 실전 · 온라인 실력은 HomeSkillCard(dashboard.tsx).
 *
 * 비로그인(2026-10-05 오너 결정: "홈을 비로그인에 다 열고, 가입 안 한 사람에겐 예시로 보여 준다") —
 * 점수판 카드의 '내 다마'는 예시 인물의 숫자 + "예시" 표시로 그린다(홈이 sample 을 넘긴다).
 * 입구 셋(경기 시작·혼자 연습·PIN 합류)을 막는 일은 여기서 하지 않는다 — 받은 onStartGame·onJoinGame 을 부를 뿐이고,
 * 홈(dashboard.tsx)의 그 두 함수가 비로그인을 가입 안내로 잇는다(설명 창·'내 실전 기록' 카드의 단추도 같은 함수를 거친다).
 */
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { LucideMessageCircle, LucideStore, LucideInfo, LucideChevronRight } from "@/lib/icons";
import { useT } from "@/lib/i18n";
import { StoreTableBanner, useStoreDots } from "@/components/hiq/stores/StoreTableMap";

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

/** 둘러보기 구역 — 매장 찾기 + 커뮤니티 */
export function ExploreActions() {
    const { t } = useT();
    const [, setLocation] = useLocation();
    // 2026-10-17: 매장 찾기는 전국 당구장 지도(가로 당구대 — StoreTableBanner)로. 지도를 못 받으면 예전 타일 둘로 돌아간다
    const { dots, isLoading } = useStoreDots();
    const map = isLoading || dots.length >= 50;
    const items = [
        ...(map ? [] : [{ to: "/stores", Icon: LucideStore, title: t("quickActions.storeTitle"), desc: t("quickActions.storeDesc") }]),
        { to: "/community", Icon: LucideMessageCircle, title: t("quickActions.communityTitle"), desc: t("quickActions.communityDesc") },
    ];
    return (
        <>
            {map && (
                <div className="mb-3">
                    <StoreTableBanner onOpen={() => setLocation("/stores")} copy={{ title: t("storeMap.title"), count: (n) => t("storeMap.count").replace("{n}", n.toLocaleString()), sub: t("storeMap.sub"), cta: t("storeMap.cta") }} />
                </div>
            )}
            <div className={map ? "grid grid-cols-1" : "grid grid-cols-2 gap-3"}>
                {items.map(({ to, Icon, title, desc }) => map ? (
                    // 지도 아래의 커뮤니티 — 한 줄 띠(지도와 키를 다투지 않게)
                    <motion.button key={to} whileTap={{ scale: 0.98 }} onClick={() => setLocation(to)}
                        className="h-[72px] rounded-3xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] flex items-center gap-3.5 px-[18px] text-left transition-colors hover:bg-black/[0.015]">
                        <div className="w-10 h-10 shrink-0 rounded-2xl bg-brand/10 flex items-center justify-center">
                            <Icon className="w-[21px] h-[21px] text-brand" strokeWidth={2} />
                        </div>
                        <div className="min-w-0 flex-1">
                            <span className="block text-[15px] font-semibold text-ink-1 leading-tight">{title}</span>
                            <span className="block text-[12.5px] font-medium text-black/50 mt-0.5 truncate">{desc}</span>
                        </div>
                        <LucideChevronRight className="w-5 h-5 shrink-0 text-black/25" aria-hidden />
                    </motion.button>
                ) : (
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
        </>
    );
}
