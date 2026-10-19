/**
 * 전국 당구장 지도(2026-10-17) — 당구대를 위에서 내려다본 모습: 나무 레일 · 다이아몬드 표시 · 쿠션 · 펠트.
 * 펠트 위에 우리나라 윤곽선을 분필 선처럼 긋고, 매장 디렉터리(인허가 자료까지 1만 5천여 곳)를 공 하나씩으로 찍는다(shared/storeDots — 공은 캔버스).
 * 캐롬(대대 · 중대)이 우리 당구라 포켓은 없다. 다이아몬드는 긴 레일 일곱 · 짧은 레일 셋(실제 대대의 표시 자리).
 *
 *   StoreTableMap     매장 찾기 화면 — 세로 당구대. 시도를 누르면 그 지역만(다시 누르면 전체). 고른 지역의 공은 노란 공.
 *   StoreTableBanner  당구 홈 '둘러보기' — 가로 당구대. 왼쪽 글 · 오른쪽 지도, 누르면 매장 찾기.
 *
 * 윤곽선 자료는 출처 기록이 없어 **화면에만** 쓴다(golf/lib/koreaOutline 머리말 — 서버가 그리는 카드에는 싣지 않는다).
 * 점은 지어내지 않는다 — 받은 것이 없으면 지도 대신 아무것도 그리지 않는다(빈 당구대를 '0곳'처럼 보이게 두지 않는다).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { KOREA_MAP_PATHS } from "@/golf/data/koreaMapData";
import { latLngToOutline } from "@/golf/lib/koreaOutline";
import { NICE_KM, OUTLINE_TO_STORE_REGION, nearDistText, nearViewKm, spreadBalls, storeRegionCounts, unpackStoreDots, type StoreDot } from "@shared/storeDots";
import { nearRateCompare, rate10Ok, rateLanes, ratePos, rateVerdict, type NearRateCompare } from "@shared/storeNearRates";

export const STORE_DOTS_KEY = ["/api/hiq/listings/dots"] as const;
export function useStoreDots() {
    const q = useQuery<unknown>({ queryKey: STORE_DOTS_KEY, staleTime: 30 * 60_000 });
    const dots = useMemo(() => unpackStoreDots(q.data), [q.data]);
    return { dots, isLoading: q.isLoading };
}

const LAND = Object.entries(KOREA_MAP_PATHS);
/** 뭍만 — 울릉 칸과 바다 여백을 덜어 낸 틀(지금 산 위 지도와 같은 틀) */
const VIEW = { x: 52, y: 20, w: 400, h: 620 };
const FELT = "radial-gradient(ellipse 85% 60% at 50% 32%, #18875A 0%, #0F6E4A 48%, #0A5134 100%)";
const RAIL = "linear-gradient(150deg, #7A4E2B 0%, #5A381E 38%, #3E2614 72%, #2C1A0D 100%)";
const IVORY = "#F6F1E3", YELLOW = "#F4C542";

/** 레일의 다이아몬드 — 긴 쪽 일곱(1/8 … 7/8) · 짧은 쪽 셋(1/4 · 2/4 · 3/4) */
function Diamonds({ portrait, rail }: { portrait: boolean; rail: number }) {
    const long = [1, 2, 3, 4, 5, 6, 7].map((k) => `${(k / 8) * 100}%`);
    const short = [1, 2, 3].map((k) => `${(k / 4) * 100}%`);
    const d = (key: string, style: React.CSSProperties) => (
        <span key={key} aria-hidden className="absolute h-[6px] w-[6px] rotate-45 rounded-[1px]" style={{ background: "#EFE6CF", boxShadow: "0 0 0 0.5px #00000040, 0 1px 1px #00000055", marginLeft: -3, marginTop: -3, ...style }} />
    );
    const c = rail / 2;
    const [side, end] = portrait ? [long, short] : [short, long];
    return (
        <>
            {side.map((y, i) => d(`l${i}`, { left: c, top: y }))}
            {side.map((y, i) => d(`r${i}`, { right: c - 3, top: y, marginLeft: 0 }))}
            {end.map((x, i) => d(`t${i}`, { top: c, left: x }))}
            {end.map((x, i) => d(`b${i}`, { bottom: c - 3, left: x, marginTop: 0 }))}
        </>
    );
}

/** 당구대 껍데기 — 레일(나무) · 쿠션(진녹) · 펠트 */
function Table({ portrait, rail = 12, children, className = "" }: { portrait: boolean; rail?: number; children: React.ReactNode; className?: string }) {
    return (
        <div className={`relative rounded-[24px] ${className}`} style={{ background: RAIL, padding: rail, boxShadow: "0 10px 22px rgba(30,18,8,0.28), inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -2px 0 rgba(0,0,0,0.25)" }}>
            <Diamonds portrait={portrait} rail={rail} />
            <div className="rounded-[14px] p-[4px]" style={{ background: "#0A3D28", boxShadow: "inset 0 2px 4px rgba(0,0,0,0.45)" }}>
                <div className="relative h-full overflow-hidden rounded-[11px]" style={{ background: FELT }}>{children}</div>
            </div>
        </div>
    );
}

/**
 * 펠트 위의 지도 — 분필 선 윤곽(SVG · 누르면 그 시도) 위에 공(캔버스 한 장).
 * 2026-10-19 인허가 자료로 점이 1만 5천 개가 되자 SVG 원 3만 개(그림자 + 공)가 됐고, 느린 폰(CPU 6배 느리게)에서 시도 칩을 누르면
 * 3.5초 뒤에야 바뀌었다 — 공은 캔버스에 그리고, 윤곽선만 SVG 로 남긴다. 그리는 셈(viewBox 맞추기)은 SVG 의 기본(가운데 맞춰 넣기)과 같다.
 */
function FeltMap({ dots, region, onPick, r = 3.1, label }: { dots: readonly StoreDot[]; region?: string; onPick?: (region: string) => void; r?: number; label: string }) {
    const pts = useMemo(() => dots.map((d) => ({ d, xy: latLngToOutline(d.lat, d.lng) })), [dots]);
    const wrap = useRef<HTMLDivElement>(null), cv = useRef<HTMLCanvasElement>(null);
    const [size, setSize] = useState<{ w: number; h: number } | null>(null);
    useEffect(() => {
        const el = wrap.current;
        if (!el) return;
        const measure = () => { const b = el.getBoundingClientRect(); if (b.width > 0 && b.height > 0) setSize({ w: Math.round(b.width), h: Math.round(b.height) }); };
        measure();
        if (typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    useEffect(() => {
        const c = cv.current;
        if (!c || !size) return;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        c.width = Math.round(size.w * dpr); c.height = Math.round(size.h * dpr);
        const g = c.getContext("2d");
        if (!g) return;
        // SVG viewBox 를 가운데 맞춰 넣는 것과 같은 셈
        const k = Math.min(size.w / VIEW.w, size.h / VIEW.h);
        const ox = (size.w - VIEW.w * k) / 2 - VIEW.x * k, oy = (size.h - VIEW.h * k) / 2 - VIEW.y * k;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, size.w, size.h);
        const on = (d: StoreDot) => !!region && d.region === region;
        const rr = (d: StoreDot) => (on(d) ? r + 0.5 : r) * k;
        // 공 그림자 — 등이 위에 있다
        g.fillStyle = "#000000";
        for (const { d, xy } of pts) {
            g.globalAlpha = 0.25 * (region && !on(d) ? 0.4 : 1);
            g.beginPath(); g.arc(ox + (xy[0] + 1.1) * k, oy + (xy[1] + 1.5) * k, rr(d), 0, Math.PI * 2); g.fill();
        }
        // 공 — 고른 지역은 맨 위에 노란 공
        g.lineWidth = 0.55 * k; g.strokeStyle = "#0A3D28";
        const draw = (sel: boolean) => {
            for (const { d, xy } of pts) {
                if (on(d) !== sel) continue;
                g.globalAlpha = region && !sel ? 0.32 : 0.95;
                g.fillStyle = sel ? YELLOW : IVORY;
                g.beginPath(); g.arc(ox + xy[0] * k, oy + xy[1] * k, rr(d), 0, Math.PI * 2); g.fill(); g.stroke();
            }
        };
        draw(false); if (region) draw(true);
        g.globalAlpha = 1;
    }, [pts, region, r, size]);
    return (
        <div ref={wrap} className="relative h-full w-full">
            <svg viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} className="block h-full w-full" role="img" aria-label={label}>
                <g strokeLinejoin="round">
                    {LAND.map(([id, path]) => {
                        const name = OUTLINE_TO_STORE_REGION[id];
                        const sel = !!region && name === region;
                        return (
                            <path key={id} d={path} fill={sel ? "#F4C5422E" : "#FFFFFF12"} stroke={sel ? YELLOW : "#FFFFFF3D"} strokeWidth={sel ? 1.6 : 0.9}
                                onClick={onPick && name ? () => onPick(sel ? "" : name) : undefined}
                                style={onPick ? { cursor: "pointer" } : undefined}
                                data-region={name} />
                        );
                    })}
                </g>
            </svg>
            <canvas ref={cv} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" data-testid="store-dots-canvas" />
        </div>
    );
}

/** 매장 찾기 — 세로 당구대 + 옆의 지역별 막대(지도의 범례이자 고르기). 시도나 줄을 누르면 그 지역(onPick("") = 전체).
 *  폭 360 에서 지도를 꽉 채우면 높이가 500px 을 넘어 목록이 첫 화면에서 사라졌다 — 지도는 57%, 옆에 지역별 일곱 줄. */
export function StoreTableMap({ region, onPick, copy }: {
    region: string;
    onPick: (region: string) => void;
    copy: { all: (n: number) => string; inRegion: (r: string, n: number) => string; legend: string; hint: string; byRegion: string; others: (n: number) => string };
}) {
    const { dots } = useStoreDots();
    const counts = useMemo(() => storeRegionCounts(dots), [dots]);
    if (dots.length < 50) return null;
    const n = region ? counts.find((c) => c.region === region)?.count ?? 0 : dots.length;
    const head = region ? copy.inRegion(region, n) : copy.all(dots.length);
    const TOP = 7;
    // 고른 지역이 일곱 줄 밖이면 마지막 줄을 그 지역으로 — 고른 것이 늘 보이게
    const top = counts.slice(0, TOP);
    const picked = region && !top.some((c) => c.region === region) ? counts.find((c) => c.region === region) : undefined;
    const rows = picked ? [...top.slice(0, TOP - 1), picked] : top;
    const rest = dots.length - rows.reduce((a, c) => a + c.count, 0);
    const max = counts[0]?.count ?? 1;
    return (
        <div className="mb-4" data-testid="store-table-map">
            <div className="flex items-start gap-3">
                <Table portrait rail={9} className="w-[57%] max-w-[300px] shrink-0">
                    <div className="relative" style={{ aspectRatio: `${VIEW.w} / ${VIEW.h}` }}>
                        <FeltMap dots={dots} region={region} onPick={onPick} r={4.4} label={head} />
                        {/* 지금 보는 범위 — 펠트 위의 작은 패 */}
                        <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-[12px] font-bold tabular-nums" style={{ background: "#062B1CCC", color: region ? YELLOW : IVORY, boxShadow: "inset 0 0 0 1px #FFFFFF1F" }} data-testid="store-table-head">{head}</span>
                    </div>
                </Table>
                <div className="min-w-0 flex-1 pt-0.5">
                    <p className="mb-1.5 text-[12px] font-semibold text-black/55">{copy.byRegion}</p>
                    <ol className="space-y-1">
                        {rows.map((c) => {
                            const sel = c.region === region;
                            return (
                                <li key={c.region}>
                                    <button type="button" onClick={() => onPick(sel ? "" : c.region)} aria-pressed={sel} className="block w-full rounded-lg px-1.5 py-1 text-left active:bg-black/[0.04]" style={sel ? { background: "#F4C54229" } : undefined} data-testid="store-table-row">
                                        <span className="flex items-baseline justify-between gap-1.5">
                                            <span className={`truncate text-[13px] ${sel ? "font-bold text-ink-1" : "font-semibold text-ink-2"}`}>{c.region}</span>
                                            <span className="shrink-0 text-[12.5px] font-bold tabular-nums text-ink-1">{c.count.toLocaleString()}</span>
                                        </span>
                                        <span className="mt-1 block h-[5px] overflow-hidden rounded-full bg-black/[0.06]" aria-hidden>
                                            <span className="block h-full rounded-full" style={{ width: `${Math.max(4, (c.count / max) * 100)}%`, background: sel ? "#D9A514" : "#0F6E4A" }} />
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ol>
                    {rest > 0 && <p className="mt-1.5 px-1.5 text-[12px] font-medium text-black/55 tabular-nums">{copy.others(rest)}</p>}
                </div>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-[12px] font-medium text-black/55">
                {/* 범례 — 펠트 한 조각 위의 공 하나(밝은 바탕에서 빈 동그라미로 읽히지 않게) */}
                <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px]" style={{ background: "#0F6E4A" }} aria-hidden>
                    <span className="h-[6px] w-[6px] rounded-full" style={{ background: IVORY }} />
                </span>
                <span className="break-keep">{copy.legend} · {copy.hint}</span>
            </p>
        </div>
    );
}

/** 당구 홈 '둘러보기' — 가로 당구대. 왼쪽 글 · 오른쪽 지도 */
export function StoreTableBanner({ onOpen, copy }: { onOpen: () => void; copy: { title: string; count: (n: number) => string; sub: string; cta: string } }) {
    const { dots, isLoading } = useStoreDots();
    if (!isLoading && dots.length < 50) return null;
    return (
        <button type="button" onClick={onOpen} className="block w-full text-left active:scale-[0.99] transition-transform" data-testid="store-table-banner" data-track-as="홈 전국 당구장 지도">
            <Table portrait={false} rail={11}>
                <div className="flex h-[212px] items-stretch">
                    <div className="relative flex min-w-0 flex-1 flex-col justify-between py-4 pl-4 pr-1">
                        <div>
                            <p className="text-[13px] font-semibold" style={{ color: "#F6F1E3B3" }}>{copy.title}</p>
                            <p className="mt-0.5 text-[30px] font-bold leading-none tracking-tight tabular-nums" style={{ color: IVORY }}>
                                {dots.length ? copy.count(dots.length) : <span className="inline-block h-[30px] w-24 animate-pulse rounded-md bg-white/10 align-middle" />}
                            </p>
                            <p className="mt-2 text-[12.5px] leading-snug break-keep" style={{ color: "#F6F1E3B3" }}>{copy.sub}</p>
                        </div>
                        <span className="inline-flex h-9 w-fit items-center gap-1 rounded-full px-3.5 text-[13px] font-bold" style={{ background: IVORY, color: "#0A3D28", boxShadow: "0 2px 0 #00000033" }}>{copy.cta} <span aria-hidden>→</span></span>
                        {/* 공 둘 — 장식(캐롬의 노란 공 · 빨간 공) */}
                        <span aria-hidden className="pointer-events-none absolute bottom-4 right-3 flex gap-1.5">
                            <span className="h-[14px] w-[14px] rounded-full" style={{ background: "radial-gradient(circle at 35% 30%, #FFF6C8 0%, #F4C542 45%, #B88A12 100%)", boxShadow: "1px 2px 2px #00000055" }} />
                            <span className="h-[14px] w-[14px] rounded-full" style={{ background: "radial-gradient(circle at 35% 30%, #FFB4A8 0%, #D8352A 45%, #8C1810 100%)", boxShadow: "1px 2px 2px #00000055" }} />
                        </span>
                    </div>
                    <div className="h-full shrink-0 py-1.5 pr-1.5" style={{ aspectRatio: `${VIEW.w} / ${VIEW.h}` }}>
                        {dots.length > 0 && <FeltMap dots={dots} r={4.2} label={copy.count(dots.length)} />}
                    </div>
                </div>
            </Table>
        </button>
    );
}

/* ── 매장 상세 '이 근처'(2026-10-17) — 이 매장을 가운데 둔 가로 당구대(2:1, 실제 대대의 비) ──
 * 이 매장 = 빨간 공, 가까운 다섯 곳 = 번호 붙은 노란 공(아래 목록의 번호와 같다), 판 안의 그 밖 매장 = 상아색 공.
 * 판의 크기는 다섯째 곳까지 들어가게(1.2 ~ 30km). 윤곽선은 그리지 않는다 — 이 크기에서는 시도 경계가 뜻이 없다. 거리는 직선이다.
 * 자리 셈은 그 자리의 평면 어림(경도 1° = 111.32km · cos 위도, 위도 1° = 110.57km) — 30km 안에서는 충분히 맞다. */
export interface NearStore { code: string; name: string; address: string; distanceKm: number | null; lat?: number | null; lng?: number | null; rate10Large?: number | null; rate10Medium?: number | null }

/** 10분 요금 견주기 문구 — 매장 상세가 5개 언어로 넘긴다 */
export interface NearRateCopy {
    title: string; large: string; medium: string; avg: string; note: string; same: string;
    lower: (amount: string) => string; higher: (amount: string) => string;
    range: (count: number, lo: string, hi: string) => string;
    won: (n: number) => string;
}

export function StoreNearTable({ code, lat, lng, onOpen, copy, mine, rates }: {
    code: string; lat: number; lng: number;
    onOpen: (code: string) => void;
    copy: { title: string; here: string; near: string; note: string; within50: string };
    /** 이 매장의 10분 요금 — 있으면 큐대 위에 빨간 공으로 */
    mine?: { large: number | null; medium: number | null };
    rates?: NearRateCopy;
}) {
    const km = (n: number) => nearDistText(n, copy.within50);
    const key = `/api/hiq/listings?lat=${lat.toFixed(5)}&lng=${lng.toFixed(5)}&limit=6`;
    const q = useQuery<{ rows?: NearStore[] }>({ queryKey: [key], staleTime: 30 * 60_000 });
    const near = (Array.isArray(q.data?.rows) ? q.data!.rows : []).filter((r) => r.code !== code && r.distanceKm != null).slice(0, 5);
    if (!near.length) return null;
    const R = nearViewKm(near);
    const kx = 111.32 * Math.cos((lat * Math.PI) / 180), ky = 110.57;
    const xy = (a: number, b: number): [number, number] => [(b - lng) * kx, (lat - a) * ky];
    const inView = ([x, y]: [number, number]) => Math.abs(x) <= 2 * R && Math.abs(y) <= R;
    // 그 밖의 매장(상아 공)은 그리지 않는다 — 오너 10/17 "흰공은 빼자": 이 매장과 가까운 다섯 곳만
    const bar = NICE_KM.filter((k) => k <= R * 0.7).pop() ?? 0.2;
    const ry = R * 0.105;
    const shown = near.filter((n) => n.lat != null && n.lng != null && inView(xy(n.lat, n.lng)));
    // 민 공이 판 밖으로 나가지 않게 — 레일 안쪽에 붙인다(표시만)
    const spots = spreadBalls(shown.map((n) => xy(n.lat!, n.lng!)), ry, { x: 0, y: 0, r: ry * 1.15 }, { hw: 2 * R - ry * 1.3, hh: R - ry * 1.3 });
    return (
        <div className="mb-4 rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)]" data-testid="store-near">
            <p className="mb-2.5 text-[12px] font-bold text-black/55">{copy.title}</p>
            <Table portrait={false} rail={9}>
                <div className="relative" style={{ aspectRatio: "2 / 1" }}>
                    <svg viewBox={`${-2 * R} ${-R} ${4 * R} ${2 * R}`} className="block h-full w-full" role="img" aria-label={`${copy.here} · ${copy.near} ${near.length}`}>
                        {/* 번호가 큰 것부터 그려 작은 번호가 위에 오게 */}
                        {shown.map((n, k) => ({ n, k })).reverse().map(({ n, k }) => {
                            const i = near.indexOf(n);
                            const [x, y] = spots[k];
                            return (
                                <g key={n.code}>
                                    <circle cx={x + ry * 0.3} cy={y + ry * 0.45} r={ry} fill="#00000047" />
                                    <circle cx={x} cy={y} r={ry} fill={YELLOW} stroke="#7A5A08" strokeWidth={ry * 0.1} />
                                    <text x={x} y={y} dy="0.36em" textAnchor="middle" fontSize={ry * 1.15} fontWeight={700} fill="#3A2A04">{i + 1}</text>
                                </g>
                            );
                        })}
                        {/* 이 매장 — 빨간 공(가장 위) */}
                        <circle cx={ry * 0.3} cy={ry * 0.5} r={ry * 1.15} fill="#00000052" />
                        <circle cx={0} cy={0} r={ry * 1.15} fill="url(#near-red)" stroke="#6E120B" strokeWidth={ry * 0.1} />
                        <defs>
                            <radialGradient id="near-red" cx="35%" cy="30%" r="75%"><stop offset="0%" stopColor="#FFB4A8" /><stop offset="45%" stopColor="#D8352A" /><stop offset="100%" stopColor="#8C1810" /></radialGradient>
                        </defs>
                    </svg>
                    {/* 축척 — 펠트 위 왼쪽 아래 */}
                    {/* 상자는 왼쪽 10px 부터 오른쪽 끝까지 — 막대 폭은 펠트 폭에 대한 비율이라 (100% + 10px) 에 곱한다 */}
                    <span className="pointer-events-none absolute bottom-2 left-2.5 right-0 flex flex-col items-start gap-1" aria-hidden data-testid="store-near-scale">
                        {/* 공이 몰린 자리에 얹혀도 읽히게 어두운 패에 */}
                        <span className="rounded-full px-1.5 py-0.5 text-[12px] font-semibold leading-none tabular-nums" style={{ color: IVORY, background: "#062B1CCC" }}>{km(bar)}</span>
                        <span className="block h-[3px] rounded-full" style={{ width: `calc((100% + 10px) * ${(bar / (4 * R)).toFixed(4)})`, background: IVORY, boxShadow: "0 0 0 1px #062B1C99" }} />
                    </span>
                </div>
            </Table>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-medium text-black/50">
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: "#D8352A" }} aria-hidden />{copy.here}</span>
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: YELLOW, boxShadow: "0 0 0 1px #7A5A08" }} aria-hidden />{copy.near}</span>
            </p>
            <ol className="mt-3 divide-y divide-black/[0.06]">
                {near.map((n, i) => (
                    <li key={n.code}>
                        <button type="button" onClick={() => onOpen(n.code)} className="flex w-full items-center gap-3 py-2.5 text-left active:opacity-70" data-testid="store-near-row">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold" style={{ background: YELLOW, color: "#3A2A04", boxShadow: "inset 0 0 0 1px #7A5A0866" }}>{i + 1}</span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[14.5px] font-bold text-ink-1">{n.name}</span>
                                <span className="mt-0.5 block truncate text-[12px] text-black/55">{n.address}</span>
                            </span>
                            <span className="flex shrink-0 flex-col items-end">
                                <span className="text-[13px] font-bold tabular-nums text-brand">{km(n.distanceKm!)}</span>
                                {rates && rowRate(n, rates) && <span className="mt-0.5 text-[12px] tabular-nums text-black/50" data-testid="store-near-rate">{rowRate(n, rates)}</span>}
                            </span>
                            <span className="shrink-0 text-[16px] text-black/25" aria-hidden>›</span>
                        </button>
                    </li>
                ))}
            </ol>
            <p className="mt-1 text-[12px] text-black/40">{copy.note}</p>
            {rates && <NearRates near={near} mine={mine} copy={rates} />}
        </div>
    );
}

/** 목록 줄의 요금 — 대대가 있으면 대대, 없으면 중대(믿을 만한 값만) */
function rowRate(n: NearStore, c: NearRateCopy): string | null {
    if (rate10Ok(n.rate10Large)) return `${c.large} ${c.won(n.rate10Large)}`;
    if (rate10Ok(n.rate10Medium)) return `${c.medium} ${c.won(n.rate10Medium)}`;
    return null;
}

/** 10분 요금 견주기(2026-10-18) — 대대 · 중대 각각, 근처 값이 모자라면 그 줄은 없다 */
function NearRates({ near, mine, copy }: { near: NearStore[]; mine?: { large: number | null; medium: number | null }; copy: NearRateCopy }) {
    const rows = [
        { label: copy.large, c: nearRateCompare(mine?.large, near.map((n) => n.rate10Large)) },
        { label: copy.medium, c: nearRateCompare(mine?.medium, near.map((n) => n.rate10Medium)) },
    ].filter((r): r is { label: string; c: NearRateCompare } => r.c != null);
    if (!rows.length) return null;
    return (
        <div className="mt-4 border-t border-black/[0.06] pt-3.5" data-testid="store-near-rates">
            <p className="mb-1 text-[12px] font-bold text-black/55">{copy.title}</p>
            <div className="space-y-4">
                {rows.map((r) => <RateCue key={r.label} label={r.label} c={r.c} copy={copy} />)}
            </div>
            <p className="mt-3 text-[12px] text-black/40">{copy.note}</p>
        </div>
    );
}

const BALL = 22, MINE_BALL = 26, CUE_H = 9, AVG_ROOM = 18;
const YELLOW_BALL = "radial-gradient(circle at 35% 30%, #FFF4C2 0%, #F4C542 46%, #B8890F 100%)";
const RED_BALL = "radial-gradient(circle at 35% 30%, #FFB4A8 0%, #D8352A 46%, #8C1810 100%)";
/** 큐대 — 왼쪽 손잡이(굵게)에서 오른쪽 팁(가늘게)으로. 끝에 흰 페룰과 파란 초크 */
const CUE = "linear-gradient(90deg, #2C1A0D 0%, #4A2E17 17%, #6B4424 17.5%, #B5844E 58%, #E0BC86 94%, #F3EAD6 94%, #F3EAD6 98.4%, #3D6FB5 98.4%)";

/** 큐대 눈금 하나 — 왼쪽이 싸고 오른쪽이 비싸다(양 끝 글은 눈금 끝 — 최소 600원 폭). 노란 번호 공 = 목록의 번호, 빨간 공 = 이 매장, 점선 = 근처 평균 */
function RateCue({ label, c, copy }: { label: string; c: NearRateCompare; copy: NearRateCopy }) {
    const ref = useRef<HTMLDivElement>(null);
    const [w, setW] = useState(320);
    useEffect(() => {
        const el = ref.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver(([e]) => { if (e?.contentRect.width) setW(e.contentRect.width); });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    // 이 매장을 맨 먼저 — 늘 큐대 바로 위 층
    const items = [
        ...(c.mine != null ? [{ key: "mine", v: c.mine, i: -1 }] : []),
        ...c.points.map((p) => ({ key: `n${p.i}`, v: p.v, i: p.i })),
    ];
    const pos = items.map((it) => ratePos(it.v, c.from, c.to));
    const gap = ((BALL + 2) / Math.max(w, 160)) * 100;
    const lanes = rateLanes(pos, gap);
    const size = items.map((it) => (it.i < 0 ? MINE_BALL : BALL));
    // 아래층부터 쌓는다 — 바로 밑에 겹치는 공(빨간 공은 더 크다)의 꼭대기에 살짝 얹는다
    const bottom: number[] = [];
    for (const k of items.map((_, k) => k).sort((a, b) => lanes[a] - lanes[b])) {
        bottom[k] = items.reduce((b, _, j) => (lanes[j] < lanes[k] && Math.abs(pos[j] - pos[k]) < gap ? Math.max(b, bottom[j] + size[j] - 3) : b), CUE_H - 1);
    }
    const h = AVG_ROOM + Math.max(...items.map((_, k) => bottom[k] + size[k]));
    const avgAt = ratePos(c.avg, c.from, c.to);
    const v = c.diff != null ? rateVerdict(c.diff) : null;
    const amount = c.diff != null ? copy.won(Math.abs(c.diff)) : "";
    const headline = v == null ? copy.range(c.points.length, copy.won(c.lo), copy.won(c.hi))
        : v === "same" ? copy.same : v === "lower" ? copy.lower(amount) : copy.higher(amount);
    return (
        <div data-testid="store-near-rate-cue">
            <div className="flex items-baseline justify-between gap-2">
                <p className="min-w-0 text-[13.5px] font-semibold leading-snug text-ink-1 break-keep">
                    <span className="mr-1.5 inline-block rounded-md bg-black/[0.05] px-1.5 py-0.5 text-[12px] font-bold text-black/60">{label}</span>
                    {headline}
                </p>
                <span className="shrink-0 text-[12px] tabular-nums text-black/50">{copy.avg} {copy.won(c.avg)}</span>
            </div>
            <div ref={ref} className="relative mt-1.5" style={{ height: h }} role="img" aria-label={`${label} — ${headline}. ${copy.avg} ${copy.won(c.avg)}`}>
                {/* 근처 평균 — 점선과 이름표(양 끝에서는 안쪽으로 붙인다) */}
                <span className="absolute w-0 border-l border-dashed border-[#3D6FB5]/70" style={{ left: `${avgAt}%`, top: AVG_ROOM - 2, bottom: CUE_H }} aria-hidden />
                <span className="absolute top-0 whitespace-nowrap text-[12px] font-semibold leading-none text-[#3D6FB5]" aria-hidden
                    style={{ left: `${Math.min(Math.max(avgAt, 9), 91)}%`, transform: "translateX(-50%)" }}>{copy.avg}</span>
                {/* 공 — 번호가 큰 것부터 그려 작은 번호가 위에, 이 매장은 맨 위 */}
                {items.map((it, k) => ({ it, k })).reverse().sort((a, b) => (a.it.i < 0 ? 1 : 0) - (b.it.i < 0 ? 1 : 0)).map(({ it, k }) => {
                    const mineBall = it.i < 0;
                    return (
                        <span key={it.key} aria-hidden
                            className="absolute flex items-center justify-center rounded-full text-[12px] font-bold leading-none tabular-nums"
                            style={{
                                width: size[k], height: size[k], left: `calc(${pos[k]}% - ${size[k] / 2}px)`, bottom: bottom[k],
                                background: mineBall ? RED_BALL : YELLOW_BALL, color: "#3A2A04",
                                boxShadow: mineBall ? "0 2px 4px #00000052, 0 0 0 2px #fff" : "0 2px 3px #00000040, inset 0 0 0 1px #7A5A0855",
                            }}>
                            {mineBall ? null : it.i + 1}
                        </span>
                    );
                })}
                <span className="absolute inset-x-0 bottom-0 block rounded-l-sm" style={{ height: CUE_H, background: CUE, clipPath: "polygon(0 0, 100% 28%, 100% 72%, 0 100%)" }} aria-hidden />
            </div>
            <div className="mt-1 flex justify-between text-[12px] tabular-nums text-black/50" aria-hidden>
                <span>{copy.won(c.from)}</span><span>{copy.won(c.to)}</span>
            </div>
        </div>
    );
}
