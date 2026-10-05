/**
 * 근처 맛집·카페·숙소(2026-10-05 오너: "순서대로 하자"의 2번) — 네이버 지역 검색 결과를 그 자리에서 불러 보여 준다.
 *
 * 골프장 이름에 붙여 찾는 말 2위가 '맛집'이다(날씨 다음). 네이버 검색 API 약관 때문에(shared/golfAround 머리말):
 *   · 구역이 화면에 들어올 때·탭을 누를 때 **실시간으로** 부른다(저장·캐싱 없음 — 브라우저에서도 1분만 들고 있는다).
 *   · 순서·낱말은 네이버가 준 그대로. 거리·별점 같은 우리 표시는 얹지 않는다. 한 번에 다섯 곳이 끝이라 '더 보기'는 네이버 지도로 넘긴다.
 *   · 검색엔진용 화면에는 없다.
 * 못 불러와도 구역은 남는다 — 네이버 지도에서 같은 말로 찾아보는 줄 하나.
 *
 * ⚠️ 비로그인(당구 테마)에서도 열리는 화면 — 색은 리터럴만(CourseShell 머리말). 글자 12px 이상.
 */
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { LucideArrowUpRight } from "@/lib/icons";
import { NEARBY_KINDS, NEARBY_WORD, naverMapSearchUrl, nearbyQuery, type NearbyKind, type NearbyPlace } from "@shared/golfAround";
import { useCourseNearby } from "@/golf/lib/courseApi";
import { Card, Section, Skel } from "./ui";

/** 그 가게를 네이버 지도에서 찾는 말 — 이름 + 주소 앞 세 마디(같은 이름의 다른 지점과 섞이지 않게) */
const placeUrl = (p: NearbyPlace) => naverMapSearchUrl([p.name, ...p.address.split(/\s+/).slice(0, 3)].join(" ").trim());

const ROW = "flex items-center gap-3 px-5 py-3.5 active:bg-[#FFFFFF0A] transition-colors";

export function NearbyPlaces({ slug, name }: { slug: string; name: string }) {
    const [kind, setKind] = useState<NearbyKind>("food");
    // 화면에 들어올 때 처음 부른다 — 구역까지 내려오지 않는 사람 몫의 호출을 아낀다(하루 한도가 있다)
    const mark = useRef<HTMLDivElement>(null);
    const [seen, setSeen] = useState(false);
    useEffect(() => {
        const el = mark.current;
        if (!el || seen) return;
        if (typeof IntersectionObserver === "undefined") { setSeen(true); return; }
        const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: "240px 0px" });
        io.observe(el);
        return () => io.disconnect();
    }, [seen]);

    const q = useCourseNearby(slug, kind, seen);
    const query = nearbyQuery(name, kind);
    const items = q.data?.items ?? [];
    const loading = !seen || q.isPending;

    return (
        <Section
            id="food" title={`근처 ${NEARBY_WORD[kind]}`}
            aside={<span className="shrink-0 text-[12px] text-[#FFFFFF66]">네이버 검색 결과</span>}
        >
            <div ref={mark} />
            <div className="mb-3 flex gap-1.5" role="tablist" aria-label="근처에서 찾을 곳">
                {NEARBY_KINDS.map((k) => (
                    <button
                        key={k} type="button" role="tab" aria-selected={k === kind} onClick={() => setKind(k)}
                        className={cn(
                            "h-9 px-4 rounded-full text-[14px] transition-colors",
                            k === kind ? "bg-[#FFFFFF] text-[#0A0A0A] font-semibold" : "bg-[#FFFFFF0F] text-[#FFFFFFB3] font-medium active:bg-[#FFFFFF1A]",
                        )}
                    >
                        {NEARBY_WORD[k]}
                    </button>
                ))}
            </div>
            <Card className="overflow-hidden">
                {loading ? (
                    <ul className="divide-y divide-[#FFFFFF0A]" aria-hidden>
                        {[0, 1, 2, 3, 4].map((i) => (
                            <li key={i} className="px-5 py-3.5"><Skel className="h-[18px] w-2/5" /><Skel className="mt-2 h-[14px] w-4/5" /></li>
                        ))}
                    </ul>
                ) : items.length > 0 ? (
                    <ul className="divide-y divide-[#FFFFFF0A]">
                        {items.map((p, i) => (
                            <li key={`${p.name}-${i}`}>
                                <a href={placeUrl(p)} target="_blank" rel="noopener noreferrer nofollow" className={ROW}>
                                    <span className="flex-1 min-w-0">
                                        <span className="block text-[15px] font-semibold text-white truncate">{p.name}</span>
                                        <span className="block mt-0.5 text-[13px] text-[#FFFFFF73] truncate">{[p.category, p.address].filter(Boolean).join(" · ")}</span>
                                    </span>
                                    <LucideArrowUpRight weight="bold" className="w-4 h-4 shrink-0 text-[#FFFFFF40]" aria-hidden />
                                </a>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="px-5 pt-4 pb-1 text-[14px] text-[#FFFFFF99] break-keep">
                        {q.isError ? "지금은 목록을 불러올 수 없어요." : "검색 결과가 없어요."}
                    </p>
                )}
                <a
                    href={naverMapSearchUrl(query)} target="_blank" rel="noopener noreferrer nofollow"
                    className={cn(ROW, "border-t border-[#FFFFFF0A] text-[14px] font-medium text-[#FFFFFFCC]")}
                >
                    <span className="flex-1 min-w-0 truncate">네이버 지도에서 {items.length > 0 ? "더 보기" : "찾아보기"}</span>
                    <LucideArrowUpRight weight="bold" className="w-4 h-4 shrink-0 text-[#FFFFFF66]" aria-hidden />
                </a>
            </Card>
        </Section>
    );
}
