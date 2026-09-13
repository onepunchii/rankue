/**
 * 선수 페이지 공용 조각(2026-09-13 오너: "정보는 좋으니 디자인만 시원하게 — 이모지로 시인성, 글자 줄이고").
 * 섹션 제목은 이모지 하나 + 짧은 제목, 숫자는 타일, 부가 정보는 칩. 본문(UmbPlayerSheet)과 응원글(PlayerCheers)이 같이 쓴다.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Section({ emoji, title, meta, desc, children }: { emoji: string; title: string; meta?: ReactNode; desc?: string; children: ReactNode }) {
    return (
        <section className="min-w-0">
            <div className="flex items-center justify-between gap-2 mb-3">
                <h3 className="text-[15px] font-bold text-ink-1 flex items-center gap-1.5 shrink-0">
                    <span className="text-[16px] leading-none">{emoji}</span>
                    {title}
                </h3>
                {meta && <div className="min-w-0 truncate text-[12px] font-semibold text-ink-3">{meta}</div>}
            </div>
            {desc && <p className="text-[11.5px] font-medium text-ink-3 leading-snug -mt-1.5 mb-3">{desc}</p>}
            {children}
        </section>
    );
}

/** 숫자 타일 — 이모지 · 큰 숫자 · 작은 라벨 */
export function Tile({ emoji, value, label, accent }: { emoji: string; value: string; label: string; accent?: boolean }) {
    return (
        <div className="rounded-2xl bg-surface-3 px-2 py-3 text-center min-w-0">
            <div className="text-[16px] leading-none">{emoji}</div>
            <div className={cn("text-[19px] font-bold tabular-nums mt-1.5 leading-none", accent ? "text-brand" : "text-ink-1")}>{value}</div>
            <div className="text-[10.5px] font-semibold text-ink-3 mt-1.5 truncate">{label}</div>
        </div>
    );
}

export function Chip({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "gold" | "brand"; className?: string }) {
    return (
        <span className={cn(
            "inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[12px] font-semibold leading-none whitespace-nowrap",
            tone === "gold" ? "bg-[#F5B721]/15 text-[#8a6a0a]" : tone === "brand" ? "bg-brand/10 text-brand" : "bg-surface-3 text-ink-2",
            className,
        )}>{children}</span>
    );
}

/** 줄 목록 컨테이너 — 줄마다 회색 상자를 두르지 않고 한 상자 안에 가는 선으로 나눈다(상자가 겹겹이면 답답하다) */
export function List({ children, className }: { children: ReactNode; className?: string }) {
    return <div className={cn("rounded-2xl bg-surface-3 divide-y divide-surface-line overflow-hidden", className)}>{children}</div>;
}
