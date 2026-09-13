/**
 * 다시보기 목록(2026-09-12 관전 출시 → 2026-09-13 오너: "3구·4구 나누는 게 좋을까? 고수들 리플 보는 탭은 어때?").
 *
 * 고르는 축 둘:
 *  - **종목 칩**(3쿠션 / 4구) — 섞여 있으면 보고 싶은 종목을 찾느라 스크롤해야 한다.
 *  - **정렬 탭**(최근 / 하이런 / 명경기) — '고수' 를 레이팅으로 고르지 않는다. 보고 싶은 건 그 경기의 내용이고,
 *    초보가 우연히 잘 친 판도 올라오는 편이 낫다(shared/sim/watchRank).
 * 줄마다 하이런·에버리지를 적는다 — 점수만 있으면 다 비슷해 보여서 뭘 볼지 고를 수가 없었다.
 *
 * '게임 중' 인 방은 멀티방 목록 안에 '게임중 · 관전' 으로 뜬다 — 여기는 끝난 경기만 다룬다.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { caromsOf } from "@shared/sim/handicap";
import { highlightsOf, sortWatch, type WatchSort } from "@shared/watchRank";
import type { GameType } from "@shared/sim/rules/types";
import { matchApi, type MatchApi, type WatchCard } from "../matchApi";
import { gameLabel } from "../match/matchView";
import { GameBalls } from "../rank/GameBalls";
import { WATCH_LIST_REFETCH_MS, WATCH_QUERY_KEY } from "./watchPlan";

const SORTS: readonly { key: WatchSort; label: string }[] = [
    { key: "recent", label: "sim.watch.sortRecent" },
    { key: "highRun", label: "sim.watch.sortHighRun" },
    { key: "best", label: "sim.watch.sortBest" },
];

const chip = "h-9 px-3 shrink-0 inline-flex items-center gap-1.5 rounded-pill border text-[12.5px] font-bold";
const chipOn = "border-transparent bg-[color:var(--arc-frame)] text-[color:var(--arc-ink)]";
const chipOff = "border-white/15 bg-white/[0.08] text-white/85 active:bg-white/15";

function Row({ card, onOpen }: { card: WatchCard; onOpen: (id: string) => void }) {
    const { t } = useT();
    const names = [card.hostName, card.guestName ?? "-"];
    const h = highlightsOf({ ...card, gameType: card.gameType as GameType });
    const scores = [caromsOf(card.scores[0] ?? 0, card.gameType), caromsOf(card.scores[1] ?? 0, card.gameType)];
    return (
        <li className="rounded-tile border border-surface-line bg-surface-1 px-4 py-3 flex items-center gap-3">
            <span className="flex-1 min-w-0 flex flex-col gap-1">
                <span className="text-[14px] font-semibold text-ink-1 truncate">
                    {names[0]} <span className="text-ink-3">vs</span> {names[1]}
                </span>
                <span className="text-[12px] font-medium text-ink-3 truncate">
                    {gameLabel(card, t)} · <span className="tabular-nums">{card.scores[0] ?? 0} : {card.scores[1] ?? 0}</span>
                    {card.winnerIndex !== null && <> · {names[card.winnerIndex]} {t("sim.watch.win")}</>}
                </span>
                {/* 뭘 볼지 고를 수 있게 — 점수만 있으면 다 비슷해 보인다(2026-09-13 오너) */}
                <span className="flex flex-wrap gap-1.5">
                    {h.highRun > 0 && (
                        <span className="rk-chip bg-surface-3 text-ink-2 tabular-nums">{t("sim.watch.runOf").replace("{n}", String(h.highRun))}</span>
                    )}
                    <span className="rk-chip bg-surface-3 text-ink-2 tabular-nums">{t("sim.watch.avgOf").replace("{v}", h.avg.toFixed(2))}</span>
                    {h.closeness > 0.85 && Math.min(...scores) > 0 && (
                        <span className="rk-chip bg-brand/15 text-brand font-bold">{t("sim.watch.closeGame")}</span>
                    )}
                </span>
            </span>
            <button
                type="button" onClick={() => onOpen(card.id)}
                className="h-10 px-4 shrink-0 rounded-pill bg-[color:var(--arc-frame)] text-[color:var(--arc-ink)] text-[13px] font-black"
            >{t("sim.watch.replay")}</button>
        </li>
    );
}

export function WatchList({ onOpen, api = matchApi }: { onOpen: (id: string) => void; api?: MatchApi }) {
    const { t } = useT();
    const [game, setGame] = useState<GameType | null>(null);
    const [sort, setSort] = useState<WatchSort>("recent");
    const { data } = useQuery({
        queryKey: WATCH_QUERY_KEY,
        queryFn: () => api.getWatchable(),
        refetchInterval: WATCH_LIST_REFETCH_MS,
    });
    const all = data?.replays ?? [];
    /** 칩은 실제로 경기가 있는 종목만 — 눌러도 빈 목록이 나오는 칩을 주지 않는다. */
    const games = useMemo(() => (["3c", "4c"] as const).filter((g) => all.some((c) => c.gameType === g)), [all]);
    const rows = useMemo(() => {
        const filtered = game ? all.filter((c) => c.gameType === game) : all;
        return sortWatch(filtered.map((c) => ({ ...c, gameType: c.gameType as GameType })), sort);
    }, [all, game, sort]);

    if (all.length === 0) return null;

    return (
        // 아케이드 배색은 .rank-arcade 안에서만 산다(--arc-frame 등). 멀티방 화면의 연장이라 같은 배색을 쓰되,
        // 변수가 이 안에서 정의되도록 클래스를 여기 직접 붙인다 — 안 붙이면 고른 칩이 안 칠해진다(2026-09-13 오너 지적).
        <section className="rank-arcade space-y-2">
            <h3 className="text-[13px] font-bold text-ink-2">{t("sim.watch.replays")}</h3>
            <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-0.5">
                {games.length > 1 && (
                    <>
                        <button type="button" aria-pressed={game === null} onClick={() => setGame(null)} className={cn(chip, game === null ? chipOn : chipOff)}>
                            {t("sim.watch.allGames")}
                        </button>
                        {games.map((g) => (
                            <button key={g} type="button" aria-pressed={game === g} onClick={() => setGame(g)} className={cn(chip, game === g ? chipOn : chipOff)}>
                                <GameBalls gameType={g} size={18} />
                            </button>
                        ))}
                        <span className="w-2 shrink-0" aria-hidden />
                    </>
                )}
                {SORTS.map((s) => (
                    <button key={s.key} type="button" aria-pressed={sort === s.key} onClick={() => setSort(s.key)} className={cn(chip, sort === s.key ? chipOn : chipOff)}>
                        {t(s.label)}
                    </button>
                ))}
            </div>
            <ul className="space-y-2">
                {rows.map((c) => <Row key={c.id} card={c as WatchCard} onOpen={onOpen} />)}
            </ul>
        </section>
    );
}

export default WatchList;
