/**
 * 오늘의 명산(2026-10-21) — 100대 명산 가운데 한국관광공사 사진이 있는 산 여덟(서버가 날마다 돌린다 — GET /hiking/featured-photos).
 * 사진은 자르지 않는다(공공누리 제3유형 변경 금지) — 높이만 맞추고 가로는 사진 그대로. 누르면 그 산 페이지. 받지 못하면 칸이 없다.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { hikingMountainPath } from "@shared/hikingMountains";
import { HkSection } from "./HikingShell";

type Item = { slug: string; name: string; heightM: number | null; sigungu: string | null; photo: { url: string; lic: "Type1" | "Type3" } };

export function FeaturedPhotos() {
    const { data } = useQuery<{ items: Item[] }>({ queryKey: ["/api/hiq/hiking/featured-photos"], staleTime: 30 * 60_000 });
    const items = Array.isArray(data?.items) ? data!.items : [];
    if (items.length < 3) return null;
    return (
        <HkSection title="오늘의 명산" aside="사진 한국관광공사">
            <div className="-mx-5 flex gap-2.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-testid="hiking-featured">
                {items.map((m, i) => (
                    <Link key={m.slug} href={hikingMountainPath(m.slug)} className="shrink-0 active:opacity-80" data-testid="hiking-featured-card">
                        <span className="block overflow-hidden rounded-2xl" style={{ background: "#FFFFFF0A", boxShadow: "inset 0 0 0 1px #F4EFE31F" }}>
                            <img src={m.photo.url} alt={`${m.name} 사진`} loading={i < 2 ? "eager" : "lazy"} decoding="async" draggable={false} referrerPolicy="no-referrer"
                                className="block h-[150px] w-auto max-w-none select-none" />
                        </span>
                        <span className="mt-1.5 block text-[15px] font-semibold text-[#F4EFE3]">{m.name}</span>
                        <span className="block text-[12.5px] text-[#F4EFE399] tabular-nums">{[m.heightM ? `${m.heightM.toLocaleString()}m` : null, m.sigungu].filter(Boolean).join(" · ")}</span>
                    </Link>
                ))}
            </div>
            <p className="mt-2 text-[12px] text-[#F4EFE366]">사진 한국관광공사 · 공공누리 제1 · 3유형 — 날마다 다른 산이 와요</p>
        </HkSection>
    );
}
