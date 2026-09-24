/**
 * 골프장 상세의 공용 조각(2026-09-24) — 섹션 틀·뼈대·작은 글자 규칙.
 * ⚠️ 리터럴 색만(CourseShell 머리말). 글자 12px 이상, 굵기는 semibold 까지.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { kstDateKey } from "@/lib/kst";

/** 섹션 id — 위의 섹션 줄(SectionNav)이 이걸로 건너간다. */
export type SectionId = "tee" | "price" | "fee" | "course" | "about" | "map" | "near";

/** 상단 바(56) + 섹션 줄(48) — 건너뛴 섹션 제목이 그 밑에 가리지 않게. */
export const SCROLL_MARGIN = "calc(96px + env(safe-area-inset-top))";

export function Section({ id, title, aside, children, className }: { id?: SectionId; title: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
    return (
        <section id={id ? `sec-${id}` : undefined} data-sec={id} className={cn("px-4 pt-8", className)} style={{ scrollMarginTop: SCROLL_MARGIN }}>
            <div className="flex items-end justify-between gap-3 mb-3">
                <h2 className="text-[18px] font-semibold text-white leading-tight">{title}</h2>
                {aside}
            </div>
            {children}
        </section>
    );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
    return <div className={cn("rounded-2xl bg-[#FFFFFF08] border border-[#FFFFFF14]", className)}>{children}</div>;
}

export function Skel({ className }: { className?: string }) {
    return <div className={cn("rounded-lg bg-[#FFFFFF0F] animate-pulse", className)} />;
}

/** 한국 날짜 열쇠 둘의 날 차이(b - a). */
export function dayDiff(aKey: string, bKey: string): number {
    const t = (k: string) => { const [y, m, d] = k.split("-").map(Number); return Date.UTC(y, m - 1, d); };
    return Math.round((t(bKey) - t(aKey)) / 86_400_000);
}
/** 한국 요일(0=일). */
export function kstWeekday(v: string | Date): number {
    const [y, m, d] = kstDateKey(v).split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
export const todayKey = () => kstDateKey(new Date());

/** 시세 변화 색 — 한국 관례(오름 빨강·내림 파랑). */
export const trendColor = (n: number | null | undefined) => (!n ? "#FFFFFF80" : n > 0 ? "#FF4D4F" : "#3B82F6");
