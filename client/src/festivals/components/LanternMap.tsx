/**
 * 축제 지도(2026-10-21) — 밤바다 위 한반도에 축제를 등불로 놓는다. 지금 열리는 축제는 산호빛으로 숨 쉬고, 곧 열리는 축제는 옅은 등불.
 * 시도를 고르면 그 시도로 당겨 들어간다(그림 상자를 0.45초에 걸쳐 옮긴다 — 폭은 로그로 옮겨 확대가 고르게 느껴지게).
 * 등불을 누르면 가까운 것(24px 안)을 잡아 onPick. 축제 한 곳 화면에서는 focus 로 그 자리를 당겨 보고, marks 로 가는 길에 들를 곳을 같이 놓는다.
 *
 * 윤곽선은 골프의 점 지도 자료(golf/data/koreaMapData)를 **화면에서만** 빌린다 — 출처 기록이 없는 자료라 서버가 밖으로 내보내는 그림에는 쓰지 않는다.
 * 점의 자리는 좌표 그대로(latLngToOutline). 꾸밈(빛 · 숨쉬기 · 바다 이름)만 그린다. 움직임을 줄이는 설정이면 숨쉬기와 옮기기를 끈다.
 * ⚠️ 리터럴 색만. 글자는 화면에서 12px 이상(그림 단위 = 12 × 한 픽셀의 그림 단위).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { KOREA_MAP_PATHS } from "@/golf/data/koreaMapData";
import { latLngToOutline } from "@/golf/lib/koreaOutline";
import { festivalState, type FestivalRow, type FestivalState } from "@shared/festivals";

interface Box { x: number; y: number; w: number; h: number }
/** 가로:세로 = 4:5 */
const ASPECT = 0.8;
const FULL: Box = { x: 40, y: 15, w: 436, h: 640 };
const REGION_KEY: Readonly<Record<string, string>> = {
    서울: "Seoul", 경기: "Gyeonggi", 인천: "Incheon", 강원: "Gangwon", 충북: "North Chungcheong", 충남: "South Chungcheong", 대전: "Daejeon", 세종: "Sejong",
    전북: "North Jeolla", 전남: "South Jeolla", 광주: "Gwangju", 경북: "North Gyeongsang", 경남: "South Gyeongsang", 대구: "Daegu", 울산: "Ulsan", 부산: "Busan", 제주: "Jeju",
};
/** 시도 이름 자리(위경도) — 넓게 볼 때 도 이름과 열린 축제 수를 적는다. 광역시는 좁아서 넓게 볼 때 숨긴다 */
const PLACES: readonly { name: string; lat: number; lng: number; city?: boolean }[] = [
    { name: "경기", lat: 37.28, lng: 127.42 }, { name: "강원", lat: 37.72, lng: 128.32 }, { name: "충북", lat: 36.78, lng: 127.72 }, { name: "충남", lat: 36.52, lng: 126.82 },
    { name: "전북", lat: 35.72, lng: 127.12 }, { name: "전남", lat: 34.88, lng: 126.92 }, { name: "경북", lat: 36.38, lng: 128.82 }, { name: "경남", lat: 35.36, lng: 128.22 }, { name: "제주", lat: 33.27, lng: 126.56 },
    { name: "서울", lat: 37.56, lng: 126.98, city: true }, { name: "인천", lat: 37.46, lng: 126.66, city: true }, { name: "대전", lat: 36.34, lng: 127.39, city: true }, { name: "대구", lat: 35.84, lng: 128.57, city: true },
    { name: "광주", lat: 35.15, lng: 126.85, city: true }, { name: "부산", lat: 35.16, lng: 129.06, city: true }, { name: "울산", lat: 35.55, lng: 129.28, city: true }, { name: "세종", lat: 36.56, lng: 127.26, city: true },
];
const SEAS: readonly { name: string; lat: number; lng: number }[] = [{ name: "동해", lat: 36.55, lng: 130.05 }, { name: "서해", lat: 35.95, lng: 125.95 }, { name: "남해", lat: 33.95, lng: 128.25 }];

export interface LanternMark { lat: number; lng: number; label: string; kind: "mountain" | "golf" | "fishing" }

/** 상자를 가로:세로에 맞게 넓힌다(가운데 그대로) */
const fit = (b: Box): Box => {
    if (b.w / b.h > ASPECT) { const h = b.w / ASPECT; return { x: b.x, y: b.y - (h - b.h) / 2, w: b.w, h }; }
    const w = b.h * ASPECT;
    return { x: b.x - (w - b.w) / 2, y: b.y, w, h: b.h };
};
const ease = (t: number) => 1 - Math.pow(1 - t, 3);
const ORDER: Record<FestivalState, number> = { ended: 0, soon: 1, now: 2 };
/** 숨쉬기를 등불마다 어긋나게 — 번호로 정하는 늦춤(새로 그려도 같다) */
const delayOf = (id: string) => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 2600; return h; };
const MARK_COLOR: Record<LanternMark["kind"], string> = { mountain: "#F6D9A8", golf: "#8FD3A7", fishing: "#8EC5FF" };

export function LanternMap({ items, today, region = null, picked = null, onPick, focus, marks = [], className, label = "전국 축제 지도" }: {
    items: readonly FestivalRow[];
    today: string;
    /** 고른 시도 — 그 시도로 당겨 들어간다 */
    region?: string | null;
    picked?: string | null;
    onPick?: (id: string | null) => void;
    /** 이 자리로 당겨 본다(축제 한 곳 화면) */
    focus?: { lat: number; lng: number } | null;
    /** 같이 놓을 곳(가는 길에 들를 산 · 골프장 · 낚시터) */
    marks?: readonly LanternMark[];
    className?: string;
    label?: string;
}) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const pathRefs = useRef<Record<string, SVGPathElement | null>>({});
    const [px, setPx] = useState(360);
    const [ready, setReady] = useState(false);
    useEffect(() => {
        const el = wrapRef.current;
        if (!el) return;
        setPx(el.clientWidth || 360);
        setReady(true);
        if (typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver(() => setPx(el.clientWidth || 360));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const spots = useMemo(() => items.map((f) => { const [x, y] = latLngToOutline(f.lat, f.lng); return { f, x, y, st: festivalState(f, today).state }; })
        .sort((a, b) => ORDER[a.st] - ORDER[b.st]), [items, today]);
    const markSpots = useMemo(() => marks.map((m) => { const [x, y] = latLngToOutline(m.lat, m.lng); return { ...m, x, y }; }), [marks]);

    // 가야 할 그림 상자 — 한 곳 · 시도 · 전국
    const target = useMemo<Box>(() => {
        if (focus) { const [x, y] = latLngToOutline(focus.lat, focus.lng); return fit({ x: x - 36, y: y - 45, w: 72, h: 90 }); }
        if (!region) return fit(FULL);
        let b: Box | null = null;
        try { const bb = pathRefs.current[REGION_KEY[region] ?? ""]?.getBBox(); if (bb && bb.width > 0) b = { x: bb.x, y: bb.y, w: bb.width, h: bb.height }; } catch { /* 아직 안 그려졌다 */ }
        if (!b) {
            const pts = spots.filter((s) => s.f.region === region);
            if (!pts.length) return fit(FULL);
            const xs = pts.map((s) => s.x), ys = pts.map((s) => s.y);
            b = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
        }
        const pad = Math.max(b.w, b.h) * 0.14 + 4;
        const box = { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 };
        // 광역시 하나는 너무 작다 — 둘레가 조금 보이게
        if (box.w < 56) { box.x -= (56 - box.w) / 2; box.w = 56; }
        return fit(box);
        // ready: 윤곽선이 그려진 뒤 다시 잰다
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [region, focus?.lat, focus?.lng, ready, spots]);

    const [vb, setVb] = useState<Box>(target);
    const vbRef = useRef(vb);
    vbRef.current = vb;
    useEffect(() => {
        const from = vbRef.current, to = target;
        if (Math.abs(from.x - to.x) + Math.abs(from.y - to.y) + Math.abs(from.w - to.w) < 0.5) return;
        const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        if (reduce) { setVb(to); return; }
        let raf = 0;
        const t0 = performance.now();
        const fc = { x: from.x + from.w / 2, y: from.y + from.h / 2 }, tc = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
        const step = (t: number) => {
            const k = ease(Math.min(1, (t - t0) / 450));
            const w = Math.exp(Math.log(from.w) + (Math.log(to.w) - Math.log(from.w)) * k), h = w / ASPECT;
            const cx = fc.x + (tc.x - fc.x) * k, cy = fc.y + (tc.y - fc.y) * k;
            setVb({ x: cx - w / 2, y: cy - h / 2, w, h });
            if (k < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, [target]);

    /** 한 픽셀이 그림 단위로 얼마인가 — 크기 · 글자를 화면 픽셀로 맞춘다 */
    const k = vb.w / Math.max(200, px);
    const zoomed = vb.w < 300;
    const counts = useMemo(() => {
        const m = new Map<string, number>();
        for (const s of spots) if (s.st !== "ended" && s.f.region) m.set(s.f.region, (m.get(s.f.region) ?? 0) + 1);
        return m;
    }, [spots]);

    // 이름표 — 한 번에 자리를 잡는다(2026-10-21 화면 확인: 오른쪽 끝에서 잘리고, 산 · 낚시터 이름이 서로 겹쳤다).
    // 축제(알약)가 먼저 — 오른쪽, 넘치면 왼쪽. 그다음 표시(산 · 골프장 · 낚시터)의 이름 — 아래 · 위 · 오른쪽 · 왼쪽 중 비는 곳, 없으면 이름 없이 둔다.
    // 등불 · 표시 자체의 자리도 막아 둔다(이름이 다른 점을 덮지 않게)
    const { labels, markLabels } = useMemo(() => {
        type Bx = { x: number; y: number; w: number; h: number };
        const placed: Bx[] = [];
        const hit = (b: Bx) => placed.some((o) => !(b.x > o.x + o.w || b.x + b.w < o.x || b.y > o.y + o.h || b.y + b.h < o.y));
        const inside = (b: Bx) => b.x >= vb.x + 2 * k && b.x + b.w <= vb.x + vb.w - 2 * k && b.y >= vb.y + 2 * k && b.y + b.h <= vb.y + vb.h - 2 * k;
        const out: { id: string; x: number; y: number; w: number; text: string }[] = [];
        const marksOut: { i: number; x: number; y: number; anchor: "start" | "middle" | "end"; text: string }[] = [];
        if (!zoomed && !focus) return { labels: out, markLabels: marksOut };
        const vis = (x: number, y: number) => x > vb.x && x < vb.x + vb.w && y > vb.y && y < vb.y + vb.h;
        const cand = [...spots].filter((s) => s.st !== "ended" && vis(s.x, s.y))
            .sort((a, b) => (a.f.id === picked ? -1 : b.f.id === picked ? 1 : 0) || ORDER[b.st] - ORDER[a.st] || a.f.start.localeCompare(b.f.start));
        // 점 자리를 먼저 막는다
        for (const s of cand) placed.push({ x: s.x - 5 * k, y: s.y - 5 * k, w: 10 * k, h: 10 * k });
        for (const m of markSpots) placed.push({ x: m.x - 5 * k, y: m.y - 5 * k, w: 10 * k, h: 10 * k });
        for (const s of cand) {
            if (out.length >= (focus ? 6 : 10)) break;
            const text = s.f.title.length > 12 ? `${s.f.title.slice(0, 11)}…` : s.f.title;
            const w = (text.length * 12.4 + 14) * k, h = 22 * k, y = s.y - h / 2;
            // 오른쪽 · 왼쪽 · (이름이 지도 반보다 길면) 위 · 아래 가운데
            const opts = [{ x: s.x + 7 * k, y }, { x: s.x - 7 * k - w, y }, { x: s.x - w / 2, y: s.y - 10 * k - h }, { x: s.x - w / 2, y: s.y + 10 * k }].map((o) => ({ ...o, w, h })).filter(inside);
            const b = opts.find((o) => !hit(o));
            if (!b) continue;
            placed.push(b);
            out.push({ id: s.f.id, x: b.x, y: b.y, w, text });
        }
        markSpots.forEach((m, i) => {
            if (!vis(m.x, m.y)) return;
            const text = m.label.length > 8 ? `${m.label.slice(0, 7)}…` : m.label;
            const w = text.length * 12.2 * k, h = 15 * k;
            const tries: { b: Bx; x: number; y: number; anchor: "start" | "middle" | "end" }[] = [
                { b: { x: m.x - w / 2, y: m.y + 6 * k, w, h }, x: m.x, y: m.y + 18 * k, anchor: "middle" },
                { b: { x: m.x - w / 2, y: m.y - 21 * k, w, h }, x: m.x, y: m.y - 9 * k, anchor: "middle" },
                { b: { x: m.x + 7 * k, y: m.y - h / 2, w, h }, x: m.x + 7 * k, y: m.y + 4.5 * k, anchor: "start" },
                { b: { x: m.x - 7 * k - w, y: m.y - h / 2, w, h }, x: m.x - 7 * k, y: m.y + 4.5 * k, anchor: "end" },
            ];
            const t = tries.find((o) => inside(o.b) && !hit(o.b));
            if (!t) return;
            placed.push(t.b);
            marksOut.push({ i, x: t.x, y: t.y, anchor: t.anchor, text });
        });
        return { labels: out, markLabels: marksOut };
    }, [spots, markSpots, zoomed, focus, vb.x, vb.y, vb.w, vb.h, k, picked]);

    const tap = (e: React.MouseEvent<SVGSVGElement>) => {
        if (!onPick) return;
        const r = e.currentTarget.getBoundingClientRect();
        const x = vb.x + ((e.clientX - r.left) * vb.w) / r.width, y = vb.y + ((e.clientY - r.top) * vb.h) / r.height;
        let best: string | null = null, bd = (24 * k) ** 2;
        for (const s of spots) {
            if (s.st === "ended") continue;
            const d = (s.x - x) ** 2 + (s.y - y) ** 2;
            if (d < bd) { bd = d; best = s.f.id; }
        }
        onPick(best);
    };
    const nowN = spots.filter((s) => s.st === "now").length, soonN = spots.filter((s) => s.st === "soon").length;

    return (
        <div ref={wrapRef} className={`relative overflow-hidden rounded-2xl ${className ?? ""}`} style={{ aspectRatio: "4 / 5", background: "radial-gradient(120% 75% at 50% 0%, #143A44 0%, #0B1F26 72%)", boxShadow: "inset 0 0 0 1px #FFFFFF14" }} data-testid="lantern-map">
            <style>{`@keyframes lt-breathe{0%,100%{opacity:.55;transform:scale(.82)}50%{opacity:1;transform:scale(1.14)}}.lt-pulse{transform-box:fill-box;transform-origin:center;animation:lt-breathe 2.6s ease-in-out infinite}@media (prefers-reduced-motion:reduce){.lt-pulse{animation:none}}`}</style>
            <svg viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} className={`absolute inset-0 h-full w-full ${onPick ? "cursor-pointer" : ""}`} onClick={onPick ? tap : undefined} role="img" aria-label={label}>
                <defs>
                    <radialGradient id="lt-now"><stop offset="0" stopColor="#FFE1CF" stopOpacity="0.95" /><stop offset="0.32" stopColor="#F28C6A" stopOpacity="0.6" /><stop offset="1" stopColor="#F28C6A" stopOpacity="0" /></radialGradient>
                    <radialGradient id="lt-soon"><stop offset="0" stopColor="#F6D9A8" stopOpacity="0.75" /><stop offset="1" stopColor="#F6D9A8" stopOpacity="0" /></radialGradient>
                </defs>
                {SEAS.map((s) => { const [x, y] = latLngToOutline(s.lat, s.lng); return <text key={s.name} x={x} y={y} fontSize={12 * k} fill="#F4EFE333" textAnchor="middle" letterSpacing={6 * k}>{s.name}</text>; })}
                <g>
                    {Object.entries(KOREA_MAP_PATHS).map(([key, d]) => (
                        <path key={key} ref={(el) => { pathRefs.current[key] = el; }} d={d} fill={region && REGION_KEY[region] === key ? "#1D4C55" : "#13363F"} stroke={region && REGION_KEY[region] === key ? "#F6D9A866" : "#2B5E66"} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
                    ))}
                </g>
                {!zoomed && !focus && PLACES.filter((p) => !p.city).map((p) => {
                    const [x, y] = latLngToOutline(p.lat, p.lng);
                    const n = counts.get(p.name) ?? 0;
                    return <text key={p.name} x={x} y={y} fontSize={12 * k} fill="#F4EFE366" textAnchor="middle">{p.name}{n ? ` ${n}` : ""}</text>;
                })}
                {markSpots.map((m, i) => (
                    <g key={`m${i}`}>
                        {m.kind === "mountain"
                            ? <path d={`M${m.x} ${m.y - 5 * k} L${m.x + 4.6 * k} ${m.y + 3.4 * k} L${m.x - 4.6 * k} ${m.y + 3.4 * k} Z`} fill={MARK_COLOR.mountain} opacity={0.9} />
                            : <rect x={m.x - 3.2 * k} y={m.y - 3.2 * k} width={6.4 * k} height={6.4 * k} rx={1.2 * k} fill={MARK_COLOR[m.kind]} opacity={0.9} transform={m.kind === "fishing" ? `rotate(45 ${m.x} ${m.y})` : undefined} />}
                    </g>
                ))}
                {spots.map(({ f, x, y, st }) => {
                    if (st === "ended") return <circle key={f.id} cx={x} cy={y} r={1.6 * k} fill="#F4EFE3" opacity={0.25} />;
                    const sel = picked === f.id || (focus != null && Math.abs(f.lat - focus.lat) < 1e-6 && Math.abs(f.lng - focus.lng) < 1e-6);
                    const glow = (st === "now" ? 13 : 8.5) * k * (sel ? 1.4 : 1);
                    return (
                        <g key={f.id}>
                            <circle cx={x} cy={y} r={glow} fill={`url(#lt-${st})`} className={st === "now" ? "lt-pulse" : undefined} style={st === "now" ? { animationDelay: `-${delayOf(f.id)}ms` } : undefined} />
                            <circle cx={x} cy={y} r={(st === "now" ? 2.7 : 2.1) * k} fill={st === "now" ? "#FFEDE2" : "#F6D9A8"} />
                            {sel && <circle cx={x} cy={y} r={8 * k} fill="none" stroke="#F4EFE3" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />}
                        </g>
                    );
                })}
                {markLabels.map((l) => (
                    <text key={`ml${l.i}`} x={l.x} y={l.y} fontSize={12 * k} fill={MARK_COLOR[markSpots[l.i].kind]} textAnchor={l.anchor} pointerEvents="none"
                        stroke="#0B1F26" strokeWidth={3 * k} strokeLinejoin="round" paintOrder="stroke">{l.text}</text>
                ))}
                {labels.map((l) => (
                    <g key={`l${l.id}`} pointerEvents="none">
                        <rect x={l.x} y={l.y} width={l.w} height={22 * k} rx={11 * k} fill={l.id === picked ? "#F28C6A" : "#0B1F26D9"} stroke="#F4EFE326" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
                        <text x={l.x + 7 * k} y={l.y + 15.5 * k} fontSize={12 * k} fill={l.id === picked ? "#2A1208" : "#F4EFE3"} fontWeight={l.id === picked ? 600 : 400}>{l.text}</text>
                    </g>
                ))}
            </svg>
            {/* 범례는 오른쪽 아래(바다) — 왼쪽 아래는 제주의 등불을 덮었다 */}
            {!focus && (
                <div className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-3 rounded-full bg-[#0B1F26CC] px-3 py-1.5 text-[12px] text-[#F4EFE3CC] backdrop-blur-sm">
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#F28C6A]" style={{ boxShadow: "0 0 8px #F28C6A" }} />지금 {nowN}</span>
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#F6D9A8]" />곧 {soonN}</span>
                </div>
            )}
        </div>
    );
}
