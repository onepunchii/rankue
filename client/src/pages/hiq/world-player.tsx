import { useLocation, useRoute } from "wouter";
import { motion } from "framer-motion";
import { useT } from "@/lib/i18n";
import { useSeo } from "@/hooks/useSeo";
import { LucideChevronLeft } from "@/lib/icons";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { UmbPlayerBody, usePlayerDetail } from "@/components/hiq/umb/UmbPlayerSheet";
import type { UmbCategory } from "@/components/hiq/umb/types";
import { umbPlayerDesc, umbPlayerTitle } from "@shared/siteGraph";

const CATEGORIES = ["players", "ladies", "juniors"];

// 선수 전용 페이지 — 시트와 같은 본문을 공유 가능한 URL로. 검색 색인(사이트맵 톱200+한국 선수)
// 과 링크 공유가 목적이다.
export default function HiqWorldPlayer() {
    const { t, locale } = useT();
    const [, setLocation] = useLocation();
    const [, params] = useRoute("/player/:category/:umbId");
    const category = (CATEGORIES.includes(params?.category || "") ? params!.category : "players") as UmbCategory;
    const umbId = params?.umbId || null;

    // SEO 타이틀은 데이터 로드 후 갱신 (같은 쿼리 키라 Body와 캐시 공유)
    const { data } = usePlayerDetail(category, umbId);
    const p = data?.player;
    const nameMain = p ? (p.nativeName || p.playerName) : null;
    // 제목·설명은 프리렌더(server/prerender.ts)와 같은 함수·같은 API 값 — 봇과 사람이 같은 제목을 본다(2026-09-24)
    const seo = p && data ? {
        category, playerName: p.playerName, nativeName: p.nativeName ?? null, fed: p.fed,
        rank: p.rank, points: p.points, bestRank: data.bestRank, nationalRank: p.nationalRank,
    } : null;
    useSeo({
        title: seo ? umbPlayerTitle(locale, seo) : `${t("umb.pageTitle")} | RANKUE`,
        description: seo ? umbPlayerDesc(locale, seo) : t("umb.subtitle"),
        path: `/player/${category}/${umbId}`,
        // 선수 카드 PNG — 프리렌더(server/prerender.ts)와 같은 주소. 공유 미리보기·검색 썸네일.
        image: p ? `https://www.rankue.co.kr/og/player/${category}/${umbId}.png${locale === "ko" ? "" : `?lang=${locale}`}` : undefined,
        // 개체 연결(조명우 = CHO Myung Woo)용 Person 스키마 — 프리렌더와 동일 구조
        jsonLd: p ? {
            "@context": "https://schema.org",
            "@type": "Person",
            name: nameMain,
            alternateName: p.nativeName ? p.playerName : undefined,
            nationality: { "@type": "Country", name: p.fed },
            description: seo ? umbPlayerDesc(locale, seo) : undefined,
            url: `https://www.rankue.co.kr/player/${category}/${umbId}`,
            knowsAbout: "Three-cushion billiards",
        } : null,
    });

    return (
        <div className="min-h-screen bg-surface-0 text-ink-1 px-5 pt-6 pb-nav relative overflow-x-hidden font-sans">
            <div className="flex items-center gap-3 mb-5 relative z-10">
                <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setLocation("/world-ranking")}
                    className="w-11 h-11 rounded-full bg-white flex items-center justify-center transition-transform text-black/60 shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                    aria-label={t("umb.back")}
                >
                    <LucideChevronLeft className="w-5 h-5" />
                </motion.button>
                <h2 className="text-[20px] font-bold tracking-tight text-ink-1">{t("umb.pageTitle")}</h2>
            </div>

            <div className="rk-card p-6 relative z-10">
                {umbId && (
                    <UmbPlayerBody
                        category={category}
                        playerUmbId={umbId}
                        standalone
                        onNavigate={(id) => setLocation(`/player/${category}/${id}`)}
                    />
                )}
            </div>

            <HiqNavigation />
        </div>
    );
}
