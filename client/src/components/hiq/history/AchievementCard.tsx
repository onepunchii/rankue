import { useQuery } from "@tanstack/react-query";
import { useT, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// 주간 달성률 — 득점÷다마수. 다마수는 매장마다 스케일이 달라 남과 비교는 안 되지만
// "자기 다마 대비 몇 %"는 공정하다. 랭킹이 아니라 '지난주의 나'와 겨루는 솔로 루프.
//
// 2026-09-09 오너: 막대 → 선그래프. 주마다 독립된 양이 아니라 '한 사람이 이어 온 추이'라서 선이 맞다.
// 헤드라인도 알약 두 개(초록 100% + 불꽃)에서 큰 숫자 하나 + 조용한 변화량으로 바꿨다.
// 경기 없는 주는 선을 끊는다 — 없는 주를 0으로 이으면 안 친 주가 폭락처럼 보인다.
// 100% 기준선(내 다마수만큼 친 주)을 점선으로 둔다 — 이 화면에서 유일하게 의미 있는 눈금이다.

interface Week { week: string; type: "3c" | "4c"; games: number; rate: number }

const L: Record<Locale, { title: string; subtitle: string; vs: (d: number) => string; same: string; empty: string; games: string; thisWeek: string; weekOf: (d: string, g: number) => string }> = {
    ko: {
        title: "주간 달성률", subtitle: "득점 ÷ 내 다마수",
        vs: (d) => (d > 0 ? `직전 주보다 +${d}%p` : `직전 주보다 ${d}%p`), same: "직전 주와 동일",
        empty: "매칭 경기를 기록하면 주간 달성률이 쌓입니다", games: "경기", thisWeek: "이번 주", weekOf: (d, g) => `${d} 주 · ${g}경기`,
    },
    en: {
        title: "Weekly achievement", subtitle: "Score ÷ my handicap",
        vs: (d) => (d > 0 ? `+${d}%p vs previous week` : `${d}%p vs previous week`), same: "Same as the previous week",
        empty: "Record match games to build your weekly rate", games: "games", thisWeek: "This week", weekOf: (d, g) => `Week of ${d} · ${g} games`,
    },
    vi: {
        title: "Tỷ lệ đạt tuần", subtitle: "Điểm ÷ mức chấp của tôi",
        vs: (d) => (d > 0 ? `+${d}%p so với tuần liền trước` : `${d}%p so với tuần liền trước`), same: "Bằng tuần liền trước",
        empty: "Ghi các trận đấu để tích lũy tỷ lệ tuần", games: "trận", thisWeek: "Tuần này", weekOf: (d, g) => `Tuần ${d} · ${g} trận`,
    },
    tr: {
        title: "Haftalık başarı", subtitle: "Skor ÷ handikapım",
        vs: (d) => (d > 0 ? `Önceki haftaya +${d}%p` : `Önceki haftaya ${d}%p`), same: "Önceki haftayla aynı",
        empty: "Maç kaydettikçe haftalık oranın oluşur", games: "maç", thisWeek: "Bu hafta", weekOf: (d, g) => `${d} haftası · ${g} maç`,
    },
    es: {
        title: "Logro semanal", subtitle: "Puntos ÷ mi hándicap",
        vs: (d) => (d > 0 ? `+${d}%p vs semana anterior` : `${d}%p vs semana anterior`), same: "Igual que la semana anterior",
        empty: "Registra partidas para acumular tu tasa semanal", games: "partidas", thisWeek: "Esta semana", weekOf: (d, g) => `Semana del ${d} · ${g} partidas`,
    },
};

export const AchievementCard = ({ filter }: { filter: string }) => {
    const { locale } = useT();
    const t = L[locale] ?? L.ko;
    const DATE_LOCALE: Record<string, string> = { ko: "ko-KR", en: "en-US", vi: "vi-VN", tr: "tr-TR", es: "es-ES" };
    const md = (iso: string) => new Date(iso).toLocaleDateString(DATE_LOCALE[locale] ?? "ko-KR", { month: "numeric", day: "numeric" });
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
    // 0 → 94, yMax → 6. 위아래 6 만큼은 늘 비워 둔다.
    const yOf = (rate: number) => 94 - (rate / maxRate) * 88;
    const y100 = yOf(100);
    const points = weeks
        .map((w, i) => ({ ...w, i, x: (i / 7) * 100, y: w.rate == null ? 0 : yOf(w.rate), isLast: w.week === last.week }))
        .filter((pt) => pt.rate != null);
    // 경기 없는 주에서 선을 끊는다 — 이어 붙이면 안 친 주가 급락으로 읽힌다.
    const segments: { x: number; y: number }[][] = [];
    points.forEach((pt, n) => {
        const prev = n > 0 ? points[n - 1] : null;
        if (prev && pt.i === prev.i + 1) segments[segments.length - 1].push({ x: pt.x, y: pt.y });
        else segments.push([{ x: pt.x, y: pt.y }]);
    });
    const chartLabel = `${t.title}: ${points.map((pt) => `${pt.rate}%`).join(", ")}`;
    const prev = withData.length > 1 ? withData[withData.length - 2] : null;
    // 비교는 달력상 바로 앞 주일 때만 — 중간이 비었는데 "직전 주보다" 라고 하면 거짓말이 된다.
    const adjacent = prev != null && new Date(last.week).getTime() - new Date(prev.week).getTime() === 7 * 86400000;
    const delta = adjacent ? last.rate! - prev!.rate! : null;

    return (
        <div className="rk-card p-5 mb-6">
            <div className="flex items-baseline justify-between mb-3">
                <h3 className="text-[15px] font-bold text-ink-1">{t.title}</h3>
                <span className="text-[11.5px] font-medium text-black/40">{t.subtitle}</span>
            </div>
            {/* 헤드라인 — 이번 주 숫자 하나가 주인공, 변화량은 곁들이 */}
            <div className="flex items-baseline gap-2 flex-wrap mb-4">
                <span className="text-[30px] font-extrabold tabular-nums leading-none text-ink-1">
                    {last.rate}<span className="text-[16px] font-bold text-black/35 ml-0.5">%</span>
                </span>
                {delta != null && (
                    <span className={cn(
                        "text-[12.5px] font-bold leading-none",
                        delta > 0 ? "text-brand" : delta < 0 ? "text-red-500" : "text-black/40",
                    )}>
                        {delta === 0 ? t.same : t.vs(delta)}
                    </span>
                )}
            </div>
            {/* 머리 숫자는 '가장 최근 기록이 있는 주' — 이번 주에 아직 안 쳤으면 지난 주다. 어느 주인지 밝혀 둔다. */}
            <p className="text-[11.5px] font-medium text-black/40 -mt-3 mb-3.5">{t.weekOf(md(last.week), last.games)}</p>
            {/* 선그래프 — 0~yMax 를 6~94 로 눌러 위아래 여백을 둔다(꼭짓점과 100% 선이 테두리에 붙지 않게) */}
            <div className="relative h-[84px]">
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full" role="img" aria-label={chartLabel}>
                    <line x1="0" y1={y100} x2="100" y2={y100} stroke="currentColor" className="text-black/15" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
                    {segments.map((seg, i) => (
                        <polyline
                            key={i} fill="none" stroke="currentColor" className="text-brand"
                            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
                            points={seg.map((pt) => `${pt.x},${pt.y}`).join(" ")}
                        />
                    ))}
                </svg>
                <span className="absolute right-0 text-[9px] font-semibold text-black/25 tabular-nums leading-none" style={{ top: `${y100}%`, transform: "translateY(-140%)" }}>100%</span>
                {points.map((pt) => (
                    <span
                        key={pt.week}
                        title={`${pt.rate}% · ${pt.games}${t.games}`}
                        className={cn(
                            "absolute rounded-full bg-brand ring-2 ring-white",
                            pt.isLast ? "w-[9px] h-[9px]" : "w-[6px] h-[6px]",
                        )}
                        style={{ left: `${pt.x}%`, top: `${pt.y}%`, transform: "translate(-50%,-50%)" }}
                    />
                ))}
            </div>
            <div className="relative h-[14px] mt-1.5">
                {weeks.map((w, i) => (
                    i % 2 === 1 && (
                        <span
                            key={w.week}
                            className="absolute text-[9.5px] text-black/35 tabular-nums whitespace-nowrap"
                            style={{ left: `${(i / 7) * 100}%`, transform: i === 7 ? "translateX(-100%)" : "translateX(-50%)" }}
                        >
                            {i === 7 ? t.thisWeek : new Date(w.week).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}
                        </span>
                    )
                ))}
            </div>
        </div>
    );
};
