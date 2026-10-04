/**
 * 홈 구역 '설명' 창(2026-10-04 오너: "설명 버튼을 누르면 그 기능이 어떤 건지 — 점수판이면 점수판 이미지가 떠서 미리 알 수 있게").
 *
 * 점수판: 실제 점수판 화면 사진(/img/guide/scoreboard.webp — 로컬 Vite 에 가짜 경기 응답을 끼워 찍은 진짜 화면, 운영 DB 무관)
 *   + 쓰는 법 다섯 줄(누르는 자리까지 실제 동작과 같게: 내 칸 위 +1·아래 −1, 상대 칸 = 차례 넘김 — useGameScore.handleCardTap)
 *   + 같은 점수판의 다른 입구(혼자 연습·PIN으로 합류)와 기록이 이어지는 곳(전적·실전 핸디).
 * 당구 게임: 홈 혼자 치기 카드와 같은 초록 다이 그림 + 혼자 치기·같이 치기·닮은 프로. 둘러보기: 매장 찾기·커뮤니티.
 * 예전 '게임 모드 안내'(빠른 실행 머리의 ?)를 대신한다.
 */
import type { ComponentType, ReactNode } from "react";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Target, LogIn, LucideTrophy, LucideStore, LucideMessageCircle, GameController, LucideUsers, LucideMedal, LucideX } from "@/lib/icons";
import { useT } from "@/lib/i18n";

export type HomeGuideTopic = "scoreboard" | "online" | "explore";

function Row({ Icon, tone, title, children }: { Icon: ComponentType<{ className?: string }>; tone: "brand" | "red" | "gold"; title: string; children: ReactNode }) {
    const chip = tone === "red" ? "bg-[#E02D2D] text-white" : tone === "gold" ? "bg-[#cba258]/20 text-[#8a6a1f]" : "bg-brand/10 text-brand";
    return (
        <div className="flex gap-3 p-3.5 rounded-2xl bg-black/[0.03]">
            <span className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center ${chip}`}>
                <Icon className="w-5 h-5" />
            </span>
            <div className="min-w-0 pt-0.5">
                <span className="block text-[14.5px] font-bold text-ink-1">{title}</span>
                <p className="text-[12.5px] font-medium text-black/55 mt-0.5 leading-relaxed break-keep">{children}</p>
            </div>
        </div>
    );
}

export function HomeGuideDialog({ topic, onClose, onStartGame, onJoinGame }: {
    topic: HomeGuideTopic | null;
    onClose: () => void;
    onStartGame: (mode: "practice" | "match") => void;
    onJoinGame: () => void;
}) {
    const { t } = useT();
    const [, setLocation] = useLocation();
    const go = (fn: () => void) => { onClose(); fn(); };

    const head = topic === "online"
        ? { title: t("home.secOnline"), lead: t("guide.onlineLead") }
        : topic === "explore"
            ? { title: t("home.secExplore"), lead: t("guide.exploreLead") }
            : { title: t("home.secScoreboard"), lead: t("guide.scoreboardLead") };

    const steps = ["guide.scoreboardStep1", "guide.scoreboardStep2", "guide.scoreboardStep3", "guide.scoreboardStep4", "guide.scoreboardStep5"];

    return (
        <Dialog open={!!topic} onOpenChange={(v) => { if (!v) onClose(); }}>
            <DialogContent hideClose className="bg-white text-ink-1 max-w-md w-[92%] rounded-[28px] p-0 overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.18)] focus:outline-none">
                <div className="max-h-[86vh] overflow-y-auto overscroll-contain px-6 pt-6 pb-5">
                    <DialogHeader className="mb-4 pr-10 text-left">
                        <DialogTitle className="text-[21px] font-bold tracking-tight text-ink-1">{head.title}</DialogTitle>
                        <DialogDescription className="text-[13.5px] font-medium text-black/55 mt-1 leading-relaxed break-keep">{head.lead}</DialogDescription>
                    </DialogHeader>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={t("quickActions.close")}
                        className="absolute top-5 right-5 w-9 h-9 rounded-full bg-black/[0.04] flex items-center justify-center hover:bg-black/[0.08] transition-colors"
                    >
                        <LucideX className="w-[18px] h-[18px] text-black/45" />
                    </button>

                    {topic === "scoreboard" && (
                        <>
                            <figure>
                                <img
                                    src="/img/guide/scoreboard.webp"
                                    width={1200}
                                    height={555}
                                    alt={t("guide.scoreboardCaption")}
                                    className="w-full h-auto rounded-2xl bg-[#E7E5E0] shadow-[0_0_0_1px_rgba(0,0,0,0.06)]"
                                />
                                <figcaption className="mt-2 text-center text-[12px] font-medium text-black/45">{t("guide.scoreboardCaption")}</figcaption>
                            </figure>

                            <ol className="mt-4 space-y-2.5">
                                {steps.map((k, i) => (
                                    <li key={k} className="flex gap-3">
                                        <span className="w-6 h-6 shrink-0 rounded-full bg-[#F5B721] text-white text-[12.5px] font-bold tabular-nums flex items-center justify-center">{i + 1}</span>
                                        <span className="pt-0.5 text-[13.5px] font-medium text-ink-1 leading-snug break-keep">{t(k)}</span>
                                    </li>
                                ))}
                            </ol>

                            <div className="mt-5 space-y-2">
                                <Row Icon={Target} tone="brand" title={t("quickActions.practiceTitle")}>{t("guide.practiceLine")}</Row>
                                <Row Icon={LogIn} tone="red" title={t("quickActions.pinTitle")}>{t("guide.pinLine")}</Row>
                                <Row Icon={LucideTrophy} tone="gold" title={t("guide.recordsTitle")}>{t("guide.recordsLine")}</Row>
                            </div>

                            <div className="mt-5 grid grid-cols-[1fr_auto] gap-2">
                                <button
                                    type="button"
                                    onClick={() => go(() => onStartGame("match"))}
                                    className="h-12 rounded-full bg-brand text-white text-[15px] font-bold active:scale-[0.98] transition-transform"
                                >
                                    {t("quickActions.matchCta")}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => go(onJoinGame)}
                                    className="h-12 px-5 rounded-full bg-black/[0.05] text-ink-1 text-[14px] font-semibold active:scale-[0.98] transition-transform"
                                >
                                    {t("quickActions.pinTitle")}
                                </button>
                            </div>
                        </>
                    )}

                    {topic === "online" && (
                        <>
                            <figure>
                                <img
                                    src="/img/guide/online.webp"
                                    width={1200}
                                    height={535}
                                    alt={t("home.secOnline")}
                                    className="w-full h-auto rounded-2xl bg-[#142219]"
                                />
                            </figure>
                            <div className="mt-4 space-y-2">
                                <Row Icon={GameController} tone="brand" title={t("guide.onlineSolo").split(" — ")[0]}>{t("guide.onlineSolo").split(" — ")[1] ?? ""}</Row>
                                <Row Icon={LucideUsers} tone="brand" title={t("guide.onlineRooms").split(" — ")[0]}>{t("guide.onlineRooms").split(" — ")[1] ?? ""}</Row>
                                <Row Icon={LucideMedal} tone="gold" title={t("guide.onlinePro").split(" — ")[0]}>{t("guide.onlinePro").split(" — ")[1] ?? ""}</Row>
                            </div>
                            <button
                                type="button"
                                onClick={() => go(() => setLocation("/online-game"))}
                                className="mt-5 w-full h-12 rounded-full bg-brand text-white text-[15px] font-bold active:scale-[0.98] transition-transform"
                            >
                                {t("guide.onlineCta")}
                            </button>
                        </>
                    )}

                    {topic === "explore" && (
                        <div className="space-y-2">
                            {([
                                { to: "/stores", Icon: LucideStore, title: t("quickActions.storeTitle"), desc: t("quickActions.guideStoreDesc") },
                                { to: "/community", Icon: LucideMessageCircle, title: t("quickActions.communityTitle"), desc: t("quickActions.guideCommunityDesc") },
                            ]).map(({ to, Icon, title, desc }) => (
                                <button key={to} type="button" onClick={() => go(() => setLocation(to))} className="w-full text-left">
                                    <Row Icon={Icon} tone="brand" title={title}>
                                        {desc} <span className="font-semibold text-brand whitespace-nowrap">{t("guide.go")} →</span>
                                    </Row>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
