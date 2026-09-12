/**
 * 관전 목록(2026-09-12). 멀티방 화면 아래에 붙는다 — "들어갈 수 있는 방"이 비어 있어도 지금 치는 판을 구경할 수 있게.
 *
 * 오너의 문제 제기: "게임 시작하면 방이 사라진다". 시작한 방은 참가 대상이 아니라서 목록에서 빠지는 게 맞지만,
 * 그 순간 화면이 텅 비어 아무것도 할 게 없어 보인다. 여기서 그 판들을 관전으로 되살린다.
 * 끝난 공개 대전은 최근 7일까지 다시보기로 남는다 — 라이브는 타이밍이 맞아야 하지만 다시보기는 아무 때나 본다.
 */
import { useQuery } from "@tanstack/react-query";
import { useT } from "@/lib/i18n";
import { matchApi, type MatchApi, type WatchCard } from "../matchApi";
import { gameLabel } from "../match/matchView";

export const WATCH_QUERY_KEY = ["sim-watch"] as const;
/** 목록 갱신 — 대전 화면(4초)보다 느리다. 여기는 점수만 보이는 목록이라 급하지 않다. */
export const WATCH_LIST_REFETCH_MS = 15_000;

function Row({ card, label, onOpen }: { card: WatchCard; label: string; onOpen: (id: string) => void }) {
    const { t } = useT();
    const names = [card.hostName, card.guestName ?? "-"];
    const scores = [card.scores[0] ?? 0, card.scores[1] ?? 0];
    return (
        <li className="rounded-tile border border-surface-line bg-surface-1 px-4 py-3 flex items-center gap-3">
            <span className="flex-1 min-w-0 flex flex-col gap-1">
                <span className="text-[14px] font-semibold text-ink-1 truncate">
                    {names[0]} <span className="text-ink-3">vs</span> {names[1]}
                </span>
                <span className="text-[12px] font-medium text-ink-3 truncate">
                    {gameLabel(card, t)} · <span className="tabular-nums">{scores[0]} : {scores[1]}</span>
                    {card.winnerIndex !== null && <> · {names[card.winnerIndex]} {t("sim.watch.win")}</>}
                </span>
            </span>
            <button
                type="button"
                onClick={() => onOpen(card.id)}
                className="h-10 px-4 shrink-0 rounded-pill bg-[color:var(--arc-frame)] text-[color:var(--arc-ink)] text-[13px] font-black"
            >{label}</button>
        </li>
    );
}

export function WatchList({ onOpen, api = matchApi }: { onOpen: (id: string) => void; api?: MatchApi }) {
    const { t } = useT();
    const { data } = useQuery({
        queryKey: WATCH_QUERY_KEY,
        queryFn: () => api.getWatchable(),
        refetchInterval: WATCH_LIST_REFETCH_MS,
    });
    const live = data?.live ?? [];
    const replays = data?.replays ?? [];
    if (live.length === 0 && replays.length === 0) return null;

    return (
        <div className="space-y-5">
            {live.length > 0 && (
                <section className="space-y-2">
                    <h3 className="text-[13px] font-bold text-ink-2 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" aria-hidden />
                        {t("sim.watch.live")}
                    </h3>
                    <ul className="space-y-2">
                        {live.map((c) => <Row key={c.id} card={c} label={t("sim.watch.watch")} onOpen={onOpen} />)}
                    </ul>
                </section>
            )}
            {replays.length > 0 && (
                <section className="space-y-2">
                    <h3 className="text-[13px] font-bold text-ink-2">{t("sim.watch.replays")}</h3>
                    <ul className="space-y-2">
                        {replays.map((c) => <Row key={c.id} card={c} label={t("sim.watch.replay")} onOpen={onOpen} />)}
                    </ul>
                </section>
            )}
        </div>
    );
}
