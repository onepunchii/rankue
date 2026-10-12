import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useT } from "@/lib/i18n";
import type { FilterType } from "./types";

/**
 * 기록 페이지의 온라인게임 자리 — 2026-09-09 오너 결정으로 **숫자를 모두 뺐다**.
 * 이유 둘: (1) 기록 페이지는 실전 기록(RP·에버리지)의 자리라 온라인게임 숫자가 섞이면 안 된다(RP 오염 사고 이후 원칙),
 * (2) 같은 내용을 온라인게임 대시보드가 더 잘 보여 준다. 그래서 대시보드로 가는 줄 하나만 남긴다.
 * 기록이 하나도 없으면 이 줄도 그리지 않는다(처음 온 사람에게 빈 안내를 늘리지 않는다).
 * 2026-09-09 오너: 부제("연습·대전 기록은 대시보드에…")는 제목이 이미 말하고 있어 뺐다. 아래 매치 리스트와 붙어 보여 mb-6.
 *
 * 2026-10-12 — 순서의 4번: 줄의 모양만 바꿨다. 온라인게임 화면들과 같은 어두운 '진열장' 띠 + 그림(트로피).
 * **숫자는 여전히 없다**(레이팅 · 순위 · 전적 · 내 등급 배지도 넣지 않는다 — 위 원칙 그대로). 그림은 내 등급이 아니라 누구에게나 같은 트로피다.
 * 부제도 다시 넣지 않았다(9/9 결정). 색 · 광택은 index.css 의 .rank-hall .hall-banner(홈 배너와 같은 판).
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
            data-testid="sim-history-link" data-track-as="기록 온라인게임 입구"
            className="rank-hall w-full mb-6 block text-left active:opacity-90"
        >
            <span className="hall-banner min-h-[64px] rounded-2xl pl-2.5 pr-4 py-2 flex items-center gap-2.5">
                <img src="/sim/rank/trophy.webp" width={48} height={48} alt="" aria-hidden="true" decoding="async" draggable={false} className="w-12 h-12 shrink-0 object-contain" style={{ filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.5))" }} />
                <span className="flex-1 min-w-0 text-[15px] font-black text-white truncate">{t("sim.history.linkRow")}</span>
                <span className="shrink-0 text-white/45" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 5 7 7-7 7" /></svg>
                </span>
            </span>
        </button>
    );
}

export default SimHistoryCard;
