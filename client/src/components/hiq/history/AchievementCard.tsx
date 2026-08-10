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

    // 8주 축 고정 — 경기 없는 주도 빈 칸으로 그려야 "이번 주가 몇 번째 칸인지"가 안 흔들린다.
    // 서버의 date_trunc('week')는 월요일(UTC) 시작 — 같은 기준으로 주 키를 생성한다.
    const monday = new Date();
    monday.setUTCHours(0, 0, 0, 0);
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    const weeks = Array.from({ length: 8 }, (_, i) => {
        const d = new Date(monday.getTime() - (7 - i) * 7 * 86400000); // i=7 이 이번 주(월요일)
        const key = d.toISOString().slice(0, 10);
        const v = byWeek.get(key);
        return { week: key, games: v?.games ?? 0, rate: v ? Math.round(v.rateSum / v.games) : null };
    });

    const withData = weeks.filter((w) => w.rate != null);
    if (withData.length === 0) {
        return (
            <div className="rk-card p-5 mb-6">
                <h3 className="text-[15px] font-bold text-ink-1">{t.title}</h3>
                <p className="text-[13px] text-black/45 text-center py-4">{t.empty}</p>
            </div>
        );
    }

    const maxRate = Math.max(...withData.map((w) => w.rate!), 100);
    const last = withData[withData.length - 1];
    const prev = withData.length > 1 ? withData[withData.length - 2] : null;
    const delta = prev ? last.rate! - prev.rate! : null;

    return (
        <div className="rk-card p-5 mb-6">
            <div className="flex items-baseline justify-between mb-3">
                <h3 className="text-[15px] font-bold text-ink-1">{t.title}</h3>
                <span className="text-[11.5px] font-medium text-black/40">{t.subtitle}</span>
            </div>
            {/* 헤드라인 칩 — 이번 달성률 + 지난주 대비 */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
                <span className="inline-flex items-baseline gap-1 px-3.5 py-1.5 rounded-full bg-brand text-white">
                    <b className="text-[18px] tabular-nums leading-none">{last.rate}%</b>
                </span>
                {delta != null && (
                    <span className={cn(
                        "inline-flex items-center px-3 py-1.5 rounded-full text-[12.5px] font-bold leading-none",
                        delta > 0 ? "bg-brand/10 text-brand" : delta < 0 ? "bg-red-500/10 text-red-500" : "bg-black/[0.05] text-black/45",
                    )}>
                        {delta === 0 ? t.same : t.vs(delta)}
                    </span>
                )}
            </div>
            <div className="flex items-end gap-1.5 h-[72px]">
                {weeks.map((w) => (
                    <div key={w.week} className="flex-1 flex flex-col items-center gap-1">
                        {w.rate != null ? (
                            <div
                                className={cn("w-full rounded-t-md", w.week === last.week ? "bg-brand" : "bg-brand/25")}
                                style={{ height: `${Math.max(8, (w.rate / maxRate) * 64)}px` }}
                                title={`${w.rate}% · ${w.games}${t.games}`}
                            />
                        ) : (
                            <div className="w-full h-[6px] rounded-full bg-black/[0.05]" />
                        )}
                        <span className="text-[9.5px] text-black/35 tabular-nums">
                            {new Date(w.week).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};
