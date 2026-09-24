/**
 * 골프장 로고판(2026-09-24 오너: "해당 로고 자연스럽게 골프장에 넣어줘").
 *
 * 로고는 대부분 **흰 바탕 위 짙은 녹색 워드마크**다(247×77 같은 가로형부터 세로형까지 제각각).
 * 어두운 화면에 그대로 올리면 안 보이니 흰 판 위에 얹는다 — 더블이글 목록과 같은 방식이고, 로고를 자르지 않는다(object-contain).
 * 로고가 없거나 못 불러오면 이름 첫 글자 모노그램 — 빈 흰 판을 남기지 않는다.
 *
 * ⚠️ 리터럴 색만(CourseShell 머리말). 흰 판은 bg-[#FFFFFF] — `bg-white` 는 골프 테마가 어둡게 바꿔 끼운다.
 */
import { useState } from "react";
import { cn } from "@/lib/utils";

const SIZE = {
    sm: "w-12 h-12 rounded-xl p-1",        // 목록 줄
    md: "w-14 h-14 rounded-xl p-1.5",      // 가까운 골프장
    lg: "h-16 min-w-[64px] max-w-[176px] rounded-2xl px-3 py-2", // 상세 머리 — 가로형 워드마크가 길게 눕는다
} as const;

/** 모노그램 — "가평베네스트GC" → "가평". 영문이면 앞 두 글자 대문자. */
function monogram(name: string): string {
    const n = name.replace(/\s+/g, "").replace(/^(골프존카운티|더|the)/i, "");
    const ko = n.match(/[가-힣]{1,2}/);
    return ko ? ko[0] : n.slice(0, 2).toUpperCase();
}

export function CourseLogo({ logo, name, size = "sm", className }: { logo: string | null | undefined; name: string; size?: keyof typeof SIZE; className?: string }) {
    const [broken, setBroken] = useState(false);
    const show = !!logo && !broken;
    if (!show) {
        return (
            <span
                aria-hidden="true"
                className={cn(
                    "shrink-0 inline-flex items-center justify-center bg-[#FFFFFF0F] border border-[#FFFFFF14] text-[#FFFFFF99] font-semibold",
                    size === "lg" ? "w-16 h-16 rounded-2xl text-[20px]" : size === "md" ? "w-14 h-14 rounded-xl text-[16px]" : "w-12 h-12 rounded-xl text-[15px]",
                    className,
                )}
            >
                {monogram(name)}
            </span>
        );
    }
    return (
        <span className={cn("shrink-0 inline-flex items-center justify-center bg-[#FFFFFF] shadow-[0_1px_2px_#00000040]", SIZE[size], className)}>
            <img
                src={logo!}
                alt={`${name} 로고`}
                loading={size === "lg" ? "eager" : "lazy"}
                decoding="async"
                onError={() => setBroken(true)}
                className={cn("block max-w-full max-h-full object-contain", size === "lg" ? "h-full w-auto" : "w-full h-full")}
            />
        </span>
    );
}

/** 잔디·플레이 방식 칩의 말 — 자료의 "3인가능" 을 화면 말로. */
export const PLAY_LABEL: Readonly<Record<string, string>> = { "3인가능": "3인 가능", "2인가능": "2인 가능", 노캐디: "노캐디" };
