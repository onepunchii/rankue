
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

    // Billiards (is3c logic)
    if (is3c) {
        if (handi >= 45) return { label: "MASTER", class: "tier-master", icon: "🔥", glow: "rgba(239, 68, 68, 0.15)" };
        if (handi >= 35) return { label: "DIAMOND", class: "tier-diamond", icon: "💠", glow: "rgba(185, 242, 255, 0.15)" };
        if (handi >= 28) return { label: "PLATINUM", class: "tier-platinum", icon: "💎", glow: "rgba(0, 255, 209, 0.15)" };
        if (handi >= 22) return { label: "GOLD", class: "tier-gold", icon: "🥇", glow: "rgba(255, 215, 0, 0.15)" };
        if (handi >= 16) return { label: "SILVER", class: "tier-silver", icon: "🥈", glow: "rgba(224, 224, 224, 0.15)" };
        return { label: "BRONZE", class: "tier-bronze", icon: "🥉", glow: "rgba(205, 127, 50, 0.15)" };
    } else {
        // 4구 호출부는 전부 member.handi4c(다마수)를 넘긴다. 서버가 저장하는 handi4c는
        // HANDICAP_MAP_4C의 값(3,5,8,10,12,15,20,25,30,40,50)뿐이라 최댓값이 50이다.
        // 이전 임계값(700/400/250/150/80)은 이 스케일에서 도달 자체가 불가능해 최상급자도 영구 BRONZE였다.
        // 각 경계가 뜻하는 에버리지(50→1.5, 40→1.2, 30→0.9, 20→0.6, 12→0.35)를 기준으로,
        // 위 3구 분기의 경계 에버리지(28→1.0, 22→0.6, 16→0.4)와 같은 눈금에 오도록 잡았다.
        if (handi >= 50) return { label: "MASTER", class: "tier-master", icon: "🔥", glow: "rgba(239, 68, 68, 0.15)" };
        if (handi >= 40) return { label: "DIAMOND", class: "tier-diamond", icon: "💠", glow: "rgba(185, 242, 255, 0.15)" };
        if (handi >= 30) return { label: "PLATINUM", class: "tier-platinum", icon: "💎", glow: "rgba(0, 255, 209, 0.15)" };
        if (handi >= 20) return { label: "GOLD", class: "tier-gold", icon: "🥇", glow: "rgba(255, 215, 0, 0.15)" };
        if (handi >= 12) return { label: "SILVER", class: "tier-silver", icon: "🥈", glow: "rgba(224, 224, 224, 0.15)" };
        return { label: "BRONZE", class: "tier-bronze", icon: "🥉", glow: "rgba(205, 127, 50, 0.15)" };
    }
};
