import { memo, useState } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { MATCH_EMOJIS, type MatchEmoji } from "@shared/sim/rules";

/**
 * 대전 중 상대에게 보내는 인사(2026-09-09 오너). 상대 이름표 옆의 작은 버튼을 누르면 여섯 개가 펼쳐지고,
 * 하나 고르면 곧바로 접힌다. 직접 입력은 없다 — 고정 여섯 개라 번역·신고 대응 부담이 없다.
 * 그림은 여기서만 고른다(서버·DB 는 코드만 안다).
 */
export const EMOJI_GLYPH: Readonly<Record<MatchEmoji, string>> = {
    hi: "👋", nice: "👍", wow: "😮", hurry: "⏰", sorry: "🙏", fight: "🔥",
};

export interface EmojiBarProps {
    onSend: (code: MatchEmoji) => void;
    /** 보낼 수 없는 동안(쿨다운·횟수 소진·전송 중) */
    disabled?: boolean;
    className?: string;
}

export const EmojiBar = memo(function EmojiBar({ onSend, disabled, className }: EmojiBarProps) {
    const { t } = useT();
    const [open, setOpen] = useState(false);
    return (
        <div className={cn("flex items-center gap-1", className)}>
            {open && MATCH_EMOJIS.map((code) => (
                <button
                    key={code} type="button" disabled={disabled}
                    onClick={() => { onSend(code); setOpen(false); }}
                    aria-label={t(`sim.emoji.${code}`)} title={t(`sim.emoji.${code}`)}
                    className="h-9 w-9 shrink-0 rounded-pill bg-surface-3 text-[17px] leading-none flex items-center justify-center active:opacity-70 disabled:opacity-40"
                >
                    {EMOJI_GLYPH[code]}
                </button>
            ))}
            <button
                type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
                aria-label={t("sim.emoji.open")} title={t("sim.emoji.open")}
                className={cn(
                    "h-9 w-9 shrink-0 rounded-pill border text-[15px] leading-none flex items-center justify-center",
                    open ? "border-brand text-brand" : "border-surface-line text-ink-3",
                )}
            >
                {open ? "×" : "☺"}
            </button>
        </div>
    );
});

export default EmojiBar;
