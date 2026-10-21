/**
 * 전국 축제 — /golf/festivals · /hiking/festivals · /fishing/festivals(종목마다) · /festivals(검색용 정본).
 * 2026-10-21 오너: "전국 축제 … 공개 페이지 + 종목별" → "낚시에서 전국축제 누르면 등산으로 가잖아 … 골프 등산 낚시에 각각 … 골프도 축제가 중요해".
 * 자료와 짜임은 하나, 종목마다 색 · 표지 · 틀(하단 탭) · 지도 밑의 점(골프장 ■ · 명산 ▲ · 낚시터 ◆) · 목록 줄의 '가까운 ○○' · 종목 줄이 다르다(theme).
 *
 * 위에서부터: 표지 → 지역 · 종류 고르기 → 축제 지도(등불 — 시도로 당겨 들어간다, 누르면 그 축제 카드) → 종목 줄(라운드/산행 길에 · 낚시 축제)
 * → 이번 주말(짧은 축제 먼저) → 축제 달력 → 지금 · 곧 열리는 축제 → 출처.
 * /festivals 는 검색으로 들어온 사람의 화면(등산 색) — 앱에서 종목을 고른 적 있는 사람은 그 종목의 축제 화면으로 옮긴다(주소만 바꾼다).
 * 정본(canonical)은 셋 다 /festivals — 같은 글이 세 주소로 색인되지 않게. 사진은 공공누리 제3유형 — 자르지 않는다(FestivalThumb).
 * ⚠️ 리터럴 색만. 글자는 12px 이상.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useSeo } from "@/hooks/useSeo";
import { LucideChevronRight } from "@/lib/icons";
import {
    FESTIVAL_METRO_GOLF_KM, FESTIVAL_METRO_REGIONS,
    FESTIVALS_H1, FESTIVALS_TAGLINE, FESTIVAL_CATS, FESTIVAL_CREDIT, FESTIVAL_REGIONS, festivalKm, festivalPeriod, festivalsHubSeo, festivalsSportPath, kstToday, liveFestivals, overlaps, thisWeekend,
    type FestivalSport,
} from "@shared/festivals";
import { HkSkel } from "@/hiking/components/HikingShell";
import { LanternMap } from "../components/LanternMap";
import { FestivalCalendar } from "../components/FestivalCalendar";
import { FestivalBadge, FestivalCard, FestivalItem, FestivalThumb } from "../components/FestivalBits";
import { FestivalPicks } from "../components/FestivalPicks";
import { FestSection, festSportOfPath, festTheme } from "../theme";
import { FestShell } from "../FestShell";
import { FESTIVALS_KEY, festivalLayerKey, type FestivalLayerData, type FestivalsData } from "../api";

const LIST_SHOW = 20;
const md = (ymd: string) => `${Number(ymd.slice(4, 6))}월 ${Number(ymd.slice(6, 8))}일`;
const dayLen = (f: { start: string; end: string }) => Date.UTC(+f.end.slice(0, 4), +f.end.slice(4, 6) - 1, +f.end.slice(6, 8)) - Date.UTC(+f.start.slice(0, 4), +f.start.slice(4, 6) - 1, +f.start.slice(6, 8));
/** 목록 줄의 '가까운 ○○' — 종목마다 이름 · 반경 */
const NEAR = { golf: { word: "가까운 골프장", km: 25 }, mountain: { word: "가까운 명산", km: 15 }, fishing: { word: "가까운 낚시터", km: 15 } } as const;

/** 앱에서 고른 종목(저장된 선호) — 골프 · 등산 · 낚시면 그 종목의 축제 화면으로 */
function savedFestSport(): FestivalSport | null {
    try { const v = localStorage.getItem("rankue_current_sport"); return v === "GOLF" || v === "HIKING" || v === "FISHING" ? v : null; } catch { return null; }
}

export default function FestivalsHub() {
    const [location, setLocation] = useLocation();
    const sport = festSportOfPath(location);
    const t = festTheme(sport);
    useEffect(() => {
        if (sport) return;
        const saved = savedFestSport();
        if (saved) setLocation(festivalsSportPath(saved), { replace: true });
    }, [sport, setLocation]);

    const { data, isLoading } = useQuery<FestivalsData>({ queryKey: FESTIVALS_KEY, staleTime: 10 * 60_000 });
    const layerQ = useQuery<FestivalLayerData>({ queryKey: festivalLayerKey(sport ?? "HIKING"), enabled: !!sport, staleTime: 60 * 60_000 });
    const layer = useMemo(() => (sport && Array.isArray(layerQ.data?.items) ? layerQ.data!.items : []), [sport, layerQ.data]);
    const layerPts = useMemo(() => layer.map((p) => ({ lat: p.a, lng: p.o })), [layer]);

    const today = data?.today ?? kstToday();
    const all = useMemo(() => (Array.isArray(data?.items) ? data!.items : []), [data]);
    const [region, setRegion] = useState<string | null>(null);
    const [cat, setCat] = useState<string | null>(null);
    const [picked, setPicked] = useState<string | null>(null);
    const [more, setMore] = useState(false);

    const liveAll = useMemo(() => liveFestivals(all, today, 45), [all, today]);
    const inRegion = useMemo(() => all.filter((f) => !region || f.region === region), [all, region]);
    const filtered = useMemo(() => inRegion.filter((f) => !cat || f.cat === cat), [inRegion, cat]);
    const live = useMemo(() => liveFestivals(filtered, today, 45), [filtered, today]);
    const { sat, sun } = thisWeekend(today);
    // 이번 주말 — 짧은 축제 먼저(두 달 내내 하는 정원 · 전시가 맨 앞에 오지 않게). 같으면 시작한 날 순서
    const weekend = live.filter((f) => overlaps(f, sat, sun)).sort((a, b) => dayLen(a) - dayLen(b) || a.start.localeCompare(b.start));
    const regionCounts = useMemo(() => { const m = new Map<string, number>(); for (const f of liveAll) if (f.region) m.set(f.region, (m.get(f.region) ?? 0) + 1); return m; }, [liveAll]);
    const catCounts = useMemo(() => { const m = new Map<string, number>(); for (const f of liveFestivals(inRegion, today, 45)) if (f.cat) m.set(f.cat, (m.get(f.cat) ?? 0) + 1); return m; }, [inRegion, today]);
    const pick = live.find((f) => f.id === picked) ?? null;
    const nowN = liveAll.filter((f) => f.start <= today).length;
    // 목록 줄의 '가까운 ○○ 4km' — 종목 화면에서만
    const nearOf = useMemo(() => {
        const m = new Map<string, string>();
        if (!sport || !layer.length) return m;
        const rule = NEAR[t.layer];
        for (const f of live) {
            let best: { n: string; km: number } | null = null;
            // 도심 축제(서울 · 광역시)는 골프장 3km 안만 — '라운드 길에 들를 축제'와 같은 규칙(경복궁 ↔ 고양 6홀 9.7km 같은 줄을 내지 않는다)
            const limit = t.layer === "golf" && FESTIVAL_METRO_REGIONS.has(f.region ?? "") ? FESTIVAL_METRO_GOLF_KM : rule.km;
            for (const p of layer) { const km = festivalKm(f, { lat: p.a, lng: p.o }); if (km <= limit && (!best || km < best.km)) best = { n: p.n, km }; }
            if (best) m.set(f.id, `${rule.word} ${best.n} ${best.km < 1 ? "1km 안" : `${best.km.toFixed(best.km < 10 ? 1 : 0)}km`}`);
        }
        return m;
    }, [sport, layer, live, t.layer]);

    const seo = festivalsHubSeo({ live: liveAll.length, weekend: liveAll.filter((f) => overlaps(f, sat, sun)).length });
    useSeo(data ? { title: seo.title, description: seo.desc, path: seo.path } : null);

    const chip = (on: boolean) => (on ? { background: t.accent, color: t.onAccent } : { background: "#FFFFFF0F", color: `${t.text}CC` });
    const back = sport === "GOLF" ? "/golf/courses" : sport === "FISHING" ? "/fishing" : "/hiking";
    const layerWord = t.layer === "golf" ? "■ 골프장" : t.layer === "fishing" ? "◆ 낚시터" : "▲ 명산";

    return (
        <FestShell sport={sport} title="전국 축제" back={back}>
            <div data-testid="festivals-hub" data-festival-sport={sport ?? "NONE"}>
                <div className="relative h-[248px] overflow-hidden">
                    <img src={t.hero} alt="" width={880} height={880} className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: t.heroPos }} draggable={false} decoding="async" />
                    <div className="absolute inset-0" style={{ background: `linear-gradient(180deg,${t.bg}00 30%,${t.bg}F2 96%)` }} aria-hidden />
                    <div className="absolute inset-x-5 bottom-4">
                        <h1 className="text-[28px] font-semibold leading-tight tracking-tight" style={{ color: t.text }}>{FESTIVALS_H1}</h1>
                        <p className="mt-1 text-[14.5px] break-keep" style={{ color: `${t.text}CC` }}>{FESTIVALS_TAGLINE.replace("이번 주말 어디 갈까 — ", "")}</p>
                        {data && (
                            <p className="mt-2 text-[13px] tabular-nums" style={{ color: t.soon }}>지금 열리는 {nowN}곳 · 45일 안에 {liveAll.length - nowN}곳 더 · 이번 주말 {liveAll.filter((f) => overlaps(f, sat, sun)).length}곳</p>
                        )}
                    </div>
                </div>

                {isLoading || !data ? (
                    <div className="space-y-4 px-5 pt-6" aria-busy="true"><HkSkel className="h-10" /><HkSkel className="h-[440px]" /><HkSkel className="h-40" /></div>
                ) : all.length === 0 ? (
                    <p className="px-5 pt-10 text-center text-[15px]" style={{ color: `${t.text}B3` }}>축제 자료를 받는 중이에요. 잠시 뒤에 다시 와 주세요.</p>
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
                                            style={on ? { background: t.text, color: t.bg, fontWeight: 600 } : { background: "transparent", color: `${t.text}B3`, boxShadow: `inset 0 0 0 1px ${t.text}29` }}>
                                            {c ? FESTIVAL_CATS.find((x) => x.code === c)!.chip : "모든 축제"}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <FestSection title="축제 지도" aside={region ? `${region} · 등불을 눌러 보세요` : "등불을 눌러 보세요"}>
                            <LanternMap items={live} today={today} region={region} picked={picked} onPick={setPicked} layer={layerPts} />
                            {pick ? (
                                <Link href={t.item(pick.id)} className="mt-3 flex items-center gap-3 rounded-2xl p-3 active:opacity-80" style={{ background: "#FFFFFF0D", boxShadow: `inset 0 0 0 1px ${t.accent}66` }} data-testid="festival-picked">
                                    <FestivalThumb f={pick} h={72} frame={96} eager />
                                    <span className="min-w-0 flex-1">
                                        <FestivalBadge f={pick} today={today} />
                                        <span className="mt-1 block text-[15.5px] font-semibold leading-snug line-clamp-2 break-keep" style={{ color: t.text }}>{pick.title}</span>
                                        <span className="block text-[13px] tabular-nums" style={{ color: `${t.text}B3` }}>{festivalPeriod(pick)}</span>
                                        <span className="block truncate text-[12.5px]" style={{ color: nearOf.get(pick.id) ? t.soon : `${t.text}80` }}>{nearOf.get(pick.id) ?? [pick.region, pick.addr?.split(" ")[1]].filter(Boolean).join(" · ")}</span>
                                    </span>
                                    <LucideChevronRight weight="bold" className="h-4 w-4 shrink-0" style={{ color: t.accent }} aria-hidden />
                                </Link>
                            ) : (
                                <p className="mt-2.5 text-[12.5px] break-keep" style={{ color: `${t.text}80` }}>
                                    밝게 숨 쉬는 등불은 지금 열리는 축제, 옅은 등불은 45일 안에 열리는 축제예요{sport ? ` · 바탕의 ${layerWord}` : ""}
                                </p>
                            )}
                        </FestSection>

                        {/* 종목 줄 — 라운드/산행 길에 들를 축제 · 낚시 축제(검색용 정본에는 없다) */}
                        {sport && <FestivalPicks sport={sport} inHub />}

                        {weekend.length > 0 && (
                            <FestSection title={sat === sun ? "오늘 열리는 축제" : "이번 주말"} aside={sat === sun ? md(sat) : `${md(sat)} ~ ${md(sun)} · ${weekend.length}곳`}>
                                <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-testid="festival-weekend">
                                    {weekend.slice(0, 12).map((f, i) => <FestivalCard key={f.id} f={f} today={today} eager={i < 2} note={nearOf.get(f.id) ?? null} />)}
                                </div>
                            </FestSection>
                        )}

                        <FestSection title="축제 달력" aside={region ?? "전국"}>
                            <FestivalCalendar items={filtered} today={today} />
                        </FestSection>

                        <FestSection title="지금 · 곧 열리는 축제" aside={`${live.length}곳`}>
                            {live.length === 0 ? (
                                <p className="rounded-2xl bg-[#FFFFFF0A] px-4 py-6 text-center text-[14px]" style={{ color: `${t.text}99` }}>45일 안에 열리는 축제가 없어요 — 달력에서 다른 달을 봐 주세요</p>
                            ) : (
                                <>
                                    <ul className="divide-y divide-[#FFFFFF12]" data-testid="festival-list">
                                        {(more ? live : live.slice(0, LIST_SHOW)).map((f) => <FestivalItem key={f.id} f={f} today={today} near={nearOf.get(f.id) ?? null} />)}
                                    </ul>
                                    {live.length > LIST_SHOW && (
                                        <button type="button" onClick={() => setMore((v) => !v)} className="mt-2 h-11 w-full rounded-xl bg-[#FFFFFF0D] text-[14px] font-medium active:bg-[#FFFFFF17]" style={{ color: t.text }}>
                                            {more ? "접기" : `${live.length - LIST_SHOW}곳 더 보기`}
                                        </button>
                                    )}
                                </>
                            )}
                        </FestSection>

                        <div className="px-5 pb-6 pt-8">
                            <p className="text-[12px] leading-relaxed" style={{ color: `${t.text}66` }}>{FESTIVAL_CREDIT}. 날짜 · 장소는 바뀔 수 있어요 — 가기 전에 축제 홈페이지를 한 번 더 봐 주세요.</p>
                        </div>
                    </>
                )}
            </div>
        </FestShell>
    );
}
