import { memo } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { EMOJI_GLYPH } from "./EmojiBar";

/**
 * 상대가 잘 쳤을 때만 잠깐 튀어나오는 "굿샷" 버튼(2026-09-15 오너: 라포 4번).
 *
 * 왜 필요한가: 인사 이모지는 상대 이름표 옆 메뉴 안에 접혀 있다. 누르려면 두 번 눌러야 하고, 그 사이에 칭찬할
 * 순간이 지나간다. 누르기 쉬워야 누른다 — 상대가 득점한 직후에만 큰 버튼 하나로 몇 초 떠 있다 사라진다.
 *
 * 연속 득점은 같이 알려 준다: 예전에는 상대가 3연속을 쳐도 점수만 조용히 올라가서, 상대가 잘 치고 있다는 걸
 * 남은 사람이 알 길이 없었다. 잘 친 걸 알아야 칭찬도 나온다.
 */
export const PRAISE_MS = 6000;
/** 이 이상 연속 득점이면 "n연속" 을 같이 띄운다. 1~2 는 흔해서 소음이다. */
export const PRAISE_RUN_MIN = 3;

export const PraisePrompt = memo(function PraisePrompt({ visible, run, name, disabled, onPraise }: {
    visible: boolean;
    /** 상대의 지금 연속 득점 */
    run: number;
    name: string;
    /** 쿨다운·횟수 소진·전송 중 */
    disabled?: boolean;
    onPraise: () => void;
}) {
    const { t } = useT();
    const streak = run >= PRAISE_RUN_MIN;
    return (
        <div
            aria-hidden={!visible}
            className={cn(
                "pointer-events-none absolute inset-x-0 bottom-3 z-20 flex flex-col items-center gap-1.5 transition-opacity duration-200",
                visible ? "opacity-100" : "opacity-0",
            )}
        >
            {streak && (
                <span className="rounded-pill bg-ink-1/85 px-3 py-1 text-[12px] font-bold text-white">
                    {t("sim.praise.streak").replace("{name}", name).replace("{n}", String(run))}
                </span>
            )}
            <button
                type="button" disabled={!visible || disabled} onClick={onPraise}
                className={cn(
                    "pointer-events-auto inline-flex items-center gap-1.5 h-11 px-5 rounded-pill",
                    "bg-brand text-brand-fg text-[14px] font-bold shadow-[0_4px_16px_rgba(0,0,0,0.18)]",
                    "active:scale-[0.97] transition-transform disabled:opacity-60",
                )}
            >
                <span className="text-[17px] leading-none">{EMOJI_GLYPH.nice}</span>
                {t("sim.praise.send")}
            </button>
        </div>
    );
});
