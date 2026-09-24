import { useLocation, useRoute } from "wouter";
import { useT } from "@/lib/i18n";
import { useSeo } from "@/hooks/useSeo";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { GOLF_TOUR_META, isGolfTour } from "@shared/golfTours";
import { GolferBody, useGolferDetail } from "@/components/hiq/golf/GolferSheet";
import { useGolfTheme } from "@/components/hiq/golf/ui";
import { golferName, type GolfTour } from "@/components/hiq/golf/types";
import { golferCardUrl } from "@/lib/playerCard";
import { GolfBackButton } from "@/golf/components/common/GolfBackButton";

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
        // 선수 카드 PNG — 프리렌더와 같은 주소(ko·en). 공유 미리보기·검색 썸네일.
        image: p && id ? golferCardUrl(tour, id, locale) : undefined,
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
                <GolfBackButton onClick={() => setLocation(`/golf-ranking?tour=${tour}`)} label={t("golf.back")} />
                <h2 className="text-[20px] font-bold tracking-tight text-ink-1">⛳ {t("golf.pageTitle")}</h2>
            </div>
            <div className="rounded-card bg-surface-1 border border-surface-line p-6 relative z-10">
                {id && <GolferBody tour={tour} playerId={id} standalone onNavigate={(pid) => setLocation(`/golfer/${tour}/${pid}`)} />}
            </div>
            <HiqNavigation />
        </div>
    );
}
