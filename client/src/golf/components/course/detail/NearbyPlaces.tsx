/**
 * 근처 먹거리·카페·숙소(2026-10-05 오너: "순서대로 하자"의 2번) — 네이버 지역 검색 결과를 그 자리에서 불러 보여 준다.
 *
 * 같은 날 저녁, 메뉴 칩으로 넓혔다(오너: "사진이 아니더라도 이모지 및 아이콘을 활용하자 … 해당 메뉴의 느낌" → "순서대로"의 1번):
 *   · 탭 셋 → **이모지 메뉴 칩**(해장국·칼국수·한우 …). 낱말은 실측으로 고른 것만(shared/golfAround 머리말).
 *   · **날씨가 첫 칩을 고른다** — 날씨 카드에서 보고 있는 라운드의 한 줄 평에서(쌀쌀한 새벽 티 → 해장국). 위에 그 까닭 한 줄.
 *     손님이 칩을 직접 누르면 그 뒤로는 따라가지 않는다. 까닭 줄을 누르면 추천으로 돌아온다.
 *   · 결과 줄 앞의 동그란 접시는 **누른 칩의 그림**이다(네이버 분류값에서 뽑지 않는다 — 가공 금지).
 *   · **이 동네 대표 메뉴**(5번) — 시군마다 이름난 먹거리 칩이 한 줄 더 붙는다(춘천 → 닭갈비). 사전은 우리가 썼다(shared/golfLocalDish).
 *
 * 골프장 이름에 붙여 찾는 말 2위가 '맛집'이다(날씨 다음). 네이버 검색 API 약관 때문에(shared/golfAround 머리말):
 *   · 구역이 화면에 들어올 때·칩을 누를 때 **실시간으로** 부른다(저장·캐싱 없음 — 브라우저에서도 1분만 들고 있는다).
 *   · 순서·낱말은 네이버가 준 그대로. 거리·별점 같은 우리 표시는 얹지 않는다. 한 번에 다섯 곳이 끝이라 '더 보기'는 네이버 지도로 넘긴다.
 *   · 검색엔진용 화면에는 없다.
 * 못 불러와도 구역은 남는다 — 네이버 지도에서 같은 말로 찾아보는 줄 하나.
 *
 * ⚠️ 비로그인(당구 테마)에서도 열리는 화면 — 색은 리터럴만(CourseShell 머리말). 글자 12px 이상.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { kstDateKey } from "@/lib/kst";
import { LucideArrowUpRight } from "@/lib/icons";
import { cleanCourseName, menuChips, menuForBrief, naverMapSearchUrl, nearbyMenu, nearbyWordQuery, type NearbyKind, type NearbyPlace } from "@shared/golfAround";
import { localDishLabel, localDishes, type LocalDish } from "@shared/golfLocalDish";
import { useCourseNearby } from "@/golf/lib/courseApi";
import { BriefIcon, type RoundPick } from "./WeatherCard";
import { Card, Section, Skel } from "./ui";

/** 그 가게를 네이버 지도에서 찾는 말 — 이름 + 주소 앞 세 마디(같은 이름의 다른 지점과 섞이지 않게) */
const placeUrl = (p: NearbyPlace) => naverMapSearchUrl([p.name, ...p.address.split(/\s+/).slice(0, 3)].join(" ").trim());

const ROW = "flex items-center gap-3 px-4 py-3 active:bg-[#FFFFFF0A] transition-colors";
/** 줄 앞의 접시 — 폰마다 이모지 그림이 달라서 같은 동그라미·같은 크기에 담는다 */
const PLATE = "w-10 h-10 shrink-0 rounded-full bg-[#FFFFFF0F] flex items-center justify-center text-[19px] leading-none";

/** 손님이 고른 것 — 정해 둔 메뉴 칩이거나, 이 동네 대표 메뉴 */
type Sel = { kind: NearbyKind } | { dish: LocalDish };
const CHIP = "h-9 pl-3 pr-3.5 rounded-full text-[14px] inline-flex items-center gap-1.5 transition-colors";

export function NearbyPlaces({ slug, name, region, city, round }: { slug: string; name: string; region?: string | null; city?: string | null; round?: RoundPick | null }) {
    // 날씨가 고른 칩(없으면 맛집) — 손님이 직접 고르면 그쪽이 이긴다
    const pick = useMemo(() => (round ? menuForBrief(round.brief) : null), [round]);
    const dishes = useMemo(() => localDishes(region, city), [region, city]);
    const [chosen, setChosen] = useState<Sel | null>(null);
    const dish = chosen && "dish" in chosen ? chosen.dish : null;
    const kind: NearbyKind = chosen && "kind" in chosen ? chosen.kind : pick?.kind ?? "food";
    const menu = nearbyMenu(kind);
    // 지금 찾는 낱말과 그 그림 — 접시·제목·'더 보기'가 같이 쓴다
    const word = dish ? dish.word : menu.word;
    const emoji = dish ? dish.emoji : menu.emoji;
    const chips = menuChips(kind, +kstDateKey(new Date()).slice(5, 7));

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

    const q = useCourseNearby(slug, kind, seen, dish?.word);
    // '더 보기'는 서버가 실제로 답을 받은 검색어로 연다(이름을 바꿔 물었으면 그 이름). 아직 없으면 다듬은 이름으로 —
    // "SKY72 골프클럽(바다코스)"처럼 괄호가 든 이름은 그대로는 지도에서도 안 잡힌다.
    const query = q.data?.query || nearbyWordQuery(cleanCourseName(name) || name, word);
    const items = q.data?.items ?? [];
    const loading = !seen || q.isPending;

    return (
        <Section
            id="food" title={`근처 ${word}`}
            aside={<span className="shrink-0 text-[12px] text-[#FFFFFF66]">네이버 검색 결과</span>}
        >
            <div ref={mark} />
            {pick && round && (
                <button
                    type="button" onClick={() => setChosen(null)} aria-label={`${pick.line} — 추천 메뉴 ${nearbyMenu(pick.kind).word} 보기`}
                    className="mb-3.5 w-full flex items-center gap-3 text-left active:opacity-70 transition-opacity"
                >
                    <BriefIcon b={round.brief} className="w-8 h-8 shrink-0" />
                    <span className="min-w-0">
                        <span className="block text-[16px] font-semibold text-white break-keep">{pick.line}</span>
                        <span className="block mt-0.5 text-[13px] text-[#FFFFFF80] tabular-nums break-keep">{round.dayLabel} {round.teeLabel} 티오프 · {round.brief.verdict}</span>
                    </span>
                </button>
            )}
            <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="근처에서 찾을 것">
                {chips.map((m) => {
                    const on = !dish && m.key === kind;
                    return (
                        <button
                            key={m.key} type="button" role="tab" aria-selected={on} onClick={() => setChosen({ kind: m.key })}
                            className={cn(CHIP, on ? "bg-[#FFFFFF] text-[#0A0A0A] font-semibold" : "bg-[#FFFFFF0F] text-[#FFFFFFB3] font-medium active:bg-[#FFFFFF1A]")}
                        >
                            <span className="text-[15px] leading-none" aria-hidden>{m.emoji}</span>
                            {m.word}
                        </button>
                    );
                })}
            </div>
            {/* 이 동네 대표 메뉴 — 사전에 있는 시군만. 일반 칩과 헷갈리지 않게 호박색 테두리 */}
            {dishes.length > 0 && (
                <div className="mb-3 flex flex-wrap items-center gap-1.5" role="tablist" aria-label={localDishLabel(city)}>
                    <span className="mr-1 text-[13px] text-[#FFFFFF80]">{localDishLabel(city)}</span>
                    {dishes.map((x) => {
                        const on = dish?.word === x.word;
                        return (
                            <button
                                key={x.word} type="button" role="tab" aria-selected={on} onClick={() => setChosen({ dish: x })}
                                className={cn(CHIP, on ? "bg-[#FFC43D] text-[#1F1500] font-semibold" : "bg-[#FFC43D14] text-[#FFD266] font-medium ring-1 ring-inset ring-[#FFC43D4D] active:bg-[#FFC43D24]")}
                            >
                                <span className="text-[15px] leading-none" aria-hidden>{x.emoji}</span>
                                {x.word}
                            </button>
                        );
                    })}
                </div>
            )}
            <Card className="overflow-hidden">
                {loading ? (
                    <ul className="divide-y divide-[#FFFFFF0A]" aria-hidden>
                        {[0, 1, 2, 3, 4].map((i) => (
                            <li key={i} className="px-4 py-3 flex items-center gap-3">
                                <Skel className="w-10 h-10 shrink-0 rounded-full" />
                                <div className="flex-1 min-w-0"><Skel className="h-[18px] w-2/5" /><Skel className="mt-2 h-[14px] w-4/5" /></div>
                            </li>
                        ))}
                    </ul>
                ) : items.length > 0 ? (
                    <ul className="divide-y divide-[#FFFFFF0A]">
                        {items.map((p, i) => (
                            <li key={`${p.name}-${i}`}>
                                <a href={placeUrl(p)} target="_blank" rel="noopener noreferrer nofollow" className={ROW}>
                                    <span className={PLATE} aria-hidden>{emoji}</span>
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
                    className={cn(ROW, "px-5 py-3.5 border-t border-[#FFFFFF0A] text-[14px] font-medium text-[#FFFFFFCC]")}
                >
                    <span className="flex-1 min-w-0 truncate">네이버 지도에서 {word} {items.length > 0 ? "더 보기" : "찾아보기"}</span>
                    <LucideArrowUpRight weight="bold" className="w-4 h-4 shrink-0 text-[#FFFFFF66]" aria-hidden />
                </a>
            </Card>
        </Section>
    );
}
