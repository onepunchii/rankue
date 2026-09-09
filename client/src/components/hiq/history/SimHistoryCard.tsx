import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { GameController } from "@/lib/icons";
import { apiRequest } from "@/lib/queryClient";
import { useT } from "@/lib/i18n";
import type { FilterType } from "./types";

/**
 * 기록 페이지의 온라인게임 자리 — 2026-09-09 오너 결정으로 **숫자를 모두 뺐다**.
 * 이유 둘: (1) 기록 페이지는 실전 기록(RP·에버리지)의 자리라 온라인게임 숫자가 섞이면 안 된다(RP 오염 사고 이후 원칙),
 * (2) 같은 내용을 온라인게임 대시보드가 더 잘 보여 준다. 그래서 대시보드로 가는 줄 하나만 남긴다.
 * 기록이 하나도 없으면 이 줄도 그리지 않는다(처음 온 사람에게 빈 안내를 늘리지 않는다).
 * 2026-09-09 오너: 부제("연습·대전 기록은 대시보드에…")는 제목이 이미 말하고 있어 뺐다. 아래 매치 리스트와 붙어 보여 mb-6.
 */
interface SimRating { sessions: number }
interface SimMatchRow { status: string }

interface Props {
    filter: FilterType;
}

export function SimHistoryCard({ filter }: Props) {
    const { t } = useT();
    const [, setLocation] = useLocation();

    const { data: ratings = [] } = useQuery<SimRating[]>({
        queryKey: ["/api/hiq/sim/ratings/me"],
        queryFn: async () => (await apiRequest("/api/hiq/sim/ratings/me")) ?? [],
        staleTime: 60_000,
    });
    const { data: matches = [] } = useQuery<SimMatchRow[]>({
        queryKey: ["sim-matches"],
        queryFn: async () => (await apiRequest("/api/hiq/sim/matches")) ?? [],
        staleTime: 60_000,
    });

    // 종목 필터는 호출부가 이미 거른다(골프 탭에선 아예 그리지 않는다) — 여기선 기록 유무만 본다.
    void filter;
    const hasRecord = ratings.some((r) => (r.sessions ?? 0) > 0) || matches.length > 0;
    if (!hasRecord) return null;

    return (
        <button
            type="button"
            onClick={() => setLocation("/online-game?dash=1")}
            className="w-full min-h-[60px] mb-6 rounded-2xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] px-4 py-3 flex items-center gap-3 text-left active:bg-black/[0.02]"
        >
            <span className="w-10 h-10 shrink-0 rounded-xl bg-brand/10 flex items-center justify-center">
                <GameController className="w-5 h-5 text-brand" strokeWidth={2} />
            </span>
            <span className="flex-1 min-w-0 text-[15px] font-bold text-ink-1">{t("sim.history.linkRow")}</span>
            <span className="shrink-0 text-black/30" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 5 7 7-7 7" /></svg>
            </span>
        </button>
    );
}

export default SimHistoryCard;
