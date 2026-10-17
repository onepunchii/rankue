/**
 * 전국 낚시터 공개 화면(2026-10-18 오너: "낚시 전체 공개" · "골프장 · 산 페이지처럼") — 누구나 본다(로그인 없이). 글은 shared/fishingPlaces(검색용 화면과 같은 말).
 *
 *   SpotsHub   /fishing/spots · /region/<시도> · /type/<종류> — 판화 표지 · 종이 지도 위의 낚시터 점(종류 색) · 종류 · 지역 · 어종 칩 · 이름 찾기 · 목록
 *   SpotPage   /fishing/spot/<id> — 표지 · 한눈 칸(어종 · 요금 · 연락처) · 대상 어종(어탁 · 금어기 · 금지체장) · 오늘 물때(바다 낚시터) · 위치(종이 지도 '여기' · 길찾기) · 가까운 낚시터
 *
 * 받은 칸만 적는다(지어 넣지 않는다). 금어기 · 금지체장은 수산자원관리법 시행령 별표(regs.json — 낚시 규칙 화면과 같은 자료) 그대로.
 * ⚠️ 리터럴 색만. 글자 12px 이상, 굵기는 semibold 까지. 한국어만.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { SportBackHeader } from "@/components/hiq/SportHeader";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { useSeo } from "@/hooks/useSeo";
import { useAuth } from "@/hooks/useAuth";
import { goLogin } from "@/components/hiq/LoginGate";
import { LucideChevronRight, LucideMap, LucideNavigation, LucidePhone } from "@/lib/icons";
import { KOREA_MAP_PATHS } from "@/golf/data/koreaMapData";
import { latLngToOutline } from "@/golf/lib/koreaOutline";
import { kakaoMapUrl, kakaoRouteUrl } from "@/golf/components/join/joinUi";
import { FISHING_COLORS as C, FISHING_PLACE_SOURCE, fishingSidoShort } from "@shared/fishing";
import { fishByName } from "@shared/fishingFish";
import { hhmm, type PortNow, type TideTurn } from "@shared/fishingPort";
import {
    FISHING_SPOTS_LABEL, FISHING_SPOTS_PATH, PLACE_KINDS, fishingRegionPath, fishingSpotPath, fishingTypePath, placeCounts, placeFeeText, placeKind, placeKindById, placeSeo, placeWhere,
    speciesKey, spotsHubSeo, spotsRegionSeo, spotsTypeSeo, type PlaceKindId, type PublicPlace,
} from "@shared/fishingPlaces";
import { art, PAPER, INK } from "../ink";
import { fishingSpotCardUrl } from "@shared/ogCards";
import { spreadBalls } from "@shared/storeDots";
import { FISHING_SEA_PATH, fishingPortPath, seaArt } from "@shared/fishingSeaPages";
import { useRegs } from "../Guide";

type Lite = Pick<PublicPlace, "id" | "name" | "kind" | "sido" | "sigungu" | "lat" | "lng" | "species" | "fee">;
const LAND = Object.values(KOREA_MAP_PATHS);
const VIEW = { x: 52, y: 20, w: 400, h: 620 };
/** 종류의 색 — 지도의 점 · 칩 · 목록의 점(뜻 하나씩) */
export const KIND_TONE: Readonly<Record<PlaceKindId, string>> = { reservoir: "#3F86A8", sea: "#0F4A66", flat: "#7FA36A", etc: "#C98A4B", valley: "#5E8F6F" };
export const useSpots = () => useQuery<{ total: number; items: Lite[] }>({ queryKey: ["/api/hiq/fishing/spots"], staleTime: 10 * 60_000 });

export function Shell({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="min-h-[100dvh] pb-28" style={{ background: C.bg, color: C.foam }}>
            <SportBackHeader sport="FISHING" title={title} fallback={FISHING_SPOTS_PATH} inner="mx-auto max-w-[720px]" />
            <main className="mx-auto max-w-[720px]">{children}</main>
            <HiqNavigation />
        </div>
    );
}

/** 종이 지도 위의 점 — 낚시터마다 종류 색. 'here' 가 있으면 그 한 곳만 크게(나머지는 옅게) */
function PaperMap({ items, here, height = 320 }: { items: readonly Lite[]; here?: Lite | null; height?: number }) {
    const pts = useMemo(() => items.filter((p) => p.lat != null && p.lng != null).map((p) => ({ p, xy: latLngToOutline(p.lat!, p.lng!) })), [items]);
    const h = here && here.lat != null && here.lng != null ? latLngToOutline(here.lat, here.lng) : null;
    return (
        <svg viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} className="block w-full" style={{ height, background: PAPER }} role="img" aria-label={here ? `${here.name}의 자리` : `낚시터 ${pts.length}곳의 자리`}>
            <defs><pattern id="sp-wave" width="26" height="12" patternUnits="userSpaceOnUse"><path d="M0 6 q6.5 -5 13 0 t13 0" fill="none" stroke="#1F556026" strokeWidth="1" /></pattern></defs>
            <rect x={VIEW.x} y={VIEW.y} width={VIEW.w} height={VIEW.h} fill="url(#sp-wave)" />
            <g fill="#C9BFA4" opacity="0.55" transform="translate(2.5 3)">{LAND.map((d, i) => <path key={i} d={d} />)}</g>
            <g fill="#EAE2CC" stroke="#0F283855" strokeWidth={0.8} strokeLinejoin="round">{LAND.map((d, i) => <path key={i} d={d} />)}</g>
            <g>{pts.map(({ p, xy }) => <circle key={p.id} cx={xy[0]} cy={xy[1]} r={here ? 2.6 : 3.6} fill={KIND_TONE[placeKind(p.kind).id]} stroke="#F3ECDD" strokeWidth={0.8} opacity={here ? 0.35 : 0.9} />)}</g>
            {h && (
                <g transform={`translate(${h[0]} ${h[1]})`} data-testid="spot-here">
                    <circle r={20} fill="#C8372D2E" />
                    <circle r={8} fill="#C8372D" stroke="#FBF7EE" strokeWidth={2.6} />
                </g>
            )}
        </svg>
    );
}

/** 이 근처 지도 — 이 낚시터를 가운데 둔 종이 지도(가로 · 세로 약 80km) · 가까운 낚시터는 목록과 같은 번호 */
function LocalMap({ here, near }: { here: Lite; near: readonly Lite[] }) {
    if (here.lat == null || here.lng == null) return null;
    const [hx, hy] = latLngToOutline(here.lat, here.lng);
    // 창은 가까운 낚시터가 다 들어가게(지도 칸 1 ≈ 0.95km) — 5km 안에 몰려 있으면 약 12km 창
    const far = Math.max(5, ...near.filter((x) => x.lat != null && x.lng != null).map((x) => { const [x2, y2] = latLngToOutline(x.lat!, x.lng!); return Math.max(Math.abs(x2 - hx), Math.abs(y2 - hy)); }));
    const R = Math.min(48, far * 1.3);
    const u = R / 50; // 화면 크기에 맞춘 글자 · 점
    // 같은 동네의 공이 겹치면 옆으로 비킨다(표시만 — 거리는 목록의 숫자가 말한다, 당구장 '이 근처'와 같은 셈)
    const withXY = near.filter((x) => x.lat != null && x.lng != null).map((x) => ({ id: x.id, xy: latLngToOutline(x.lat!, x.lng!) as [number, number] }));
    const placed = spreadBalls(withXY.map((x) => [x.xy[0] - hx, x.xy[1] - hy] as [number, number]), 3.9 * u, { x: 0, y: 0, r: 4.8 * u }, { hw: R - 4 * u, hh: R - 4 * u });
    const spots = new Map(withXY.map((x, i) => [x.id, [placed[i][0] + hx, placed[i][1] + hy] as [number, number]]));
    return (
        <svg viewBox={`${hx - R} ${hy - R} ${2 * R} ${2 * R}`} className="block aspect-square w-full" style={{ background: PAPER }} role="img" aria-label={`${here.name}와 가까운 낚시터`} data-testid="spot-local-map">
            <defs><pattern id="sp-wave2" width={13 * u} height={6 * u} patternUnits="userSpaceOnUse"><path d={`M0 ${3 * u} q${3.25 * u} ${-2.5 * u} ${6.5 * u} 0 t${6.5 * u} 0`} fill="none" stroke="#1F556026" strokeWidth={0.5 * u} /></pattern></defs>
            <rect x={hx - R} y={hy - R} width={2 * R} height={2 * R} fill="url(#sp-wave2)" />
            <g fill="#EAE2CC" stroke="#0F283866" strokeWidth={0.45 * u} strokeLinejoin="round">{LAND.map((d, i) => <path key={i} d={d} />)}</g>
            {near.map((x, i) => {
                const at = spots.get(x.id);
                if (!at) return null;
                const [px, py] = at;
                return (
                    <g key={x.id} transform={`translate(${px} ${py})`}>
                        <circle r={3.6 * u} fill={KIND_TONE[placeKind(x.kind).id]} stroke="#FBF7EE" strokeWidth={0.7 * u} />
                        <text y={1.4 * u} textAnchor="middle" fontSize={4 * u} fontWeight={600} fill="#FBF7EE">{i + 1}</text>
                    </g>
                );
            })}
            <g transform={`translate(${hx} ${hy})`} data-testid="spot-here">
                <circle r={9 * u} fill="#C8372D2E" />
                <circle r={4.4 * u} fill="#C8372D" stroke="#FBF7EE" strokeWidth={1.2 * u} />
            </g>
        </svg>
    );
}

export function Row({ p, km, no }: { p: Lite; km?: number | null; /** 이 근처 지도의 번호 */ no?: number }) {
    const k = placeKind(p.kind), fee = placeFeeText(p.fee);
    return (
        <Link href={fishingSpotPath(p.id)} className="flex min-h-[60px] items-center gap-3 py-2.5 active:opacity-70" data-testid="spot-row">
            {no != null
                ? <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold" style={{ background: KIND_TONE[k.id], color: "#FBF7EE" }}>{no}</span>
                : <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: KIND_TONE[k.id], boxShadow: "0 0 0 2px #FFFFFF14" }} />}
            <span className="min-w-0 flex-1">
                <span className="block truncate text-[15.5px] font-semibold">{p.name}</span>
                <span className="mt-0.5 flex flex-wrap gap-x-1 text-[13px]" style={{ color: C.dim }}>
                    {/* 덩어리 사이에서 줄바꿈 · 긴 요금 글("주간기준 25,000원/인당 …")은 줄 안에서 접는다 — 폭 360 을 넘지 않게 */}
                    {[placeWhere(p), k.short, p.species.length ? p.species.slice(0, 3).join(" · ") : null, fee].filter(Boolean).map((x, i, a) => <span key={i} className="max-w-full [overflow-wrap:anywhere]">{x}{i < a.length - 1 ? " ·" : ""}</span>)}
                </span>
            </span>
            {km != null && <span className="shrink-0 text-[13px] tabular-nums" style={{ color: C.soft }}>{km}km</span>}
            <LucideChevronRight weight="bold" className="h-4 w-4 shrink-0" style={{ color: "#F3ECDD55" }} />
        </Link>
    );
}

const chip = (on: boolean) => (on ? { background: C.brand, color: C.onBrand } : { background: "#FFFFFF0F", color: C.soft });

export function SpotsHub({ region, type }: { region?: string; type?: string }) {
    const [, setLocation] = useLocation();
    const { data, isLoading } = useSpots();
    const all = data?.items ?? [];
    const [q, setQ] = useState("");
    const [fish, setFish] = useState<string | null>(null);
    const [n, setN] = useState(60);
    const kind = type ? placeKindById(type) : null;
    const scoped = all.filter((p) => (!region || fishingSidoShort(p.sido) === region) && (!kind || p.kind === kind.raw));
    const counts = useMemo(() => placeCounts(all as PublicPlace[]), [all]);
    const scopedCounts = useMemo(() => placeCounts(scoped as PublicPlace[]), [scoped]);
    const qq = q.trim().replace(/\s+/g, "");
    const shown = scoped.filter((p) => (!fish || p.species.includes(fish)) && (!qq || p.name.replace(/\s+/g, "").includes(qq) || (p.sigungu ?? "").includes(qq)));
    const seo = region ? spotsRegionSeo(region, scoped.length) : kind ? spotsTypeSeo(kind.id, scoped.length) : spotsHubSeo(all.length || 1151);
    useSeo({ title: seo.title, description: seo.description, path: region ? fishingRegionPath(region) : kind ? fishingTypePath(kind.id) : FISHING_SPOTS_PATH, locale: "ko", image: "https://www.rankue.co.kr/og.png" });
    const cover = kind?.art ?? "/fishing/art/band-reservoir.webp";
    return (
        <Shell title={region ? `${region} 낚시터` : kind ? kind.label : FISHING_SPOTS_LABEL}>
            <div className="relative h-[180px] overflow-hidden" data-testid="spots-cover">
                <img src={cover} alt="" width={640} height={640} className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: "50% 55%" }} draggable={false} decoding="async" />
                <div className="absolute inset-0" style={{ background: "linear-gradient(180deg,#0B1E2D10 0%,#0B1E2D66 55%,#0B1E2D 100%)" }} aria-hidden />
                <div className="absolute inset-x-5 bottom-4">
                    <h1 className="text-[26px] font-semibold tracking-tight">{seo.h1}</h1>
                    <p className="mt-0.5 text-[13.5px] tabular-nums" style={{ color: "#F3ECDDCC" }}>{isLoading ? "불러오는 중…" : `${scoped.length.toLocaleString("ko-KR")}곳 · 대상 어종 · 요금 · 주소`}</p>
                </div>
            </div>
            <div className="px-5 pt-4">
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="낚시터 이름 · 시군으로 찾기" className="h-12 w-full rounded-2xl px-4 text-[15px] outline-none" style={{ background: "#FFFFFF0F", color: C.foam, boxShadow: "inset 0 0 0 1px #FFFFFF1A" }} data-testid="spots-search" />
                {/* 종류 */}
                <div className="-mx-5 mt-3 flex gap-1.5 overflow-x-auto px-5 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="종류">
                    <Link href={region ? fishingRegionPath(region) : FISHING_SPOTS_PATH} className="flex h-9 shrink-0 items-center rounded-full px-3.5 text-[13px]" style={chip(!kind)}>전체</Link>
                    {PLACE_KINDS.filter((k) => counts.kind.some(([id]) => id === k.id)).map((k) => (
                        <Link key={k.id} href={fishingTypePath(k.id)} className="flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px]" style={chip(kind?.id === k.id)}>
                            <i aria-hidden className="h-2 w-2 rounded-full" style={{ background: KIND_TONE[k.id] }} />{k.short} <span className="tabular-nums opacity-70">{counts.kind.find(([id]) => id === k.id)?.[1]}</span>
                        </Link>
                    ))}
                </div>
                {/* 지역 */}
                <div className="-mx-5 mt-2 flex gap-1.5 overflow-x-auto px-5 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="지역">
                    {counts.sido.map(([s, c]) => (
                        <Link key={s} href={region === s ? FISHING_SPOTS_PATH : fishingRegionPath(s)} className="flex h-9 shrink-0 items-center rounded-full px-3.5 text-[13px]" style={chip(region === s)} data-testid="spots-region">{s} <span className="ml-1 tabular-nums opacity-70">{c}</span></Link>
                    ))}
                </div>
            </div>
            {/* 지도 — 종류 색의 점 */}
            <section className="px-5 pt-5">
                <div className="overflow-hidden rounded-2xl" style={{ boxShadow: "0 1px 0 #00000040, inset 0 0 0 1px #0F28381F" }}>
                    <PaperMap items={shown} height={300} />
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2.5" style={{ background: PAPER, color: "#0F2838B3" }}>
                        {PLACE_KINDS.filter((k) => scopedCounts.kind.some(([id]) => id === k.id)).map((k) => <span key={k.id} className="flex items-center gap-1.5 text-[12px]"><i aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: KIND_TONE[k.id] }} />{k.short}</span>)}
                    </div>
                </div>
            </section>
            {/* 바다 · 항구 물때 — 저수지만 고른 화면에는 걸지 않는다 */}
            {(!kind || kind.id === "sea") && (
                <section className="px-5 pt-4">
                    <Link href={FISHING_SEA_PATH} className="flex items-center gap-3 overflow-hidden rounded-2xl p-2.5 active:opacity-85" style={{ background: "#FFFFFF0D", boxShadow: "inset 0 0 0 1px #FFFFFF14" }} data-testid="spots-sea-link">
                        <img src={seaArt("south-east")} alt="" width={640} height={640} loading="lazy" className="h-14 w-14 shrink-0 rounded-xl object-cover" draggable={false} />
                        <span className="min-w-0 flex-1"><span className="block text-[15px] font-semibold">오늘의 바다 · 물때</span><span className="block text-[12.5px]" style={{ color: C.dim }}>항구 51곳의 만조 · 간조 · 해역 특보</span></span>
                        <LucideChevronRight size={18} aria-hidden style={{ color: C.dim }} />
                    </Link>
                </section>
            )}
            {/* 어종 */}
            {scopedCounts.species.length > 0 && (
                <section className="px-5 pt-5">
                    <h2 className="mb-2.5 text-[17px] font-semibold">어종으로 고르기</h2>
                    <div className="flex flex-wrap gap-1.5">
                        {scopedCounts.species.slice(0, 16).map(([f, c]) => (
                            <button key={f} type="button" aria-pressed={fish === f} onClick={() => setFish(fish === f ? null : f)} className="flex h-9 items-center rounded-full px-3 text-[13px]" style={chip(fish === f)} data-testid="spots-fish">{f} <span className="ml-1 tabular-nums opacity-70">{c}</span></button>
                        ))}
                    </div>
                </section>
            )}
            <section className="px-5 pt-5">
                <h2 className="mb-1 text-[17px] font-semibold">{fish ? `${fish} 낚시터` : "낚시터"} <span className="text-[13px] font-normal tabular-nums" style={{ color: C.dim }}>{shown.length.toLocaleString("ko-KR")}곳</span></h2>
                <ul className="divide-y divide-[#FFFFFF14]">{shown.slice(0, n).map((p) => <li key={p.id}><Row p={p} /></li>)}</ul>
                {shown.length > n && <button type="button" onClick={() => setN(n + 60)} className="mt-2 h-11 w-full rounded-xl text-[14px]" style={{ background: "#FFFFFF0F", color: C.soft }}>{(shown.length - n).toLocaleString("ko-KR")}곳 더 보기</button>}
                {!isLoading && shown.length === 0 && <p className="py-6 text-center text-[14px]" style={{ color: C.dim }}>찾는 낚시터가 없어요.</p>}
                <p className="mt-4 text-[12px] leading-relaxed [word-break:keep-all]" style={{ color: C.dim }}>자료: {FISHING_PLACE_SOURCE}. 대상 어종 · 요금은 등록된 그대로이고 바뀌었을 수 있어요 — 가기 전에 낚시터에 물어보세요.</p>
                <button type="button" onClick={() => setLocation("/fishing")} className="mt-4 flex h-12 w-full items-center justify-center rounded-2xl text-[15px] font-semibold" style={{ background: C.brand, color: C.onBrand }} data-testid="spots-to-fishing">랭큐 낚시 — 오늘 바다 · 조과 기록</button>
            </section>
        </Shell>
    );
}

interface RegRow { kind: "closed" | "min"; group: string; name: string; rule: string }
type SpotDetail = { place: PublicPlace; nearby: (PublicPlace & { km: number | null })[]; port: { code: string; name: string; km: number; area: string } | null };

export function SpotPage({ id }: { id: string }) {
    const [, setLocation] = useLocation();
    const { member } = useAuth();
    const { data, isLoading, isError } = useQuery<SpotDetail>({ queryKey: [`/api/hiq/fishing/spots/${id}`], staleTime: 10 * 60_000, retry: false });
    const { data: tide } = useQuery<{ port: { name: string; km: number }; turns: TideTurn[]; now: PortNow | null } | null>({ queryKey: [`/api/hiq/fishing/spots/${id}/tide`], enabled: !!data?.port, staleTime: 5 * 60_000 });
    const { data: regs } = useRegs() as { data?: { basis: string; rows: RegRow[] } };
    const { data: all } = useSpots();
    const p = data?.place ?? null;
    const seo = p ? placeSeo(p) : null;
    useSeo(seo && p ? { title: seo.title, description: seo.description, path: fishingSpotPath(p.id), locale: "ko", image: fishingSpotCardUrl("https://www.rankue.co.kr", p.id) } : null);
    if (isLoading) return <Shell title="낚시터"><div className="h-[60vh] animate-pulse" aria-busy="true" /></Shell>;
    if (!p || isError) return <Shell title="낚시터"><p className="px-5 py-16 text-center text-[15px]" style={{ color: C.soft }}>낚시터를 찾을 수 없어요.</p></Shell>;
    const k = placeKind(p.kind), fee = placeFeeText(p.fee), where = placeWhere(p);
    const sameArea = (all?.items ?? []).filter((x) => x.id !== p.id && x.sido === p.sido && x.sigungu === p.sigungu);
    const fishCards = p.species.map((name) => {
        const key = speciesKey(name), ours = fishByName(key) ?? fishByName(name);
        const rules = (regs?.rows ?? []).filter((r) => speciesKey(r.name) === key || r.name === name);
        return { name, ours, closed: rules.find((r) => r.kind === "closed")?.rule ?? null, min: rules.find((r) => r.kind === "min")?.rule ?? null };
    });
    const sido = fishingSidoShort(p.sido);
    return (
        <Shell title="낚시터">
            {/* 표지 — 그 종류의 판화 */}
            <div className="relative h-[200px] overflow-hidden" data-testid="spot-cover">
                <img src={k.art} alt="" width={640} height={640} className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: "50% 55%" }} draggable={false} decoding="async" />
                <div className="absolute inset-0" style={{ background: "linear-gradient(180deg,#0B1E2D10 0%,#0B1E2D55 50%,#0B1E2D 100%)" }} aria-hidden />
                <div className="absolute inset-x-5 bottom-4">
                    <p className="text-[13px]" style={{ color: "#F3ECDDCC" }}><Link href={fishingRegionPath(sido)} className="underline-offset-2 active:underline">{where}</Link> · <Link href={fishingTypePath(k.id)} className="active:underline">{k.short}</Link></p>
                    <h1 className="mt-0.5 text-[26px] font-semibold leading-tight tracking-tight">{p.name}</h1>
                </div>
            </div>
            {/* 한눈 칸 */}
            <div className="grid grid-cols-2 gap-2 px-5 pt-4" data-testid="spot-facts">
                <div className="col-span-2 rounded-2xl px-3.5 py-3" style={{ background: "#FFFFFF0D", boxShadow: "inset 0 0 0 1px #FFFFFF14" }}>
                    <p className="text-[12px]" style={{ color: C.dim }}>대상 어종</p>
                    <p className="mt-0.5 text-[16px] font-semibold [word-break:keep-all]">{p.species.length ? p.species.join(" · ") : "등록된 어종이 없어요"}</p>
                </div>
                <div className="rounded-2xl px-3.5 py-3" style={{ background: "#FFFFFF0D", boxShadow: "inset 0 0 0 1px #FFFFFF14" }}>
                    <p className="text-[12px]" style={{ color: C.dim }}>요금</p>
                    <p className="mt-0.5 text-[15px] font-semibold [word-break:keep-all]">{fee ?? "등록 안 됨"}</p>
                </div>
                {p.tel ? (
                    <a href={`tel:${p.tel.replace(/[^0-9+]/g, "")}`} className="flex flex-col rounded-2xl px-3.5 py-3 active:opacity-80" style={{ background: "#FFFFFF0D", boxShadow: "inset 0 0 0 1px #FFFFFF14" }} data-testid="spot-tel">
                        <span className="flex items-center gap-1 text-[12px]" style={{ color: C.dim }}><LucidePhone className="h-3.5 w-3.5" />연락처</span>
                        <span className="mt-0.5 text-[15px] font-semibold tabular-nums">{p.tel}</span>
                    </a>
                ) : (
                    <div className="rounded-2xl px-3.5 py-3" style={{ background: "#FFFFFF0D", boxShadow: "inset 0 0 0 1px #FFFFFF14" }}>
                        <p className="text-[12px]" style={{ color: C.dim }}>종류</p>
                        <p className="mt-0.5 text-[15px] font-semibold">{k.label}</p>
                    </div>
                )}
            </div>

            {/* 대상 어종 — 어탁 · 금어기 · 금지체장 */}
            {fishCards.length > 0 && (
                <section className="px-5 pt-7" data-testid="spot-fish">
                    <h2 className="mb-2.5 text-[17px] font-semibold">이곳의 어종</h2>
                    <div className="-mx-5 flex gap-2.5 overflow-x-auto px-5 pb-1.5 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {fishCards.map((f) => (
                            <div key={f.name} className="w-[156px] shrink-0 overflow-hidden rounded-2xl" style={{ background: PAPER, color: INK }} data-testid="spot-fish-card">
                                <div className="flex h-[86px] items-center justify-center px-2">
                                    {f.ours ? <img src={art(f.ours.id)} alt={`${f.name} 어탁`} width={640} height={400} loading="lazy" className="h-full w-full object-contain" style={{ mixBlendMode: "multiply" }} />
                                        : <span className="text-[12px]" style={{ color: "#0F283880" }}>어탁 준비 중</span>}
                                </div>
                                <div className="px-3 pb-3">
                                    <p className="text-[15px] font-semibold">{f.name}</p>
                                    {f.closed && <p className="mt-1 text-[12px] leading-snug [word-break:keep-all]" style={{ color: "#8E2A14" }}>금어기 {f.closed.split(".")[0]}</p>}
                                    {f.min && <p className="mt-0.5 text-[12px] leading-snug [word-break:keep-all]" style={{ color: "#0F2838B3" }}>금지체장 {f.min.split(".")[0]}</p>}
                                    {!f.closed && !f.min && <p className="mt-1 text-[12px]" style={{ color: "#0F283880" }}>법정 금어기 없음</p>}
                                </div>
                            </div>
                        ))}
                    </div>
                    {regs?.basis && <p className="mt-2 text-[12px] [word-break:keep-all]" style={{ color: C.dim }}>금어기 · 금지체장: {regs.basis}. 지자체 조례가 따로 있을 수 있어요.</p>}
                </section>
            )}

            {/* 오늘 물때 — 바다 낚시터 */}
            {tide && tide.turns.length > 0 && (
                <section className="px-5 pt-7" data-testid="spot-tide">
                    <h2 className="mb-2.5 text-[17px] font-semibold">오늘 물때 <span className="text-[13px] font-normal" style={{ color: C.dim }}>{tide.port.name}({tide.port.km}km)</span></h2>
                    <div className="rounded-2xl px-3.5 py-3" style={{ background: "#FFFFFF0A" }}>
                        <p className="flex flex-wrap gap-1.5">{tide.turns.map((t) => <span key={`${t.kind}${t.min}`} className="rounded-full px-2.5 py-1 text-[13px] font-semibold tabular-nums" style={{ background: t.kind === "high" ? "#3F86A84D" : "#FFFFFF14" }}>{t.kind === "high" ? "만조" : "간조"} {hhmm(t.min)}</span>)}</p>
                        {tide.now?.wtemp != null && <p className="mt-2 text-[13px]" style={{ color: C.soft }}>지금 수온 {tide.now.wtemp.toFixed(1)}°{tide.now.buoy?.wave != null ? ` · 파고 ${tide.now.buoy.wave.toFixed(1)}m(${tide.now.buoy.name})` : ""}</p>}
                        <p className="mt-1.5 text-[12px]" style={{ color: C.dim }}>국립해양조사원 조석 예보 · 관측</p>
                    </div>
                    <Link href={fishingPortPath(tide.port.name)} className="mt-2 flex h-11 items-center justify-between rounded-xl px-3.5 text-[14px]" style={{ background: "#FFFFFF0F", color: C.soft }} data-testid="spot-port-link">{tide.port.name} 물때표 — 물때 곡선 · 열흘<LucideChevronRight size={16} aria-hidden /></Link>
                </section>
            )}

            {/* 위치 */}
            <section className="px-5 pt-7" data-testid="spot-location">
                <h2 className="mb-2.5 text-[17px] font-semibold">위치</h2>
                <div className="grid grid-cols-[42%_1fr] gap-3 rounded-2xl p-3" style={{ background: "#FFFFFF0A" }}>
                    <div className="overflow-hidden rounded-xl">{p.lat != null && p.lng != null ? <LocalMap here={p} near={data!.nearby} /> : <PaperMap items={all?.items ?? []} here={p} height={210} />}</div>
                    <div className="flex min-w-0 flex-col gap-2">
                        <p className="text-[14px] leading-snug [word-break:keep-all]">{p.address ?? where}</p>
                        <a href={kakaoMapUrl(p.name, p.lat, p.lng)} target="_blank" rel="noopener noreferrer" className="flex h-11 items-center justify-center gap-1.5 rounded-xl text-[14px] font-semibold" style={{ background: "#FFFFFF14" }}><LucideMap className="h-4 w-4" />지도</a>
                        <a href={kakaoRouteUrl(p.name, p.lat, p.lng)} target="_blank" rel="noopener noreferrer" className="flex h-11 items-center justify-center gap-1.5 rounded-xl text-[14px] font-semibold" style={{ background: C.brand, color: C.onBrand }}><LucideNavigation className="h-4 w-4" />길찾기</a>
                    </div>
                </div>
            </section>

            {/* 가까운 낚시터 */}
            {(data!.nearby.length > 0 || sameArea.length > 0) && (
                <section className="px-5 pt-7" data-testid="spot-nearby">
                    <h2 className="mb-1 text-[17px] font-semibold">가까운 낚시터</h2>
                    <ul className="divide-y divide-[#FFFFFF14]">{(data!.nearby.length ? data!.nearby : sameArea.slice(0, 6).map((x) => ({ ...x, km: null }))).map((x, i) => <li key={x.id}><Row p={x} km={x.km} no={data!.nearby.length && p.lat != null ? i + 1 : undefined} /></li>)}</ul>
                    <Link href={fishingRegionPath(sido)} className="mt-2 flex h-11 items-center justify-center rounded-xl text-[14px]" style={{ background: "#FFFFFF0F", color: C.soft }}>{sido} 낚시터 모두 보기</Link>
                </section>
            )}

            <section className="px-5 pt-7">
                <button type="button" onClick={() => (member ? setLocation("/fishing") : goLogin(setLocation, fishingSpotPath(p.id)))} className="flex h-[52px] w-full items-center justify-center rounded-2xl text-[15px] font-semibold" style={{ background: C.brand, color: C.onBrand }} data-testid="spot-cta">
                    {member ? "여기서 낚았으면 — 조과 적기" : "가입하고 조과 기록 · 어탁 모으기"}
                </button>
                <p className="mt-3 text-[12px] leading-relaxed [word-break:keep-all]" style={{ color: C.dim }}>자료: {FISHING_PLACE_SOURCE}{p.dataDate ? ` · ${p.dataDate} 기준` : ""}. 요금 · 운영은 바뀌었을 수 있어요 — 가기 전에 낚시터에 물어보세요.</p>
            </section>
        </Shell>
    );
}
