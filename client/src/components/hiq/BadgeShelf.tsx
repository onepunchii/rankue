import { useQuery } from "@tanstack/react-query";
import { useT, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// 큐 컬렉션 — 기록 기반 뱃지 진열장 (마이페이지).
// 순위가 아니라 '순간'을 수집한다: 하위권도 개근·이닝 계열로 채울 게 항상 있다.
// 등급: 1 나무큐 → 2 카본큐 → 3 금장큐 → 4 명인큐 (서버 계산, 소급 자동).

interface Badge { id: string; value: number; tier: number; next: number | null }

const L: Record<Locale, { title: string; subtitle: string; tiers: string[]; names: Record<string, string>; next: (n: number) => string; empty: string }> = {
    ko: {
        title: "큐 컬렉션", subtitle: "기록이 쌓이면 뱃지가 열립니다",
        tiers: ["", "나무큐", "카본큐", "금장큐", "명인큐"],
        names: { hr3c: "3쿠션 하이런", hr4c: "4구 하이런", innings: "이닝 클럽", games: "경기 수", wins: "승리", visits: "출석" },
        next: (n) => `다음 등급까지 ${n.toLocaleString()}`, empty: "첫 경기를 기록하면 컬렉션이 시작됩니다",
    },
    en: {
        title: "Cue collection", subtitle: "Badges unlock as your record grows",
        tiers: ["", "Wood cue", "Carbon cue", "Gold cue", "Master cue"],
        names: { hr3c: "3-cushion high run", hr4c: "4-ball high run", innings: "Innings club", games: "Games", wins: "Wins", visits: "Visits" },
        next: (n) => `${n.toLocaleString()} to next tier`, empty: "Record your first game to start collecting",
    },
    vi: {
        title: "Bộ sưu tập cơ", subtitle: "Huy hiệu mở khi thành tích tăng",
        tiers: ["", "Cơ gỗ", "Cơ carbon", "Cơ vàng", "Cơ bậc thầy"],
        names: { hr3c: "Series 3 băng", hr4c: "Series 4 bi", innings: "CLB lượt cơ", games: "Số trận", wins: "Thắng", visits: "Điểm danh" },
        next: (n) => `Còn ${n.toLocaleString()} tới hạng sau`, empty: "Ghi trận đầu tiên để bắt đầu",
    },
    tr: {
        title: "Isteka koleksiyonu", subtitle: "Kayıtların arttıkça rozetler açılır",
        tiers: ["", "Ahşap", "Karbon", "Altın", "Usta"],
        names: { hr3c: "3 bant seri", hr4c: "4 top seri", innings: "El kulübü", games: "Maç", wins: "Galibiyet", visits: "Devam" },
        next: (n) => `Sonraki seviyeye ${n.toLocaleString()}`, empty: "İlk maçını kaydet, koleksiyon başlasın",
    },
    es: {
        title: "Colección de tacos", subtitle: "Las insignias se desbloquean con tu historial",
        tiers: ["", "Taco de madera", "Taco de carbono", "Taco dorado", "Taco maestro"],
        names: { hr3c: "Serie 3 bandas", hr4c: "Serie 4 bolas", innings: "Club de entradas", games: "Partidas", wins: "Victorias", visits: "Asistencia" },
        next: (n) => `${n.toLocaleString()} para el siguiente nivel`, empty: "Registra tu primera partida para empezar",
    },
};

const EMOJI: Record<string, string> = { hr3c: "🎯", hr4c: "🎱", innings: "⏱️", games: "📋", wins: "🏆", visits: "📍" };
const TIER_STYLE = [
    "bg-black/[0.03] text-black/35",                 // 0 미획득
    "bg-[#a9825e]/12 text-[#7a5c3e]",                // 1 나무
    "bg-black/[0.08] text-black/70",                 // 2 카본
    "bg-[#cba258]/15 text-[#8a6a2a]",                // 3 금장
    "bg-brand/12 text-brand",                        // 4 명인
];

export const BadgeShelf = () => {
    const { locale } = useT();
    const t = L[locale] ?? L.ko;
    const { data } = useQuery<{ badges: Badge[] }>({
        queryKey: ["/api/hiq/me/badges"],
        staleTime: 10 * 60 * 1000,
    });
    const badges = data?.badges ?? [];
    // 획득 전이라도 진행도(value>0)가 있으면 그리드를 보여준다 — "다음 등급까지 N"이 동기부여다
    const hasProgress = badges.some((b) => b.value > 0);

    return (
        <div className="rk-card p-5">
            <div className="flex items-baseline justify-between mb-3">
                <h3 className="text-[15px] font-bold text-ink-1">{t.title}</h3>
                <span className="text-[11.5px] font-medium text-black/40">{t.subtitle}</span>
            </div>
            {!hasProgress ? (
                <p className="text-[13px] text-black/45 text-center py-4">{t.empty}</p>
            ) : (
                <div className="grid grid-cols-2 gap-2">
                    {badges.map((b) => (
                        <div key={b.id} className={cn("rounded-2xl p-3 flex items-start gap-2.5", TIER_STYLE[b.tier])}>
                            <span className={cn("text-[20px] leading-none", b.tier === 0 && "grayscale opacity-40")}>{EMOJI[b.id]}</span>
                            <div className="min-w-0">
                                <p className="text-[12.5px] font-bold leading-tight">{t.names[b.id]}</p>
                                <p className="text-[11px] font-semibold mt-0.5 tabular-nums">
                                    {b.tier > 0 ? `${t.tiers[b.tier]} · ${b.value.toLocaleString()}` : (b.next != null ? t.next(b.next - b.value) : "")}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
