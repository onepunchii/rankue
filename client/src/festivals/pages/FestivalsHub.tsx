/**
 * /festivals — 전국 축제(2026-10-21, 오너 "전국 축제 … 공개 페이지 + 종목별").
 *
 * 위에서부터: 표지(판화 — 강가 마을의 등불) → 지역 · 종류 고르기 → 축제 지도(등불 — 고른 시도로 당겨 들어간다, 누르면 그 축제 카드)
 * → 이번 주말(사진 카드) → 축제 달력(한 달 막대) → 지금 · 곧 열리는 축제 목록 → 출처.
 * 로그인 없이 열린다. 글은 shared/festivals — 검색용 화면(server/seo/festivals)과 같다. 색은 등산(주소가 등산 색으로 정해진다 — shared/sportRoute).
 * 사진은 공공누리 제3유형 — 자르지 않는다(FestivalThumb).
 * ⚠️ 리터럴 색만. 글자는 12px 이상.
 */
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useSeo } from "@/hooks/useSeo";
import { LucideChevronRight } from "@/lib/icons";
import {
    FESTIVALS_H1, FESTIVALS_TAGLINE, FESTIVAL_CATS, FESTIVAL_CREDIT, FESTIVAL_REGIONS, festivalPath, festivalPeriod, festivalsHubSeo, kstToday, liveFestivals, overlaps, thisWeekend,
} from "@shared/festivals";
import { HIKING_HUB_PATH } from "@shared/hikingMountains";
import { HikingShell, HkSection, HkSkel } from "@/hiking/components/HikingShell";
import { LanternMap } from "../components/LanternMap";
import { FestivalCalendar } from "../components/FestivalCalendar";
import { FestivalBadge, FestivalCard, FestivalItem, FestivalThumb } from "../components/FestivalBits";
import { FESTIVALS_KEY, FESTIVAL_HERO, type FestivalsData } from "../api";

const LIST_SHOW = 20;
const md = (ymd: string) => `${Number(ymd.slice(4, 6))}월 ${Number(ymd.slice(6, 8))}일`;

export default function FestivalsHub() {
    const { data, isLoading } = useQuery<FestivalsData>({ queryKey: FESTIVALS_KEY, staleTime: 10 * 60_000 });
    const today = data?.today ?? kstToday();
    const all = Array.isArray(data?.items) ? data!.items : [];
    const [region, setRegion] = useState<string | null>(null);
    const [cat, setCat] = useState<string | null>(null);
    const [picked, setPicked] = useState<string | null>(null);
    const [more, setMore] = useState(false);

    const liveAll = useMemo(() => liveFestivals(all, today, 45), [all, today]);
    const inRegion = useMemo(() => all.filter((f) => !region || f.region === region), [all, region]);
    const filtered = useMemo(() => inRegion.filter((f) => !cat || f.cat === cat), [inRegion, cat]);
    const live = useMemo(() => liveFestivals(filtered, today, 45), [filtered, today]);
    const { sat, sun } = thisWeekend(today);
    const weekend = live.filter((f) => overlaps(f, sat, sun));
    const regionCounts = useMemo(() => { const m = new Map<string, number>(); for (const f of liveAll) if (f.region) m.set(f.region, (m.get(f.region) ?? 0) + 1); return m; }, [liveAll]);
    const catCounts = useMemo(() => { const m = new Map<string, number>(); for (const f of liveFestivals(inRegion, today, 45)) if (f.cat) m.set(f.cat, (m.get(f.cat) ?? 0) + 1); return m; }, [inRegion, today]);
    const pick = live.find((f) => f.id === picked) ?? null;
    const nowN = liveAll.filter((f) => f.start <= today).length;

    const seo = festivalsHubSeo({ live: liveAll.length, weekend: liveAll.filter((f) => overlaps(f, sat, sun)).length });
    useSeo(data ? { title: seo.title, description: seo.desc, path: seo.path } : null);

    const chip = (on: boolean) => (on ? { background: "#F28C6A", color: "#2A1208" } : { background: "#FFFFFF0F", color: "#F4EFE3CC" });

    return (
        <HikingShell title="전국 축제" backTo={HIKING_HUB_PATH}>
            <div data-testid="festivals-hub">
                <div className="relative h-[248px] overflow-hidden">
                    <img src={FESTIVAL_HERO} alt="" width={880} height={880} className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: "50% 56%" }} draggable={false} decoding="async" />
                    <div className="absolute inset-0" style={{ background: "linear-gradient(180deg,#0B1F2600 30%,#0B1F26F2 96%)" }} aria-hidden />
                    <div className="absolute inset-x-5 bottom-4">
                        <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-[#F4EFE3]">{FESTIVALS_H1}</h1>
                        <p className="mt-1 text-[14.5px] text-[#F4EFE3CC] break-keep">{FESTIVALS_TAGLINE.replace("이번 주말 어디 갈까 — ", "")}</p>
                        {data && (
                            <p className="mt-2 text-[13px] tabular-nums text-[#F6D9A8]">지금 열리는 {nowN}곳 · 45일 안에 {liveAll.length - nowN}곳 더 · 이번 주말 {liveAll.filter((f) => overlaps(f, sat, sun)).length}곳</p>
                        )}
                    </div>
                </div>

                {isLoading || !data ? (
                    <div className="space-y-4 px-5 pt-6" aria-busy="true"><HkSkel className="h-10" /><HkSkel className="h-[440px]" /><HkSkel className="h-40" /></div>
                ) : all.length === 0 ? (
                    <p className="px-5 pt-10 text-center text-[15px] text-[#F4EFE3B3]">축제 자료를 받는 중이에요. 잠시 뒤에 다시 와 주세요.</p>
                ) : (
                    <>
                        {/* 지역 · 종류 */}
                        <div className="px-5 pt-5">
                            <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="지역 고르기">
                                {[null, ...FESTIVAL_REGIONS.filter((r) => regionCounts.get(r))].map((r) => (
                                    <button key={r ?? "all"} type="button" onClick={() => { setRegion(r); setPicked(null); setCat(null); }} aria-pressed={region === r}
                                        className="h-9 shrink-0 rounded-full px-3.5 text-[13.5px] font-medium tabular-nums active:opacity-80" style={chip(region === r)} data-testid="festival-region-chip">
                                        {r ?? "전국"} <span className="opacity-70">{r ? regionCounts.get(r) : liveAll.length}</span>
                                    </button>
                                ))}
                            </div>
                            <div className="-mx-5 mt-2 flex gap-1.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="종류 고르기">
                                {[null, ...FESTIVAL_CATS.filter((c) => catCounts.get(c.code)).map((c) => c.code)].map((c) => {
                                    const on = cat === c;
                                    return (
                                        <button key={c ?? "all"} type="button" onClick={() => { setCat(c); setPicked(null); }} aria-pressed={on}
                                            className="h-8 shrink-0 rounded-full px-3 text-[13px] active:opacity-80"
                                            style={on ? { background: "#F4EFE3", color: "#0B1F26", fontWeight: 600 } : { background: "transparent", color: "#F4EFE3B3", boxShadow: "inset 0 0 0 1px #F4EFE329" }}>
                                            {c ? FESTIVAL_CATS.find((x) => x.code === c)!.chip : "모든 축제"}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <HkSection title="축제 지도" aside={region ? `${region} · 등불을 눌러 보세요` : "등불을 눌러 보세요"}>
                            <LanternMap items={live} today={today} region={region} picked={picked} onPick={setPicked} />
                            {pick ? (
                                <Link href={festivalPath(pick.id)} className="mt-3 flex items-center gap-3 rounded-2xl p-3 active:opacity-80" style={{ background: "#FFFFFF0D", boxShadow: "inset 0 0 0 1px #F28C6A66" }} data-testid="festival-picked">
                                    <FestivalThumb f={pick} h={72} eager />
                                    <span className="min-w-0 flex-1">
                                        <FestivalBadge f={pick} today={today} />
                                        <span className="mt-1 block text-[15.5px] font-semibold leading-snug text-[#F4EFE3] line-clamp-2 break-keep">{pick.title}</span>
                                        <span className="block text-[13px] tabular-nums text-[#F4EFE3B3]">{festivalPeriod(pick)}</span>
                                        <span className="block truncate text-[12.5px] text-[#F4EFE380]">{[pick.region, pick.addr?.split(" ")[1]].filter(Boolean).join(" · ")}</span>
                                    </span>
                                    <LucideChevronRight weight="bold" className="h-4 w-4 shrink-0 text-[#F28C6A]" aria-hidden />
                                </Link>
                            ) : (
                                <p className="mt-2.5 text-[12.5px] text-[#F4EFE380]">밝게 숨 쉬는 등불은 지금 열리는 축제, 옅은 등불은 45일 안에 열리는 축제예요</p>
                            )}
                        </HkSection>

                        {weekend.length > 0 && (
                            <HkSection title={sat === sun ? "오늘 열리는 축제" : "이번 주말"} aside={sat === sun ? md(sat) : `${md(sat)} ~ ${md(sun)} · ${weekend.length}곳`}>
                                <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-testid="festival-weekend">
                                    {weekend.slice(0, 12).map((f, i) => <FestivalCard key={f.id} f={f} today={today} eager={i < 2} />)}
                                </div>
                            </HkSection>
                        )}

                        <HkSection title="축제 달력" aside={region ?? "전국"}>
                            <FestivalCalendar items={filtered} today={today} />
                        </HkSection>

                        <HkSection title="지금 · 곧 열리는 축제" aside={`${live.length}곳`}>
                            {live.length === 0 ? (
                                <p className="rounded-2xl bg-[#FFFFFF0A] px-4 py-6 text-center text-[14px] text-[#F4EFE399]">45일 안에 열리는 축제가 없어요 — 달력에서 다른 달을 봐 주세요</p>
                            ) : (
                                <>
                                    <ul className="divide-y divide-[#FFFFFF12]" data-testid="festival-list">
                                        {(more ? live : live.slice(0, LIST_SHOW)).map((f) => <FestivalItem key={f.id} f={f} today={today} />)}
                                    </ul>
                                    {live.length > LIST_SHOW && (
                                        <button type="button" onClick={() => setMore((v) => !v)} className="mt-2 h-11 w-full rounded-xl bg-[#FFFFFF0D] text-[14px] font-medium text-[#F4EFE3] active:bg-[#FFFFFF17]">
                                            {more ? "접기" : `${live.length - LIST_SHOW}곳 더 보기`}
                                        </button>
                                    )}
                                </>
                            )}
                        </HkSection>

                        <div className="px-5 pb-6 pt-8">
                            <p className="text-[12px] leading-relaxed text-[#F4EFE366]">{FESTIVAL_CREDIT}. 날짜 · 장소는 바뀔 수 있어요 — 가기 전에 축제 홈페이지를 한 번 더 봐 주세요.</p>
                        </div>
                    </>
                )}
            </div>
        </HikingShell>
    );
}
