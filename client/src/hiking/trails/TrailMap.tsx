/**
 * 코리아둘레길 지도(2026-10-21) — 한반도 둘레를 도는 길 넷을 코스마다의 선으로(두루누비 GPX 를 줄인 굵은 선). 동해 해파랑 · 남해 남파랑 · 서해 서해랑 · 접경 DMZ.
 * 길을 고르면 그 길로 당겨 들어가고(0.45초 · 폭은 로그로 옮긴다), 당겨 들어가면 코스 시작점에 번호를 단다(겹치면 건너뛴다).
 * 공개 자료에 없는 코스는 비어 있다 — 없는 길을 긋지 않는다(빈 데가 '아직 공개되지 않은 코스'다).
 * 선을 누르면(18px 안 가장 가까운 코스) onPick. 윤곽선은 골프 점 지도의 것을 화면에서만 빌린다(서버 그림에는 쓰지 않는다).
 * ⚠️ 리터럴 색만(등산의 색). 글자는 화면에서 12px 이상.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { KOREA_MAP_PATHS } from "@/golf/data/koreaMapData";
import { latLngToOutline } from "@/golf/lib/koreaOutline";
import { TRAIL_ROUTES, type TrailCourseSummary, type TrailRouteId } from "@shared/koreaTrails";

interface Box { x: number; y: number; w: number; h: number }
const ASPECT = 0.8;
/** 전체 — 위를 조금 더(접경의 DMZ 평화의 길 이름이 지도 위 끝에서 잘렸다) */
const FULL: Box = { x: 40, y: -6, w: 436, h: 661 };
const fit = (b: Box): Box => {
    if (b.w / b.h > ASPECT) { const h = b.w / ASPECT; return { x: b.x, y: b.y - (h - b.h) / 2, w: b.w, h }; }
    const w = b.h * ASPECT;
    return { x: b.x - (w - b.w) / 2, y: b.y, w, h: b.h };
};
const ease = (t: number) => 1 - Math.pow(1 - t, 3);
const COLOR: Record<TrailRouteId, string> = Object.fromEntries(TRAIL_ROUTES.map((r) => [r.id, r.color])) as Record<TrailRouteId, string>;
/** 넓게 볼 때 길 이름을 놓는 자리(바다 쪽) */
const NAME_AT: Record<TrailRouteId, { lat: number; lng: number; anchor: "start" | "middle" | "end" }> = {
    haeparang: { lat: 36.55, lng: 129.62, anchor: "start" },
    namparang: { lat: 34.25, lng: 127.75, anchor: "middle" },
    seohaerang: { lat: 35.95, lng: 126.35, anchor: "end" },
    dmz: { lat: 38.47, lng: 127.55, anchor: "middle" },
};

export function TrailMap({ courses, focus = null, picked = null, onPick, numbers = false, className, label = "코리아둘레길 지도" }: {
    courses: readonly TrailCourseSummary[];
    /** 고른 길 — 그 길로 당겨 들어가고 나머지는 옅게 */
    focus?: TrailRouteId | null;
    picked?: string | null;
    onPick?: (c: TrailCourseSummary) => void;
    /** 당겨 들어갔을 때 코스 번호를 단다 */
    numbers?: boolean;
    className?: string;
    label?: string;
}) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const [px, setPx] = useState(360);
    useEffect(() => {
        const el = wrapRef.current;
        if (!el) return;
        setPx(el.clientWidth || 360);
        if (typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver(() => setPx(el.clientWidth || 360));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const lines = useMemo(() => courses.map((c) => {
        const pts = c.coarse.map(([la, lo]) => latLngToOutline(la, lo));
        return { c, pts, d: pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ") };
    }), [courses]);

    const target = useMemo<Box>(() => {
        const sel = focus ? lines.filter((l) => l.c.route === focus) : [];
        if (!sel.length) return fit(FULL);
        const xs = sel.flatMap((l) => l.pts.map((p) => p[0])), ys = sel.flatMap((l) => l.pts.map((p) => p[1]));
        const b = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
        const pad = Math.max(b.w, b.h) * 0.1 + 6;
        return fit({ x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 });
    }, [focus, lines]);

    const [vb, setVb] = useState<Box>(target);
    const vbRef = useRef(vb);
    vbRef.current = vb;
    useEffect(() => {
        const from = vbRef.current, to = target;
        if (Math.abs(from.x - to.x) + Math.abs(from.y - to.y) + Math.abs(from.w - to.w) < 0.5) return;
        if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setVb(to); return; }
        let raf = 0;
        const t0 = performance.now();
        const fc = { x: from.x + from.w / 2, y: from.y + from.h / 2 }, tc = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
        const step = (t: number) => {
            const k = ease(Math.min(1, (t - t0) / 450));
            const w = Math.exp(Math.log(from.w) + (Math.log(to.w) - Math.log(from.w)) * k), h = w / ASPECT;
            setVb({ x: fc.x + (tc.x - fc.x) * k - w / 2, y: fc.y + (tc.y - fc.y) * k - h / 2, w, h });
            if (k < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, [target]);

    const k = vb.w / Math.max(200, px);
    const zoomed = vb.w < 300;
    // 코스 번호 — 고른 길의 본 코스만, 시작점에. 화면에서 18px 안에 이미 단 번호가 있으면 건너뛴다
    const nums = useMemo(() => {
        if (!numbers || !focus || !zoomed) return [] as { id: string; x: number; y: number; t: string }[];
        const out: { id: string; x: number; y: number; t: string }[] = [];
        for (const l of lines) {
            if (l.c.route !== focus || l.c.sub != null || !l.pts.length) continue;
            const [x, y] = l.pts[0];
            if (out.some((o) => Math.hypot(o.x - x, o.y - y) < 18 * k)) continue;
            out.push({ id: l.c.id, x, y, t: String(l.c.no) });
        }
        return out;
    }, [numbers, focus, zoomed, lines, k]);

    const tap = (e: React.MouseEvent<SVGSVGElement>) => {
        if (!onPick) return;
        const r = e.currentTarget.getBoundingClientRect();
        const x = vb.x + ((e.clientX - r.left) * vb.w) / r.width, y = vb.y + ((e.clientY - r.top) * vb.h) / r.height;
        let best: TrailCourseSummary | null = null, bd = (18 * k) ** 2;
        for (const l of lines) {
            if (focus && l.c.route !== focus) continue;
            for (const [px2, py2] of l.pts) { const d = (px2 - x) ** 2 + (py2 - y) ** 2; if (d < bd) { bd = d; best = l.c; } }
        }
        if (best) onPick(best);
    };

    return (
        <div ref={wrapRef} className={`relative overflow-hidden rounded-2xl ${className ?? ""}`} style={{ aspectRatio: "4 / 5", background: "radial-gradient(120% 75% at 50% 0%, #143A44 0%, #0B1F26 72%)", boxShadow: "inset 0 0 0 1px #FFFFFF14" }} data-testid="trail-map">
            <svg viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} className={`absolute inset-0 h-full w-full ${onPick ? "cursor-pointer" : ""}`} onClick={onPick ? tap : undefined} role="img" aria-label={label}>
                <g>{Object.entries(KOREA_MAP_PATHS).map(([key, d]) => <path key={key} d={d} fill="#13363F" stroke="#2B5E66" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />)}</g>
                {/* 빛 — 선 밑에 넓고 옅게 */}
                <g fill="none" strokeLinecap="round" strokeLinejoin="round" pointerEvents="none">
                    {lines.map((l) => <path key={`g${l.c.id}`} d={l.d} stroke={COLOR[l.c.route]} strokeOpacity={focus && l.c.route !== focus ? 0.05 : 0.22} strokeWidth={7 * k} />)}
                </g>
                <g fill="none" strokeLinecap="round" strokeLinejoin="round">
                    {lines.map((l) => {
                        const dim = focus && l.c.route !== focus;
                        return <path key={l.c.id} d={l.d} stroke={COLOR[l.c.route]} strokeOpacity={dim ? 0.28 : 1} strokeWidth={(picked === l.c.id ? 3.4 : 2.2) * k} data-trail={l.c.route} />;
                    })}
                </g>
                {picked && lines.filter((l) => l.c.id === picked).map((l) => (
                    <g key={`p${l.c.id}`} pointerEvents="none">
                        <path d={l.d} fill="none" stroke="#F4EFE3" strokeOpacity={0.9} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
                        {l.pts[0] && <circle cx={l.pts[0][0]} cy={l.pts[0][1]} r={4.5 * k} fill="#F4EFE3" />}
                    </g>
                ))}
                {!zoomed && TRAIL_ROUTES.map((r) => {
                    const at = NAME_AT[r.id];
                    const [x, y] = latLngToOutline(at.lat, at.lng);
                    return <text key={r.id} x={x} y={y} fontSize={13 * k} fontWeight={600} fill={r.color} fillOpacity={focus && focus !== r.id ? 0.35 : 0.95} textAnchor={at.anchor}
                        stroke="#0B1F26" strokeWidth={3 * k} paintOrder="stroke" pointerEvents="none">{r.name}</text>;
                })}
                {nums.map((n) => (
                    <g key={`n${n.id}`} pointerEvents="none">
                        <circle cx={n.x} cy={n.y} r={9 * k} fill={focus ? COLOR[focus] : "#F4EFE3"} stroke="#0B1F26" strokeWidth={1.5 * k} />
                        <text x={n.x} y={n.y + 4.2 * k} fontSize={12 * k} fontWeight={600} fill="#0B1F26" textAnchor="middle">{n.t}</text>
                    </g>
                ))}
            </svg>
        </div>
    );
}
