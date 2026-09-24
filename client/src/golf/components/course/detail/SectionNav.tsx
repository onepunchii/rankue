/**
 * 섹션 줄(2026-09-24) — 상단 바 밑에 붙는 칩 줄. 있는 섹션만, 지금 보고 있는 섹션에 불이 들어온다.
 * 긴 페이지라서다: 시세만 보러 온 사람이 티타임·그린피를 스크롤로 넘지 않아도 된다.
 */
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { SectionId } from "./ui";

export const SECTION_LABEL: Record<SectionId, string> = {
    tee: "티타임", price: "시세", fee: "그린피", course: "코스", about: "소개", map: "위치", near: "주변",
};

export function jumpTo(id: SectionId) {
    document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function SectionNav({ ids }: { ids: SectionId[] }) {
    const [active, setActive] = useState<SectionId | null>(null);
    const bar = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const els = ids.map((id) => document.getElementById(`sec-${id}`)).filter(Boolean) as HTMLElement[];
        if (!els.length || typeof IntersectionObserver === "undefined") return;
        const seen = new Map<string, boolean>();
        const io = new IntersectionObserver((entries) => {
            for (const e of entries) seen.set((e.target as HTMLElement).dataset.sec!, e.isIntersecting);
            const first = ids.find((id) => seen.get(id));
            if (first) setActive(first);
        }, { rootMargin: "-120px 0px -55% 0px" });
        els.forEach((el) => io.observe(el));
        return () => io.disconnect();
    }, [ids.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

    // 불 들어온 칩이 줄 밖이면 보이게 민다
    useEffect(() => {
        if (!active || !bar.current) return;
        const el = bar.current.querySelector<HTMLElement>(`[data-nav="${active}"]`);
        if (!el) return;
        const b = bar.current;
        const left = el.offsetLeft - 16, right = el.offsetLeft + el.offsetWidth + 16;
        if (left < b.scrollLeft) b.scrollTo({ left, behavior: "smooth" });
        else if (right > b.scrollLeft + b.clientWidth) b.scrollTo({ left: right - b.clientWidth, behavior: "smooth" });
    }, [active]);

    if (ids.length < 3) return null;
    return (
        <div className="sticky z-30 mt-8 bg-[#0A0A0AF2] backdrop-blur-md border-b border-[#FFFFFF0F]" style={{ top: "calc(56px + env(safe-area-inset-top))" }}>
            <div ref={bar} className="flex gap-5 px-5 overflow-x-auto scrollbar-hide">
                {ids.map((id) => (
                    <button
                        key={id} type="button" data-nav={id} onClick={() => jumpTo(id)}
                        className={cn(
                            "relative shrink-0 h-11 text-[14px] transition-colors",
                            active === id ? "text-white font-semibold" : "text-[#FFFFFF73] font-medium active:text-white",
                        )}
                    >
                        {SECTION_LABEL[id]}
                        {/* 밑줄 — 알약보다 조용하고, 지금 어디인지는 똑같이 말한다 */}
                        <span className={cn("absolute left-0 right-0 -bottom-px h-[2px] rounded-full transition-colors", active === id ? "bg-[#64DD17]" : "bg-transparent")} />
                    </button>
                ))}
            </div>
        </div>
    );
}
