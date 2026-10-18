/**
 * 등산 도장첩의 조각(2026-10-13) — 와펜(PatchArt) · 핀(PinArt) · 종이(HkPaper) · 진행 막대(HkBar) · 책 한 줄(BookRow).
 *
 * 골프의 도장첩(golf/stamps/StampParts)과 짜임은 닮았지만 가져다 쓰지 않는다 — 등산의 물건은 정상 도장 · 와펜 · 배낭이다.
 * 와펜 · 핀의 그림에는 글자가 없다. 못 받은 것은 흐린 윤곽으로 보인다(무엇이 남았는지 알아야 모으고 싶어진다).
 * ⚠️ 리터럴 색만(theme.HK). 글자는 12px 이상, 굵기는 semibold 까지.
 */
import type { ReactNode } from "react";
import { Link } from "wouter";
import { LucideChevronRight } from "@/lib/icons";
import type { HikingBookState } from "@shared/hikingStamps";
import { withHikingExample } from "@shared/hikingStampExample";
import { hikingCover, hikingListCover, patchSrc, pinSrc } from "../theme";

export const HIKING_STAMPS_PATH = "/hiking/stamps";
export const HIKING_PACK_PATH = "/hiking/pack";
export const hikingBookPath = (id: string) => `${HIKING_STAMPS_PATH}/${id}`;

/** 와펜 한 장 — earned 가 아니면 흐린 윤곽. preview 는 '받을 수 있는 것'을 제 색으로 보여 줄 때(등산이 아직 열리지 않은 사람에게) */
export function PatchArt({ art, size, earned, preview, className }: { art: string; size: number; earned: boolean; preview?: boolean; className?: string }) {
    return (
        <img
            src={patchSrc(art)} width={size} height={size} alt="" draggable={false} decoding="async" loading="lazy" data-patch={art} data-earned={earned ? "1" : "0"}
            className={`block shrink-0 ${className ?? ""}`}
            style={{ width: size, height: size, filter: earned ? "drop-shadow(0 4px 6px rgba(0,0,0,0.45))" : preview ? "drop-shadow(0 3px 5px rgba(0,0,0,0.35))" : "grayscale(1) brightness(0.75)", opacity: earned || preview ? 1 : 0.4 }}
        />
    );
}
export function PinArt({ art, size, earned }: { art: string; size: number; earned: boolean }) {
    return (
        <img
            src={pinSrc(art)} width={size} height={size} alt="" draggable={false} decoding="async" loading="lazy" data-pin={art} data-earned={earned ? "1" : "0"} className="block shrink-0"
            style={{ width: size, height: size, filter: earned ? "drop-shadow(0 3px 5px rgba(0,0,0,0.45))" : "grayscale(1) brightness(0.7)", opacity: earned ? 1 : 0.42 }}
        />
    );
}

/** 도장이 놓이는 종이 */
export function HkPaper({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <div className={`relative rounded-[18px] bg-[#F4EFE3] text-[#0E2A33] ${className ?? ""}`}>
            <div className="pointer-events-none absolute inset-[7px] rounded-[12px] border border-dashed border-[#0E2A3326]" aria-hidden />
            <div className="relative">{children}</div>
        </div>
    );
}

export function HkBar({ got, total, className }: { got: number; total: number; className?: string }) {
    const pct = total > 0 ? Math.min(100, Math.round((got / total) * 100)) : 0;
    return (
        <div className={`h-1.5 overflow-hidden rounded-full bg-[#FFFFFF1F] ${className ?? ""}`} role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={got}>
            <div className="h-full rounded-full bg-[#F28C6A]" style={{ width: `${pct}%` }} />
        </div>
    );
}

/** 책장의 한 권 — 권역의 표지 그림(특성 · 철 묶음은 그 묶음의 표지) 위에 이름 · 진행 · 와펜 */
export function BookRow({ state, preview, example }: { state: HikingBookState; preview?: boolean; /** 예시 — 권으로 들어가도 예시가 이어진다 */ example?: boolean }) {
    const { book, got, total, done } = state;
    return (
        <Link href={example ? withHikingExample(hikingBookPath(book.id)) : hikingBookPath(book.id)} className="relative block h-[92px] overflow-hidden rounded-2xl bg-[#0E2A33] active:opacity-80" data-testid={`hk-book-${book.id}`} data-done={done ? "1" : "0"}>
            <img src={book.region ? hikingCover(book.region) : hikingListCover(book.id)} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: "50% 60%" }} loading="lazy" decoding="async" draggable={false} />
            <span className="absolute inset-0" style={{ background: "linear-gradient(90deg,#0B1F26E6 30%,#0B1F2666)" }} aria-hidden />
            <span className="absolute left-3.5 right-[84px] top-3">
                <span className="block truncate text-[16.5px] font-semibold text-[#F4EFE3]">{book.name}{done && <span className="ml-1.5 text-[12.5px] font-medium text-[#F6D9A8]">다 채웠어요</span>}</span>
                <span className="mt-0.5 block text-[12.5px] tabular-nums text-[#F4EFE3B3]">{preview ? `${total}곳` : `${got} / ${total}곳`}</span>
                {!preview && <HkBar got={got} total={total} className="mt-2 max-w-[180px]" />}
            </span>
            <PatchArt art={book.art} size={66} earned={done} preview={preview} className="absolute right-3 top-1/2 -translate-y-1/2" />
            <LucideChevronRight weight="bold" className="absolute right-1 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#F4EFE399]" aria-hidden />
        </Link>
    );
}
