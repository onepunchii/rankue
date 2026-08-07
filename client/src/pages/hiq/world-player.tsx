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
    useSeo({
        title: p
            ? `${p.playerName} — ${t("umb.pageTitle")} ${p.rank}${t("umb.rankSuffix")} | RANKUE`
            : `${t("umb.pageTitle")} | RANKUE`,
        description: p
            ? `${p.playerName} (${p.fed}) — ${t("umb.subtitle")} ${p.rank}${t("umb.rankSuffix")}, ${p.points}${t("umb.pointsUnit")}. ${t("umb.rankHistory")}·${t("umb.pointsBreakdown")}`
            : t("umb.subtitle"),
        path: `/player/${category}/${umbId}`,
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
