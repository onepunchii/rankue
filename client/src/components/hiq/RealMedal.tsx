/**
 * 실전(오프라인 점수판)의 **다마 메달**(2026-10-12 오너: "오프라인 점수판에도 해당 배찌및 등급을 적극 검토해줘" → "추천대로").
 * 둥근 메달 가운데에 내 다마수. 등급이 오를수록 장식이 는다(월계수 → 보석 → 왕관).
 *
 * 온라인 대전 등급(방패, sim/rank/TierEmblem)과 **모양이 다르다** — 둥근 메달 = 실전 다마 · 방패 = 온라인 대전. 한 줄에 둘이 있어도 섞이지 않는다.
 * 읽어 주는 이름은 "실전 골드 · 3쿠션 다마 20"이다(real.medalAria).
 *
 * 그림은 client/public/real/medal-<등급>.webp(256px, 여섯 장 합쳐 92KB). **숫자는 그림에 없다** — 가운데 빈 원에 여기서 얹는다.
 * 여섯 장을 같은 틀로 잘라 숫자 자리가 등급마다 같다(세로 가운데에서 2% 위).
 * 등급은 shared/realTier 의 한 가지 식(그 종목의 내 다마)으로 정한다 — 다마가 없으면(공식 5판 전) 등급이 없고 **빈 메달**(empty)을 그린다.
 */
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { bestRealTier, realTierFor, type RealGame, type RealTierId } from "@shared/realTier";

export const realMedalSrc = (id: RealTierId): string => `/real/medal-${id}.webp`;

/** 실전 등급의 빛깔 — 글자 강조에 쓴다(밝은 바탕에서도 읽히는 값) */
export const REAL_TIER_INK: Record<RealTierId, string> = {
    bronze: "#9A5A2B",
    silver: "#5F6B76",
    gold: "#A16207",
    platinum: "#2F7C78",
    diamond: "#2F6FB5",
    master: "#B4232A",
};

export interface RealMedalProps {
    game: RealGame;
    /** 내 다마(다마 표의 눈금). 없으면 빈 메달 */
    handi: number | null | undefined;
    /** 한 변(px) */
    size: number;
    className?: string;
    /** 이름을 읽어 주지 않는다(옆에 같은 글자가 있을 때) */
    decorative?: boolean;
}

export function RealMedal({ game, handi, size, className, decorative = false }: RealMedalProps) {
    const { t } = useT();
    const tier = realTierFor(handi, game);
    const gameName = t(game === "3c" ? "real.tab3c" : "real.tab4c");
    const label = tier
        ? t("real.medalAria").replace("{tier}", t(tier.nameKey)).replace("{game}", gameName).replace("{n}", String(handi))
        : t("real.medalEmptyAria").replace("{game}", gameName);
    const digits = tier ? String(handi).length : 1;
    return (
        <span
            className={cn("relative inline-block shrink-0", className)}
            style={{ width: size, height: size }}
            role={decorative ? undefined : "img"} aria-label={decorative ? undefined : label} aria-hidden={decorative ? true : undefined}
            title={decorative ? undefined : label}
            data-testid="real-medal" data-tier={tier?.id ?? "none"}
        >
            <img
                src={realMedalSrc(tier?.id ?? "bronze")} width={size} height={size} alt="" decoding="async" draggable={false}
                className="block w-full h-full object-contain"
                style={{ filter: tier ? "drop-shadow(0 2px 3px rgba(0,0,0,0.28))" : "grayscale(1) opacity(0.42)" }}
            />
            {/* 숫자는 읽힐 크기에서만(2026-10-18 — 목록의 22px 메달에서는 6px 점이 됐다. 옆 이름표와 aria 에 같은 뜻이 있다) */}
            {tier && size >= 30 && (
                <span
                    className="rk-num absolute left-0 right-0 text-center font-black text-white"
                    style={{ top: "50%", transform: "translateY(-52%)", fontSize: Math.round(size * (digits >= 3 ? 0.24 : 0.3)), lineHeight: 1, letterSpacing: "-0.03em", textShadow: "0 1px 2px rgba(0,0,0,0.55)" }}
                >
                    {handi}
                </span>
            )}
        </span>
    );
}

/**
 * 한 사람의 실전 등급 칩 — 작은 메달 + "실전 골드"(친구 · 최근 상대 · 검색 · 크루의 한 줄).
 * 두 종목 가운데 높은 쪽 하나. 다마가 없는 사람(공식 5판 전)에게는 그리지 않는다 — 예전에는 모두 브론즈로 보였다.
 */
export function RealTierChip({ member, size = 22, className }: {
    member: { handi3c?: number | null; handi4c?: number | null } | null | undefined;
    size?: number;
    className?: string;
}) {
    const { t } = useT();
    const pick = bestRealTier(member);
    if (!pick) return null;
    return (
        <span className={cn("inline-flex items-center gap-1 shrink-0 min-w-0", className)} data-testid="real-tier-chip">
            <RealMedal game={pick.game} handi={pick.handi} size={size} />
            <span className="text-[12px] font-bold truncate" style={{ color: REAL_TIER_INK[pick.tier.id] }}>
                {t("real.tierOf").replace("{tier}", t(pick.tier.nameKey))}
            </span>
        </span>
    );
}

export default RealMedal;
