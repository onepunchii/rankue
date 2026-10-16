/**
 * 홈 '당구 게임' 구역 맨 위의 **온라인 대전 배너**(2026-10-12 오너: "당구 홈에 혼자 치기 카드 위에 배너 카드를 만들어서 우리가 방금 작업한
 * 대회 및 진열장 대시보드 랭킹 들어가게 만들면 어때?" → 검토 뒤 "응 순서대로 진행하자").
 * 랭킹 화면과 한 벌인 어두운 '진열장' 카드: 왼쪽에 내 등급 배지 그림, 레이팅, 다음 등급까지 — 아래에 입구 칸.
 *
 * 입구는 **넷**(랭킹 · 장식장 · 월대회 · 대시보드), 두 줄에 둘씩이다(장식장 · 월대회는 2026-10-12 에 생겼다 —
 * 기획: docs/01-plan/features/online-game-monthly-tournament-badges.md 12-3).
 *  - 장식장 칸의 한 줄은 내가 모은 개수다. 이 기기에서 아직 못 본 것이 있으면(달이 마감돼 새로 받았으면) 그림 위에 연두 점이 뜬다.
 *  - 월대회 칸: 치르는 중인 대회에 내 경기가 있으면 남은 시간과 연두 점, 아니면 "출전 조건 · 대진표".
 *
 * 상태(무엇을 그릴지는 sim/rank/hubState 가 정한다)
 *  - 등급이 있다: 배지 · 레이팅 · 등급 이름 · 다음 등급까지 막대. 누르면 랭킹.
 *  - 배치 중: 배지는 아직 없다(가장 아래 등급의 실루엣) · "배치 중 n/3" · 한 판 하기 → 멀티방.
 *  - 한 판도 안 뒀다 / 비로그인: 일곱 등급을 한 줄로 보여 주고 시작을 권한다. **비로그인에게 예시 숫자를 만들어 보이지 않는다** —
 *    배지 일곱 개는 진짜 있는 것이라 '예시' 표시가 필요 없다. 입구는 가입 안내로 잇는다(랭킹 · 대시보드는 회원의 화면이다).
 *  - 두 종목(3쿠션 · 4구)을 다 둔 사람만 오른쪽 위에 종목 바꾸기가 보인다. 기본 종목은 아래 '내 온라인 실력' 카드의 기본 탭과 같다.
 *
 * 이 등급은 온라인 대전의 것이다(실전 RP 와 무관) — 그래서 늘 "온라인 대전"이라고 적는다.
 * 대전 전적 · 순위는 예전에 '내 온라인 실력' 카드의 기록 띠에 있었다. 배너가 가져왔고 그 카드에는 내 다마수만 남겼다(같은 숫자를 두 번 적지 않는다).
 * 숫자와 글자는 그림에 없다 — 전부 여기서 그린다. 색 · 광택은 index.css 의 .rank-hall .hall-banner.
 */
import { useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { TIERS } from "@shared/sim/rank";
import { useOnlineRecord } from "@/sim/entry/useOnlineRecord";
import { hubStateOf, otherGame, type HubGame, type HubState } from "@/sim/rank/hubState";
import { RANK_TROPHY_SRC, TIER_GLOW, TierEmblem } from "@/sim/rank/TierEmblem";
import { CASE_ICON_SRC } from "@/sim/rank/ShelfLink";
import { isShelfNew, readShelfSeen, shelfPath } from "@/sim/rank/shelfApi";
import { CUP_ICON_SRC } from "@/sim/cup/CupArt";
import { CUP_PATH, timeLeft } from "@/sim/cup/cupApi";
import { BadgeTap } from "@/components/hiq/BadgeGuideSheet";
import { useGuestGate } from "@/components/hiq/GuestGate";
import { LucideArrowLeftRight, LucideChevronRight } from "@/lib/icons";

const RANK_URL = "/online-game?rank=1";
const DASH_URL = "/online-game?dash=1";
const ROOMS_URL = "/online-game?rooms=1";
/** 대시보드 칸의 그림 — 등급 배지와 같은 화풍(public/sim/rank) */
export const HUB_DASH_ICON_SRC = "/sim/rank/icon-stats.webp";

/** 오른쪽 끝의 연두 알약 — 겉의 단추 안에 그리는 표시라 span 이다 */
function CtaPill({ children }: { children: ReactNode }) {
    return (
        <span className="shrink-0 h-9 pl-3.5 pr-2.5 rounded-pill bg-[color:var(--hall-lime)] text-[#0B1A03] text-[13px] font-black inline-flex items-center gap-0.5">
            {children}
            <LucideChevronRight className="w-3.5 h-3.5" weight="bold" aria-hidden="true" />
        </span>
    );
}

/**
 * 입구 칸 — 그림 · 이름 · 한 줄. 두 줄에 둘씩이라 360px 폰에서 칸 하나가 164px 다(영어 Dashboard · 베트남어 전적이 들어간다).
 * 화살표는 오른쪽 끝이 아니라 이름 옆에 작게 붙인다 — 글자 자리를 아끼려고. dot: 새로 볼 것이 있다는 연두 점.
 */
function Tile({ icon, title, sub, onClick, trackAs, dot = false, testId, className }: { icon: string; title: string; sub: string; onClick: () => void; trackAs: string; dot?: boolean; testId?: string; className?: string }) {
    return (
        <button type="button" onClick={onClick} data-track-as={trackAs} data-testid={testId} className={cn("min-w-0 px-3 py-2.5 flex items-center gap-2 text-left border-t border-white/10 transition-colors active:bg-white/[0.07]", className)}>
            <span className="relative shrink-0">
                <img src={icon} width={40} height={40} alt="" aria-hidden="true" decoding="async" draggable={false} className="w-10 h-10 object-contain" style={{ filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.5))" }} />
                {dot && <span className="absolute -right-0.5 -top-0.5 w-2.5 h-2.5 rounded-full bg-[color:var(--hall-lime)] ring-2 ring-[#1e1812]" data-testid={testId ? `${testId}-new` : undefined} aria-hidden="true" />}
            </span>
            <span className="flex-1 min-w-0">
                <span className="flex items-center gap-0.5 min-w-0">
                    <span className="text-[13.5px] font-black text-white truncate">{title}</span>
                    <LucideChevronRight className="w-3 h-3 shrink-0 text-white/45" weight="bold" aria-hidden="true" />
                </span>
                <span className="block rk-num text-[11.5px] font-bold text-white/60 truncate mt-0.5">{sub}</span>
            </span>
        </button>
    );
}

export function OnlineHubBanner() {
    const { t } = useT();
    const { member } = useAuth();
    const gate = useGuestGate("dark");
    const [, setLocation] = useLocation();
    const { boards, placement, ready, shelf, cup } = useOnlineRecord();
    const [pick, setPick] = useState<HubGame | null>(null);

    // 회원의 화면(랭킹 · 대시보드 · 멀티방)으로 가는 길은 전부 여기로 — 비로그인은 가입 안내, 가입 뒤 가려던 곳으로 돌아온다
    const go = (to: string) => gate.guard(() => setLocation(to), {
        title: t("guestHome.gateHubTitle"),
        desc: t("guestHome.gateHubDesc").replace("{n}", String(placement)),
        from: to,
    });

    // 회원인데 내 순위를 아직 못 받았으면 자리만 잡아 둔다 — "아직 대전을 안 했다"고 먼저 그렸다가 바뀌지 않게
    const loading = !!member && !ready;
    const s: HubState = member ? hubStateOf(boards, placement, pick) : { kind: "fresh", canSwap: false };
    const game = s.kind === "fresh" ? null : s.gameType;
    const gameName = game ? t(game === "3c" ? "real.tab3c" : "real.tab4c") : "";
    const caption = `${t("home.hubLabel")}${game && !s.canSwap ? ` · ${gameName}` : ""}`;
    // 보던 종목의 순위표로 연다(?g=) — 4구를 보다가 눌렀는데 3쿠션 순위표가 뜨지 않게
    const rankUrl = game ? `${RANK_URL}&g=${game}` : RANK_URL;
    // 내 등급(통산)을 누르면 통산 탭으로 — 랭킹 화면의 첫 탭은 '이달'이다(2026-10-12 이달의 랭킹)
    const tierUrl = `${rankUrl}&s=all`;
    const record = (w: number, l: number) => t("sim.entry.record").replace("{w}", String(w)).replace("{l}", String(l));

    const rankSub = s.kind === "ranked" && s.rank !== null
        ? t("sim.rank.rankOf").replace("{r}", String(s.rank)).replace("{n}", String(s.total))
        : t("home.hubRankSub");
    const dashSub = s.kind === "ranked" || s.kind === "placing" ? record(s.wins, s.losses) : t("home.hubDashSub");
    // 장식장 — 모은 것이 있으면 개수, 없으면 무엇을 하는 곳인지
    const shelfTotal = member && shelf ? shelf.medals + shelf.badges : 0;
    const shelfSub = shelfTotal > 0 ? t("home.hubShelfCount").replace("{n}", String(shelfTotal)) : t("home.hubShelfSub");
    const shelfNew = !!member && isShelfNew(shelf?.latest, readShelfSeen());
    // 월대회 — 내 경기가 있으면 남은 시간(상대가 아직이면 그 말), 없으면 무엇을 하는 곳인지
    const myCup = member ? cup : null;
    const cupLeft = myCup && !myCup.waiting ? timeLeft(myCup.deadlineMs, Date.now()) : null;
    // 칸의 글자 자리는 80px 쯤이다 — 대회 화면의 긴 문구 대신 이 칸만의 짧은 말을 쓴다(home.hubCup*)
    const cupSub = !myCup ? t("home.hubCupSub")
        : myCup.waiting ? t("home.hubCupWait")
            : !cupLeft ? t("home.hubCupOver")
                : cupLeft.days > 0 ? t("home.hubCupDays").replace("{d}", String(cupLeft.days)).replace("{h}", String(cupLeft.hours))
                    : cupLeft.hours > 0 ? t("home.hubCupHours").replace("{h}", String(cupLeft.hours)).replace("{m}", String(cupLeft.minutes))
                        : t("home.hubCupMin").replace("{m}", String(cupLeft.minutes));

    let hero: ReactNode;
    if (loading || s.kind === "waiting") {
        hero = (
            <div className="px-4 pt-4 pb-3.5 flex items-center gap-2 min-h-[124px]" aria-hidden="true">
                <span className="shrink-0 -ml-1.5 opacity-40 animate-pulse"><TierEmblem tier="iron" size={96} locked /></span>
                <span className="flex-1 min-w-0">
                    <span className="block text-[11.5px] font-bold text-white/60">{t("home.hubLabel")}</span>
                    <span className="block h-8 w-24 rounded-lg bg-white/10 mt-2 animate-pulse" />
                    <span className="block h-1.5 rounded-pill bg-white/10 mt-3" />
                </span>
            </div>
        );
    } else if (s.kind === "ranked") {
        const glow = TIER_GLOW[s.tier.id];
        hero = (
            <button type="button" onClick={() => go(tierUrl)} data-track-as="홈 배너 내 등급" data-testid="hub-hero"
                className="w-full px-4 pt-4 pb-3.5 flex items-center gap-2 text-left min-h-[124px] transition-colors active:bg-white/[0.05]">
                {/* 배지를 누르면 배지 안내 — 겉의 단추(랭킹으로)와 따로다 */}
                <BadgeTap guide={{ kind: "online", tier: s.tier.id, rating: s.rating }} className="hall-emblem -ml-1.5"><TierEmblem tier={s.tier.id} size={96} glow /></BadgeTap>
                <span className="flex-1 min-w-0">
                    <span className={cn("block text-[11.5px] font-bold text-white/60 truncate", s.canSwap && "pr-[92px]")}>{caption}</span>
                    <span className="flex items-baseline gap-2 mt-1 min-w-0">
                        <span className="rk-num text-[34px] font-black text-white leading-none tracking-tight" data-rating>{s.rating}</span>
                        <span className="text-[14.5px] font-black truncate" style={{ color: glow }}>{t(s.tier.nameKey)}</span>
                    </span>
                    <span className="block rk-num text-[12px] font-bold text-white/75 mt-2 truncate">
                        {s.next && s.toNext !== null
                            ? t("sim.rank.nextTier").replace("{tier}", t(s.next.nameKey)).replace("{n}", String(s.toNext))
                            : t("sim.rank.topTier")}
                    </span>
                    {/* 막대는 지금 등급 색에서 다음 등급 색으로 이어진다(랭킹 화면의 내 카드와 같다) */}
                    {s.next && (
                        <span className="block h-1.5 rounded-pill bg-white/15 overflow-hidden mt-1.5" aria-hidden="true">
                            <span className="block h-full rounded-pill" style={{ width: `${Math.max(4, Math.round(s.progress * 100))}%`, background: `linear-gradient(90deg, ${glow}, ${TIER_GLOW[s.next.id]})` }} />
                        </span>
                    )}
                </span>
            </button>
        );
    } else if (s.kind === "placing") {
        hero = (
            <button type="button" onClick={() => go(ROOMS_URL)} data-track-as="홈 배너 배치 중" data-testid="hub-hero"
                className="w-full px-4 pt-4 pb-3.5 flex items-center gap-2 text-left min-h-[124px] transition-colors active:bg-white/[0.05]">
                {/* 배치 전에는 아직 얻은 배지가 없다 — 가장 아래 등급의 실루엣 */}
                <BadgeTap guide={{ kind: "online", tier: null }} className="-ml-1.5"><TierEmblem tier="iron" size={96} locked /></BadgeTap>
                <span className="flex-1 min-w-0">
                    <span className={cn("block text-[11.5px] font-bold text-white/60 truncate", s.canSwap && "pr-[92px]")}>{caption}</span>
                    <span className="block rk-num text-[21px] font-black text-white leading-tight mt-1">
                        {t("sim.rank.unranked").replace("{n}", String(s.matches)).replace("{m}", String(placement))}
                    </span>
                    <span className="block text-[12px] font-bold text-white/75 mt-1 break-keep">{t("home.hubPlacingHint").replace("{n}", String(s.left))}</span>
                    <span className="flex mt-2.5"><CtaPill>{t("lookalike.playOnline")}</CtaPill></span>
                </span>
            </button>
        );
    } else {
        hero = (
            <button type="button" onClick={() => go(ROOMS_URL)} data-track-as="홈 배너 시작" data-testid="hub-hero"
                className="w-full px-4 pt-4 pb-3.5 block text-left min-h-[124px] transition-colors active:bg-white/[0.05]">
                <span className="flex items-center justify-between gap-3">
                    <span className="min-w-0">
                        <span className="block text-[11.5px] font-bold text-white/60 truncate">{t("home.hubLabel")}</span>
                        <span className="block text-[17px] font-black text-white leading-snug mt-0.5 break-keep [text-wrap:balance]">{t("home.hubShowTitle").replace("{n}", String(placement))}</span>
                    </span>
                    <CtaPill>{gate.isGuest ? t("home.hubJoin") : t("lookalike.playOnline")}</CtaPill>
                </span>
                {/* 얻을 수 있는 일곱 배지 — 전부 진짜 있는 것이라 밝게 보여 준다(무엇이 기다리는지 보여야 갖고 싶다) */}
                <span className="mt-3 flex items-end justify-between" role="list" aria-label={t("sim.rank.ladder")}>
                    {TIERS.map((tier, i) => (
                        <span key={tier.id} role="listitem" className="flex flex-col items-center">
                            <TierEmblem tier={tier.id} size={30 + i * 2} label={t(tier.nameKey)} />
                        </span>
                    ))}
                </span>
            </button>
        );
    }

    return (
        <section className="rank-hall" aria-label={t("home.hubAria")} data-testid="online-hub">
            <div className="hall-banner relative rounded-3xl overflow-hidden">
                {/* 종목 바꾸기 — 두 종목을 다 둔 사람만. 겉의 단추와 겹치지 않게 따로 띄운다 */}
                {!loading && game && s.canSwap && (
                    <button type="button" onClick={() => setPick(otherGame(game))} aria-label={t("home.hubSwap")} data-track-as="홈 배너 종목 바꾸기"
                        className="absolute right-3 top-3 z-10 h-8 pl-3 pr-2.5 rounded-pill border border-white/20 bg-black/40 text-[12px] font-black text-white inline-flex items-center gap-1 active:bg-black/60">
                        {gameName}
                        <LucideArrowLeftRight className="w-3.5 h-3.5 text-white/70" aria-hidden="true" />
                    </button>
                )}
                {hero}
                <div className="grid grid-cols-2">
                    <Tile icon={RANK_TROPHY_SRC} title={t("sim.rank.title")} sub={loading ? " " : rankSub} onClick={() => go(rankUrl)} trackAs="홈 배너 랭킹" className="border-r" />
                    <Tile icon={CASE_ICON_SRC} title={t("home.hubShelf")} sub={loading ? " " : shelfSub} onClick={() => go(shelfPath())} trackAs="홈 배너 장식장" dot={shelfNew} testId="hub-shelf" />
                    <Tile icon={CUP_ICON_SRC} title={t("home.hubCup")} sub={loading ? " " : cupSub} onClick={() => go(CUP_PATH)} trackAs="홈 배너 월대회" dot={!!myCup && !myCup.waiting} testId="hub-cup" className="border-r" />
                    <Tile icon={HUB_DASH_ICON_SRC} title={t("home.hubDash")} sub={loading ? " " : dashSub} onClick={() => go(DASH_URL)} trackAs="홈 배너 대시보드" />
                </div>
            </div>
        </section>
    );
}

export default OnlineHubBanner;
