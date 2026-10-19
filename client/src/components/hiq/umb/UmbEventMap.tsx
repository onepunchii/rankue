/**
 * 이번 세계랭킹에 들어간 대회 — 세계 지도 한 장(2026-10-19 디자이너 리뷰: "지도 같은 것으로 우와 소리 나게").
 * 펠트 위의 상아색 점(세계 육지 — shared/worldDots, Natural Earth)에 대회 도시를 열린 차례대로 번호로 찍고, 차례대로 금빛 점선으로 잇는다(시즌의 동선).
 * 가장 최근 대회는 빨간 고리가 숨 쉰다. 같은 자리(앤트워프 · 리르처럼 몇 km)는 번호를 한 점에 묶는다. 아래 목록이 번호 · 도시 · 날짜를 적는다.
 * 자료는 UMB 레전드(/api/hiq/umb/calendar) 그대로 — 다음 대회 일정은 레전드에 없어 그리지 않는다. 좌표는 shared/caromCities(도시 중심).
 * 메르카토르(위도가 높을수록 세로로 넓다)로 유럽의 대회들이 붙어 보이지 않게 했다. 글자는 화면 픽셀로 그린다(늘 12px 이상).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { WORLD_DOT_LAT0, WORLD_DOT_ROWS, WORLD_DOT_STEP } from "@shared/worldDots";
import { caromCity } from "@shared/caromCities";
import { flagEmoji } from "@/lib/flag";

export interface UmbMapEvent { colKey: string; label: string; kind: string; city: string | null; country: string | null; date: string }

const LNG0 = -100, LNG1 = 146, LAT_TOP = 64, LAT_BOT = -16;
const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const IVORY = "#F6F1E3", GOLD = "#E8C46A", RED = "#E0533B";

export function UmbEventMap({ events, locale, copy }: {
    events: readonly UmbMapEvent[];
    locale: string;
    copy: { title: string; sub: (n: number) => string; latest: string; worldcup: string; championship: string };
}) {
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

    // 세계의 점 — 보이는 틀 안의 칸만
    const dots = useMemo(() => {
        const out: [number, number][] = [];
        WORLD_DOT_ROWS.forEach((runs, r) => {
            const lat = WORLD_DOT_LAT0 - r * WORLD_DOT_STEP;
            if (lat > LAT_TOP + 1 || lat < LAT_BOT - 1) return;
            for (let i = 0; i < runs.length; i += 2) {
                for (let c = runs[i]; c < runs[i] + runs[i + 1]; c++) {
                    const lng = -180 + (c + 0.5) * WORLD_DOT_STEP;
                    if (lng >= LNG0 && lng <= LNG1) out.push([lng, lat]);
                }
            }
        });
        return out;
    }, []);

    // 대회 — 날짜 차례, 도시를 아는 것만 지도에
    const list = [...events].filter((e) => e.city).sort((a, b) => a.date.localeCompare(b.date)).map((e, i) => ({ e, n: i + 1, c: caromCity(e.city) }));
    const onMap = list.filter((x) => x.c);
    if (!onMap.length) return null;
    const latest = onMap[onMap.length - 1];
    // 같은 자리 묶기(14px 안)
    const pins: { x: number; y: number; ns: number[]; latest: boolean; gold: boolean }[] = [];
    for (const it of onMap) {
        const x = X(it.c!.lng), y = Y(it.c!.lat);
        const near = pins.find((p) => Math.hypot(p.x - x, p.y - y) < 14);
        if (near) { near.ns.push(it.n); near.latest ||= it === latest; near.gold ||= it.e.kind === "championship"; }
        else pins.push({ x, y, ns: [it.n], latest: it === latest, gold: it.e.kind === "championship" });
    }
    // 동선 — 차례대로 이은 활(가운데를 위로 살짝 띄운다)
    const arcs = onMap.slice(1).map((it, i) => {
        const a = onMap[i], ax = X(a.c!.lng), ay = Y(a.c!.lat), bx = X(it.c!.lng), by = Y(it.c!.lat);
        const d = Math.hypot(bx - ax, by - ay);
        if (d < 14) return null;
        const mx = (ax + bx) / 2, my = (ay + by) / 2 - Math.min(40, d * 0.22);
        return { key: `${a.n}-${it.n}`, d: `M${ax.toFixed(1)},${ay.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)}` };
    }).filter(Boolean) as { key: string; d: string }[];
    const name = (it: (typeof list)[number]) => (it.c ? (locale === "ko" ? it.c.ko : it.c.en) : (it.e.city ?? "").replace(/\b\w/g, (m) => m.toUpperCase()));
    // 짧게 — "10.12"(한국어는 "10. 12."로 길어져 두 칸 목록에서 도시 이름이 잘렸다)
    const md = (iso: string) => { const d = new Date(iso); return `${d.getUTCMonth() + 1}.${d.getUTCDate()}`; };

    return (
        <section className="mb-4" data-testid="umb-event-map">
            <div className="mb-2 flex items-baseline justify-between gap-2">
                <h2 className="text-[13px] font-bold text-ink-2">🌍 {copy.title}</h2>
                <span className="shrink-0 text-[12px] font-medium text-black/55">{copy.sub(list.length)}</span>
            </div>
            <div className="overflow-hidden rounded-2xl" style={{ background: "radial-gradient(ellipse 90% 70% at 50% 35%, #146B48 0%, #0C4A31 60%, #083624 100%)", boxShadow: "inset 0 0 0 1px #FFFFFF14, 0 1px 2px rgba(0,0,0,0.08)" }}>
                <div ref={ref} className="w-full">
                    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${copy.title} — ${onMap.map((it) => `${it.n} ${name(it)}`).join(", ")}`} className="block">
                        {dots.map(([lng, lat], i) => <circle key={i} cx={X(lng)} cy={Y(lat)} r={Math.max(1, w / 250)} fill={IVORY} opacity={0.42} />)}
                        {arcs.map((a) => <path key={a.key} d={a.d} fill="none" stroke={GOLD} strokeOpacity={0.75} strokeWidth={1.4} strokeDasharray="3 4" strokeLinecap="round" />)}
                        {pins.map((p) => {
                            const label = p.ns.join("·");
                            const rw = Math.max(18, label.length * 7.2 + 8);
                            return (
                                <g key={label} data-testid="umb-event-pin">
                                    {p.latest && (
                                        <circle cx={p.x} cy={p.y} r={12} fill="none" stroke={RED} strokeWidth={2}>
                                            <animate attributeName="r" values="10;17;10" dur="2.4s" repeatCount="indefinite" />
                                            <animate attributeName="opacity" values="0.9;0;0.9" dur="2.4s" repeatCount="indefinite" />
                                        </circle>
                                    )}
                                    <rect x={p.x - rw / 2} y={p.y - 9} width={rw} height={18} rx={9} fill={p.gold ? GOLD : IVORY} stroke={p.latest ? RED : "#3E2614"} strokeWidth={p.latest ? 2 : 1} />
                                    <text x={p.x} y={p.y} dy="0.36em" textAnchor="middle" fontSize={12} fontWeight={700} fill="#2A1A0C">{label}</text>
                                </g>
                            );
                        })}
                    </svg>
                </div>
                {/* 번호 · 도시 · 날짜 */}
                {/* 좁은 화면은 한 줄에 하나(두 칸이면 '샤름엘셰이크'가 잘린다), 넓으면 두 칸 */}
                <ol className="grid grid-cols-1 gap-x-3 gap-y-1.5 px-3.5 pb-3.5 pt-1 min-[460px]:grid-cols-2" data-testid="umb-event-list">
                    {list.map((it) => (
                        <li key={`${it.e.colKey}-${it.e.date}`} className="flex min-w-0 items-center gap-1.5">
                            <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full px-1 text-[12px] font-bold leading-none tabular-nums"
                                style={{ background: it.e.kind === "championship" ? GOLD : IVORY, color: "#2A1A0C", boxShadow: it === latest ? `0 0 0 2px ${RED}` : undefined }}>{it.n}</span>
                            <span className="shrink-0 text-[13px] leading-none">{it.e.country ? flagEmoji(it.e.country) : ""}</span>
                            <span className="min-w-0 truncate text-[12.5px] font-semibold" style={{ color: IVORY }}>{name(it)}<span className="ml-1.5 font-normal" style={{ color: "#F6F1E399" }}>{it.e.kind === "championship" ? copy.championship : copy.worldcup}</span></span>
                            <span className="ml-auto shrink-0 text-[12px] tabular-nums" style={{ color: "#F6F1E399" }}>{md(it.e.date)}</span>
                        </li>
                    ))}
                </ol>
                <p className="px-3.5 pb-3 text-[12px]" style={{ color: "#F6F1E399" }}>
                    <span className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-[-1px]" style={{ background: GOLD }} aria-hidden />{copy.championship}
                    <span className="mx-2" aria-hidden>·</span>
                    <span className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-[-1px]" style={{ background: IVORY }} aria-hidden />{copy.worldcup}
                    <span className="mx-2" aria-hidden>·</span>
                    <span className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-[-1px]" style={{ boxShadow: `inset 0 0 0 2px ${RED}` }} aria-hidden />{copy.latest}
                </p>
            </div>
        </section>
    );
}
