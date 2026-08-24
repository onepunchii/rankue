import { LucideShare2 } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useShare } from "@/hooks/useShare";
import { useT } from "@/lib/i18n";

// 공개 페이지 헤더에 붙이는 표준 공유 버튼.
// 화면마다 아이콘 크기·모양이 달라지지 않게 하나로 통일한다.
export function ShareButton({ url, title, text, className }: {
    url: string;
    title?: string;
    text?: string;
    className?: string;
}) {
    const share = useShare();
    const { t } = useT();
    return (
        <button
            type="button"
            onClick={() => share({ url, title, text })}
            aria-label={t("share.action")}
            title={t("share.action")}
            className={cn(
                "w-11 h-11 rounded-full bg-surface-1 flex items-center justify-center shrink-0",
                "text-black/55 active:scale-95 transition-transform shadow-[0_1px_2px_rgba(0,0,0,0.06)]",
                className,
            )}
        >
            <LucideShare2 className="w-5 h-5" />
        </button>
    );
}
