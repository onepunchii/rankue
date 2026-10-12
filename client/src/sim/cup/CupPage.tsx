/**
 * 월대회(2026-10-12 오너: "매월 대회 … 레이팅 기준으로 출전권 → 토너먼트 → 상대방이 못 오면 기권으로 · 1~5등 메달 · 장식장" → "추천대로"). `/online-game?cup=1`.
 *
 * 위에서부터
 *  - 머리(대회 그림) → **지금 대회**(가장 최근 것): 내 경기(상대 · 기한 · 기다리기/입장) → 끝났으면 결과(메달) → 대진표(라운드마다).
 *  - **다음 대회**: 이번 달 성적으로 다음 달 1일에 연다 — 내 출전 조건(레이팅 · 이달 판 수), 지금 이대로면 나가는 사람, 규칙.
 *
 * 대회 판은 초대 방이다. 먼저 누른 사람이 방을 열고(기다리기) 상대에게 알림이 간다 — 상대가 '입장'을 누르면 바로 시작한다.
 * 기한까지 한 사람만 들어왔으면 그 사람의 기권승이라, '기다리기'를 누른 것 자체가 기록이다.
 * 내 경기가 있는 동안에는 몇 초마다 다시 읽는다(상대가 들어왔는지 · 판이 시작됐는지). 내가 열어 둔 방에 상대가 들어오면 그 판으로 옮겨 간다.
 *
 * 숫자와 글자는 그림에 없다 — 전부 여기서 그린다. 색 · 광택은 .rank-hall(index.css). 규칙은 shared/simCup, 값은 GET /sim/cup.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { CupMedal } from "@shared/simCup";
import { rankFlag } from "../rank/flag";
import { monthLabel } from "../rank/MonthlyRank";
import { TierEmblem } from "../rank/TierEmblem";
import { CUP_QUERY_KEY, cupApi as defaultApi, roundSize, timeLeft, type CupApi, type CupEntry, type CupGameRow, type CupNow, type CupPerson, type CupView } from "./cupApi";
import { CUP_ICON_SRC, CupMedalArt } from "./CupArt";

export interface CupPageProps {
    onClose: () => void;
    api?: CupApi;
    /** 시작된 대회 판으로 */
    onOpenMatch: (matchId: string) => void;
    /** 내가 열어 둔 대기 방으로 */
    onLobby?: () => void;
    onRank?: () => void;
    onShelf?: () => void;
    /** 내 경기가 있을 때 다시 읽는 간격(ms). 시험에서는 0 으로 끈다 */
    pollMs?: number;
    /** 내 회원 id — 대진표 · 결과에서 내 줄에 '나'를 붙인다. 안 주면 내 경기 칸에서 알아낸다 */
    myMemberId?: string;
}

const pill = "h-10 px-3.5 shrink-0 inline-flex items-center rounded-pill border border-white/15 bg-white/[0.08] text-[13px] font-bold text-white/90 active:bg-white/15";
const cta = "h-12 px-5 inline-flex items-center justify-center rounded-pill bg-[color:var(--hall-lime)] text-[#0B1A03] text-[15px] font-black active:opacity-90 disabled:opacity-50";

/** 이름 한 줄 — 시드 · 등급 배지 · 국기 · 이름 */
function Who({ p, dim, strong, me }: { p: CupPerson | null; dim?: boolean; strong?: boolean; me?: boolean }) {
    const { t } = useT();
    if (!p) return <span className="flex-1 min-w-0 text-[13px] font-bold text-white/35">{t("sim.cup.tbd")}</span>;
    return (
        <span className={cn("flex-1 min-w-0 flex items-center gap-1.5", dim && "opacity-45")}>
            <span className="rk-num w-5 shrink-0 text-center text-[11.5px] font-black text-white/50">{p.seed}</span>
            {p.tier ? <TierEmblem tier={p.tier} size={26} /> : <TierEmblem tier="iron" size={26} locked />}
            <span className={cn("min-w-0 truncate text-[13.5px]", strong ? "font-black text-white" : "font-bold text-white/85")}>
                {p.country ? `${rankFlag(p.country) || ""} ` : ""}{p.name}{me ? ` · ${t("sim.rank.meMark")}` : ""}
            </span>
        </span>
    );
}

function Section({ title, right, children, testId }: { title: string; right?: ReactNode; children: ReactNode; testId?: string }) {
    return (
        <section aria-label={title} data-testid={testId}>
            <div className="flex items-baseline justify-between gap-2 px-1 mb-2">
                <h2 className="min-w-0 text-[12px] font-black tracking-wide text-white/55 break-keep">{title}</h2>
                {right}
            </div>
            {children}
        </section>
    );
}

export function CupPage({ onClose, api = defaultApi, onOpenMatch, onLobby, onRank, onShelf, pollMs = 5000, myMemberId }: CupPageProps) {
    const { t, locale } = useT();
    const qc = useQueryClient();
    const [failed, setFailed] = useState(false);
    const q = useQuery({
        queryKey: [...CUP_QUERY_KEY, "3c"],
        queryFn: () => api.get("3c"),
        staleTime: 3000,
        // 내 경기가 있는 동안만 다시 읽는다 — 상대가 들어왔는지, 판이 시작됐는지
        refetchInterval: (query) => { const d = query.state.data as CupView | undefined; return pollMs > 0 && d?.cup?.status === "running" && d.cup.mine ? pollMs : false; },
    });
    const d = q.data;
    const cup = d?.cup ?? null;
    const mine = cup?.status === "running" ? cup.mine : null;
    const people = useMemo(() => new Map<string, CupEntry>((cup?.entries ?? []).map((e) => [e.memberId, e])), [cup]);
    const myId = useMemo(() => {
        if (myMemberId) return myMemberId;
        if (!cup || !mine) return null;
        const g = cup.games.find((x) => x.id === mine.gameId);
        return g ? (g.p1Id === mine.opponentId ? g.p2Id : g.p1Id) : null;
    }, [cup, mine, myMemberId]);
    const n = (v: number) => String(v);

    // 내가 열어 둔 방에 상대가 들어왔다 — 그 판으로 옮겨 간다(첫 샷까지 2분이 주어진다)
    const prev = useRef<string | null>(null);
    useEffect(() => {
        const now = mine?.matchStatus ?? null;
        if (prev.current === "waiting" && now === "playing" && mine?.hosting && mine.matchId) onOpenMatch(mine.matchId);
        prev.current = now;
    }, [mine?.matchStatus, mine?.hosting, mine?.matchId, onOpenMatch]);

    const ready = useMutation({
        mutationFn: async (gameId: string) => {
            const r = await api.ready(gameId);
            if (r.state === "join") await api.join(r.matchId);
            return r;
        },
        onMutate: () => setFailed(false),
        onSuccess: (r) => {
            void qc.invalidateQueries({ queryKey: CUP_QUERY_KEY });
            // 들어갔거나 이미 치는 중이면 그 판으로. 방을 연 쪽은 여기 남아 상대를 기다린다(대기 방으로 갈 수도 있다)
            if (r.state !== "hosting") onOpenMatch(r.matchId);
        },
        onError: () => { setFailed(true); void qc.invalidateQueries({ queryKey: CUP_QUERY_KEY }); },
    });

    const roundName = (g: Pick<CupGameRow, "kind" | "round">, rounds: number) => {
        if (g.kind === "third") return t("sim.cup.third");
        const size = roundSize(g.round, rounds);
        return size <= 2 ? t("sim.cup.final") : size === 4 ? t("sim.cup.semi") : t("sim.cup.roundOf").replace("{n}", n(size));
    };
    const when = (ms: number) => { try { return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(ms)); } catch { return new Date(ms).toISOString().slice(5, 16); } };
    const left = (ms: number) => {
        const l = timeLeft(ms, d?.nowMs ?? Date.now());
        if (!l) return t("sim.cup.leftNone");
        if (l.days > 0) return t("sim.cup.leftDays").replace("{d}", n(l.days)).replace("{h}", n(l.hours));
        return l.hours > 0 ? t("sim.cup.leftHours").replace("{h}", n(l.hours)).replace("{m}", n(l.minutes)) : t("sim.cup.leftMin").replace("{m}", n(l.minutes));
    };
    const placeName = (m: CupMedal) => t(`sim.cup.place${m}`);

    /** 대진의 한 칸 */
    const gameRow = (g: CupGameRow, c: CupNow) => {
        const a = g.p1Id ? people.get(g.p1Id) ?? null : null, b = g.p2Id ? people.get(g.p2Id) ?? null : null;
        const done = !!g.outcome;
        const tag = g.outcome === "bye" ? t("sim.cup.bye") : g.outcome === "walkover" ? t("sim.cup.walkover") : g.outcome === "void" ? t("sim.cup.void") : g.outcome === "seed" ? t("sim.cup.bySeed") : null;
        const isMine = !!mine && g.id === mine.gameId;
        return (
            <li key={g.id} className={cn("hall-row px-3 py-2.5", isMine && "hall-row-mine")} data-game={`${g.kind}:${g.round}:${g.slot}`} data-outcome={g.outcome ?? ""}>
                <div className="flex items-center gap-2 min-h-7">
                    <Who p={a} strong={done && g.winnerId === g.p1Id} dim={done && g.winnerId !== g.p1Id} me={!!myId && g.p1Id === myId} />
                    {done && g.winnerId && g.winnerId === g.p1Id && <span className="shrink-0 text-[11.5px] font-black text-[color:var(--hall-lime)]">{t("sim.cup.win")}</span>}
                </div>
                {/* 부전승은 상대 줄이 없다 */}
                {g.outcome !== "bye" && (
                    <div className="flex items-center gap-2 min-h-7 mt-1">
                        <Who p={b} strong={done && g.winnerId === g.p2Id} dim={done && g.winnerId !== g.p2Id} me={!!myId && g.p2Id === myId} />
                        {done && g.winnerId && g.winnerId === g.p2Id && <span className="shrink-0 text-[11.5px] font-black text-[color:var(--hall-lime)]">{t("sim.cup.win")}</span>}
                    </div>
                )}
                {(tag || (!done && g.p1Id && g.p2Id && c.status === "running")) && (
                    <p className="rk-num mt-1.5 pl-[26px] text-[11.5px] font-bold text-white/50 truncate">
                        {tag ?? `${t("sim.cup.deadline").replace("{date}", when(g.deadlineMs))}`}
                    </p>
                )}
            </li>
        );
    };

    return (
        <div className="rank-hall w-full max-w-[420px] mx-auto pb-8" data-testid="cup-page">
            <header className="hall-top relative px-5 pt-4">
                <button type="button" onClick={onClose} className="absolute right-5 top-4 h-11 px-4 rounded-pill border border-white/25 bg-black/40 text-[13px] font-semibold text-white/90 active:bg-black/60">
                    {t("sim.common.close")}
                </button>
                <div className="flex items-end gap-2 pt-9">
                    <img src={CUP_ICON_SRC} width={100} height={100} alt="" aria-hidden="true" decoding="async" draggable={false} className="hall-trophy shrink-0 -ml-2" style={{ width: 100, height: 100 }} />
                    <div className="min-w-0 pb-4">
                        <h1 className="text-[23px] font-black text-white leading-tight">{t("sim.cup.title")}</h1>
                        <p className="text-[12.5px] font-medium text-white/70 mt-0.5 break-keep">{t("sim.cup.sub")}</p>
                    </div>
                </div>
            </header>

            <div className="px-5 flex flex-col gap-5">
                {q.isPending && <p className="text-[13px] font-medium text-ink-4 min-h-11 flex items-center">{t("sim.cup.loading")}</p>}
                {q.isError && (
                    <div className="flex items-center justify-between gap-3 min-h-11" data-testid="cup-failed">
                        <p className="text-[13px] font-medium text-ink-2">{t("sim.cup.failed")}</p>
                        <button type="button" onClick={() => { void q.refetch(); }} className={pill}>{t("sim.match.retry")}</button>
                    </div>
                )}

                {d && cup && (
                    <>
                        <div className="flex items-center justify-between gap-2 -mb-2">
                            <h2 className="text-[17px] font-black text-white truncate" data-testid="cup-name">{t("sim.cup.cupOf").replace("{month}", monthLabel(cup.month, locale))}</h2>
                            <span className={cn("shrink-0 h-7 px-2.5 inline-flex items-center rounded-pill text-[12px] font-black", cup.status === "running" ? "bg-[color:var(--hall-lime)] text-[#0B1A03]" : "bg-white/10 text-white/70")} data-testid="cup-status">
                                {t(cup.status === "running" ? "sim.cup.statusRunning" : "sim.cup.statusFinished")}
                            </span>
                        </div>

                        {/* 내 경기 — 상대 · 기한 · 기다리기/입장 */}
                        {mine && (
                            <section className="hall-me rounded-[22px] px-4 py-4" aria-label={t("sim.cup.myGame")} data-testid="cup-mine">
                                <p className="text-[12.5px] font-black text-white/65">
                                    {t("sim.cup.myGame")}{(() => { const g = cup.games.find((x) => x.id === mine.gameId); return g ? ` · ${roundName(g, cup.rounds)}` : ""; })()}
                                </p>
                                {mine.waiting || !mine.opponentId ? (
                                    <p className="text-[15px] font-black text-white mt-2 break-keep">{t("sim.cup.vsWaiting")}</p>
                                ) : (
                                    <>
                                        <div className="mt-2 flex items-center gap-2">
                                            <span className="text-[13px] font-black text-white/55">VS</span>
                                            <Who p={people.get(mine.opponentId) ?? null} strong />
                                        </div>
                                        <p className="rk-num text-[12.5px] font-bold text-white/80 mt-2" data-testid="cup-deadline">
                                            {t("sim.cup.deadline").replace("{date}", when(mine.deadlineMs))}{" · "}<span className="text-[color:var(--hall-lime)]">{left(mine.deadlineMs)}</span>
                                        </p>
                                        {(mine.matchStatus === "playing" || mine.opponentReady || mine.iReady) && (
                                            <p className="text-[12.5px] font-bold text-white mt-1.5 break-keep" data-testid="cup-state">
                                                {mine.matchStatus === "playing" ? t("sim.cup.playing") : mine.opponentReady && !mine.hosting ? t("sim.cup.oppWaiting") : t("sim.cup.iWaiting")}
                                            </p>
                                        )}
                                        <div className="flex flex-wrap gap-2 mt-3">
                                            {mine.matchStatus === "playing" && mine.matchId ? (
                                                <button type="button" className={cta} onClick={() => onOpenMatch(mine.matchId!)} data-testid="cup-go" data-track-as="월대회 이어서 치기">{t("sim.cup.btnBack")}</button>
                                            ) : mine.matchStatus === "waiting" && mine.hosting ? (
                                                onLobby && <button type="button" className={cta} onClick={onLobby} data-testid="cup-room" data-track-as="월대회 대기 방으로">{t("sim.cup.btnRoom")}</button>
                                            ) : (
                                                <button type="button" className={cta} disabled={ready.isPending} onClick={() => ready.mutate(mine.gameId)} data-testid="cup-ready" data-track-as="월대회 기다리기">
                                                    {t(mine.matchStatus === "waiting" ? "sim.cup.btnEnter" : "sim.cup.btnWait")}
                                                </button>
                                            )}
                                        </div>
                                        {failed && <p className="text-[12.5px] font-bold text-[#ffb4a8] mt-2 break-keep" role="alert" data-testid="cup-ready-failed">{t("sim.cup.readyFailed")}</p>}
                                        <p className="text-[11.5px] font-medium text-white/55 mt-3 leading-relaxed break-keep">{t("sim.cup.readyHint")}</p>
                                    </>
                                )}
                            </section>
                        )}

                        {/* 끝난 대회 — 메달 받은 사람 */}
                        {cup.status === "finished" && (
                            <Section title={t("sim.cup.result")} testId="cup-result">
                                <ol className="space-y-2">
                                    {cup.entries.filter((e) => e.medal !== null).sort((a, b) => (a.place ?? 9) - (b.place ?? 9) || a.seed - b.seed).map((e) => (
                                        <li key={e.memberId} className={cn("hall-row pl-2 pr-3 py-2 flex items-center gap-2", (e.medal ?? 9) <= 3 && "hall-row-top", !!myId && e.memberId === myId && "hall-row-mine")} data-medal={e.medal}>
                                            <CupMedalArt medal={e.medal as CupMedal} size={44} />
                                            <span className="w-14 shrink-0 text-[12.5px] font-black text-[color:var(--hall-gold)]">{placeName(e.medal as CupMedal)}</span>
                                            <Who p={e} strong me={!!myId && e.memberId === myId} />
                                        </li>
                                    ))}
                                </ol>
                            </Section>
                        )}

                        <Section title={t("sim.cup.bracket")} testId="cup-bracket">
                            <div className="flex flex-col gap-3">
                                {Array.from({ length: cup.rounds }, (_, i) => cup.rounds - i).map((round) => {
                                    const main = cup.games.filter((g) => g.kind === "main" && g.round === round).sort((a, b) => a.slot - b.slot);
                                    const third = round === cup.rounds ? cup.games.filter((g) => g.kind === "third") : [];
                                    return (
                                        <div key={round}>
                                            <p className="px-1 mb-1.5 text-[12.5px] font-black text-white/80">{main[0] ? roundName(main[0], cup.rounds) : ""}</p>
                                            <ul className="space-y-2">{main.map((g) => gameRow(g, cup))}</ul>
                                            {third.length > 0 && (
                                                <>
                                                    <p className="px-1 mt-3 mb-1.5 text-[12.5px] font-black text-white/80">{t("sim.cup.third")}</p>
                                                    <ul className="space-y-2">{third.map((g) => gameRow(g, cup))}</ul>
                                                </>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </Section>
                    </>
                )}

                {d && (
                    <>
                        {/* 다음 대회 — 이번 달 성적으로 다음 달 1일에 */}
                        <Section title={t("sim.cup.nextTitle").replace("{month}", monthLabel(d.next.month, locale))} testId="cup-next"
                            right={<span className="rk-num shrink-0 text-[12px] font-bold text-[color:var(--hall-lime)]">{t("sim.shelf.nowLeft").replace("{n}", n(d.next.daysLeft))}</span>}>
                            <div className="hall-row px-4 py-3.5" data-testid="cup-qual" data-qualified={d.next.me.qualified ? "1" : "0"}>
                                <p className={cn("text-[15px] font-black break-keep", d.next.me.qualified ? "text-[color:var(--hall-lime)]" : "text-white")}>
                                    {d.next.me.qualified ? t("sim.cup.qualYes").replace("{n}", n(d.next.me.seed ?? 0)) : t("sim.cup.qualNo")}
                                </p>
                                <ul className="mt-2.5 space-y-1.5">
                                    {[
                                        { ok: d.next.me.rating !== null && d.next.me.rating >= d.next.minRating, need: t("sim.cup.qualRating").replace("{n}", n(d.next.minRating)), now: d.next.me.rating === null ? t("sim.cup.qualRatingNone") : t("sim.cup.qualNow").replace("{n}", n(d.next.me.rating)) },
                                        { ok: d.next.me.matches >= d.next.minMatches, need: t("sim.cup.qualMatches").replace("{n}", n(d.next.minMatches)), now: t("sim.cup.qualMatchesNow").replace("{n}", n(d.next.me.matches)) },
                                    ].map((c, i) => (
                                        <li key={i} className="flex items-center gap-2 text-[13px] font-bold" data-ok={c.ok ? "1" : "0"}>
                                            <span className={cn("w-5 h-5 shrink-0 rounded-full inline-flex items-center justify-center text-[12px] font-black", c.ok ? "bg-[color:var(--hall-lime)] text-[#0B1A03]" : "bg-white/10 text-white/40")} aria-hidden="true">{c.ok ? "✓" : "·"}</span>
                                            <span className="flex-1 min-w-0 text-white/90 break-keep">{c.need}</span>
                                            <span className="rk-num shrink-0 text-white/60">{c.now}</span>
                                        </li>
                                    ))}
                                </ul>
                                <p className="text-[11.5px] font-medium text-white/55 mt-3 leading-relaxed break-keep">{t("sim.cup.qualHint")}</p>
                                {(onRank || onShelf) && (
                                    <div className="flex gap-2 mt-3">
                                        {onRank && <button type="button" onClick={onRank} className={pill} data-testid="cup-to-rank">{t("sim.shelf.toRank")}</button>}
                                        {onShelf && <button type="button" onClick={onShelf} className={pill} data-testid="cup-to-shelf">{t("sim.shelf.title")}</button>}
                                    </div>
                                )}
                            </div>
                        </Section>

                        <Section title={t("sim.cup.entrantsTitle")} testId="cup-entrants"
                            right={d.next.entrants.length > 0 ? <span className="rk-num shrink-0 text-[12px] font-bold text-white/55">{d.next.size > 0 ? t("sim.cup.entrantsSize").replace("{n}", n(d.next.entrants.length)).replace("{size}", n(d.next.size)) : t("sim.cup.entrantsFew").replace("{n}", n(d.next.entrants.length))}</span> : undefined}>
                            {d.next.entrants.length === 0 ? (
                                <div className="hall-row px-4 py-3.5"><p className="text-[13.5px] font-bold text-white/80 break-keep">{t("sim.cup.entrantsNone")}</p></div>
                            ) : (
                                <ol className="space-y-1.5">
                                    {d.next.entrants.map((e) => (
                                        <li key={e.memberId} className="hall-row h-11 pl-2 pr-3 flex items-center gap-2">
                                            <Who p={e} />
                                            <span className="hall-rating rk-num shrink-0 h-7 px-2.5 inline-flex items-center rounded-pill text-[12.5px] font-black text-white">{e.rating}</span>
                                        </li>
                                    ))}
                                </ol>
                            )}
                        </Section>

                        <Section title={t("sim.cup.rulesTitle")} testId="cup-rules">
                            <ul className="hall-row px-4 py-3.5 space-y-2">
                                {[
                                    t("sim.cup.rule1").replace("{n}", n(d.next.maxEntrants)),
                                    t("sim.cup.rule2").replace("{n}", n(d.next.roundDays)),
                                    t("sim.cup.rule3"), t("sim.cup.rule4"), t("sim.cup.rule5"),
                                ].map((line, i) => (
                                    <li key={i} className="flex gap-2 text-[12.5px] font-medium text-white/75 leading-relaxed break-keep">
                                        <span className="shrink-0 text-white/35" aria-hidden="true">·</span><span>{line}</span>
                                    </li>
                                ))}
                            </ul>
                        </Section>
                    </>
                )}
            </div>
        </div>
    );
}

export default CupPage;
