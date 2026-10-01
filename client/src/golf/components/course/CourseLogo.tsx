/**
 * 골프장 로고판(2026-09-24 오너: "해당 로고 자연스럽게 골프장에 넣어줘").
 *
 * 로고는 대부분 **흰 바탕 위 짙은 녹색 워드마크**다(247×77 같은 가로형부터 세로형까지 제각각).
 * 어두운 화면에 그대로 올리면 안 보이니 흰 판 위에 얹는다 — 더블이글 목록과 같은 방식이고, 로고를 자르지 않는다(object-contain).
 * 로고가 없거나 못 불러오면 이름 첫 글자 모노그램 — 빈 흰 판을 남기지 않는다.
 * 2026-10-01: 흰색뿐인 로고(파일 이름 `-light.png`)는 흰 판에서 안 보여서 **어두운 판**에 그대로 얹는다(로고를 고치지 않는다).
 *   모노그램 규칙도 고쳤다 — '1.2.3'이 '1.', 'J-PUBLIC'이 'J-', 'JNJ골프리조트'가 '골프', 클럽디가 '클럽'으로 나오던 것.
 *   우리 화면의 글자판일 뿐 골프장 표시를 흉내 내지 않는다(색·모양 없이 한 가지 모양).
 *
 * ⚠️ 리터럴 색만(CourseShell 머리말). 흰 판은 bg-[#FFFFFF] — `bg-white` 는 골프 테마가 어둡게 바꿔 끼운다.
 */
import { useState } from "react";
import { cn } from "@/lib/utils";

const SIZE = {
    xs: "h-7 min-w-[28px] max-w-[72px] rounded-md px-1 py-0.5", // 상단 바 — 뒤로 옆, 이름 앞(2026-09-24 오너)
    sm: "w-12 h-12 rounded-xl p-1",        // 목록 줄
    md: "w-14 h-14 rounded-xl p-1.5",      // 가까운 골프장
    lg: "h-16 min-w-[64px] max-w-[176px] rounded-2xl px-3 py-2", // 상세 머리 — 가로형 워드마크가 길게 눕는다
} as const;

const SUFFIX = /(컨트리클럽|컨드리클럽|골프클럽|골프앤리조트|골프&리조트|골프리조트|골프아카데미|골프장|리조트|클럽|C\.C\.?|G\.C\.?|CC|GC|cc|gc|퍼블릭|PUBLIC)$/;
const TRAILING_SUFFIX = new RegExp("\\s*" + SUFFIX.source);
/** 브랜드 + 지역인 체인은 지역이 더 잘 가른다(골프존카운티 순천 → 순천) */
const CHAIN_PREFIX = ["골프존카운티", "클럽디"];
const CORP_PREFIX = /^(\(주\)|㈜|주식회사|sk|SK)\s*/;

/**
 * 모노그램 — 이름에서 2~3글자. "가평베네스트GC" → "가평", "곤지암" → "곤지암", "1.2.3" → "123", "JNJ골프리조트" → "JNJ".
 * maxSyll: 한글 몇 글자까지(작은 판은 2).
 */
export function monogram(name: string, maxSyll = 3): string {
    const r = monogramCore(name, maxSyll);
    if (r.length >= 2) return r;
    const al = name.match(/[A-Za-z0-9가-힣]/g) ?? [];
    return al.slice(0, 2).join("").toUpperCase() || r;
}

function monogramCore(name: string, maxSyll: number): string {
    let n = name.replace(/\(.*?\)|\($/g, "").trim().replace(CORP_PREFIX, "");
    for (const c of CHAIN_PREFIX) if (n.startsWith(c) && n.length > c.length) n = n.slice(c.length).trim();
    for (let i = 0; i < 3; i++) {
        const next = n.replace(TRAILING_SUFFIX, "").trim();
        if (next === n) break;
        n = next;
    }
    const words = n.split(/[\s-]+/).filter(Boolean);
    let core = words[0] ?? n;
    // 한 글자 낱말이면 다음 낱말 첫 글자를 붙인다(잭 니클라우스 → 잭니)
    if (words.length > 1 && (core.match(/[가-힣A-Za-z]/g) ?? []).length === 1) core += words[1].slice(0, 1);
    core = core.replace(SUFFIX, "") || core;
    if (core.startsWith("더") && (core.match(/[가-힣]/g) ?? []).length >= 4) core = core.slice(1); // 더클래식 → 클래식, 더힐은 그대로
    const digits = core.match(/^[\d.]+/);
    if (digits) return digits[0].replace(/\D/g, "").slice(0, 3);
    const ko = core.match(/[가-힣]/g);
    if (ko) return (ko.length <= maxSyll ? ko : ko.slice(0, 2)).join("");
    const lat = core.match(/[A-Za-z]+/g);
    if (lat) {
        if (lat.length > 1) return (lat[0][0] + lat[1][0]).toUpperCase();
        const w = lat[0];
        return (w === w.toUpperCase() || w.length <= 3 ? w.slice(0, 3) : w.slice(0, 2)).toUpperCase();
    }
    return core.slice(0, 2);
}

/** 흰색뿐인 로고 — 파일 이름이 `-light.png` 로 끝난다. 어두운 판에 얹는다 */
export const isLightLogo = (logo: string | null | undefined): boolean => !!logo && /-light\.png$/i.test(logo);

export function CourseLogo({ logo, name, size = "sm", className }: { logo: string | null | undefined; name: string; size?: keyof typeof SIZE; className?: string }) {
    const [broken, setBroken] = useState(false);
    const show = !!logo && !broken;
    if (!show) {
        const text = monogram(name, size === "xs" ? 2 : 3);
        const three = text.length >= 3;
        return (
            <span
                aria-hidden="true"
                className={cn(
                    "shrink-0 inline-flex items-center justify-center bg-[#FFFFFF0F] border border-[#FFFFFF14] text-[#FFFFFFB3] font-semibold tracking-tight whitespace-nowrap",
                    size === "lg" ? cn("w-16 h-16 rounded-2xl", three ? "text-[17px]" : "text-[20px]")
                        : size === "md" ? cn("w-14 h-14 rounded-xl", three ? "text-[14px]" : "text-[16px]")
                        : size === "xs" ? "w-7 h-7 rounded-md text-[12px]"
                        : cn("w-12 h-12 rounded-xl", three ? "text-[13px]" : "text-[15px]"),
                    className,
                )}
            >
                {text}
            </span>
        );
    }
    return (
        <span className={cn("shrink-0 inline-flex items-center justify-center ring-1 ring-[#FFFFFF1A]", isLightLogo(logo) ? "bg-[#1C1F1D]" : "bg-[#FFFFFF]", SIZE[size], className)}>
            <img
                src={logo!}
                alt={`${name} 로고`}
                loading={size === "lg" ? "eager" : "lazy"}
                decoding="async"
                onError={() => setBroken(true)}
                className={cn("block max-w-full max-h-full object-contain", size === "lg" || size === "xs" ? "h-full w-auto" : "w-full h-full")}
            />
        </span>
    );
}

/** 잔디·플레이 방식 칩의 말 — 자료의 "3인가능" 을 화면 말로. */
export const PLAY_LABEL: Readonly<Record<string, string>> = { "3인가능": "3인 가능", "2인가능": "2인 가능", 노캐디: "노캐디" };
