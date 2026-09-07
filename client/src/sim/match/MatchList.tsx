/**
 * 내 대전 목록(GET /sim/matches). 행: 상대 이름 · 종목/테이블 · 상태 배지(내 차례 / 상대 차례 / 상대 대기 중 / 승·패·무 / 취소됨).
 * 탭하면 onOpen(match) — 페이지는 playing/finished 면 actions.startMatch(match), waiting 이면 로비의 코드 화면으로.
 * 진행 중(playing·waiting)인 대전이 하나라도 있으면 10 s 마다 다시 읽는다. 쿼리 키 ["sim-matches"] — 샷·기권 뒤 invalidate 하면 바로 갱신.
 */
import { memo, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { matchApi as defaultApi, formatCode, type MatchApi, type MatchPublic } from "../matchApi";
import { gameLabel, matchBadge, opponentLabel, sortForList, type BadgeTone } from "./matchView";

export { MATCH_LIST_QUERY_KEY, MATCH_LIST_REFETCH_MS } from "./queryKeys";
import { MATCH_LIST_QUERY_KEY, MATCH_LIST_REFETCH_MS } from "./queryKeys";
/** 진행 중인 대전이 있을 때의 재조회 주기 (ms) */

export interface MatchListProps {
    onOpen: (match: MatchPublic) => void;
    /** 테스트·주입용. 기본 matchApi */
    api?: MatchApi;
}

const TONE: Record<BadgeTone, string> = {
    brand: "bg-brand text-brand-fg",
    outline: "border border-surface-line text-ink-3",
    win: "bg-brand/[0.1] text-brand",
    muted: "bg-surface-3 text-ink-3",
};

export function hasLiveMatch(ms: readonly MatchPublic[] | undefined): boolean {
    return !!ms && ms.some((m) => m.status === "playing" || m.status === "waiting");
}

const Row = memo(function Row({ m, onOpen }: { m: MatchPublic; onOpen: (m: MatchPublic) => void }) {
    const { t } = useT();
    const badge = matchBadge(m);
    const sub = m.status === "waiting" ? `${gameLabel(m, t)} · ${t("sim.match.codeShort").replace("{code}", formatCode(m.code))}` : gameLabel(m, t);
    return (
        <button
            type="button" onClick={() => onOpen(m)}
            className="w-full min-h-[64px] rounded-tile border border-surface-line bg-surface-1 px-4 py-3 flex items-center gap-3 text-left active:bg-surface-3"
        >
            <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                <span className="text-[14px] font-semibold text-ink-1 truncate">{opponentLabel(m, t)}</span>
                <span className="text-[12px] font-medium text-ink-4 truncate">{sub}</span>
            </span>
            <span className={cn("rk-chip shrink-0", TONE[badge.tone])}>{t(badge.key)}</span>
        </button>
    );
});

export function MatchList({ onOpen, api = defaultApi }: MatchListProps) {
    const { t } = useT();
    const q = useQuery({
        queryKey: MATCH_LIST_QUERY_KEY,
        queryFn: () => api.listMatches(),
        staleTime: 0,
        refetchInterval: (query) => (hasLiveMatch(query.state.data) ? MATCH_LIST_REFETCH_MS : false),
    });
    const rows = useMemo(() => (q.data ? sortForList(q.data) : []), [q.data]);

    return (
        <section className="w-full max-w-[420px] mx-auto px-5 space-y-2" aria-label={t("sim.match.listTitle")}>
            <h3 className="text-[13px] font-semibold text-ink-3 min-h-11 flex items-center">{t("sim.match.listTitle")}</h3>
            {q.isPending && <p className="text-[13px] font-medium text-ink-4 min-h-11 flex items-center">{t("sim.match.listLoading")}</p>}
            {q.isError && (
                <div className="flex items-center justify-between gap-3 min-h-11">
                    <p className="text-[13px] font-medium text-ink-2">{t("sim.match.listFailed")}</p>
                    <button type="button" onClick={() => { void q.refetch(); }} className="h-11 px-3 rounded-pill border border-surface-line text-[13px] font-semibold text-ink-2">
                        {t("sim.match.retry")}
                    </button>
                </div>
            )}
            {q.isSuccess && rows.length === 0 && (
                <p className="text-[13px] font-medium text-ink-4 min-h-11 flex items-center">{t("sim.match.listEmpty")}</p>
            )}
            {rows.map((m) => <Row key={m.id} m={m} onOpen={onOpen} />)}
        </section>
    );
}

export default MatchList;
