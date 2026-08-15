import { useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { motion } from "framer-motion";
import { useT } from "@/lib/i18n";
import { useSeo } from "@/hooks/useSeo";
import { LucideChevronLeft } from "@/lib/icons";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { UmbPlayerBody, usePlayerDetail } from "@/components/hiq/umb/UmbPlayerSheet";
import type { UmbCategory } from "@/components/hiq/umb/types";

const CATEGORIES = ["players", "ladies", "juniors"];

// 선수 전용 페이지 — 시트와 같은 본문을 공유 가능한 URL로. 검색 색인(사이트맵 톱200+한국 선수)
// 과 링크 공유가 목적이다.
export default function HiqWorldPlayer() {
    const { t } = useT();
    const [, setLocation] = useLocation();
    const [, params] = useRoute("/player/:category/:umbId");
    const category = (CATEGORIES.includes(params?.category || "") ? params!.category : "players") as UmbCategory;
    const umbId = params?.umbId || null;

    // SEO 타이틀은 데이터 로드 후 갱신 (같은 쿼리 키라 Body와 캐시 공유)
    const { data } = usePlayerDetail(category, umbId);
    const p = data?.player;
    const nameMain = p ? (p.nativeName || p.playerName) : null;

    // 네이버 "본문 바로가기" 칩(#history·#rivals)으로 유입되면 데이터 로드 후에야
    // 섹션이 생겨 브라우저 기본 앵커 점프가 안 먹는다 — 로드 시점에 직접 스크롤.
    useEffect(() => {
        if (!p) return;
        const hash = window.location.hash.slice(1);
        if (hash) document.getElementById(hash)?.scrollIntoView();
    }, [p]);
    useSeo({
        title: p
            ? `${p.nativeName ? `${p.nativeName} (${p.playerName})` : p.playerName} — ${t("umb.pageTitle")} ${p.rank}${t("umb.rankSuffix")} | RANKUE`
            : `${t("umb.pageTitle")} | RANKUE`,
        description: p
            ? `${nameMain} (${p.fed}) — ${t("umb.subtitle")} ${p.rank}${t("umb.rankSuffix")}, ${p.points}${t("umb.pointsUnit")}. ${t("umb.rankHistory")}·${t("umb.pointsBreakdown")}`
            : t("umb.subtitle"),
        path: `/player/${category}/${umbId}`,
        // 개체 연결(조명우 = CHO Myung Woo)용 Person 스키마 — 프리렌더와 동일 구조
        jsonLd: p ? {
            "@context": "https://schema.org",
            "@type": "Person",
            name: nameMain,
            alternateName: p.nativeName ? p.playerName : undefined,
            nationality: { "@type": "Country", name: p.fed },
            description: `${t("umb.subtitle")} ${p.rank}${t("umb.rankSuffix")} (${p.points}${t("umb.pointsUnit")})`,
            url: `https://www.rankue.co.kr/player/${category}/${umbId}`,
            knowsAbout: "Three-cushion billiards",
        } : null,
    });

    return (
        <div className="min-h-screen bg-[#f2f0eb] text-ink-1 px-5 pt-6 pb-28 relative overflow-x-hidden font-sans">
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
