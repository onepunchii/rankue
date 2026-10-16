/**
 * 장식장(2026-10-12 오너: "랭킹을 달로 해야겠지? 그래서 장식장에 보관이 되도록 매월초가 되면 리셋되고 그렇지?" → "추천대로"). `/online-game?shelf=1[&m=<회원 id>]`.
 * 달이 끝날 때마다 받은 것을 놓아 두는 곳 — 이달의 랭킹 메달(1~3등)과 그 달의 등급 배지. 남의 장식장도 볼 수 있다(랭킹의 줄을 누르면).
 *
 * 위에서부터: 머리(장식장 그림) → 주인 카드(지금 등급 · 모은 개수) → **이번 달**(지금 끝난다면 받는 것 — 아직 받은 것이 아니라 흐리게)
 * → 선반 셋(이달의 랭킹 메달 셋 · 등급 일곱 · 월대회 메달 다섯: 받은 것은 밝게 ×개수, 아직은 어둡게) → 달마다.
 * 선반의 것을 누르면 언제 받았는지가 아래에 나온다. 이 기기에서 처음 보는 것은 '새로 받음' 표시.
 *
 * 숫자와 글자는 그림에 없다 — 전부 여기서 그린다. 색 · 광택은 .rank-hall(index.css)의 .hall-shelf · .hall-plank.
 * 규칙은 shared/simShelf(메달은 그 달에 점수를 올린 1~3등만 · 배지는 그 달 5판을 친 사람에게 달이 끝날 때의 등급), 값은 GET /sim/shelf.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { TIERS, type TierId } from "@shared/sim/rank";
import { MEDAL_RANKS, shelfCounts, type MedalRank } from "@shared/simShelf";
import { countryName } from "./country";
import { rankFlag } from "./flag";
import { monthLabel, signedPoints } from "./MonthlyRank";
import { SHELF_QUERY_KEY, isShelfNew, readShelfSeen, shelfApi as defaultApi, writeShelfSeen, type Shelf, type ShelfApi, type ShelfAwardRow } from "./shelfApi";
import { SHELF_ICON_SRC } from "./ShelfLink";
import type { CupMedal } from "@shared/simCup";
import { CUP_MEDALS, CupMedalArt } from "../cup/CupArt";
import { RankMedal, TIER_GLOW, TierEmblem } from "./TierEmblem";


export interface ShelfPageProps {
    onClose: () => void;
    /** 볼 회원 — 없으면 내 장식장 */
    memberId?: string | null;
    api?: ShelfApi;
    /** 이달의 랭킹으로(이번 달 칸) */
    onRank?: () => void;
    /** 한 판 하기(내 장식장에서 이달 대전이 없을 때) */
    onPlay?: () => void;
    /** 월대회로(월대회 메달 선반) */
    onCup?: () => void;
    /** 이 기기에서 마지막으로 본 달을 읽고 적는 곳(시험에서 바꿔 끼운다) */
    seen?: { read: () => string; write: (month: string) => void };
    /** 큐 케이스의 '메달 · 배지' 칸 안에 넣을 때(2026-10-16) — 머리(장식장 그림 · 닫기)와 바깥 여백 없이 선반만 */
    embedded?: boolean;
}

type Pick = { kind: "medal"; rank: MedalRank } | { kind: "tier"; tier: TierId } | { kind: "cup"; medal: CupMedal };
const pickKey = (p: Pick): string => (p.kind === "medal" ? `m${p.rank}` : p.kind === "tier" ? `t${p.tier}` : `c${p.medal}`);
const samePick = (a: Pick | null, b: Pick): boolean => !!a && pickKey(a) === pickKey(b);
const deviceSeen = { read: () => readShelfSeen(), write: (m: string) => writeShelfSeen(m) };

/** 새로 받은 것 — 작은 연두 알약 */
function NewMark({ label }: { label: string }) {
    return <span className="shrink-0 h-[18px] px-1.5 inline-flex items-center rounded-pill bg-[color:var(--hall-lime)] text-[#0B1A03] text-[11px] font-black" data-testid="shelf-new">{label}</span>;
}

/** 선반 한 칸 — 그림들이 널 위에 서 있고, 그 아래에 이름과 개수 */
function ShelfRow({ title, count, children, foot }: { title: string; count?: string; children: ReactNode; foot?: ReactNode }) {
    return (
        <section className="hall-shelf px-3 pt-3 pb-3" aria-label={title}>
            <div className="flex items-baseline justify-between gap-2 px-1">
                <h2 className="text-[13px] font-black text-white/85 truncate">{title}</h2>
                {count && <span className="rk-num shrink-0 text-[12px] font-bold text-white/55">{count}</span>}
            </div>
            {children}
            {foot}
        </section>
    );
}

export function ShelfPage({ onClose, memberId, api = defaultApi, onRank, onPlay, onCup, seen = deviceSeen, embedded = false }: ShelfPageProps) {
    const { t, locale } = useT();
    const q = useQuery({ queryKey: [...SHELF_QUERY_KEY, memberId ?? "me"], queryFn: () => api.get(memberId), staleTime: 15_000, retry: false });
    const d: Shelf | undefined = q.data;
    const [pick, setPick] = useState<Pick | null>(null);
    // 이 화면을 열었을 때의 '마지막으로 본 달' — 그 뒤에 받은 것이 새것이다. 내 장식장을 보면 가장 최근 달까지 본 것으로 적는다(남의 것은 적지 않는다).
    const [seenAt] = useState(() => seen.read());
    const latest = d?.awards[0]?.month ?? null;
    useEffect(() => { if (d?.member.mine && latest) seen.write(latest); }, [d?.member.mine, latest, seen]);

    // 달마다 받는 것(이달의 랭킹 메달 · 등급 배지)과 월대회 메달은 선반이 다르다
    const counts = useMemo(() => shelfCounts((d?.awards ?? []).filter((a) => a.kind !== "cup") as { kind: "month_rank" | "month_tier"; rank: MedalRank | null; tier: TierId | null }[]), [d]);
    const cups = useMemo(() => {
        const by: Record<CupMedal, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        for (const a of d?.awards ?? []) if (a.kind === "cup" && a.rank) by[a.rank as CupMedal] += 1;
        return { by, total: by[1] + by[2] + by[3] + by[4] + by[5] };
    }, [d]);
    const months = useMemo(() => {
        const by = new Map<string, ShelfAwardRow[]>();
        for (const a of d?.awards ?? []) by.set(a.month, [...(by.get(a.month) ?? []), a]);
        return [...by.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
    }, [d]);
    const n = (v: number) => String(v);
    const gameName = (g: "3c" | "4c") => t(g === "3c" ? "real.tab3c" : "real.tab4c");
    const isNew = (month: string) => !!d?.member.mine && isShelfNew(month, seenAt);
    const times = (c: number) => t("sim.shelf.times").replace("{n}", n(c));
    const medalText = (a: ShelfAwardRow) => t("sim.shelf.rowMedal").replace("{game}", gameName(a.gameType)).replace("{r}", n(a.rank ?? 0)).replace("{p}", signedPoints(a.points));
    const badgeText = (a: ShelfAwardRow) => t("sim.shelf.rowBadge").replace("{tier}", a.tier ? t(`sim.rank.tier.${a.tier}`) : "");
    const cupText = (a: ShelfAwardRow) => t("sim.cup.rowMedal").replace("{place}", t(`sim.cup.place${a.rank ?? 5}`));
    const picked = pick && d ? d.awards.filter((a) => (pick.kind === "medal" ? a.kind === "month_rank" && a.rank === pick.rank : pick.kind === "tier" ? a.kind === "month_tier" && a.tier === pick.tier : a.kind === "cup" && a.rank === pick.medal)) : [];
    // 고른 것의 내력 — 선반 바로 아래에 편다
    const detail = (kind: Pick["kind"]) => pick?.kind === kind && picked.length > 0 && (
        <ul className="mt-2.5 mx-1 pt-2.5 border-t border-white/10 space-y-1" data-testid="shelf-detail" aria-label={t("sim.shelf.gotIn")}>
            {picked.map((a) => (
                <li key={`${a.month}-${a.gameType}`} className="rk-num flex items-baseline justify-between gap-2 text-[12.5px] font-bold text-white/85">
                    <span className="truncate">{monthLabel(a.month, locale)}</span>
                    <span className="shrink-0 text-white/60">{a.kind === "month_rank" ? medalText(a) : a.kind === "cup" ? gameName(a.gameType) : `${gameName(a.gameType)} · ${a.rating}`}</span>
                </li>
            ))}
        </ul>
    );
    const slot = "flex-1 min-w-0 flex flex-col items-center justify-end";

    return (
        <div className={cn("rank-hall w-full", !embedded && "max-w-[420px] mx-auto pb-8")} data-testid="shelf-page">
            {!embedded && <header className="hall-top relative px-5 pt-4">
                <button type="button" onClick={onClose} className="absolute right-5 top-4 h-11 px-4 rounded-pill border border-white/25 bg-black/40 text-[13px] font-semibold text-white/90 active:bg-black/60">
                    {t("sim.common.close")}
                </button>
                <div className="flex items-end gap-2 pt-9">
                    <img src={SHELF_ICON_SRC} width={96} height={96} alt="" aria-hidden="true" decoding="async" draggable={false} className="hall-trophy shrink-0 -ml-2" style={{ width: 96, height: 96 }} />
                    <div className="min-w-0 pb-4">
                        <h1 className="text-[23px] font-black text-white leading-tight">{t("sim.shelf.title")}</h1>
                        <p className="text-[12.5px] font-medium text-white/70 mt-0.5 break-keep">{t("sim.shelf.sub")}</p>
                    </div>
                </div>
            </header>}

            <div className={cn("flex flex-col gap-4", !embedded && "px-5")}>
                {q.isPending && <p className="text-[13px] font-medium text-ink-4 min-h-11 flex items-center">{t("sim.shelf.loading")}</p>}
                {q.isError && (
                    <div className="flex items-center justify-between gap-3 min-h-11" data-testid="shelf-failed">
                        <p className="text-[13px] font-medium text-ink-2">{t("sim.shelf.failed")}</p>
                        <button type="button" onClick={() => { void q.refetch(); }} className="h-10 px-3.5 shrink-0 inline-flex items-center rounded-pill border border-white/15 bg-white/[0.08] text-[13px] font-bold text-white/85">{t("sim.match.retry")}</button>
                    </div>
                )}

                {d && (
                    <>
                        {/* 주인 — 지금 등급과 모은 개수 */}
                        <section className="hall-me rounded-[22px] px-4 py-3.5 flex items-center gap-3" aria-label={d.member.name} data-testid="shelf-owner">
                            <span className={cn("shrink-0", d.tier && "hall-emblem")}>
                                {d.tier ? <TierEmblem tier={d.tier.tier} size={84} glow /> : <TierEmblem tier="iron" size={84} locked />}
                            </span>
                            <div className="flex-1 min-w-0">
                                <p className="text-[18px] font-black text-white leading-tight truncate">
                                    {d.member.country && <span title={countryName(d.member.country, locale)}>{rankFlag(d.member.country) || ""} </span>}
                                    {d.member.name}{d.member.mine ? ` · ${t("sim.rank.meMark")}` : ""}
                                </p>
                                <p className="rk-num text-[13px] font-black mt-1 truncate" style={{ color: d.tier ? TIER_GLOW[d.tier.tier] : "rgba(255,255,255,0.6)" }}>
                                    {d.tier ? t(`sim.rank.tier.${d.tier.tier}`) : t("sim.rank.unrankedShort")}
                                    {d.tier && <span className="font-bold text-white/75">{" · "}{d.tier.rating}</span>}
                                </p>
                                <p className="rk-num text-[12.5px] font-bold text-white/75 mt-1.5 truncate" data-testid="shelf-counts">
                                    {t("sim.shelf.counts").replace("{m}", n(counts.medalTotal + cups.total)).replace("{b}", n(counts.tierTotal))}
                                </p>
                            </div>
                        </section>

                        {/* 이번 달 — 지금 끝난다면 받는 것. 아직 받은 것이 아니라 흐리게 그린다 */}
                        <section className="hall-row px-4 py-3.5" aria-label={t("sim.shelf.nowTitle")} data-testid="shelf-now">
                            <div className="flex items-baseline justify-between gap-2">
                                <h2 className="text-[14px] font-black text-white truncate">{monthLabel(d.current.month, locale)}</h2>
                                <span className="rk-num shrink-0 text-[12px] font-bold text-[color:var(--hall-lime)]">{t("sim.shelf.nowLeft").replace("{n}", n(d.current.daysLeft))}</span>
                            </div>
                            {d.current.boards.length === 0 ? (
                                <p className="text-[13px] font-medium text-white/70 mt-2 break-keep">{t("sim.shelf.nowNone")}</p>
                            ) : (
                                <ul className="mt-2.5 space-y-2.5">
                                    {d.current.boards.map((b) => (
                                        <li key={b.gameType} className="flex items-center gap-2" data-game={b.gameType}>
                                            <div className="flex-1 min-w-0">
                                                <p className="rk-num text-[13.5px] font-black text-white truncate">
                                                    {gameName(b.gameType)}
                                                    {b.rank !== null && <span className={cn("ml-1.5", b.points > 0 ? "text-[color:var(--hall-lime)]" : "text-white/80")}>{signedPoints(b.points)}</span>}
                                                </p>
                                                <p className="rk-num text-[12px] font-bold text-white/65 mt-0.5 break-keep">
                                                    {b.rank !== null
                                                        ? t("sim.rank.rankOf").replace("{r}", n(b.rank)).replace("{n}", n(b.total))
                                                        : t("sim.rank.monthNeed").replace("{n}", n(b.matches)).replace("{m}", n(d.current.minMatches)).replace("{left}", n(Math.max(0, d.current.minMatches - b.matches)))}
                                                </p>
                                            </div>
                                            {(b.medal || b.tier) && (
                                                <span className="shrink-0 flex flex-col items-center opacity-60" aria-label={t("sim.shelf.nowWill")} title={t("sim.shelf.nowWill")} data-testid="shelf-now-preview">
                                                    <span className="flex items-center gap-1">
                                                        {b.medal && <RankMedal rank={b.medal} size={40} />}
                                                        {b.tier && <TierEmblem tier={b.tier} size={42} />}
                                                    </span>
                                                    {/* 아직 받은 것이 아니라는 말을 그림 바로 아래에 */}
                                                    <span className="block max-w-[104px] text-[11px] font-bold text-white/80 text-center truncate mt-0.5" aria-hidden="true">{t("sim.shelf.nowIf")}</span>
                                                </span>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <p className="text-[11.5px] font-medium text-white/55 mt-3 leading-relaxed break-keep">{t("sim.shelf.nowHint").replace("{n}", n(d.current.minMatches))}</p>
                            {(onRank || (onPlay && d.member.mine)) && (
                                <div className="flex gap-2 mt-3">
                                    {onRank && (
                                        <button type="button" onClick={onRank} data-testid="shelf-to-rank" className="h-10 px-3.5 inline-flex items-center rounded-pill border border-white/15 bg-white/[0.08] text-[13px] font-bold text-white/90 active:bg-white/15">
                                            {t("sim.shelf.toRank")}
                                        </button>
                                    )}
                                    {onPlay && d.member.mine && (
                                        <button type="button" onClick={onPlay} data-testid="shelf-play" className="h-10 px-4 inline-flex items-center rounded-pill bg-[color:var(--hall-lime)] text-[#0B1A03] text-[13px] font-black active:opacity-90">
                                            {t("lookalike.playOnline")}
                                        </button>
                                    )}
                                </div>
                            )}
                        </section>

                        {/* 선반 1 — 이달의 랭킹 메달 */}
                        <ShelfRow title={t("sim.shelf.medals")} count={times(counts.medalTotal)} foot={detail("medal")}>
                            <div className="flex items-end px-2 pt-3">
                                {MEDAL_RANKS.map((r) => {
                                    const c = counts.medals[r];
                                    const fresh = !!d.awards.find((a) => a.kind === "month_rank" && a.rank === r && isNew(a.month));
                                    const body = <span className={cn(c === 0 && "opacity-30 grayscale")}><RankMedal rank={r} size={76} /></span>;
                                    return (
                                        <span key={r} className={slot} data-medal={r} data-count={c}>
                                            {fresh && <NewMark label={t("sim.shelf.new")} />}
                                            {c > 0
                                                ? <button type="button" onClick={() => setPick(samePick(pick, { kind: "medal", rank: r }) ? null : { kind: "medal", rank: r })} aria-pressed={samePick(pick, { kind: "medal", rank: r })}
                                                    aria-label={`${t("sim.shelf.medalName").replace("{r}", n(r))} ${times(c)}`} className="active:opacity-80">{body}</button>
                                                : body}
                                        </span>
                                    );
                                })}
                            </div>
                            <div className="hall-plank mx-1" aria-hidden="true" />
                            <div className="flex px-2 pt-2">
                                {MEDAL_RANKS.map((r) => (
                                    <span key={r} className="flex-1 min-w-0 text-center">
                                        <span className="block text-[12px] font-bold text-white/75 truncate">{t("sim.shelf.medalName").replace("{r}", n(r))}</span>
                                        <span className={cn("block rk-num text-[13px] font-black", counts.medals[r] > 0 ? "text-[color:var(--hall-gold)]" : "text-white/30")}>{times(counts.medals[r])}</span>
                                    </span>
                                ))}
                            </div>
                        </ShelfRow>

                        {/* 선반 2 — 달마다 받은 등급 배지 */}
                        <ShelfRow title={t("sim.shelf.badges")} count={times(counts.tierTotal)} foot={detail("tier")}>
                            <div className="flex items-end pt-3">
                                {TIERS.map((tier) => {
                                    const c = counts.tiers[tier.id];
                                    const fresh = !!d.awards.find((a) => a.kind === "month_tier" && a.tier === tier.id && isNew(a.month));
                                    const body = <TierEmblem tier={tier.id} size={42} locked={c === 0} />;
                                    return (
                                        <span key={tier.id} className={slot} data-tier={tier.id} data-count={c}>
                                            {fresh && <NewMark label={t("sim.shelf.new")} />}
                                            {c > 0
                                                ? <button type="button" onClick={() => setPick(samePick(pick, { kind: "tier", tier: tier.id }) ? null : { kind: "tier", tier: tier.id })} aria-pressed={samePick(pick, { kind: "tier", tier: tier.id })}
                                                    aria-label={`${t(tier.nameKey)} ${times(c)}`} className="active:opacity-80">{body}</button>
                                                : <span title={t(tier.nameKey)}>{body}</span>}
                                        </span>
                                    );
                                })}
                            </div>
                            <div className="hall-plank mx-1" aria-hidden="true" />
                            <div className="flex pt-2">
                                {TIERS.map((tier) => (
                                    <span key={tier.id} className={cn("flex-1 min-w-0 text-center rk-num text-[12.5px] font-black", counts.tiers[tier.id] > 0 ? "text-[color:var(--hall-gold)]" : "text-white/30")}>
                                        {times(counts.tiers[tier.id])}
                                    </span>
                                ))}
                            </div>
                        </ShelfRow>

                        {/* 선반 3 — 월대회 메달(우승 · 준우승 · 3위 · 4위 · 8강). 가운데에 트로피가 새겨진 메달이라 이달의 랭킹 메달과 갈린다 */}
                        <ShelfRow title={t("sim.cup.shelfMedals")} count={times(cups.total)} foot={<>
                            {detail("cup")}
                            {/* 아직 받은 것이 없으면 어떻게 받는지를 적는다 — 대회는 달마다 다음 달 초에 열린다 */}
                            {cups.total === 0 && <p className="mx-1 mt-2.5 text-[12px] font-medium text-white/55 break-keep" data-testid="shelf-cup-soon">{t("sim.shelf.cupSoon")}</p>}
                            {onCup && (
                                <button type="button" onClick={onCup} data-testid="shelf-to-cup" data-track-as="장식장 월대회로"
                                    className="mt-2.5 mx-1 h-10 px-3.5 inline-flex items-center rounded-pill border border-white/15 bg-white/[0.08] text-[13px] font-bold text-white/90 active:bg-white/15">
                                    {t("sim.cup.title")}
                                </button>
                            )}
                        </>}>
                            <div className="flex items-end pt-3" data-testid="shelf-cup">
                                {CUP_MEDALS.map((m) => {
                                    const c = cups.by[m];
                                    const fresh = !!d.awards.find((a) => a.kind === "cup" && a.rank === m && isNew(a.month));
                                    const body = <CupMedalArt medal={m} size={54} locked={c === 0} />;
                                    return (
                                        <span key={m} className={slot} data-cup={m} data-count={c}>
                                            {fresh && <NewMark label={t("sim.shelf.new")} />}
                                            {c > 0
                                                ? <button type="button" onClick={() => setPick(samePick(pick, { kind: "cup", medal: m }) ? null : { kind: "cup", medal: m })} aria-pressed={samePick(pick, { kind: "cup", medal: m })}
                                                    aria-label={`${t(`sim.cup.place${m}`)} ${times(c)}`} className="active:opacity-80">{body}</button>
                                                : <span title={t(`sim.cup.place${m}`)}>{body}</span>}
                                        </span>
                                    );
                                })}
                            </div>
                            <div className="hall-plank mx-1" aria-hidden="true" />
                            <div className="flex pt-2">
                                {CUP_MEDALS.map((m) => (
                                    <span key={m} className="flex-1 min-w-0 text-center">
                                        <span className="block text-[11.5px] font-bold text-white/75 truncate">{t(`sim.cup.place${m}`)}</span>
                                        <span className={cn("block rk-num text-[12.5px] font-black", cups.by[m] > 0 ? "text-[color:var(--hall-gold)]" : "text-white/30")}>{times(cups.by[m])}</span>
                                    </span>
                                ))}
                            </div>
                        </ShelfRow>

                        {/* 달마다 — 최근 달부터 */}
                        <section aria-label={t("sim.shelf.months")} data-testid="shelf-months">
                            <h2 className="px-1 mb-2 text-[12px] font-black tracking-wide text-white/55">{t("sim.shelf.months")}</h2>
                            {months.length === 0 ? (
                                <div className="hall-row px-4 py-4">
                                    <p className="text-[15px] font-black text-white">{t("sim.shelf.monthsEmpty")}</p>
                                    <p className="text-[13px] font-medium text-white/65 mt-1 break-keep">{t("sim.shelf.monthsEmptyDesc").replace("{month}", monthLabel(d.current.month, locale))}</p>
                                </div>
                            ) : (
                                <ol className="space-y-2">
                                    {months.map(([month, list]) => {
                                        const medals = list.filter((a) => a.kind === "month_rank");
                                        const badges = list.filter((a) => a.kind === "month_tier");
                                        const cupWon = list.filter((a) => a.kind === "cup");
                                        return (
                                            <li key={month} className={cn("hall-row px-3.5 py-3 flex items-center gap-2", (medals.length > 0 || cupWon.length > 0) && "hall-row-top")} data-month={month}>
                                                <div className="flex-1 min-w-0">
                                                    <p className="flex items-center gap-1.5 min-w-0">
                                                        <span className="text-[14px] font-black text-white truncate">{monthLabel(month, locale)}</span>
                                                        {isNew(month) && <NewMark label={t("sim.shelf.new")} />}
                                                    </p>
                                                    <p className="rk-num text-[12px] font-bold text-white/65 mt-0.5 break-keep">
                                                        {[...cupWon.map(cupText), ...medals.map(medalText), ...badges.map(badgeText)].join(" · ")}
                                                    </p>
                                                </div>
                                                <span className="shrink-0 flex items-center gap-1">
                                                    {cupWon.map((a) => <CupMedalArt key={`c-${a.gameType}`} medal={a.rank as CupMedal} size={38} />)}
                                                    {medals.map((a) => <RankMedal key={`m-${a.gameType}`} rank={a.rank as MedalRank} size={38} />)}
                                                    {badges.map((a) => <TierEmblem key={`t-${a.gameType}`} tier={a.tier as TierId} size={40} />)}
                                                </span>
                                            </li>
                                        );
                                    })}
                                </ol>
                            )}
                        </section>
                    </>
                )}
            </div>
        </div>
    );
}

export default ShelfPage;
