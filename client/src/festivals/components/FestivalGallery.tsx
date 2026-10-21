/**
 * 축제 사진 더 보기(2026-10-21) — 한국관광공사 TourAPI 의 사진들(detailImage2 · 공공누리 1 · 3유형).
 * **제3유형은 자르거나 고치지 않는다** — 줄에서는 높이만 맞추고 폭은 원본 비율 그대로, 누르면 검은 바탕에 원본 한 장(넘겨 보기 · 크레딧).
 * Radix Dialog 라 Esc · 앱의 '뒤로'가 닫는다. ⚠️ 색은 종목 테마의 글자색을 받는다. 글자는 12px 이상.
 */
import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { LucideChevronLeft, LucideChevronRight, LucideX } from "@/lib/icons";
import { festivalPhotoCredit, type FestivalImage } from "@shared/festivals";

export function FestivalGallery({ images, title, text }: { images: readonly FestivalImage[]; title: string; text: string }) {
    const [at, setAt] = useState<number | null>(null);
    if (!images.length) return null;
    const cur = at == null ? null : images[at];
    const go = (d: number) => setAt((i) => (i == null ? i : (i + d + images.length) % images.length));
    return (
        <div className="pt-2.5" data-testid="festival-gallery">
            <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {images.map((im, i) => (
                    <button key={im.url} type="button" onClick={() => setAt(i)} className="shrink-0 overflow-hidden rounded-xl active:opacity-80" style={{ background: "#FFFFFF0A" }} aria-label={`${title} 사진 ${i + 1} 크게 보기`} data-testid="festival-gallery-item">
                        <img src={im.small ?? im.url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="block h-[84px] w-auto max-w-none" />
                    </button>
                ))}
            </div>
            <p className="mt-1.5 text-right text-[12px]" style={{ color: `${text}66` }}>사진 {images.length}장 · {festivalPhotoCredit(images.some((x) => x.lic === "Type3") ? "Type3" : "Type1").replace(/^사진 /, "")}</p>

            <DialogPrimitive.Root open={at != null} onOpenChange={(o) => { if (!o) setAt(null); }}>
                <DialogPrimitive.Portal>
                    <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-[#050708]/95 backdrop-blur-md" />
                    <DialogPrimitive.Content onClick={() => setAt(null)} className="fixed inset-0 z-[61] flex flex-col items-center justify-center px-3 outline-none"
                        style={{ paddingTop: "calc(env(safe-area-inset-top) + 56px)", paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)" }} data-testid="festival-gallery-viewer">
                        <DialogPrimitive.Title className="sr-only">{`${title} 사진`}</DialogPrimitive.Title>
                        <DialogPrimitive.Description className="sr-only">사진 밖을 누르면 닫혀요</DialogPrimitive.Description>
                        <DialogPrimitive.Close aria-label="닫기" onClick={(e) => e.stopPropagation()} className="absolute right-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white active:bg-white/20" style={{ top: "calc(env(safe-area-inset-top) + 8px)" }}>
                            <LucideX className="h-6 w-6" />
                        </DialogPrimitive.Close>
                        {cur && (
                            <>
                                <img src={cur.url} alt={`${title} 사진 ${at! + 1}`} referrerPolicy="no-referrer" onClick={(e) => e.stopPropagation()} className="max-h-[calc(100dvh-200px)] max-w-full rounded-xl object-contain" />
                                <div className="mt-3 flex w-full max-w-[520px] items-center justify-between gap-3 px-2" onClick={(e) => e.stopPropagation()}>
                                    <button type="button" onClick={() => go(-1)} aria-label="앞 사진" className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white active:bg-white/20" disabled={images.length < 2}><LucideChevronLeft className="h-5 w-5" /></button>
                                    <span className="flex flex-col items-center text-center">
                                        <span className="text-[14px] font-semibold tabular-nums text-white/85">{at! + 1} / {images.length}</span>
                                        <span className="mt-0.5 text-[12px] text-white/55 break-keep">{festivalPhotoCredit(cur.lic)}</span>
                                    </span>
                                    <button type="button" onClick={() => go(1)} aria-label="다음 사진" className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white active:bg-white/20" disabled={images.length < 2}><LucideChevronRight className="h-5 w-5" /></button>
                                </div>
                            </>
                        )}
                    </DialogPrimitive.Content>
                </DialogPrimitive.Portal>
            </DialogPrimitive.Root>
        </div>
    );
}
