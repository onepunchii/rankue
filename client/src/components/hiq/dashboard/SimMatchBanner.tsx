import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ResignConfirm } from "@/sim/components/ResignConfirm";
import { useLocation } from "wouter";
import { Cpu } from "@/lib/icons";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { MATCH_LIST_QUERY_KEY, MATCH_LIST_REFETCH_MS } from "@/sim/match/queryKeys";

interface MatchRow {
    id: string;
    status: "waiting" | "playing" | "finished" | "canceled";
    myIndex: number;
    turn: number;
    hostName: string;
    guestName: string | null;
    gameType: "3c" | "4c";
}

/**
 * 진행 중인 대전이 있으면 대시보드 맨 위에 띄운다. 내 차례가 있으면 그것을 먼저(이어하기), 아니면 상대 차례인 대전(열기).
 * 오른쪽에 기권 버튼(확인 뒤) — 게임 화면을 나온 뒤 내 대전 목록까지 들어가지 않아도 홈에서 바로 정리한다(2026-09-08 오너).
 */
export function SimMatchBanner() {
    const { t } = useT();
    const [, setLocation] = useLocation();
    const { member } = useAuth();
    const qc = useQueryClient();
    const [resignOpen, setResignOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const { data } = useQuery<MatchRow[]>({
        queryKey: MATCH_LIST_QUERY_KEY,
        queryFn: async () => (await apiRequest("/api/hiq/sim/matches")) ?? [],
        enabled: !!member,
        staleTime: 10_000,
        refetchInterval: (q) => ((q.state.data ?? []).some((m) => m.status === "playing") ? MATCH_LIST_REFETCH_MS * 3 : false),
    });
    const playing = (data ?? []).filter((m) => m.status === "playing");
    const mine = playing.filter((m) => m.turn === m.myIndex);
    const first = mine[0] ?? playing[0];
    if (!first) return null;
    const isMine = first.turn === first.myIndex;
    const opponent = (first.myIndex === 0 ? first.guestName : first.hostName) ?? "";
    const others = playing.length - 1;

    const resign = async () => {
        setBusy(true);
        try {
            await apiRequest(`/api/hiq/sim/matches/${first.id}/resign`, { method: "POST" });
        } catch {
            /* 목록 갱신이 실제 상태를 보여 준다 */
        } finally {
            setBusy(false);
            setResignOpen(false);
            void qc.invalidateQueries({ queryKey: MATCH_LIST_QUERY_KEY });
        }
    };

    return (
        <div className="w-full mb-4 rounded-tile bg-surface-1 border border-brand/40 flex items-center gap-2 pr-2">
            <button
                type="button"
                onClick={() => setLocation(`/online-game?match=${first.id}`)}
                className="flex-1 min-w-0 px-4 py-3.5 flex items-center gap-3 text-left active:bg-surface-3 rounded-tile"
            >
                <span className="w-8 h-8 rounded-full bg-brand/10 text-brand flex items-center justify-center shrink-0">
                    <Cpu className="w-4 h-4" />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-bold text-ink-1">{isMine ? t("sim.match.bannerTitle") : t("sim.match.waitingTurn")}</span>
                    <span className="block text-[12px] font-medium text-ink-3 truncate">
                        {(isMine ? t("sim.match.bannerSub") : t("sim.match.bannerSubWaiting")).replace("{name}", opponent)} · {first.gameType === "3c" ? t("sim.setup.type3c") : t("sim.setup.type4c")}
                        {others > 0 ? ` · ${t("sim.match.bannerMore").replace("{n}", String(others))}` : ""}
                    </span>
                </span>
                <span className={`text-[12px] font-semibold shrink-0 rounded-pill px-2.5 py-1 ${isMine ? "bg-brand text-brand-fg" : "border border-surface-line text-ink-2"}`}>
                    {isMine ? t("sim.match.bannerCta") : t("sim.match.bannerOpen")}
                </span>
            </button>
            <button
                type="button" onClick={() => setResignOpen(true)} disabled={busy}
                aria-label={t("sim.match.resign")}
                className="h-11 px-3 shrink-0 rounded-pill border border-surface-line text-[12px] font-semibold text-ink-3 active:bg-surface-3 disabled:opacity-40"
            >
                {t("sim.match.resign")}
            </button>
            <ResignConfirm open={resignOpen} busy={busy} onOpenChange={setResignOpen} onConfirm={() => { void resign(); }} />
        </div>
    );
}
