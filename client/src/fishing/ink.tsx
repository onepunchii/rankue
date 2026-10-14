/**
 * 낚시 화면이 같이 쓰는 종이 · 먹 · 낙관(2026-10-14). 어탁 그림은 흰 바탕의 먹이라 한지색 위에 곱하기로 얹는다.
 * ⚠️ 리터럴 색만. 글자 12px 이상, 굵기는 semibold 까지.
 */
import type { FishingIndexStep } from "@shared/fishingPort";

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
