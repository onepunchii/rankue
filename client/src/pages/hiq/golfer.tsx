import { useLocation, useRoute } from "wouter";
import { motion } from "framer-motion";
import { useT } from "@/lib/i18n";
import { useSeo } from "@/hooks/useSeo";
import { LucideChevronLeft } from "@/lib/icons";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { GOLF_TOUR_META, isGolfTour } from "@shared/golfTours";
import { GolferBody, useGolferDetail } from "@/components/hiq/golf/GolferSheet";
import { useGolfTheme } from "@/components/hiq/golf/ui";
import { golferName, type GolfTour } from "@/components/hiq/golf/types";

// 골프 선수 전용 페이지(/golfer/:tour/:id) — 시트와 같은 본문을 공유 가능한 URL 로. 검색 색인·링크 공유가 목적.
export default function HiqGolfer() {
    const { t, locale } = useT();
    const [, setLocation] = useLocation();
    const [, params] = useRoute("/golfer/:tour/:id");
    useGolfTheme();
    const tour: GolfTour = isGolfTour(params?.tour) ? params!.tour as GolfTour : "owgr";
    const id = params?.id && /^\d{1,10}$/.test(params.id) ? params.id : null;

    const { data } = useGolferDetail(tour, id);
    const p = data?.player;
    const name = p ? golferName(p, locale) : null;
    useSeo({
        title: p
            ? `${name}${p.nameKo && p.nameKo !== p.playerName ? ` (${p.playerName})` : ""} — ${t(GOLF_TOUR_META[tour].labelKey)} ${p.rank ?? "-"}${t("umb.rankSuffix")} | RANKUE`
            : `${t("golf.pageTitle")} | RANKUE`,
        description: p
            ? `${name} (${p.country}) — ${t("golf.pageTitle")} ${t(GOLF_TOUR_META[tour].labelKey)} ${p.rank ?? "-"}${t("umb.rankSuffix")}. ${t("golf.rankHistory")}·${t("golf.statsTitle")}`
            : t("golf.subtitle"),
        path: `/golfer/${tour}/${id}`,
        jsonLd: p ? {
            "@context": "https://schema.org",
            "@type": "Person",
            name,
            alternateName: p.nameKo && p.nameKo !== p.playerName ? p.playerName : undefined,
            nationality: { "@type": "Country", name: p.country },
            description: `${t(GOLF_TOUR_META[tour].labelKey)} ${p.rank ?? "-"}${t("umb.rankSuffix")}`,
            url: `https://www.rankue.co.kr/golfer/${tour}/${id}`,
            knowsAbout: "Golf",
        } : null,
    });

    return (
        <div className="min-h-screen bg-surface-0 text-ink-1 px-5 pt-6 pb-nav relative overflow-x-hidden font-sans">
            <div className="flex items-center gap-3 mb-5 relative z-10">
                <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setLocation(`/golf-ranking?tour=${tour}`)}
                    className="w-11 h-11 rounded-full bg-surface-1 flex items-center justify-center transition-transform text-ink-2 shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                    aria-label={t("golf.back")}
                >
                    <LucideChevronLeft className="w-5 h-5" />
                </motion.button>
                <h2 className="text-[20px] font-bold tracking-tight text-ink-1">⛳ {t("golf.pageTitle")}</h2>
            </div>
            <div className="rounded-card bg-surface-1 border border-surface-line p-6 relative z-10">
                {id && <GolferBody tour={tour} playerId={id} standalone onNavigate={(pid) => setLocation(`/golfer/${tour}/${pid}`)} />}
            </div>
            <HiqNavigation />
        </div>
    );
}
