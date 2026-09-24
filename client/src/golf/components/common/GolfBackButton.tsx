/**
 * 골프 화면의 뒤로 단추 — 하나로 쓴다(2026-09-24 오너: "골프 페이지에 뒤로가기 버튼이 다 제각각이라 통일시켜 줘").
 *
 * 그 전에는 화면마다 w-9·w-10·p-1.5·p-2, 화살표(←)·꺾쇠(‹), 테두리 있는 원·없는 원이 섞여 있었다.
 * 게다가 아이콘 심(@/lib/icons)이 duotone 이라 꺾쇠가 **채운 삼각형**(◁)으로 그려져 '재생' 단추처럼 읽혔다 —
 * 여기서는 굵은 선 꺾쇠(weight="bold")로 못 박는다.
 *
 *   plain  상단 바 위(기본). 누르는 자리 40×40, 꺾쇠 22px, 왼쪽 여백에 꺾쇠가 맞게 -ml-2.
 *   glass  사진·3D 화면 위. 반투명 검은 원 + 블러 — 밝은 사진 위에서도 보인다.
 *
 * 동작: onClick 을 주면 그것. 없으면 뒤로 갈 기록이 있을 때 history.back(), 없으면 fallback.
 * ⚠️ 리터럴 색만 — 로그인 없이 여는 공개 골프장 페이지(CourseShell)에서도 쓴다(골프 테마가 없으면 토큰이 밝게 풀린다).
 */
import type { MouseEvent } from "react";
import { useLocation } from "wouter";
import { LucideChevronLeft, LucideX } from "@/lib/icons";
import { cn } from "@/lib/utils";

interface Props {
    onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
    /** onClick 이 없고 뒤로 갈 기록도 없을 때 갈 곳 */
    fallback?: string;
    variant?: "plain" | "glass";
    /** 닫기(×) — 전체 화면 게임·시트처럼 '나가기'가 맞는 곳 */
    icon?: "back" | "close";
    label?: string;
    className?: string;
}

export function GolfBackButton({ onClick, fallback = "/dashboard", variant = "plain", icon = "back", label, className }: Props) {
    const [, setLocation] = useLocation();
    const Icon = icon === "close" ? LucideX : LucideChevronLeft;
    const go = (e: MouseEvent<HTMLButtonElement>) => {
        if (onClick) return onClick(e);
        if (window.history.length > 1) window.history.back();
        else setLocation(fallback);
    };
    return (
        <button
            type="button"
            onClick={go}
            aria-label={label ?? (icon === "close" ? "닫기" : "뒤로")}
            className={cn(
                "shrink-0 w-10 h-10 rounded-full inline-flex items-center justify-center text-[#FFFFFF] transition-colors",
                variant === "glass"
                    ? "bg-[#0000004D] backdrop-blur-md ring-1 ring-inset ring-[#FFFFFF1A] active:bg-[#00000080]"
                    : "-ml-2 active:bg-[#FFFFFF14]",
                className,
            )}
        >
            <Icon weight="bold" className="w-[22px] h-[22px]" />
        </button>
    );
}
