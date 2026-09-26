/**
 * 크루 만들기·크루 설정 폼이 같이 쓰는 칸 모양(2026-09-26 크루 디자인 정리).
 * crew-ui 키트의 규칙(토큰 색·12/13/15/17/22·44px)을 입력칸에 옮긴 것 — 두 화면이 따로 놀던 높이(h-10/h-12/h-14)와
 * 검은 반투명 색(text-black/55, bg-black/[0.04])을 한 벌로 모았다. 키트 자체는 건드리지 않고 여기 둔다.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** 한 줄 입력칸(Input·<input>) */
export const FIELD_INPUT =
    "h-11 w-full rounded-tile border border-surface-line bg-surface-1 px-3.5 text-[15px] font-medium text-ink-1 placeholder:text-ink-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/20 focus-visible:ring-offset-0 focus-visible:border-brand disabled:opacity-50";
/** 여러 줄 입력칸(Textarea) */
export const FIELD_TEXTAREA =
    "w-full min-h-[120px] rounded-tile border border-surface-line bg-surface-1 p-3.5 text-[15px] font-medium leading-relaxed text-ink-1 placeholder:text-ink-4 resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/20 focus-visible:ring-offset-0 focus-visible:border-brand disabled:opacity-50";

/** 고르기 칩(종목·태그·정원·요일) — 44px, 선택은 채움으로 말한다. */
export function optionClass(selected: boolean, extra?: string) {
    return cn(
        "h-11 px-4 rounded-pill text-[13px] font-semibold inline-flex items-center justify-center gap-1 border transition-colors disabled:opacity-40",
        selected ? "bg-brand text-brand-fg border-transparent" : "bg-surface-1 text-ink-2 border-surface-line active:bg-surface-3",
        extra,
    );
}

/** 칸 머리(라벨 13 · 필수 표시 · 오른쪽 보조 글) + 아래 도움말(12) */
export function Field({ label, htmlFor, required, aside, hint, error, children, className }: {
    label: ReactNode;
    htmlFor?: string;
    required?: boolean;
    aside?: ReactNode;
    hint?: ReactNode;
    error?: ReactNode;
    children: ReactNode;
    className?: string;
}) {
    return (
        <div className={cn("flex flex-col gap-2", className)}>
            <div className="flex items-center justify-between gap-2">
                <label htmlFor={htmlFor} className="text-[13px] font-semibold text-ink-2">
                    {label}
                    {required && <span className="text-brand ml-0.5" aria-hidden="true">*</span>}
                </label>
                {aside && <span className="text-[12px] font-medium text-ink-4 rk-num">{aside}</span>}
            </div>
            {children}
            {error ? (
                <p className="text-[12px] font-medium text-destructive" role="alert">{error}</p>
            ) : hint ? (
                <p className="text-[12px] font-medium text-ink-3 leading-relaxed">{hint}</p>
            ) : null}
        </div>
    );
}
