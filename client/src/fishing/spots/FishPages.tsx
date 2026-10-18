/**
 * 낚시 어종 공개 화면(2026-10-18 — 누구나, 로그인 없이). 글은 shared/fishingFishPages(검색용 화면과 같은 말).
 *
 *   FishHub    /fishing/fish — 어탁 카드 22장(바다 · 민물), 카드마다 첫 낙관 · 노리는 낚시터 수
 *   FishPage   /fishing/fish/<어종> — 종이 위의 어탁 · 낚시꾼이 부르는 크기(낙관) · 금어기 · 금지체장 · 오늘 좋은 곳(낚시지수) ·
 *              이 어종을 노리는 낚시터(종이 지도 + 목록) · 위판장 · 어종 이야기(오너가 준 도감 — 출처 · 라이선스와 함께) · 다른 어종
 *
 * **어종 정보를 지어 쓰지 않는다** — 받은 칸만 그린다(shared/fishingFishPages 머리말). ⚠️ 리터럴 색만. 글자 12px 이상, 굵기는 semibold 까지.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useSeo } from "@/hooks/useSeo";
import { useAuth } from "@/hooks/useAuth";
import { goLogin } from "@/components/hiq/LoginGate";
import { apiRequest } from "@/lib/queryClient";
import { FISHING_COLORS as C } from "@shared/fishing";
import { fishValueText, type FishKind } from "@shared/fishingFish";
import { FISH_GUIDE_NAME, FISH_REG_NAMES } from "@shared/fishingFishInfo";
import { bestOf, goodSpots, rangeText, type IndexMap } from "@shared/fishingPort";
import { MARKET_NOTE, MARKET_SOURCE, type MarketWeek } from "@shared/fishingMarket";
import { FISHING_SPOTS_PATH } from "@shared/fishingPlaces";
import { josa } from "@shared/briefingMeta";
import { FISHING_FISH_LABEL, FISHING_FISH_PATH, FISH_PAGES, fishBySlug, fishHubSeo, fishPageSeo, fishSpotCounts, fishingFishPath, goodFishToday, spotsOfFish, waterWord } from "@shared/fishingFishPages";
import { fishingFishCardUrl } from "@shared/ogCards";
import { INDEX_TONE, INK, PAPER, Seal, art } from "../ink";
import { OurGuideStory, RegBox, useRegs } from "../Guide";
import { PaperMap, Row, Shell, useSpots } from "./SpotsPages";
import { PIXEL_LEGEND, SeaChart, type ChartSpot } from "../SeaChart";

const SHEET = { color: INK, background: `radial-gradient(120% 70% at 20% 0%, #F6F0E2 0%, ${PAPER} 55%, #E7DEC9 100%)`, boxShadow: "0 1px 0 #00000040, inset 0 0 0 1px #0F28381F" } as const;
const RULE = "1px dashed #0F283826";
const kstToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

function H2({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
    return <h2 className="mb-2.5 flex items-baseline justify-between gap-3 text-[17px] font-semibold"><span>{children}</span>{aside ? <span className="shrink-0 text-[13px] font-normal" style={{ color: C.dim }}>{aside}</span> : null}</h2>;
}

function FishCard({ f, n }: { f: FishKind; n: number }) {
    return (
        <Link href={fishingFishPath(f.name)} className="block overflow-hidden rounded-2xl active:opacity-85" style={SHEET} data-testid="fish-card">
            <span className="block px-3 pt-2.5 text-[12px]" style={{ color: "#0F2838B3" }}>{waterWord(f)}</span>
            <img src={art(f.id)} alt={`${f.name} 어탁`} width={640} height={400} loading="lazy" decoding="async" className="mx-auto block h-[82px] w-full object-contain px-2" style={{ mixBlendMode: "multiply" }} />
            <span className="flex items-end justify-between gap-2 px-3 pb-3 pt-1" style={{ borderTop: RULE }}>
                <span className="min-w-0"><span className="block truncate text-[16px] font-semibold">{f.name}</span><span className="block text-[12px] tabular-nums" style={{ color: "#0F2838B3" }}>{n > 0 ? `낚시터 ${n}곳` : f.tiers.map((t) => t.name).slice(0, 2).join(" · ")}</span></span>
                {/* 카드의 낙관은 세 글자까지인 첫 단계(500그램처럼 긴 이름은 작은 낙관 밖으로 넘친다) */}
                <Seal text={(f.tiers.find((t) => t.name.length <= 3) ?? f.tiers[0]).name} size={34} />
            </span>
        </Link>
    );
}

export function FishHub() {
    const { data: spots } = useSpots();
    const seo = fishHubSeo();
    useSeo({ title: seo.title, description: seo.description, path: FISHING_FISH_PATH, locale: "ko", image: "https://www.rankue.co.kr/og.png" });
    const n = useMemo(() => fishSpotCounts(spots?.items ?? []), [spots]);
    const today = kstToday();
    const { data: map } = useQuery<IndexMap | null>({ queryKey: ["/api/hiq/fishing/index-map", today], queryFn: () => apiRequest(`/api/hiq/fishing/index-map?day=${today}`), staleTime: 10 * 60_000 });
    const good = useMemo(() => goodFishToday(map), [map]);
    const top = Math.max(1, ...good.map((g) => g.rated));
    return (
        <Shell title={FISHING_FISH_LABEL}>
            <div className="relative h-[180px] overflow-hidden" data-testid="fish-cover">
                <img src="/fishing/art/cover-book.webp" alt="" width={880} height={880} className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: "50% 45%" }} draggable={false} decoding="async" />
                <div className="absolute inset-0" style={{ background: "linear-gradient(180deg,#0B1E2D10 0%,#0B1E2D66 55%,#0B1E2D 100%)" }} aria-hidden />
                <div className="absolute inset-x-5 bottom-4">
                    <h1 className="text-[26px] font-semibold tracking-tight">{seo.h1}</h1>
                    <p className="mt-0.5 text-[13.5px]" style={{ color: "#F3ECDDCC" }}>어탁 {FISH_PAGES.length}종 · 낚시꾼이 부르는 크기 · 금어기 · 낚시터</p>
                </div>
            </div>
            {/* 오늘 바다에서 좋은 곳이 많은 어종 — 해양조사원 지수 그대로(날마다 바뀐다) */}
            {good.length > 0 && (
                <section className="px-5 pt-6" data-testid="fish-today">
                    <H2 aside="해양조사원 지수">오늘 바다 좋은 어종</H2>
                    {!good.some((x) => x.good > 0) && <p className="rounded-2xl px-4 py-3.5 text-[13.5px]" style={{ background: "#FFFFFF0A", color: C.soft }}>오늘은 '좋음' 이상인 지점이 없어요.</p>}
                    <ul className="space-y-2">
                        {good.filter((x) => x.good > 0).slice(0, 6).map(({ fish: f, good: g, rated }) => (
                            <li key={f.id}>
                                <Link href={fishingFishPath(f.name)} className="flex items-center gap-3 rounded-2xl px-3 py-2.5 active:opacity-85" style={{ background: "#FFFFFF0A", boxShadow: "inset 0 0 0 1px #FFFFFF14" }} data-testid="fish-today-row">
                                    <span className="flex h-11 w-14 shrink-0 items-center justify-center rounded-lg" style={{ background: PAPER }}><img src={art(f.id)} alt="" width={640} height={400} loading="lazy" className="h-full w-full object-contain p-0.5" style={{ mixBlendMode: "multiply" }} /></span>
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-baseline justify-between gap-2"><span className="text-[15.5px] font-semibold">{f.name}</span><span className="shrink-0 text-[13px] tabular-nums" style={{ color: g ? "#F8DDB0" : C.dim }}>좋음 이상 <b className="text-[16px] font-semibold">{g}</b>곳</span></span>
                                        {/* 막대 — 지수가 매겨진 지점 가운데 좋음 이상의 몫 */}
                                        <span className="mt-1.5 flex h-[6px] overflow-hidden rounded-full" style={{ background: "#FFFFFF14", width: `${Math.max(30, Math.round((rated / top) * 100))}%` }} aria-hidden>
                                            <i className="h-full rounded-full" style={{ width: `${Math.round((g / Math.max(1, rated)) * 100)}%`, background: "#4A8FB0" }} />
                                        </span>
                                        <span className="mt-1 block text-[12px] tabular-nums" style={{ color: C.dim }}>지수가 매겨진 {rated}곳 가운데</span>
                                    </span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
            {(["sea", "fresh"] as const).map((w) => (
                <section key={w} className="px-5 pt-6">
                    <H2 aside={`${FISH_PAGES.filter((f) => f.water === w).length}종`}>{w === "sea" ? "바다 낚시" : "민물 낚시"}</H2>
                    <div className="grid grid-cols-2 gap-2.5 min-[480px]:grid-cols-3">{FISH_PAGES.filter((f) => f.water === w).map((f) => <FishCard key={f.id} f={f} n={n.get(f.id) ?? 0} />)}</div>
                </section>
            ))}
            <p className="px-5 pt-4 text-[12px] leading-relaxed [word-break:keep-all]" style={{ color: C.dim }}>크기의 이름(월척 · 4짜 · 런커 …)은 낚시꾼이 부르는 관행이에요. 법의 기준(금지체장)은 어종마다 따로 적어요. 낚시터 수는 낚시터 표에 그 어종이 대상으로 올라 있는 곳이에요.</p>
        </Shell>
    );
}

export function FishPage({ name }: { name: string }) {
    const f = fishBySlug(name);
    const [, setLocation] = useLocation();
    const { member } = useAuth();
    const today = kstToday();
    const [picked, setPicked] = useState<string | null>(null);
    const { data: spots } = useSpots();
    const { data: regs } = useRegs();
    const sea = f?.water === "sea";
    const { data: map } = useQuery<IndexMap | null>({ queryKey: ["/api/hiq/fishing/index-map", today], queryFn: () => apiRequest(`/api/hiq/fishing/index-map?day=${today}`), staleTime: 10 * 60_000, enabled: sea });
    const { data: market } = useQuery<MarketWeek | null>({ queryKey: ["/api/hiq/fishing/market"], staleTime: 15 * 60_000, enabled: sea });
    const mine = useMemo(() => (f ? spotsOfFish(spots?.items ?? [], f.id) : []), [spots, f]);
    const seo = f ? fishPageSeo(f, mine.length) : null;
    useSeo(f && seo ? { title: seo.title, description: seo.description, path: fishingFishPath(f.name), locale: "ko", image: fishingFishCardUrl("https://www.rankue.co.kr", f.id) } : null);
    if (!f || !seo) return <Shell title={FISHING_FISH_LABEL}><p className="px-5 py-16 text-center text-[15px]" style={{ color: C.soft }}>없는 어종이에요.</p><div className="px-5"><Link href={FISHING_FISH_PATH} className="flex h-11 items-center justify-center rounded-xl text-[14px]" style={{ background: "#FFFFFF0F", color: C.soft }}>낚시 어종 보기</Link></div></Shell>;
    const indexed = !!map?.fishes.includes(f.name);
    // 오늘 이 어종의 바다 — 앱의 낚시지수 지도와 같은 그림(지점의 단계를 거리로 섞은 칸, 42km 밖은 칠하지 않는다)
    const chart: ChartSpot[] = map && indexed ? map.spots.map((x) => ({ name: x.name, lat: x.lat, lng: x.lng, step: bestOf(x.fish[f.name]) })) : [];
    const good = map && indexed ? goodSpots(map, f.name, 5) : [];
    const week = market?.fish.find((x) => x.id === f.id) ?? null;
    const md = (d: string) => `${Number(d.slice(5, 7))}.${Number(d.slice(8))}`;
    const others = FISH_PAGES.filter((x) => x.water === f.water && x.id !== f.id);
    const aka = FISH_GUIDE_NAME[f.id] && FISH_GUIDE_NAME[f.id] !== f.name ? FISH_GUIDE_NAME[f.id] : null;
    return (
        <Shell title={`${f.name} 낚시`}>
            {/* 종이 위의 어탁 · 낚시꾼이 부르는 크기 */}
            <div className="px-5 pt-4">
                <div className="overflow-hidden rounded-2xl" style={SHEET} data-testid="fish-hero">
                    <div className="px-4 pt-3.5">
                        <p className="text-[12.5px]" style={{ color: "#0F2838B3" }}>{waterWord(f)} 낚시{aka ? ` · 표준 이름 ${aka}` : ""}</p>
                        <img src={art(f.id)} alt={`${f.name} 어탁`} width={640} height={400} decoding="async" className="mx-auto mt-1 block h-[176px] w-full object-contain" style={{ mixBlendMode: "multiply" }} />
                        <h1 className="pb-3 text-[28px] font-semibold leading-tight tracking-tight">{f.name}</h1>
                    </div>
                    <div className="px-3 pb-3.5 pt-3" style={{ borderTop: RULE }} data-testid="fish-ladder">
                        <p className="px-1 text-[13px]" style={{ color: "#0F2838B3" }}>낚시꾼이 부르는 크기</p>
                        <div className="relative mt-3 flex">
                            <i aria-hidden className="absolute left-[10%] right-[10%] top-[21px] border-t border-dashed" style={{ borderColor: "#0F283840" }} />
                            {f.tiers.map((t) => (
                                <div key={t.name} className="relative flex flex-1 flex-col items-center gap-1.5">
                                    <span className="rounded-[6px]" style={{ background: "#EFE8D8" }}><Seal text={t.name} size={42} /></span>
                                    <span className="text-[12.5px] tabular-nums" style={{ color: INK }}>{fishValueText(f.unit, t.min)}</span>
                                </div>
                            ))}
                        </div>
                        <p className="mt-3 px-1 text-[12.5px] [word-break:keep-all]" style={{ color: "#0F2838B3" }}>낚시계의 관행이에요 — 법의 기준(금지체장)이 아니에요.</p>
                    </div>
                </div>
                {(FISH_REG_NAMES[f.id] ?? []).length > 0 && <div className="mt-3"><RegBox names={FISH_REG_NAMES[f.id]} regs={regs} label={f.name} /></div>}
            </div>

            {/* 오늘 좋은 곳 — 지수가 매겨지는 바다 어종만 */}
            {indexed && map && (
                <section className="px-5 pt-7" data-testid="fish-good">
                    <H2 aside="국립해양조사원 바다낚시지수">오늘 {f.name} 좋은 곳</H2>
                    <div className="mb-3 overflow-hidden rounded-2xl" style={{ background: PAPER, boxShadow: "0 1px 0 #00000040, inset 0 0 0 1px #0F28381F" }} data-testid="fish-index-map">
                        <SeaChart areas={[]} picked={null} onPick={() => {}} spots={chart} spot={picked} onSpot={(n) => setPicked(n === picked ? null : n)} pixels />
                        <div className="flex items-center gap-1 border-t px-3.5 py-2.5 text-[12px]" style={{ borderColor: "#0F28381F", color: "#0F2838B3" }}>
                            나쁨{[0, 1, 2, 3, 4].map((k) => <i key={k} aria-hidden className="h-3 w-3 rounded-[2px]" style={{ background: PIXEL_LEGEND[k] }} />)}매우좋음
                            <span className="ml-auto">점을 누르면 이름이 보여요</span>
                        </div>
                    </div>
                    <div className="rounded-2xl bg-[#FFFFFF0A] px-3.5">
                        {good.length === 0 ? <p className="py-4 text-[14px]" style={{ color: C.soft }}>오늘은 좋음 이상인 곳이 없어요</p> : (
                            <ul className="divide-y divide-[#FFFFFF14]">
                                {good.map((g, i) => (
                                    <li key={g.spot.name}><button type="button" className="flex min-h-[52px] w-full items-center gap-3 py-2 text-left" onClick={() => { setPicked(g.spot.name); document.querySelector('[data-testid="fish-index-map"]')?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }} aria-pressed={picked === g.spot.name}>
                                        <span className="w-4 shrink-0 text-center text-[13px] tabular-nums" style={{ color: C.dim }}>{i + 1}</span>
                                        <span className="min-w-0 flex-1"><span className="block truncate text-[15.5px] font-semibold">{g.spot.name}</span>
                                            <span className="mt-0.5 block truncate text-[13px] tabular-nums" style={{ color: C.dim }}>{[g.spot.wave ? `파고 ${rangeText(g.spot.wave)}m` : null, g.spot.wtemp ? `수온 ${rangeText(g.spot.wtemp)}°` : null].filter(Boolean).join(" · ")}</span></span>
                                        <span className="flex h-7 shrink-0 items-center rounded-full px-2.5 text-[12.5px]" style={{ background: INDEX_TONE[g.step].bg, color: INDEX_TONE[g.step].text }}>{g.step}</span>
                                    </button></li>
                                ))}
                            </ul>
                        )}
                    </div>
                    <p className="mt-2 px-1 text-[12px] leading-relaxed [word-break:keep-all]" style={{ color: C.dim }}>물때 · 파고 · 수온 · 바람으로 매긴 값이에요. 랭큐가 매긴 값이 아니에요.</p>
                </section>
            )}

            {/* 이 어종을 노리는 낚시터 — 종이 지도 + 목록 */}
            {mine.length > 0 && (
                <section className="px-5 pt-7" data-testid="fish-spots">
                    <H2 aside={`${mine.length}곳`}>{f.name} 낚시터</H2>
                    <div className="overflow-hidden rounded-2xl" style={{ boxShadow: "0 1px 0 #00000040, inset 0 0 0 1px #0F28381F" }}><PaperMap items={mine} height={280} /></div>
                    <ul className="mt-1 divide-y divide-[#FFFFFF14]">{mine.slice(0, 8).map((p) => <li key={p.id}><Row p={p} /></li>)}</ul>
                    {mine.length > 8 && <Link href={FISHING_SPOTS_PATH} className="mt-1 flex h-11 items-center justify-center rounded-xl text-[14px]" style={{ background: "#FFFFFF0F", color: C.soft }}>전국 낚시터에서 더 보기</Link>}
                    <p className="mt-2 px-1 text-[12px] leading-relaxed [word-break:keep-all]" style={{ color: C.dim }}>낚시터 표에 {josa(f.name, "이/가")} 대상 어종으로 올라 있는 곳이에요. 등록된 그대로라 바뀌었을 수 있어요.</p>
                </section>
            )}

            {/* 위판장 — 지난 이레 */}
            {week && market && (
                <section className="px-5 pt-7" data-testid="fish-market">
                    <H2 aside={`${md(market.days[0])}~${md(market.days[market.days.length - 1])}`}>위판장</H2>
                    <div className="rounded-2xl bg-[#FFFFFF0A] px-3.5 py-3.5">
                        <div className="flex items-end gap-3">
                            <div className="flex h-[64px] flex-1 items-end gap-1.5" aria-hidden>
                                {week.counts.map((n, k) => <i key={market.days[k]} className="flex-1 rounded-t-[3px]" style={{ height: `${Math.max(3, Math.round((n / Math.max(1, ...week.counts)) * 62))}px`, background: C.brand, opacity: k === week.counts.length - 1 ? 0.4 : 0.9 }} />)}
                            </div>
                            <p className="shrink-0 text-right leading-none"><span className="block text-[12px]" style={{ color: C.dim }}>이레 동안</span><span className="mt-1.5 block text-[22px] font-semibold tabular-nums">{week.total.toLocaleString("en-US")}<span className="text-[13px] font-normal" style={{ color: C.dim }}>건</span></span></p>
                        </div>
                        <p className="mt-2.5 text-[12px] leading-relaxed [word-break:keep-all]" style={{ color: C.dim }}>{MARKET_NOTE} 출처: {MARKET_SOURCE}.</p>
                    </div>
                </section>
            )}

            {/* 어종 이야기 — 오너가 준 도감 그대로(출처 · 라이선스는 그 안에) */}
            {FISH_GUIDE_NAME[f.id] && (
                <section className="px-5 pt-7" data-testid="fish-story">
                    <H2>어종 이야기</H2>
                    <OurGuideStory fish={f} />
                </section>
            )}

            <section className="px-5 pt-7">
                <H2>다른 {waterWord(f)} 어종</H2>
                <div className="flex flex-wrap gap-1.5">{others.map((x) => <Link key={x.id} href={fishingFishPath(x.name)} className="flex h-9 items-center rounded-full px-3 text-[13px]" style={{ background: "#FFFFFF14", color: C.foam }}>{x.name}</Link>)}</div>
            </section>
            <div className="px-5 pt-6">
                <button type="button" onClick={() => (member ? setLocation("/fishing") : goLogin(setLocation, fishingFishPath(f.name)))} className="flex h-[52px] w-full items-center justify-center rounded-2xl text-[15px] font-semibold" style={{ background: C.brand, color: C.onBrand }} data-testid="fish-cta">
                    {member ? `${f.name} 조과 적으러 가기` : `가입하고 ${f.name} 어탁 찍기`}
                </button>
                <p className="mt-2 text-center text-[12px]" style={{ color: C.dim }}>{f.tiers[0].name} 낙관은 {fishValueText(f.unit, f.tiers[0].min)}부터 찍혀요</p>
            </div>
        </Shell>
    );
}
