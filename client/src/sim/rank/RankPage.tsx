/**
 * 온라인 대전 랭킹(2026-09-08 오너: "랭킹제 · 국가별 · 랭커 게임처럼"). `/online-game?rank=1`.
 * 위: 트로피 머리 → 종목 칩 → 내 카드(등급 배지 그림·레이팅·순위·전적·다음 등급까지·일곱 등급 사다리, 배치 전엔 "배치 중 n/3") → 순위 목록.
 *
 * 모양은 '진열장'(2026-10-12 오너: 시안 A·B 가운데 "B 로 가고 이미지 제작 잘해서 게임 느낌도 나고 진짜 소유욕이 들게끔").
 *  - 등급 배지·메달·트로피는 그림이다(./TierEmblem, public/sim/rank). 숫자·글자는 그림에 넣지 않고 여기서 그린다.
 *  - 내 카드의 사다리는 일곱 배지를 한 줄로: 지나온 등급은 밝게, 지금 등급은 크게 빛나고, 아직 못 얻은 등급은 어둡게 —
 *    다음에 얻을 것이 보이게 한다(갖고 싶게).
 *  - 색·광택은 .rank-hall 아래에만(index.css). 예전의 보라 판(.rank-arcade, 2026-09-09)은 이 화면에서 뺐다.
 * 순위표는 나라 구분 없이 하나다(2026-10-12 오너: "국가별인데 통합하는 건 어때?") — 예전의 범위 칩(전체 / 내 나라 / 나라 고르기)과 국가 순위 줄을 뺐다. 국기는 이름 옆에 남는다.
 * 2026-10-12(오너: "랭킹을 달로 해야겠지? … 매월초가 되면 리셋되고 그렇지?" → "추천대로"): 탭 둘 — **[이달] [통산]**.
 *  - 이달: 그 달에 올린 점수로 겨루는 판(./MonthlyRank). 매월 1일 0 에서 시작한다. 처음 열면 이 탭이다.
 *  - 통산: 예전 그대로의 레이팅 · 등급 사다리. 등급은 달이 바뀌어도 지워지지 않는다.
 *  `?rank=1&s=all` 로 통산을 바로 연다(홈 배너 · 대시보드의 '내 등급'에서 들어올 때).
 *  - 장식장(./ShelfPage): 내 카드 아래의 '내 장식장' 줄, 그리고 순위표의 줄을 누르면 그 사람의 장식장(onShelf 를 줬을 때).
 * 내 나라가 없으면 기기 언어의 지역으로 한 번 저장하고(PATCH /me), 카드의 "내 나라 바꾸기"로 고친다. 값은 온라인 대전 Elo 뿐 — 실전 RP 와 무관.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { rankStatus, tierFor, tierProgress, TIERS, PLACEMENT_MATCHES } from "@shared/sim/rank";
import { RankBoard } from "./RankBoard";
import { GameBalls } from "./GameBalls";
import type { DashGameType } from "../dash/dashApi";
import { COUNTRY_OPTIONS, countryName, guessCountry, isCountryCode } from "./country";
import { rankFlag } from "./flag";
import { rankApi as defaultApi, RANK_QUERY_KEY, type RankApi } from "./rankApi";
import { RANK_TROPHY_SRC, TIER_GLOW, TierEmblem } from "./TierEmblem";
import { MonthlyRank } from "./MonthlyRank";
import { ShelfLink } from "./ShelfLink";

export interface RankPageProps {
    onClose: () => void;
    api?: RankApi;
    /** 처음 보여줄 종목 */
    initial?: { gameType: DashGameType };
    /** 처음 보여줄 탭 — 안 주면 이달(이달의 랭킹을 주는 api 일 때). */
    initialScope?: RankScope;
    /** 장식장으로 — id 없이 부르면 내 것, 순위표의 줄을 누르면 그 사람의 것. 안 주면 입구를 그리지 않는다 */
    onShelf?: (memberId?: string) => void;
    /** 월대회로(2026-10-12) — 이달의 랭킹의 내 카드 아래 한 줄. 이달의 성적이 다음 달 초 대회의 출전권이다 */
    onCup?: () => void;
}

export type RankScope = "month" | "all";

/** 2026-09-12 오너: "대대 중대 통합해줘" — 사다리는 종목 둘뿐이다(인원이 적어 넷으로 쪼개면 한 판에 서너 명이었다). */
const COMBOS: readonly { gameType: DashGameType }[] = [{ gameType: "3c" }, { gameType: "4c" }];
const pill = "h-10 px-3.5 shrink-0 inline-flex items-center rounded-pill border text-[13px] font-bold";
const chipOn = "border-transparent bg-[color:var(--hall-lime)] text-[#0B1A03]";
const chipOff = "border-white/15 bg-white/[0.08] text-white/85 active:bg-white/15";

export function RankPage({ onClose, api = defaultApi, initial, initialScope, onShelf, onCup }: RankPageProps) {
    const { t, locale } = useT();
    const { member } = useAuth();
    const qc = useQueryClient();
    const [combo, setCombo] = useState(initial ?? COMBOS[0]);
    // 첫 화면은 사람이 있는 곳으로: 내가 가장 많이 친 조합 → 없으면 등재자가 가장 많은 조합(2026-09-09 오너).
    // 링크로 조합을 지정해 들어왔거나(initial) 사용자가 한 번이라도 고른 뒤에는 건드리지 않는다.
    const pickedRef = useRef(!!initial);
    // 탭: 이달 | 통산. 이달의 랭킹을 주지 않는 api(옛 주입)면 통산만 보여 준다.
    const hasMonthly = typeof api.getMonthly === "function";
    const [scope, setScope] = useState<RankScope>(hasMonthly ? (initialScope ?? "month") : "all");
    // 나라로 나누지 않는다 — 순위표는 하나다(2026-10-12 오너: "온라인대전 레이팅 랭킹 지금 … 국가별인데 통합하는 건 어때?").
    // 순위에 오른 사람이 3쿠션 7명 · 4구 3명이고 그중 서너 명은 나라가 비어 있었다 — 나라로 거르면 세 명짜리 목록이 되고, 나라가 빈 사람은 어디에도 안 나왔다.
    // 예전의 범위 칩(전체 · 내 나라 · 나라 고르기)과 '내 나라 순위' 줄을 뺐다. 이름 옆 국기와 '내 나라' 고르기는 그대로다(대전 화면의 국기도 이 값이다).
    // 월대회 출전권도 이 하나의 순위표로 정한다(docs/01-plan/features/online-game-monthly-tournament-badges.md).
    const myCountry = member?.country && isCountryCode(member.country) ? member.country : null;
    const q = useQuery({
        queryKey: [...RANK_QUERY_KEY, combo.gameType, "all"],
        queryFn: () => api.getLadder({ gameType: combo.gameType, country: null }),
        staleTime: 15_000,
    });

    // 내 나라가 비어 있으면 기기 언어의 지역으로 한 번 저장한다
    const [guessed, setGuessed] = useState(false);
    useEffect(() => {
        if (!member || myCountry || guessed) return;
        setGuessed(true);
        const g = guessCountry();
        if (!g) return;
        api.setCountry(g).then(() => { void qc.invalidateQueries({ queryKey: ["/api/hiq/me"] }); void qc.invalidateQueries({ queryKey: RANK_QUERY_KEY }); }, () => undefined);
    }, [member, myCountry, guessed, api, qc]);

    const changeCountry = async (code: string) => {
        if (!isCountryCode(code)) return;
        try {
            await api.setCountry(code);
            void qc.invalidateQueries({ queryKey: ["/api/hiq/me"] });
            void qc.invalidateQueries({ queryKey: RANK_QUERY_KEY });
        } catch { /* 다음에 다시 */ }
    };

    const data = q.data;
    useEffect(() => {
        if (pickedRef.current || !data || (data.combos ?? []).length === 0) return;
        const best = [...(data.combos ?? [])].sort((a, b) => b.myMatches - a.myMatches || b.ranked - a.ranked)[0];
        if (!best || (best.myMatches === 0 && best.ranked === 0)) return;
        pickedRef.current = true;
        if (best.gameType !== combo.gameType) setCombo({ gameType: best.gameType });
    }, [data, combo.gameType]);
    const status = data ? rankStatus(data.me.rating, data.me.matches) : null;
    const options = useMemo(() => {
        const set = new Set<string>(COUNTRY_OPTIONS);
        for (const c of data?.countries ?? []) if (c.country) set.add(c.country);
        return [...set].map((code) => ({ code, name: countryName(code, locale) })).sort((a, b) => a.name.localeCompare(b.name, locale));
    }, [data, locale]);
    const n = (v: number) => String(v);

    return (
        <div className="rank-hall w-full max-w-[420px] mx-auto pb-8">
            {/* 머리 — 당구장 불빛 아래 트로피 */}
            <header className="hall-top relative px-5 pt-4">
                <button type="button" onClick={onClose} className="absolute right-5 top-4 h-11 px-4 rounded-pill border border-white/25 bg-black/40 text-[13px] font-semibold text-white/90 active:bg-black/60">
                    {t("sim.common.close")}
                </button>
                <div className="flex items-end gap-1 pt-9">
                    <img src={RANK_TROPHY_SRC} width={108} height={108} alt="" aria-hidden="true" decoding="async" draggable={false} className="hall-trophy shrink-0 -ml-3" />
                    <div className="min-w-0 pb-4">
                        <h1 className="text-[23px] font-black text-white leading-tight">{t("sim.rank.title")}</h1>
                        <p className="text-[12.5px] font-medium text-white/70 mt-0.5">{t("sim.rank.sub").replace("{n}", n(PLACEMENT_MATCHES))}</p>
                    </div>
                </div>
            </header>

            <div className="px-5">
                <div role="group" aria-label={t("sim.dash.filterAria")} className="flex gap-1.5 overflow-x-auto -mx-5 px-5 pt-1 pb-1 mb-3">
                    {(["3c", "4c"] as const).map((g) => {
                        const sel = combo.gameType === g;
                        const ranked = (data?.combos ?? []).filter((c) => c.gameType === g).reduce((a, c) => a + c.ranked, 0);
                        return (
                            <button
                                key={g} type="button" aria-pressed={sel} onClick={() => { pickedRef.current = true; setCombo({ ...combo, gameType: g }); }}
                                aria-label={t(g === "3c" ? "sim.setup.type3c" : "sim.setup.type4c")}
                                className={cn(pill, "gap-2", sel ? chipOn : chipOff)}
                            >
                                <GameBalls gameType={g} />
                                {ranked > 0 && <span className="rk-num text-[11px] font-bold opacity-70">{t("sim.rank.rankedCount").replace("{n}", String(ranked))}</span>}
                            </button>
                        );
                    })}
                </div>

                {hasMonthly && (
                    <div role="tablist" aria-label={t("sim.rank.periodAria")} className="grid grid-cols-2 p-1 rounded-pill bg-white/[0.07] border border-white/10 mb-4">
                        {(["month", "all"] as const).map((k) => (
                            <button
                                key={k} type="button" role="tab" aria-selected={scope === k} onClick={() => setScope(k)} data-testid={`rank-scope-${k}`}
                                className={cn("h-10 rounded-pill text-[13.5px] font-black transition-colors", scope === k ? "bg-white text-[#14110d]" : "text-white/70 active:bg-white/10")}
                            >
                                {t(k === "month" ? "sim.rank.periodMonth" : "sim.rank.periodAll")}
                            </button>
                        ))}
                    </div>
                )}

                {scope === "month" && hasMonthly && (
                    <MonthlyRank gameType={combo.gameType} api={api} myMemberId={member?.id} locale={locale} onShelf={onShelf} onCup={onCup} />
                )}

                {scope === "all" && q.isPending && <p className="text-[13px] font-medium text-ink-4 min-h-11 flex items-center">{t("sim.rank.loading")}</p>}
                {scope === "all" && q.isError && (
                    <div className="flex items-center justify-between gap-3 min-h-11">
                        <p className="text-[13px] font-medium text-ink-2">{t("sim.rank.failed")}</p>
                        <button type="button" onClick={() => { void q.refetch(); }} className={cn(pill, chipOff)}>{t("sim.match.retry")}</button>
                    </div>
                )}

                {scope === "all" && data && status && (
                    <div className={cn("flex flex-col gap-4", q.isFetching && "opacity-80")}>
                        <section className="hall-me rounded-[22px] px-4 pt-3 pb-4" aria-label={t("sim.rank.myTitle")} data-testid="rank-me">
                            <div className="flex items-center gap-2">
                                {/* 배치 전에는 아직 얻은 배지가 없다 — 가장 아래 등급의 실루엣 */}
                                <span className="hall-emblem shrink-0 -ml-2">
                                    {status.tier
                                        ? <TierEmblem tier={status.tier.id} size={124} glow />
                                        : <TierEmblem tier="iron" size={124} locked />}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[13px] font-black" style={{ color: status.tier ? TIER_GLOW[status.tier.id] : "rgba(255,255,255,0.6)" }}>
                                        {status.tier ? t(status.tier.nameKey) : t("sim.rank.unrankedShort")}
                                        <span className="rk-num font-bold text-white/75">{" · "}{t("sim.entry.record").replace("{w}", n(data.me.wins)).replace("{l}", n(data.me.matches - data.me.wins))}</span>
                                    </p>
                                    <p className="text-[46px] font-black text-white leading-none tracking-tight mt-1" data-rating>{data.me.rating}</p>
                                    <p className="rk-num text-[12.5px] font-bold text-white/80 mt-1.5">
                                        {status.placed && data.me.rank !== null
                                            ? t("sim.rank.rankOf").replace("{r}", n(data.me.rank)).replace("{n}", n(data.total))
                                            : t("sim.rank.unranked").replace("{n}", n(data.me.matches)).replace("{m}", n(PLACEMENT_MATCHES))}
                                    </p>
                                </div>
                            </div>

                            {/* 다음 등급까지 — 막대는 지금 등급 색에서 다음 등급 색으로 이어진다 */}
                            <div className="mt-2">
                                {status.placed && status.tier && status.toNext !== null && (
                                    <div className="h-1.5 rounded-pill bg-white/15 overflow-hidden" aria-hidden="true">
                                        <div className="h-full rounded-pill" style={{ width: `${Math.max(4, Math.round(tierProgress(data.me.rating) * 100))}%`, background: `linear-gradient(90deg, ${TIER_GLOW[status.tier.id]}, ${TIER_GLOW[tierFor(data.me.rating + status.toNext).id]})` }} />
                                    </div>
                                )}
                                <p className="rk-num text-[12.5px] font-bold text-white/80 mt-1.5">
                                    {!status.placed
                                        ? t("sim.rank.placementHint").replace("{n}", n(status.placementLeft))
                                        : status.toNext !== null
                                            ? t("sim.rank.nextTier").replace("{tier}", t(tierFor(data.me.rating + status.toNext).nameKey)).replace("{n}", n(status.toNext))
                                            : t("sim.rank.topTier")}
                                </p>
                            </div>

                            {/* 등급 사다리(2026-09-09 오너: 재미 = 다음 목표가 보이는 것) — 일곱 배지. 지나온 등급은 밝게, 지금은 크게, 아직은 어둡게 */}
                            <div className="hall-ladder mt-3 px-1 flex items-end justify-between" role="list" aria-label={t("sim.rank.ladder")}>
                                {TIERS.map((tier) => {
                                    const cur = status.placed && status.tier?.id === tier.id;
                                    const passed = status.placed && data.me.rating >= tier.min;
                                    // 바로 다음 등급은 덜 어둡게 — 손에 닿을 듯이
                                    const upNext = status.placed && status.toNext !== null && tierFor(data.me.rating + status.toNext).id === tier.id;
                                    return (
                                        <span key={tier.id} role="listitem" title={t(tier.nameKey)} className={cn("flex flex-col items-center", cur && "hall-step-cur")} aria-current={cur ? "true" : undefined}>
                                            <TierEmblem tier={tier.id} size={cur ? 46 : upNext ? 38 : 34} locked={!passed} next={upNext} glow={cur} label={t(tier.nameKey)} />
                                        </span>
                                    );
                                })}
                            </div>

                            <label className="mt-4 flex items-center justify-between gap-2 text-[12px] font-bold text-white/75">
                                <span>{myCountry ? `${rankFlag(myCountry) || ""} ${countryName(myCountry, locale)}` : t("sim.rank.countryChange")}</span>
                                <select
                                    aria-label={t("sim.rank.countryChange")} value={myCountry ?? ""} onChange={(e) => { void changeCountry(e.target.value); }}
                                    className="h-9 rounded-lg border border-white/20 bg-white/10 px-2 text-[12px] font-bold text-white max-w-[150px]"
                                >
                                    <option value="">–</option>
                                    {options.map((o) => <option key={o.code} value={o.code}>{o.name}</option>)}
                                </select>
                            </label>
                            {onShelf && <ShelfLink onClick={() => onShelf()} sub={t("sim.shelf.linkSub")} className="mt-3" testId="rank-shelf" />}
                        </section>

                        {data.rows.length === 0 ? (
                            <section className="rounded-card bg-surface-1 border border-surface-line rk-shadow p-4">
                                <p className="text-[15px] font-bold text-ink-1">{t("sim.rank.empty")}</p>
                                <p className="text-[13px] font-medium text-ink-3 mt-1">{t("sim.rank.emptyDesc").replace("{n}", n(PLACEMENT_MATCHES))}</p>
                            </section>
                        ) : (
                            <RankBoard rows={data.rows} myMemberId={member?.id} locale={locale} onOpen={onShelf} />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export default RankPage;
