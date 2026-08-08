import { useQuery } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useSeo } from "@/hooks/useSeo";
import { briefingLineKo, briefingDateKo, briefingTitle, briefingDesc, todayKst, type BriefingData } from "@shared/briefingMeta";

// 당구 브리핑 아카이브 — 날짜별 고정 URL(AEO 자산). ko 단일 언어 공개 페이지.
// 문구는 shared/briefingMeta 로 프리렌더와 문자 단위 일치.

const todayStr = todayKst;

export default function BriefingPage() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/briefing/:date");
  const date = params?.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : todayStr();

  const { data: b, isLoading } = useQuery<BriefingData | null>({
    queryKey: ["/api/hiq/umb/briefing", date],
    queryFn: async () => apiRequest(`/api/hiq/umb/briefing?date=${date}`),
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

  const shift = (days: number) => {
    const d = new Date(date + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    const next = d.toISOString().slice(0, 10);
    if (next > todayStr()) return;
    setLocation(`/briefing/${next}`);
  };
  const isToday = date >= todayStr();

  useSeo({
    title: briefingTitle(date),
    description: briefingDesc(b ?? null, date),
    path: `/briefing/${date}`,
    locale: "ko",
  });

  return (
    <div className="min-h-screen w-full bg-[#f2f0eb] text-[rgba(0,0,0,0.87)] font-sans">
      <div className="mx-auto max-w-2xl px-5 py-12">
        <button onClick={() => setLocation("/world-ranking")} className="text-[13.5px] font-semibold text-black/50 mb-5 hover:text-black/70">
          ← 세계 랭킹
        </button>

        <header className="mb-6">
          <p className="text-[13px] font-bold text-brand">오늘의 당구 브리핑</p>
          <div className="flex items-center gap-3 mt-1">
            <button onClick={() => shift(-1)} className="w-9 h-9 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] text-black/50">←</button>
            <h1 className="text-[22px] font-bold tracking-tight tabular-nums">{briefingDateKo(date)}</h1>
            <button onClick={() => shift(1)} disabled={isToday} className="w-9 h-9 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] text-black/50 disabled:opacity-30">→</button>
          </div>
        </header>

        {isLoading ? (
          <div className="h-28 bg-black/[0.04] rounded-3xl animate-pulse" />
        ) : b ? (
          <button
            onClick={() => setLocation(`/player/players/${b.playerUmbId}`)}
            className="w-full text-left rounded-3xl bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.05)] active:scale-[0.99] transition-transform"
          >
            <span className="text-[22px]">📅</span>
            <p className="mt-2 text-[19px] font-bold leading-snug">{briefingLineKo(b)}</p>
            <p className="mt-3 text-[13px] font-semibold text-brand">선수 기록 보기 →</p>
          </button>
        ) : (
          <div className="rounded-3xl bg-white p-6 text-center text-[14px] text-black/45">이 날짜의 브리핑이 없습니다</div>
        )}

        <p className="mt-6 text-[11px] text-black/35 text-center">출처: UMB 공식 랭킹 · 매일 자동 갱신</p>
      </div>
    </div>
  );
}
