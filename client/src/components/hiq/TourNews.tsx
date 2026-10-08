/**
 * 투어 소식(2026-10-05 오너: "순서대로 하자"의 3번) — 네이버 뉴스 검색 결과 다섯 줄.
 * PBA 랭킹 · UMB 세계랭킹 · 골프 랭킹 페이지의 목록 아래에 놓는다(랭킹이 먼저, 소식은 그다음).
 *
 * 네이버 검색 API 약관 때문에(shared/tourNews 머리말): 구역이 화면에 들어와 머물 때 **실시간으로** 부르고(브라우저에서도 1분만 들고 있는다),
 * 순서·제목은 네이버가 준 그대로 — 걸러 내거나 요약하지 않는다. 다섯 줄이 끝이고 '더 보기'는 네이버로 넘긴다.
 * 못 불러오면 구역을 그리지 않는다(랭킹 페이지는 이게 없어도 된다). 한국어 기사라 한국어 화면에서만 쓴다(부르는 쪽이 가른다).
 *
 * 색은 토큰(surface·ink)만 — 당구(밝은 바탕)와 골프 테마 둘 다에서 쓰인다.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { TOUR_NEWS, naverNewsUrl, newsAgo, type TourNewsResult, type TourNewsTopic } from "@shared/tourNews";

const KEY = "/api/hiq/tour-news";

export function TourNews({ topic, className }: { topic: TourNewsTopic; className?: string }) {
    // 화면에 들어와 **1초 머물면** 부른다 — 목록만 보고 나가는 사람 몫의 호출을 아낀다(하루 한도가 있다).
    // 바로 부르지 않는 까닭: 랭킹을 받기 전에는 페이지가 짧아 이 자리가 첫 화면에 걸린다. 목록이 채워지면 밀려 내려가고, 그때 약속을 물린다.
    const mark = useRef<HTMLDivElement>(null);
    const [seen, setSeen] = useState(false);
    useEffect(() => {
        const el = mark.current;
        if (!el || seen) return;
        if (typeof IntersectionObserver === "undefined") { setSeen(true); return; }
        let timer: ReturnType<typeof setTimeout> | null = null;
        const io = new IntersectionObserver((es) => {
            const on = es.some((e) => e.isIntersecting);
            if (on && !timer) timer = setTimeout(() => { setSeen(true); io.disconnect(); }, 1000);
            else if (!on && timer) { clearTimeout(timer); timer = null; }
        }, { rootMargin: "160px 0px" });
        io.observe(el);
        return () => { io.disconnect(); if (timer) clearTimeout(timer); };
    }, [seen]);

    const q = useQuery<TourNewsResult>({
        queryKey: [KEY, topic],
        queryFn: async () => {
            const r: any = await apiRequest(`${KEY}/${topic}`);
            return { query: String(r?.query ?? ""), items: Array.isArray(r?.items) ? r.items : [] };
        },
        enabled: seen, staleTime: 60_000, gcTime: 60_000, retry: 0, refetchOnWindowFocus: false, refetchOnReconnect: false,
    });

    const items = q.data?.items ?? [];
    // 못 불러왔거나 기사가 없으면 구역째 없앤다. 받기 전에는 자리만(표식) 둔다 — 제목이 떴다 사라지지 않게.
    if (!seen || q.isPending) return <div ref={mark} className={cn("h-px", className)} aria-hidden />;
    if (q.isError || items.length === 0) return null;
    const now = Date.now();

    return (
        <section className={cn("mt-6", className)} aria-label={TOUR_NEWS[topic].label}>
            <div className="flex items-baseline justify-between gap-2 mb-2 px-1">
                <h2 className="text-[15px] font-bold tracking-tight text-ink-1">{TOUR_NEWS[topic].label}</h2>
                <span className="shrink-0 text-[11.5px] font-medium text-ink-4">네이버 뉴스 검색 결과</span>
            </div>
            {/* data-track-as: 방문자 발자국은 이 구역에서 누른 것을 '투어 소식'으로만 남긴다 — 네이버 결과의 글자·주소는 저장하지 않는다 */}
            <ul data-track-as="투어 소식" className="flex flex-col gap-1.5">
                {items.map((it, i) => (
                    <li key={`${it.url}-${i}`}>
                        <a
                            href={it.url} target="_blank" rel="noopener noreferrer nofollow"
                            className="block px-4 py-3 rounded-2xl bg-surface-1 shadow-[0_1px_2px_rgba(0,0,0,0.05)] active:scale-[0.99] transition-transform"
                        >
                            <span className="block text-[14px] font-semibold leading-snug text-ink-1 line-clamp-2 break-keep">{it.title}</span>
                            <span className="block mt-1 text-[12px] font-medium text-ink-3 tabular-nums truncate">
                                {[it.source, newsAgo(it.at, now)].filter(Boolean).join(" · ")}
                            </span>
                        </a>
                    </li>
                ))}
            </ul>
            <a
                href={naverNewsUrl(topic)} target="_blank" rel="noopener noreferrer nofollow"
                className="mt-1.5 block py-2.5 text-center text-[12.5px] font-semibold text-ink-3 active:opacity-60"
            >
                네이버에서 더 보기 ›
            </a>
        </section>
    );
}
