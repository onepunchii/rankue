/**
 * 3쿠션 세계 지도(2026-10-19) — 세계랭킹 '국가' 보기의 맨 위. 나라마다 거품 하나: 넓이는 상위 5명 포인트 합(UMB 레전드 그대로), 자리는 그 나라 가운데.
 * 대회 지도(UmbEventMap)와 같은 펠트 · 상아색 점 세계(shared/worldDots). 벨기에 · 네덜란드처럼 작은 나라는 점 지도로 칠하면 사라져서(2.5° 칸) 거품으로 그린다.
 * 거품 안의 숫자는 아래 국가 순위의 차례(1 = 1위 나라). 떠 있는 꼬리표는 남의 거품 옆에 앉아 헷갈려서 뺐다.
 * '유럽' 단추 — 유럽은 나라가 몰려 거품이 겹친다. 같은 지도를 유럽만 크게. 누르면 아래 줄에 그 나라(선수 수 · 최고 순위 · 국가 페이지로).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { WORLD_DOT_LAT0, WORLD_DOT_ROWS, WORLD_DOT_STEP } from "@shared/worldDots";
import { NATION_CENTERS } from "@shared/nationCenters";
import { EU_DOT_LAT0, EU_DOT_LNG0, EU_DOT_ROWS, EU_DOT_STEP } from "@shared/worldDotsEurope";
import { flagEmoji } from "@/lib/flag";

export interface MapNation { fed: string; players: number; bestRank: number; bestPlayer: string; top5Points: number | null }

const VIEWS = {
    world: { lng0: -125, lng1: 150, top: 71, bot: -46, big: 22 },
    europe: { lng0: -12, lng1: 38, top: 62, bot: 34, big: 16 },
} as const;
type ViewId = keyof typeof VIEWS;
const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const IVORY = "#F6F1E3", GOLD = "#E8C46A";

export function NationsWorldMap({ nations, homeFed, nameOf, href, copy }: {
    nations: readonly MapNation[];
    homeFed: string;
    nameOf: (fed: string) => string;
    href: (fed: string) => string;
    copy: { title: string; sub: string; pick: (n: MapNation) => string; points: string; world: string; europe: string };
}) {
    const [view, setView] = useState<ViewId>("world");
    const V = VIEWS[view];
    const LNG0 = V.lng0, LNG1 = V.lng1, LAT_TOP = V.top, LAT_BOT = V.bot;
    const ref = useRef<HTMLDivElement>(null);
    const [w, setW] = useState(320);
    useEffect(() => {
        const el = ref.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver(([e]) => { if (e?.contentRect.width) setW(Math.round(e.contentRect.width)); });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    const h = Math.round(w * ((merc(LAT_TOP) - merc(LAT_BOT)) / (((LNG1 - LNG0) * Math.PI) / 180)));
    const X = (lng: number) => ((lng - LNG0) / (LNG1 - LNG0)) * w;
    const Y = (lat: number) => ((merc(LAT_TOP) - merc(lat)) / (merc(LAT_TOP) - merc(LAT_BOT))) * h;

    // 점 — 세계는 2.5° 세계 점, 유럽은 0.75° 유럽 점(세계 점으로는 유럽 모양이 안 나온다)
    const dots = useMemo(() => {
        const out: [number, number][] = [];
        const eu = view === "europe";
        const rows = eu ? EU_DOT_ROWS : WORLD_DOT_ROWS, step = eu ? EU_DOT_STEP : WORLD_DOT_STEP, lat0 = eu ? EU_DOT_LAT0 : WORLD_DOT_LAT0, lng0 = eu ? EU_DOT_LNG0 : -180;
        rows.forEach((runs, r) => {
            const lat = lat0 - r * step;
            if (lat > LAT_TOP + 1 || lat < LAT_BOT - 1) return;
            for (let i = 0; i < runs.length; i += 2) for (let c = runs[i]; c < runs[i] + runs[i + 1]; c++) {
                const lng = lng0 + (c + 0.5) * step;
                if (lng >= LNG0 && lng <= LNG1) out.push([lng, lat]);
            }
        });
        return { pts: out, r: eu ? 1.6 : 0 };
    }, [view, LAT_TOP, LAT_BOT, LNG0, LNG1]);

    const ranked = nations.filter((n) => (n.top5Points ?? 0) > 0 && NATION_CENTERS[n.fed]);
    const [pick, setPick] = useState<string | null>(null);
    if (!ranked.length) return null;
    const max = Math.max(...ranked.map((n) => n.top5Points ?? 0));
    // 넓이가 점수에 비례 — 가장 큰 거품의 반지름은 폭에 맞춰(유럽 보기는 크게)
    const rOf = (p: number) => 3 + Math.sqrt(p / max) * Math.max(view === "world" ? 14 : 18, w / V.big);
    const items = ranked.map((n, i) => { const [lat, lng] = NATION_CENTERS[n.fed]; return { n, i, x: X(lng), y: Y(lat), r: rOf(n.top5Points ?? 0) }; })
        .filter((it) => it.x > -it.r && it.x < w + it.r && it.y > -it.r && it.y < h + it.r);
    const cur = items.find((it) => it.n.fed === pick) ?? items[0];
    if (!cur) return null;
    const numbered: typeof items = [];
    for (const it of items) if (it.r >= 8 && !numbered.some((o) => Math.hypot(o.x - it.x, o.y - it.y) < 16)) numbered.push(it);

    return (
        <section className="mb-3" data-testid="umb-nations-map">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 px-1">
                <h2 className="whitespace-nowrap text-[13px] font-bold text-ink-2">🌍 {copy.title}</h2>
                <span className="text-[12px] font-medium text-black/55 break-keep">{copy.sub}</span>
            </div>
            <div className="overflow-hidden rounded-2xl" style={{ background: "radial-gradient(ellipse 90% 70% at 50% 35%, #146B48 0%, #0C4A31 60%, #083624 100%)", boxShadow: "inset 0 0 0 1px #FFFFFF14, 0 1px 2px rgba(0,0,0,0.08)" }}>
                <div className="flex justify-end gap-1 px-2.5 pt-2.5" role="group" aria-label={copy.title}>
                    {(["world", "europe"] as const).map((v) => (
                        <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v} data-testid={`umb-nations-view-${v}`}
                            className="h-7 rounded-full px-3 text-[12px] font-semibold"
                            style={view === v ? { background: IVORY, color: "#2A1A0C" } : { background: "#FFFFFF1A", color: "#F6F1E3CC" }}>
                            {v === "world" ? copy.world : copy.europe}
                        </button>
                    ))}
                </div>
                <div ref={ref} className="w-full">
                    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" className="block"
                        aria-label={`${copy.title} — ${items.slice(0, 10).map((it) => `${nameOf(it.n.fed)} ${it.n.top5Points}`).join(", ")}`}>
                        {dots.pts.map(([lng, lat], i) => <circle key={i} cx={X(lng)} cy={Y(lat)} r={dots.r || Math.max(0.9, w / 300)} fill={IVORY} opacity={0.32} />)}
                        {/* 작은 거품이 위에 오게 큰 것부터 */}
                        {[...items].sort((a, b) => b.r - a.r).map((it) => {
                            const on = it.n.fed === cur.n.fed, home = it.n.fed === homeFed;
                            return (
                                <circle key={it.n.fed} cx={it.x} cy={it.y} r={it.r} fill={GOLD} fillOpacity={on ? 0.95 : 0.62}
                                    stroke={on ? "#FFFFFF" : home ? "#FFFFFFB3" : "#3E2614"} strokeWidth={on ? 2 : 1}
                                    style={{ cursor: "pointer" }} onClick={() => setPick(it.n.fed)} data-testid="umb-nation-bubble">
                                    <title>{`${nameOf(it.n.fed)} ${it.n.top5Points}`}</title>
                                </circle>
                            );
                        })}
                        {/* 차례 — 숫자가 들어가는 거품만(반지름 8px 이상), 앞 순위 숫자와 16px 안이면 뺀다(겹친 거품에서 '1 19'가 붙던 것) */}
                        {numbered.map((it) => (
                            <text key={`n-${it.n.fed}`} x={it.x} y={it.y} dy="0.36em" textAnchor="middle" fontSize={12} fontWeight={700} fill="#2A1A0C" pointerEvents="none">{it.i + 1}</text>
                        ))}
                    </svg>
                </div>
                {/* 고른 나라 */}
                <Link href={href(cur.n.fed)} className="flex items-center gap-3 border-t px-3.5 py-3 active:opacity-80" style={{ borderColor: "#FFFFFF1A" }} data-testid="umb-nation-pick">
                    <span className="text-[22px] leading-none">{flagEmoji(cur.n.fed)}</span>
                    <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-semibold" style={{ color: IVORY }}>{cur.i + 1}. {nameOf(cur.n.fed)}</span>
                        <span className="block truncate text-[12px]" style={{ color: "#F6F1E3B3" }}>{copy.pick(cur.n)}</span>
                    </span>
                    <span className="shrink-0 text-right">
                        <span className="block text-[17px] font-bold tabular-nums leading-none" style={{ color: GOLD }}>{(cur.n.top5Points ?? 0).toLocaleString("en-US")}</span>
                        <span className="mt-1 block text-[12px]" style={{ color: "#F6F1E399" }}>{copy.points}</span>
                    </span>
                </Link>
            </div>
        </section>
    );
}
