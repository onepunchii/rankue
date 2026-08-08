import { useQuery } from "@tanstack/react-query";
import { useT, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// 주간 달성률 — 득점÷다마수. 다마수는 매장마다 스케일이 달라 남과 비교는 안 되지만
// "자기 다마 대비 몇 %"는 공정하다. 랭킹이 아니라 '지난주의 나'와 겨루는 솔로 루프.

interface Week { week: string; type: "3c" | "4c"; games: number; rate: number }

const L: Record<Locale, { title: string; subtitle: string; vs: (d: number) => string; same: string; empty: string; games: string }> = {
    ko: {
        title: "주간 달성률", subtitle: "득점 ÷ 내 다마수",
        vs: (d) => (d > 0 ? `지난주보다 +${d}%p 🔥` : `지난주보다 ${d}%p`), same: "지난주와 동일",
        empty: "매칭 경기를 기록하면 주간 달성률이 쌓입니다", games: "경기",
    },
    en: {
        title: "Weekly achievement", subtitle: "Score ÷ my handicap",
        vs: (d) => (d > 0 ? `+${d}%p vs last week 🔥` : `${d}%p vs last week`), same: "Same as last week",
        empty: "Record match games to build your weekly rate", games: "games",
    },
    vi: {
        title: "Tỷ lệ đạt tuần", subtitle: "Điểm ÷ mức chấp của tôi",
        vs: (d) => (d > 0 ? `+${d}%p so với tuần trước 🔥` : `${d}%p so với tuần trước`), same: "Bằng tuần trước",
        empty: "Ghi các trận đấu để tích lũy tỷ lệ tuần", games: "trận",
    },
    tr: {
        title: "Haftalık başarı", subtitle: "Skor ÷ handikapım",
        vs: (d) => (d > 0 ? `Geçen haftaya +${d}%p 🔥` : `Geçen haftaya ${d}%p`), same: "Geçen haftayla aynı",
        empty: "Maç kaydettikçe haftalık oranın oluşur", games: "maç",
    },
    es: {
        title: "Logro semanal", subtitle: "Puntos ÷ mi hándicap",
        vs: (d) => (d > 0 ? `+${d}%p vs semana pasada 🔥` : `${d}%p vs semana pasada`), same: "Igual que la semana pasada",
        empty: "Registra partidas para acumular tu tasa semanal", games: "partidas",
    },
};

export const AchievementCard = ({ filter }: { filter: string }) => {
    const { locale } = useT();
    const t = L[locale] ?? L.ko;
    const { data } = useQuery<{ weeks: Week[] }>({
        queryKey: ["/api/hiq/me/achievement"],
        staleTime: 5 * 60 * 1000,
    });

    // 필터 탭(3c/4c) 존중 — all 이면 종목 합산(주별 경기수 가중 평균)
    const type = filter === "3c" || filter === "4c" ? filter : null;
    const byWeek = new Map<string, { rateSum: number; games: number }>();
    for (const w of data?.weeks ?? []) {
        if (type && w.type !== type) continue;
        const cur = byWeek.get(w.week) ?? { rateSum: 0, games: 0 };
        cur.rateSum += w.rate * w.games;
        cur.games += w.games;
        byWeek.set(w.week, cur);
    }
    const weeks = [...byWeek.entries()]
        .map(([week, v]) => ({ week, games: v.games, rate: Math.round(v.rateSum / v.games) }))
        .sort((a, b) => a.week.localeCompare(b.week))
        .slice(-8);

    if (weeks.length === 0) {
        return (
            <div className="rk-card p-5 mb-6">
                <h3 className="text-[15px] font-bold text-ink-1">{t.title}</h3>
                <p className="text-[13px] text-black/45 text-center py-4">{t.empty}</p>
            </div>
        );
    }

    const maxRate = Math.max(...weeks.map((w) => w.rate), 100);
    const last = weeks[weeks.length - 1];
    const prev = weeks.length > 1 ? weeks[weeks.length - 2] : null;
    const delta = prev ? last.rate - prev.rate : null;

    return (
        <div className="rk-card p-5 mb-6">
            <div className="flex items-baseline justify-between mb-1">
                <h3 className="text-[15px] font-bold text-ink-1">{t.title}</h3>
                <span className="text-[11.5px] font-medium text-black/40">{t.subtitle}</span>
            </div>
            <div className="flex items-baseline gap-2 mb-3">
                <span className="text-[28px] font-bold text-brand tabular-nums">{last.rate}%</span>
                {delta != null && (
                    <span className={cn("text-[12.5px] font-bold", delta > 0 ? "text-brand" : delta < 0 ? "text-red-500" : "text-black/40")}>
                        {delta === 0 ? t.same : t.vs(delta)}
                    </span>
                )}
            </div>
            <div className="flex items-end gap-1.5 h-[72px]">
                {weeks.map((w, i) => (
                    <div key={w.week} className="flex-1 flex flex-col items-center gap-1">
                        <div
                            className={cn("w-full rounded-t-md", i === weeks.length - 1 ? "bg-brand" : "bg-brand/25")}
                            style={{ height: `${Math.max(8, (w.rate / maxRate) * 64)}px` }}
                            title={`${w.rate}% · ${w.games}${t.games}`}
                        />
                        <span className="text-[9.5px] text-black/35 tabular-nums">
                            {new Date(w.week).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};
