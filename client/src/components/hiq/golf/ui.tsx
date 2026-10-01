/**
 * 골프 랭킹 화면 조각(2026-09-13). 당구 선수 페이지의 umb/ui.tsx 와 같은 어휘지만 **토큰만** 쓴다 —
 * 골프 모드는 검정 바탕·라임 강조(index.css [data-sport="GOLF"])라 black/… 알파 색은 안 보인다.
 * 이 파일의 클래스는 골프 모드에서도 당구 모드에서도 제 색이 난다.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * (2026-10-01 걷어냄) 예전엔 공개 골프 페이지가 직접 data-sport=GOLF 를 걸고, 나갈 때 들어올 때 값으로 되돌렸다.
 * 9/21 부터 SportContext 가 주소(/golfer·/golf-ranking)로 골프를 고르는데, 이 되돌리기가 그 뒤에 돌아
 * 홈·로그인까지 골프 색으로 굳혔다(오너 제보: 비로그인으로 골프 페이지 → 홈이 검은 화면). 이제 아무것도 하지 않는다.
 */
export function useGolfTheme() { /* SportContext 가 맡는다 */ }

export function GSection({ emoji, title, meta, desc, children }: { emoji: string; title: string; meta?: ReactNode; desc?: string; children: ReactNode }) {
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

export function GTile({ emoji, value, label, accent }: { emoji: string; value: string; label: string; accent?: boolean }) {
    return (
        <div className="rounded-2xl bg-surface-3 px-2 py-3 text-center min-w-0">
            <div className="text-[16px] leading-none">{emoji}</div>
            <div className={cn("text-[19px] font-bold tabular-nums mt-1.5 leading-none", accent ? "text-brand" : "text-ink-1")}>{value}</div>
            <div className="text-[10.5px] font-semibold text-ink-3 mt-1.5 truncate">{label}</div>
        </div>
    );
}

export function GChip({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "gold" | "brand"; className?: string }) {
    return (
        <span className={cn(
            "inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[12px] font-semibold leading-none whitespace-nowrap",
            tone === "gold" ? "bg-[#F5B721]/20 text-[#e0b13a]" : tone === "brand" ? "bg-brand/15 text-brand" : "bg-surface-3 text-ink-2",
            className,
        )}>{children}</span>
    );
}

export function GList({ children, className }: { children: ReactNode; className?: string }) {
    return <div className={cn("rounded-2xl bg-surface-3 divide-y divide-surface-line overflow-hidden", className)}>{children}</div>;
}

/** 순위 변동 배지 — ▲n 라임 / ▼n 빨강 / 신규 */
export function GMove({ move, newLabel }: { move: number | null; newLabel: string }) {
    if (move === null) return <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-brand/15 text-[10px] font-bold text-brand leading-none">{newLabel}</span>;
    if (move === 0) return <span className="shrink-0 w-8 text-center text-[11px] font-semibold text-ink-4">–</span>;
    return <span className={cn("shrink-0 w-8 text-center text-[12px] font-bold tabular-nums", move > 0 ? "text-brand" : "text-red-400")}>{move > 0 ? `▲${move}` : `▼${-move}`}</span>;
}
