/**
 * 내 대전 목록(GET /sim/matches). 행: 상대 이름 · 종목/테이블 · 상태 배지(내 차례 / 상대 차례 / 상대 대기 중 / 승·패·무 / 취소됨).
 * 탭하면 onOpen(match) — 페이지는 playing/finished 면 actions.startMatch(match), waiting 이면 로비의 코드 화면으로.
 * 진행 중(playing·waiting)인 대전이 하나라도 있으면 10 s 마다 다시 읽는다. 쿼리 키 ["sim-matches"] — 샷·기권 뒤 invalidate 하면 바로 갱신.
 */
import { memo, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ResignConfirm } from "../components/ResignConfirm";
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

/** 행의 그만두기: playing 은 기권(확인 뒤), 내가 연 waiting 은 취소(바로). 그 밖엔 없음. */
function quitKind(m: MatchPublic): "resign" | "cancel" | null {
    if (m.status === "playing") return "resign";
    if (m.status === "waiting" && m.myIndex === 0) return "cancel";
    return null;
}

const Row = memo(function Row({ m, onOpen, onQuit, busy }: { m: MatchPublic; onOpen: (m: MatchPublic) => void; onQuit: (m: MatchPublic) => void; busy: boolean }) {
    const { t } = useT();
    const badge = matchBadge(m);
    const sub = m.status === "waiting" ? `${gameLabel(m, t)} · ${t("sim.match.codeShort").replace("{code}", formatCode(m.code))}` : gameLabel(m, t);
    const quit = quitKind(m);
    return (
        <div className="w-full min-h-[64px] rounded-tile border border-surface-line bg-surface-1 flex items-center gap-2 pr-2">
            <button type="button" onClick={() => onOpen(m)} className="flex-1 min-w-0 min-h-[64px] px-4 py-3 flex items-center gap-3 text-left active:bg-surface-3 rounded-tile">
                <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <span className="text-[14px] font-semibold text-ink-1 truncate">{opponentLabel(m, t)}</span>
                    <span className="text-[12px] font-medium text-ink-4 truncate">{sub}</span>
                </span>
                <span className={cn("rk-chip shrink-0", TONE[badge.tone])}>{t(badge.key)}</span>
            </button>
            {/* 남아 있는 대전을 정리하는 길(2026-09-07 오너: "포기가 없어 계속 남더라") — 진행 중은 기권, 내가 연 대기 방은 취소 */}
            {quit && (
                <button
                    type="button" onClick={() => onQuit(m)} disabled={busy}
                    aria-label={quit === "resign" ? t("sim.match.resign") : t("sim.match.cancelShort")}
                    className="h-11 px-3 shrink-0 rounded-pill border border-surface-line text-[12px] font-semibold text-ink-3 active:bg-surface-3 disabled:opacity-40"
                >
                    {quit === "resign" ? t("sim.match.resign") : t("sim.match.cancelShort")}
                </button>
            )}
        </div>
    );
});

export function MatchList({ onOpen, api = defaultApi }: MatchListProps) {
    const { t } = useT();
    const qc = useQueryClient();
    const [resignTarget, setResignTarget] = useState<MatchPublic | null>(null);
    const [busy, setBusy] = useState(false);
    const quit = async (m: MatchPublic) => {
        setBusy(true);
        try {
            await api.resign(m.id);
        } catch {
            /* 다음 목록 갱신이 실제 상태를 보여 준다 */
        } finally {
            setBusy(false);
            setResignTarget(null);
            void qc.invalidateQueries({ queryKey: MATCH_LIST_QUERY_KEY });
        }
    };
    const onQuit = (m: MatchPublic) => {
        if (quitKind(m) === "resign") setResignTarget(m);
        else void quit(m);
    };
    const q = useQuery({
        queryKey: MATCH_LIST_QUERY_KEY,
        queryFn: () => api.listMatches(),
        staleTime: 0,
        refetchInterval: (query) => (hasLiveMatch(query.state.data) ? MATCH_LIST_REFETCH_MS : false),
    });
    const rows = useMemo(() => (q.data ? sortForList(q.data) : []), [q.data]);

    // 폭·좌우 여백은 부모(SimulatorPage 의 로비 래퍼)가 준다 — 여기서 또 px-5 를 주면 제목이 폼보다 20px 안으로 들어가 보였다.
    return (
        <section className="space-y-2" aria-label={t("sim.match.listTitle")}>
            <h3 className="text-[15px] font-semibold text-ink-1 min-h-11 flex items-center">{t("sim.match.listTitle")}</h3>
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
            {rows.map((m) => <Row key={m.id} m={m} onOpen={onOpen} onQuit={onQuit} busy={busy} />)}
            <ResignConfirm
                open={resignTarget !== null} busy={busy}
                onOpenChange={(o) => { if (!o) setResignTarget(null); }}
                onConfirm={() => { if (resignTarget) void quit(resignTarget); }}
            />
        </section>
    );
}

export default MatchList;
