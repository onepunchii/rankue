
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
        if (handi >= 700) return { label: "MASTER", class: "tier-master", icon: "🔥", glow: "rgba(239, 68, 68, 0.15)" };
        if (handi >= 400) return { label: "DIAMOND", class: "tier-diamond", icon: "💠", glow: "rgba(185, 242, 255, 0.15)" };
        if (handi >= 250) return { label: "PLATINUM", class: "tier-platinum", icon: "💎", glow: "rgba(0, 255, 209, 0.15)" };
        if (handi >= 150) return { label: "GOLD", class: "tier-gold", icon: "🥇", glow: "rgba(255, 215, 0, 0.15)" };
        if (handi >= 80) return { label: "SILVER", class: "tier-silver", icon: "🥈", glow: "rgba(224, 224, 224, 0.15)" };
        return { label: "BRONZE", class: "tier-bronze", icon: "🥉", glow: "rgba(205, 127, 50, 0.15)" };
    }
};
