import { bestRealTier, realTierFor, type RealTierId } from "@shared/realTier";

export const getTier = (handi: number, is3c: boolean, sport: 'GOLF' | 'BILLIARDS' | string) => {
    if (sport === "GOLF") {
        if (!handi || handi <= 0) return { label: "ROOKIE", class: "tier-bronze", icon: "🏌️", glow: "rgba(148, 163, 184, 0.1)" };
        // Based on score (strokes)
        if (handi <= 72) return { label: "ALBATROSS", class: "tier-platinum", icon: "🏆", glow: "rgba(192, 192, 192, 0.2)" };
        if (handi <= 79) return { label: "EAGLE", class: "tier-gold", icon: "🦅", glow: "rgba(255, 215, 0, 0.2)" };
        if (handi <= 89) return { label: "BIRDIE", class: "tier-silver", icon: "🐦", glow: "rgba(16, 185, 129, 0.2)" };
        if (handi <= 99) return { label: "PAR", class: "tier-gold", icon: "⭕", glow: "rgba(59, 130, 246, 0.2)" };
        if (handi <= 109) return { label: "BOGEY", class: "tier-bronze", icon: "⬜", glow: "rgba(148, 163, 184, 0.2)" };
        return { label: "ROOKIE", class: "tier-bronze", icon: "🏌️", glow: "rgba(148, 163, 184, 0.1)" };
    }

    // 당구 — 실전 등급은 한 가지 식이다(shared/realTier: 그 종목의 내 다마). 2026-10-12 에 3쿠션 구간을 다마 표에 맞췄다
    // (예전 구간은 다이아 35 · 마스터 45 라 표의 최고 30 으로는 나올 수 없었다). 다마가 없으면 등급이 없다 — rated: false.
    const t = realTierFor(handi, is3c ? "3c" : "4c");
    return t ? { ...BILLIARDS_TIER_LOOK[t.id], rated: true as const, id: t.id } : { ...BILLIARDS_TIER_LOOK.bronze, rated: false as const, id: null };
};

/** 당구 등급의 생김새(글자 코드 · 색 클래스 · 사진이 없을 때의 그림 문자) — 등급을 정하는 식은 shared/realTier 에 있다 */
const BILLIARDS_TIER_LOOK: Record<RealTierId, { label: string; class: string; icon: string; glow: string }> = {
    master: { label: "MASTER", class: "tier-master", icon: "🔥", glow: "rgba(239, 68, 68, 0.15)" },
    diamond: { label: "DIAMOND", class: "tier-diamond", icon: "💠", glow: "rgba(185, 242, 255, 0.15)" },
    platinum: { label: "PLATINUM", class: "tier-platinum", icon: "💎", glow: "rgba(0, 255, 209, 0.15)" },
    gold: { label: "GOLD", class: "tier-gold", icon: "🥇", glow: "rgba(255, 215, 0, 0.15)" },
    silver: { label: "SILVER", class: "tier-silver", icon: "🥈", glow: "rgba(224, 224, 224, 0.15)" },
    bronze: { label: "BRONZE", class: "tier-bronze", icon: "🥉", glow: "rgba(205, 127, 50, 0.15)" },
};

/**
 * 한 사람을 한 줄로 보여 줄 때(친구 · 최근 상대 · 검색 · 크루)의 당구 등급 — 두 종목 가운데 높은 쪽 하나(shared/realTier bestRealTier).
 * 예전에는 이 화면들이 전부 4구 다마만 넘겨 3쿠션만 치는 사람도 4구 다마로 매겨졌다. 다마가 하나도 없으면 rated: false(칩을 그리지 않는다).
 */
export function getMemberTier(m: { handi3c?: number | null; handi4c?: number | null } | null | undefined) {
    const pick = bestRealTier(m);
    return pick
        ? { ...BILLIARDS_TIER_LOOK[pick.tier.id], rated: true as const, id: pick.tier.id, game: pick.game, handi: pick.handi }
        : { ...BILLIARDS_TIER_LOOK.bronze, rated: false as const, id: null, game: null, handi: null };
}
