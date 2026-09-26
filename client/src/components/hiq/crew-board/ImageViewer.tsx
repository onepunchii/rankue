/**
 * 사진 크게 보기 — 좌우로 밀어 넘기기, 공유·저장. 글 상세의 사진과 사진첩이 같이 쓴다.
 * 바탕은 페이지 바탕(surface-0) — 검정을 박으면 토큰 규칙을 깨고, 골프(어두운 테마)에선 어차피 어둡다.
 */
import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { LucideChevronLeft, LucideChevronRight, LucideDownload, LucideShare2, LucideX } from "@/lib/icons";
import { IconButton } from "@/components/hiq/crew-ui";
import { useShare } from "@/hooks/useShare";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * 가로로 밀기 — 50px 넘게, 세로보다 가로로 더 움직였을 때만(세로 스크롤을 넘기기로 오인하지 않게).
 * 크루 화면의 탭 컨테이너도 가로 드래그를 받으므로 pointerdown 을 멈춰 탭이 같이 넘어가지 않게 한다.
 */
export function useHorizontalSwipe(onPrev: () => void, onNext: () => void) {
    const start = useRef<{ x: number; y: number } | null>(null);
    return {
        onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
        onTouchStart: (e: React.TouchEvent) => {
            const t = e.touches[0];
            start.current = t ? { x: t.clientX, y: t.clientY } : null;
        },
        onTouchEnd: (e: React.TouchEvent) => {
            const s = start.current;
            start.current = null;
            const t = e.changedTouches[0];
            if (!s || !t) return;
            const dx = t.clientX - s.x;
            const dy = t.clientY - s.y;
            if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
            if (dx > 0) onPrev(); else onNext();
        },
    };
}

/** 좌우 화살표 키로 넘기기(데스크톱). */
export function useArrowKeys(enabled: boolean, onPrev: () => void, onNext: () => void) {
    useEffect(() => {
        if (!enabled) return;
        const h = (e: KeyboardEvent) => {
            if (e.key === "ArrowLeft") onPrev();
            else if (e.key === "ArrowRight") onNext();
        };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [enabled, onPrev, onNext]);
}

/** 공유(OS 공유 시트, 없으면 주소 복사) + 원본 열기/저장. */
export function PhotoShareButtons({ url, title }: { url: string; title?: string }) {
    const { t } = useT();
    const share = useShare();
    return (
        <>
            <IconButton label={t("crewAlbum.share")} onClick={() => void share({ url, title })}>
                <LucideShare2 />
            </IconButton>
            <a
                href={url}
                download
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("crewAlbum.download")}
                title={t("crewAlbum.download")}
                className="w-11 h-11 shrink-0 rounded-full inline-flex items-center justify-center text-ink-2 active:bg-surface-3 [&_svg]:w-5 [&_svg]:h-5"
            >
                <LucideDownload />
            </a>
        </>
    );
}

export function ImageViewer({ images, index, onIndexChange, open, onOpenChange, footer }: {
    images: string[];
    index: number;
    onIndexChange: (i: number) => void;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    footer?: ReactNode;
}) {
    const { t } = useT();
    const count = images.length;
    const safe = Math.min(Math.max(index, 0), Math.max(count - 1, 0));
    const prev = useCallback(() => { if (safe > 0) onIndexChange(safe - 1); }, [safe, onIndexChange]);
    const next = useCallback(() => { if (safe < count - 1) onIndexChange(safe + 1); }, [safe, count, onIndexChange]);
    const swipe = useHorizontalSwipe(prev, next);
    useArrowKeys(open, prev, next);
    const url = images[safe];

    return (
        <Dialog open={open && count > 0} onOpenChange={onOpenChange}>
            <DialogContent
                hideClose
                className="max-w-none w-screen h-[100dvh] p-0 gap-0 rounded-none sm:rounded-none border-0 bg-surface-0 flex flex-col"
            >
                <DialogTitle className="sr-only">{t("crewAlbum.viewerTitle")}</DialogTitle>
                <header className="flex items-center gap-1 px-2 pt-[env(safe-area-inset-top)] min-h-14 shrink-0">
                    <IconButton label={t("crewPost.close")} onClick={() => onOpenChange(false)}><LucideX /></IconButton>
                    <span className="flex-1 text-center text-[13px] font-semibold text-ink-2 rk-num">
                        {count > 1 ? `${safe + 1} / ${count}` : ""}
                    </span>
                    {url && <PhotoShareButtons url={url} />}
                </header>
                <div className="relative flex-1 min-h-0 flex items-center justify-center select-none" {...swipe}>
                    {url && <img key={url} src={url} alt="" className="max-w-full max-h-full object-contain" draggable={false} />}
                    {count > 1 && (
                        <>
                            <IconButton label={t("crewAlbum.prev")} onClick={prev} disabled={safe === 0}
                                className={cn("absolute left-2 top-1/2 -translate-y-1/2 bg-surface-1 shadow-sm hidden md:inline-flex")}>
                                <LucideChevronLeft />
                            </IconButton>
                            <IconButton label={t("crewAlbum.next")} onClick={next} disabled={safe === count - 1}
                                className="absolute right-2 top-1/2 -translate-y-1/2 bg-surface-1 shadow-sm hidden md:inline-flex">
                                <LucideChevronRight />
                            </IconButton>
                        </>
                    )}
                </div>
                {footer && <div className="shrink-0 pb-[env(safe-area-inset-bottom)]">{footer}</div>}
            </DialogContent>
        </Dialog>
    );
}
