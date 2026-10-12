/* eslint-disable react-refresh/only-export-components */
/**
 * 배지 안내 팝업(2026-10-12 오너: "이거 누르면 팝업창으로 배지 나오면서 무슨 배지가 있고 간략하게 보여주는 팝업창 필요해 · 온라인게임 배지랑 실전 배지 다").
 * 배지를 누르면 아래에서 올라온다 — 누른 배지를 크게, 그 아래에 **어떤 배지들이 있는지** 한 줄씩.
 *
 *   openBadgeGuide({ kind: "real", game, handi })      실전 다마 메달을 눌렀을 때
 *   openBadgeGuide({ kind: "online", tier, rating })   온라인 대전 등급(방패)을 눌렀을 때
 *   openBadgeGuide({ kind: "online", dama })           온라인 다마 배지(육각)를 눌렀을 때
 *
 * 탭 둘: [실전 배지] [온라인 배지]. 누른 쪽이 먼저 열린다.
 *  - 실전: 둥근 다마 메달 여섯(브론즈 ~ 마스터) — 종목(3쿠션 · 4구)마다 다마 구간.
 *  - 온라인: 방패 일곱(아이언 ~ 마스터) — 레이팅 구간. 그 아래 '그 밖의 배지'(온라인 다마수 · 이달의 랭킹 메달 · 월대회 메달 · 달마다 받는 등급 배지).
 * 구간의 숫자는 규칙에서 읽는다(shared/badgeGuide) — 여기에 따로 적지 않는다. 표가 바뀌면 안내도 같이 바뀐다.
 *
 * 훅이 아닌 곳에서도 열 수 있게 작은 저장소를 모듈에 둔다(LoginSheet 와 같은 방식). 화면은 App 의 BadgeGuideHost 하나가 그린다.
 * 배지가 큰 단추 안에 있을 때(홈의 점수판 카드 · 온라인 대전 배너)는 BadgeTap 으로 감싼다 — 눌림이 바깥 단추로 번지지 않게 막는다.
 */
import { useState, useSyncExternalStore, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { useLocation } from "wouter";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";
import { useBackToClose } from "@/hooks/useBackToClose";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { onlineTierRanges, realTierRanges } from "@shared/badgeGuide";
import { realTierFor, type RealGame } from "@shared/realTier";
import { PLACEMENT_MATCHES, type TierId } from "@shared/sim/rank";
import { REAL_TIER_INK, RealMedal } from "@/components/hiq/RealMedal";
import { CupMedalArt } from "@/sim/cup/CupArt";
import { ONLINE_DAMA_SRC, OnlineDamaBadge } from "@/sim/entry/OnlineDamaBadge";
import { shelfPath } from "@/sim/rank/shelfApi";
import { RankMedal, TierEmblem } from "@/sim/rank/TierEmblem";

export type BadgeGuideOptions =
    | { kind: "real"; game?: RealGame; handi?: number | null }
    | { kind: "online"; tier?: TierId | null; rating?: number | null; dama?: number | null };

interface GuideState { open: boolean; opts: BadgeGuideOptions }
let state: GuideState = { open: false, opts: { kind: "real" } };
const listeners = new Set<() => void>();
const getState = () => state;
function setState(next: GuideState) { state = next; listeners.forEach((l) => l()); }
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function openBadgeGuide(opts: BadgeGuideOptions): void { setState({ open: true, opts }); }
export function closeBadgeGuide(): void { if (state.open) setState({ ...state, open: false }); }

/**
 * 배지를 누를 수 있게 감싼다. 배지가 다른 단추 안에 있어도 되게 span 으로 그리고(단추 안에 단추를 넣을 수 없다),
 * 눌림 · 키 입력이 바깥으로 번지지 않게 막는다.
 */
export function BadgeTap({ guide, children, className }: { guide: BadgeGuideOptions; children: ReactNode; className?: string }) {
    const { t } = useT();
    const open = (e: MouseEvent | KeyboardEvent) => { e.preventDefault(); e.stopPropagation(); openBadgeGuide(guide); };
    return (
        <span
            role="button" tabIndex={0} aria-label={t("badgeGuide.open")} data-testid="badge-tap" data-track-as="배지 안내 열기"
            onClick={open} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") open(e); }}
            className={cn("inline-flex shrink-0 cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand/50 active:opacity-80", className)}
        >
            {children}
        </span>
    );
}

const seg = "h-9 rounded-full text-[13px] font-bold transition-colors";

export function BadgeGuideHost() {
    const { t } = useT();
    const { member } = useAuth();
    const [, setLocation] = useLocation();
    const s = useSyncExternalStore(subscribe, getState, getState);
    useBackToClose(s.open, closeBadgeGuide);
    // 탭 · 종목은 열 때의 배지를 따른다 — 사람이 바꾸면 그 선택이 남는다(다음에 열면 다시 그 배지를 따른다)
    const [pick, setPick] = useState<{ for: BadgeGuideOptions; tab?: "real" | "online"; game?: RealGame }>({ for: s.opts });
    const mine = pick.for === s.opts ? pick : { for: s.opts };
    const tab = mine.tab ?? s.opts.kind;
    const game: RealGame = mine.game ?? (s.opts.kind === "real" && s.opts.game ? s.opts.game : "3c");
    const n = (v: number) => String(v);
    const gameName = (g: RealGame) => t(g === "3c" ? "real.tab3c" : "real.tab4c");

    const o = s.opts;
    const realHandi = o.kind === "real" && typeof o.handi === "number" && o.handi > 0 ? o.handi : null;
    const realGame = o.kind === "real" && o.game ? o.game : "3c";
    const realTier = realHandi !== null ? realTierFor(realHandi, realGame) : null;
    const onTier = o.kind === "online" ? o.tier ?? null : null;
    const onDama = o.kind === "online" && typeof o.dama === "number" && o.dama > 0 ? o.dama : null;

    const hero = (art: ReactNode, title: string, sub?: string, color?: string) => (
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-surface-2 px-4 py-3.5" data-testid="badge-guide-hero">
            <span className="shrink-0">{art}</span>
            <span className="min-w-0">
                <span className="block text-[17px] font-black leading-tight text-ink-1 break-keep" style={color ? { color } : undefined}>{title}</span>
                {sub && <span className="block mt-1 text-[12.5px] font-semibold text-ink-3 rk-num break-keep">{sub}</span>}
            </span>
        </div>
    );
    const row = (key: string, art: ReactNode, name: string, range: string, on: boolean, color?: string) => (
        <li key={key} className={cn("flex items-center gap-3 rounded-xl px-2.5 py-1.5", on && "bg-brand/[0.08]")} data-tier={key} aria-current={on ? "true" : undefined}>
            <span className="shrink-0 w-11 flex items-center justify-center">{art}</span>
            <span className="flex-1 min-w-0 text-[14px] font-bold text-ink-1 truncate" style={color ? { color } : undefined}>{name}</span>
            <span className="shrink-0 rk-num text-[12.5px] font-semibold text-ink-3">{range}</span>
        </li>
    );

    return (
        <Sheet open={s.open} onOpenChange={(open) => { if (!open) closeBadgeGuide(); }}>
            <SheetContent side="bottom" className="mx-auto max-w-[448px] max-h-[88vh] overflow-y-auto rounded-t-3xl border-0 bg-surface-1 px-5 pt-5 pb-[max(20px,env(safe-area-inset-bottom))]" data-testid="badge-guide">
                <SheetTitle className="text-[18px] font-black text-ink-1">{t("badgeGuide.title")}</SheetTitle>
                <SheetDescription className="sr-only">{t("badgeGuide.desc")}</SheetDescription>

                <div className="mt-3 grid grid-cols-2 gap-1 p-1 rounded-full bg-surface-3" role="tablist">
                    {(["real", "online"] as const).map((k) => (
                        <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setPick({ ...mine, tab: k })} data-testid={`badge-tab-${k}`}
                            className={cn(seg, tab === k ? "bg-surface-1 text-ink-1 shadow-sm" : "text-ink-3")}>
                            {t(k === "real" ? "badgeGuide.tabReal" : "badgeGuide.tabOnline")}
                        </button>
                    ))}
                </div>

                {tab === "real" ? (
                    <div data-testid="badge-guide-real">
                        {/* 누른 배지 — 실전 메달을 눌러 열었을 때만 */}
                        {o.kind === "real" && (realTier
                            ? hero(<RealMedal game={realGame} handi={realHandi} size={84} decorative />,
                                t("real.tierOf").replace("{tier}", t(realTier.nameKey)),
                                t("badgeGuide.realSub").replace("{game}", gameName(realGame)).replace("{n}", n(realHandi!)), REAL_TIER_INK[realTier.id])
                            : hero(<RealMedal game={realGame} handi={null} size={84} decorative />, t("real.tierNone"), t("badgeGuide.realNone")))}
                        <div className="mt-4 flex items-center justify-between gap-2">
                            <h3 className="text-[13px] font-black text-ink-2">{t("badgeGuide.realList")}</h3>
                            <div className="inline-flex p-[3px] rounded-full bg-surface-3" role="tablist">
                                {(["3c", "4c"] as const).map((g) => (
                                    <button key={g} type="button" role="tab" aria-selected={game === g} onClick={() => setPick({ ...mine, game: g })} data-testid={`badge-game-${g}`}
                                        className={cn("h-7 px-3 rounded-full text-[12.5px] font-bold transition-colors", game === g ? "bg-surface-1 text-ink-1 shadow-sm" : "text-ink-3")}>
                                        {gameName(g)}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <ul className="mt-2 space-y-0.5">
                            {realTierRanges(game).map((r) => row(r.id,
                                <RealMedal game={game} handi={r.from} size={40} decorative />,
                                t("real.tierOf").replace("{tier}", t(`sim.rank.tier.${r.id}`)),
                                r.to === null ? t("badgeGuide.handiTop").replace("{a}", n(r.from)) : r.to === r.from ? t("badgeGuide.handiOne").replace("{a}", n(r.from)) : t("badgeGuide.handiRange").replace("{a}", n(r.from)).replace("{b}", n(r.to)),
                                !!realTier && realGame === game && realTier.id === r.id, REAL_TIER_INK[r.id]))}
                        </ul>
                        <p className="mt-3 text-[12px] font-medium text-ink-3 leading-relaxed break-keep">{t("badgeGuide.realHow")}</p>
                    </div>
                ) : (
                    <div data-testid="badge-guide-online">
                        {o.kind === "online" && (onDama !== null
                            ? hero(<OnlineDamaBadge target={onDama} size={84} />, t("badgeGuide.damaTitle").replace("{n}", n(onDama)), t("badgeGuide.damaSub"))
                            : onTier
                                ? hero(<TierEmblem tier={onTier} size={84} />, t("badgeGuide.onlineOf").replace("{tier}", t(`sim.rank.tier.${onTier}`)),
                                    typeof o.rating === "number" ? t("badgeGuide.ratingNow").replace("{n}", n(o.rating)) : undefined)
                                : hero(<TierEmblem tier="iron" size={84} locked />, t("sim.rank.unrankedShort"), t("badgeGuide.onlineNone").replace("{n}", n(PLACEMENT_MATCHES))))}
                        <h3 className="mt-4 text-[13px] font-black text-ink-2">{t("badgeGuide.onlineList")}</h3>
                        <ul className="mt-2 space-y-0.5">
                            {onlineTierRanges().map((r) => row(r.id,
                                <TierEmblem tier={r.id} size={40} />,
                                t(`sim.rank.tier.${r.id}`),
                                r.from === null ? t("badgeGuide.ratingBelow").replace("{a}", n((r.to ?? 0) + 1)) : r.to === null ? t("badgeGuide.ratingTop").replace("{a}", n(r.from)) : t("badgeGuide.ratingRange").replace("{a}", n(r.from)).replace("{b}", n(r.to)),
                                onDama === null && onTier === r.id))}
                        </ul>
                        <p className="mt-3 text-[12px] font-medium text-ink-3 leading-relaxed break-keep">{t("badgeGuide.onlineHow").replace("{n}", n(PLACEMENT_MATCHES))}</p>

                        <h3 className="mt-5 text-[13px] font-black text-ink-2">{t("badgeGuide.more")}</h3>
                        <ul className="mt-2 space-y-2" data-testid="badge-guide-more">
                            {[
                                { k: "dama", art: <img src={ONLINE_DAMA_SRC} width={36} height={36} alt="" aria-hidden="true" className="w-9 h-9" />, text: t("badgeGuide.moreDama") },
                                { k: "month", art: <RankMedal rank={1} size={36} />, text: t("badgeGuide.moreMonth") },
                                { k: "cup", art: <CupMedalArt medal={1} size={36} />, text: t("badgeGuide.moreCup") },
                                { k: "tier", art: <TierEmblem tier="gold" size={36} />, text: t("badgeGuide.moreTier") },
                            ].map((x) => (
                                <li key={x.k} className="flex items-center gap-3 px-2.5" data-more={x.k}>
                                    <span className="shrink-0 w-11 flex items-center justify-center">{x.art}</span>
                                    <span className="flex-1 min-w-0 text-[12.5px] font-semibold text-ink-2 leading-snug break-keep">{x.text}</span>
                                </li>
                            ))}
                        </ul>
                        {/* 달마다 받은 것은 장식장에 쌓인다 — 회원의 화면이라 로그인했을 때만 길을 낸다 */}
                        {member && (
                            <button type="button" onClick={() => { closeBadgeGuide(); setLocation(shelfPath()); }} data-testid="badge-guide-shelf" data-track-as="배지 안내 장식장으로"
                                className="mt-4 w-full h-12 rounded-full bg-brand text-brand-fg text-[14.5px] font-bold active:opacity-90">
                                {t("badgeGuide.toShelf")}
                            </button>
                        )}
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
}

export default BadgeGuideHost;
