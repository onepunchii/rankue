import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Cpu } from "@/lib/icons";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { MATCH_LIST_QUERY_KEY, MATCH_LIST_REFETCH_MS } from "@/sim/match/queryKeys";

/**
 * 시뮬레이터 대전에서 내 차례인 게 있으면 대시보드 맨 위에 띄운다. 푸시를 못 받은 사람이 대전을 잊지 않게 하는 입구.
 * 엔진 청크를 끌어오지 않도록 matchApi 대신 apiRequest 로 목록만 읽는다.
 */
interface MatchRow {
    id: string;
    status: "waiting" | "playing" | "finished" | "canceled";
    myIndex: number;
    turn: number;
    hostName: string;
    guestName: string | null;
    gameType: "3c" | "4c";
}

export function SimMatchBanner() {
    const { t } = useT();
    const [, setLocation] = useLocation();
    const { member } = useAuth();
    const { data } = useQuery<MatchRow[]>({
        queryKey: MATCH_LIST_QUERY_KEY,
        queryFn: async () => (await apiRequest("/api/hiq/sim/matches")) ?? [],
        enabled: !!member,
        staleTime: 10_000,
        refetchInterval: (q) => ((q.state.data ?? []).some((m) => m.status === "playing") ? MATCH_LIST_REFETCH_MS * 3 : false),
    });
    const mine = (data ?? []).filter((m) => m.status === "playing" && m.turn === m.myIndex);
    if (mine.length === 0) return null;
    const first = mine[0];
    const opponent = (first.myIndex === 0 ? first.guestName : first.hostName) ?? "";

    return (
        <button
            type="button"
            onClick={() => setLocation(`/online-game?match=${first.id}`)}
            className="w-full mb-4 px-4 py-3.5 rounded-tile bg-surface-1 border border-brand/40 flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
        >
            <span className="w-8 h-8 rounded-full bg-brand/10 text-brand flex items-center justify-center shrink-0">
                <Cpu className="w-4 h-4" />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-bold text-ink-1">{t("sim.match.bannerTitle")}</span>
                <span className="block text-[12px] font-medium text-ink-3 truncate">
                    {t("sim.match.bannerSub").replace("{name}", opponent)} · {first.gameType === "3c" ? t("sim.setup.type3c") : t("sim.setup.type4c")}
                    {mine.length > 1 ? ` · ${t("sim.match.bannerMore").replace("{n}", String(mine.length - 1))}` : ""}
                </span>
            </span>
            <span className="text-[12px] font-semibold shrink-0 bg-brand text-brand-fg rounded-pill px-2.5 py-1">
                {t("sim.match.bannerCta")}
            </span>
        </button>
    );
}
