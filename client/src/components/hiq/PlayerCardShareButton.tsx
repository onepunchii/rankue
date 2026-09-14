import { useState } from "react";
import { useT } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { shareImage } from "@/lib/shareImage";
import { cn } from "@/lib/utils";

// "카드 공유" — 선수 페이지(UMB·골프·PBA) 헤더의 관심 선수 버튼 옆 알약. 서버가 그린 정사각형 카드 PNG
// (/og/…)를 받아 OS 공유 시트로 넘기거나(앱·모바일) 다운로드한다(데스크톱). 2026-09-14 오너 요청.
export function PlayerCardShareButton({ cardUrl, filename, title, text, className }: {
    cardUrl: string;
    filename: string;
    title: string;
    text: string;
    className?: string;
}) {
    const { t } = useT();
    const { toast } = useToast();
    const [busy, setBusy] = useState(false);

    const onClick = async () => {
        if (busy) return;
        setBusy(true);
        try {
            const outcome = await shareImage({ url: cardUrl, filename, title, text });
            if (outcome === "downloaded") toast({ title: t("playerCard.saved") });
            else if (outcome === "failed") toast({ title: t("playerCard.failed"), variant: "destructive" });
        } finally {
            setBusy(false);
        }
    };

    return (
        <button
            type="button" onClick={() => { void onClick(); }} disabled={busy} aria-busy={busy}
            className={cn(
                "inline-flex items-center gap-1 h-8 px-3 rounded-full text-[12.5px] font-bold transition-colors disabled:opacity-60",
                "bg-black/[0.05] text-ink-1 hover:bg-black/[0.08]",
                className,
            )}
        >
            <span className="text-[14px] leading-none">🃏</span>
            {busy ? t("playerCard.making") : t("playerCard.share")}
        </button>
    );
}
