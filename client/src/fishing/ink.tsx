/**
 * 낚시 화면이 같이 쓰는 종이 · 먹 · 낙관(2026-10-14). 어탁 그림은 흰 바탕의 먹이라 한지색 위에 곱하기로 얹는다.
 * ⚠️ 리터럴 색만. 글자 12px 이상, 굵기는 semibold 까지.
 */
import type { FishingIndexStep } from "@shared/fishingPort";
import { LucideX } from "@/lib/icons";

export const PAPER = "#EFE8D8", INK = "#1B1B1F", SEAL = "#C8372D";
/** 어탁 그림(client/public/fishing/art/gyotaku-<id>.webp) */
export const art = (id: string) => `/fishing/art/gyotaku-${id}.webp`;

/** 붉은 낙관 — 단계의 이름을 찍는다 */
export function Seal({ text, size = 44, faint }: { text: string; size?: number; faint?: boolean }) {
    return (
        <span className="inline-flex shrink-0 items-center justify-center rounded-[5px] text-center leading-[1.05]" aria-label={`${text} 낙관`}
            style={{ width: size, height: size, background: faint ? "transparent" : SEAL, color: faint ? SEAL : "#FFF4EC", border: `1.5px solid ${SEAL}`, fontSize: Math.max(12, Math.round(size / (text.length > 3 ? 3.6 : 2.9))), fontWeight: 600, transform: "rotate(-4deg)", wordBreak: "keep-all", padding: 2 }}>
            {text}
        </span>
    );
}

/** 바다낚시지수 다섯 단계의 알약 색(어두운 바탕 위) */
export const INDEX_TONE: Readonly<Record<FishingIndexStep, { bg: string; text: string }>> = {
    매우좋음: { bg: "#F4A96340", text: "#F8DDB0" }, 좋음: { bg: "#F4A96326", text: "#F8DDB0" }, 보통: { bg: "#FFFFFF14", text: "#F3ECDDCC" },
    나쁨: { bg: "#EE7B5B26", text: "#F7B9A6" }, 매우나쁨: { bg: "#EE7B5B40", text: "#F7B9A6" },
};

/** 사진 크게 보기 — 아무 데나 누르면 닫힌다. 아래에 한 줄(어종 · 값 · 날 · 곳) */
export function PhotoZoom({ src, alt, caption, onClose }: { src: string; alt: string; caption?: string; onClose: () => void }) {
    return (
        <div role="dialog" aria-modal="true" aria-label="사진" className="fixed inset-0 z-[80] flex flex-col items-center justify-center" style={{ background: "#000000F2" }} onClick={onClose} data-testid="fishing-photo-zoom">
            <img src={src} alt={alt} className="max-h-[82%] max-w-full object-contain" />
            {caption && <p className="mt-3 px-6 text-center text-[14px] [word-break:keep-all]" style={{ color: "#F3ECDDCC" }}>{caption}</p>}
            <button type="button" aria-label="닫기" className="absolute right-4 flex h-10 w-10 items-center justify-center rounded-full" style={{ top: "calc(12px + env(safe-area-inset-top))", background: "#FFFFFF24", color: "#FFFFFF" }}><LucideX className="h-5 w-5" /></button>
        </div>
    );
}
