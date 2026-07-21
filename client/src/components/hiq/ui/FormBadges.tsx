import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

export type MatchResult = "W" | "L" | "D";

const STYLES: Record<MatchResult, { bg: string; fg: string; label: string }> = {
    W: { bg: "bg-brand", fg: "text-brand-fg", label: "formBadges.win" },
    L: { bg: "bg-red-500", fg: "text-white", label: "formBadges.loss" },
    D: { bg: "bg-black/[0.06]", fg: "text-black/60", label: "formBadges.draw" },
};

/**
 * Recent-form row of circular W/무/패 badges (the "LAST 5 GAMES" pattern).
 * Newest-first by default.
 */
export function FormBadges({
    results,
    size = 26,
    className,
}: {
    results: MatchResult[];
    size?: number;
    className?: string;
}) {
    const { t } = useT();
    if (!results.length) {
        // Designed empty state — 5 hollow placeholders instead of bare text.
        return (
            <div className={cn("flex items-center gap-1.5", className)}>
                {Array.from({ length: 5 }).map((_, i) => (
                    <span
                        key={i}
                        className="inline-flex rounded-full bg-black/[0.04] ring-1 ring-black/[0.05]"
                        style={{ width: size, height: size }}
                    />
                ))}
            </div>
        );
    }
    return (
        <div className={cn("flex items-center gap-1.5", className)}>
            {results.map((r, i) => {
                const s = STYLES[r] || STYLES.D;
                return (
                    <span
                        key={i}
                        className={cn("inline-flex items-center justify-center rounded-full font-bold", s.bg, s.fg)}
                        style={{ width: size, height: size, fontSize: Math.round(size * 0.46) }}
                    >
                        {t(s.label)}
                    </span>
                );
            })}
        </div>
    );
}
