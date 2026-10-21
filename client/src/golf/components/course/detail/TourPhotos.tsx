/**
 * 골프장 사진(2026-10-21) — 한국관광공사 TourAPI 의 사진(공공누리 제1 · 3유형만, server/data/golfTourPhotos).
 * 3유형은 '변경 금지'라 자르지 않는다 — 높이를 맞추고 가로는 사진 그대로(object-contain 이 아니라 너비 auto). 가로로 넘긴다.
 * 출처를 사진 아래에 단다(사진 한국관광공사 · 공공누리 제N유형 — 유형마다 공공누리 안내로 이어진다). 사진이 없으면 칸을 그리지 않는다.
 * 그림은 한국관광공사 서버의 것을 그대로 부른다(옮겨 담지 않는다).
 */
import { useState } from "react";

export interface TourPhoto { url: string; thumb: string | null; lic: "Type1" | "Type3" }

const KOGL: Record<TourPhoto["lic"], { label: string; href: string }> = {
    Type1: { label: "공공누리 제1유형", href: "https://www.kogl.or.kr/info/licenseType1.do" },
    Type3: { label: "공공누리 제3유형", href: "https://www.kogl.or.kr/info/licenseType3.do" },
};

export function TourPhotos({ photos, name, className = "" }: { photos: TourPhoto[] | undefined; name: string; className?: string }) {
    const [broken, setBroken] = useState<Set<string>>(new Set());
    const list = (photos ?? []).filter((p) => !broken.has(p.url));
    if (!list.length) return null;
    const lics = [...new Set(list.map((p) => p.lic))];
    return (
        <section className={className} data-testid="course-tour-photos" aria-label={`${name} 사진`}>
            <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {list.map((p, i) => (
                    <a key={p.url} href={p.url} target="_blank" rel="noreferrer" className="shrink-0 overflow-hidden rounded-2xl bg-[#FFFFFF0D]" style={{ boxShadow: "inset 0 0 0 1px #FFFFFF14" }}>
                        {/* 자르지 않는다(3유형) — 높이만 맞추고 가로는 사진의 비율 그대로 */}
                        <img src={p.url} alt={`${name} 사진 ${i + 1}`} loading={i === 0 ? "eager" : "lazy"} decoding="async" draggable={false}
                            className="block h-[188px] w-auto max-w-none select-none" referrerPolicy="no-referrer"
                            onError={() => setBroken((s) => new Set(s).add(p.url))} />
                    </a>
                ))}
            </div>
            <p className="mt-1.5 text-[12px] text-[#FFFFFF80]">
                사진 한국관광공사 ·{" "}
                {lics.map((l, i) => (
                    <span key={l}>{i > 0 ? " · " : ""}<a href={KOGL[l].href} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">{KOGL[l].label}</a></span>
                ))}
            </p>
        </section>
    );
}
