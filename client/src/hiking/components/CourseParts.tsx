/**
 * 코스의 그림 둘(2026-10-13) — 높낮이(CourseProfile)와 길의 모양(CourseTrace). 종이(상아색) 위에 그린다.
 *
 *  - 높낮이: 가로는 걸은 거리, 세로는 해발. 길 위의 지점(갈림길 · 위험 · 대피소 …)이 그 자리에 색 점으로 놓이고, 정상에는 깃발.
 *            now(km)를 주면 거기까지를 산호빛으로 칠한다 — 산행 중 '길 띠'가 같은 그림을 쓴다.
 *  - 길의 모양: 지도를 깔지 않고 선만. 위가 북쪽이다. 출발 · 도착 · 정상을 표시한다.
 * 셈은 shared/hikingGeo. ⚠️ 리터럴 색만. 글자는 viewBox 가 화면보다 좁아질 일이 없게 12 단위 이상으로.
 */
import { useMemo } from "react";
import { eleAtKm, type LinePoint } from "@shared/hikingGeo";
import { altitudeTicks, kmTicks, slopeRuns } from "@shared/hikingCourseLook";
import { POI_COLOR } from "../theme";
import type { MountainPoi } from "../lib/api";

const W = 340, H = 176, PAD_L = 8, PAD_R = 8, TOP = 30, BOTTOM = 26;
/** 기울기의 색 — 완만 · 가파름 · 매우 가파름. 종이 위에서 읽히는 값 */
export const SLOPE_COLOR = ["#1F5560", "#C98A1E", "#D8492F"] as const;

export function CourseProfile({ line, pois = [], summitKm, now, className }: {
    line: readonly LinePoint[];
    pois?: readonly Pick<MountainPoi, "id" | "kind" | "km">[];
    summitKm?: number | null;
    /** 지금까지 걸은 거리(km) — 산행 중 */
    now?: number | null;
    className?: string;
}) {
    const g = useMemo(() => {
        if (line.length < 2) return null;
        const km = line[line.length - 1][3];
        let lo = Infinity, hi = -Infinity;
        for (const p of line) { if (p[2] < lo) lo = p[2]; if (p[2] > hi) hi = p[2]; }
        const span = Math.max(hi - lo, 40);
        const x = (k: number) => PAD_L + (k / km) * (W - PAD_L - PAD_R);
        const y = (e: number) => H - BOTTOM - ((e - lo) / span) * (H - TOP - BOTTOM);
        const pt = (p: LinePoint) => `${x(p[3]).toFixed(1)} ${y(p[2]).toFixed(1)}`;
        const path = line.map((p, i) => `${i ? "L" : "M"}${pt(p)}`).join(" ");
        // 기울기가 같은 토막마다 한 선 — 가파른 구간이 색으로 드러난다
        const runs = slopeRuns(line).map(([c, i0, i1]) => ({ c, d: line.slice(i0, i1 + 1).map((p, i) => `${i ? "L" : "M"}${pt(p)}`).join(" ") }));
        return { km, lo, hi, x, y, path, runs, alt: altitudeTicks(lo + span * 0.08, hi - span * 0.04), kms: kmTicks(km) };
    }, [line]);
    if (!g) return null;
    const here: LinePoint | null = now != null && now > 0 ? [0, 0, eleAtKm(line, now), Math.min(now, g.km)] : null;
    const walked = here ? [...line.filter((p) => p[3] <= here[3]), here] : null;
    const base = H - BOTTOM;
    const top = summitKm != null ? { x: g.x(summitKm), y: g.y(eleAtKm(line, summitKm)) } : null;
    return (
        <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label={`높낮이 — 해발 ${Math.round(g.lo)}m 에서 ${Math.round(g.hi)}m, ${g.km.toFixed(1)}km`} style={{ display: "block", width: "100%" }} data-testid="course-profile">
            <defs>
                <linearGradient id="hk-prof-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1F5560" stopOpacity="0.34" /><stop offset="100%" stopColor="#1F5560" stopOpacity="0.04" /></linearGradient>
            </defs>
            {/* 높이의 눈금 */}
            {g.alt.map((v) => (
                <g key={`a${v}`}>
                    <path d={`M${PAD_L} ${g.y(v).toFixed(1)} H${W - PAD_R}`} stroke="#0E2A33" strokeOpacity="0.1" strokeWidth="1" strokeDasharray="2 4" />
                    <text x={PAD_L + 2} y={g.y(v) - 3} fontSize="12" fill="#0E2A33" fillOpacity="0.5">{v.toLocaleString("en-US")}m</text>
                </g>
            ))}
            <path d={`${g.path} L${g.x(g.km).toFixed(1)} ${base} L${g.x(0).toFixed(1)} ${base} Z`} fill="url(#hk-prof-fill)" />
            <path d={`M${PAD_L} ${base} H${W - PAD_R}`} stroke="#0E2A33" strokeOpacity="0.35" strokeWidth="1" />
            {/* 거리의 눈금 */}
            {g.kms.map((v) => (
                <g key={`k${v}`}>
                    <path d={`M${g.x(v).toFixed(1)} ${base} v4`} stroke="#0E2A33" strokeOpacity="0.4" strokeWidth="1" />
                    <text x={g.x(v)} y={base + 16} textAnchor="middle" fontSize="12" fill="#0E2A33" fillOpacity="0.55">{v}</text>
                </g>
            ))}
            <path d={g.path} fill="none" stroke="#F4EFE3" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />
            {g.runs.map((r, i) => <path key={i} d={r.d} fill="none" stroke={SLOPE_COLOR[r.c]} strokeWidth="2.8" strokeLinejoin="round" strokeLinecap="round" />)}
            {walked && <path d={walked.map((p, i) => `${i ? "L" : "M"}${g.x(p[3]).toFixed(1)} ${g.y(p[2]).toFixed(1)}`).join(" ")} fill="none" stroke="#F28C6A" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />}
            {pois.filter((p) => p.km != null).map((p) => (
                <circle key={p.id} cx={g.x(p.km!)} cy={g.y(eleAtKm(line, p.km!))} r="3.8" fill={POI_COLOR[p.kind] ?? "#8A979B"} stroke="#F4EFE3" strokeWidth="1.5" />
            ))}
            {/* 출발 · 도착 */}
            <circle cx={g.x(0)} cy={g.y(line[0][2])} r="4.6" fill="#F4EFE3" stroke="#0E2A33" strokeWidth="1.8" />
            <circle cx={g.x(g.km)} cy={g.y(line[line.length - 1][2])} r="4.6" fill="#0E2A33" stroke="#F4EFE3" strokeWidth="1.4" />
            {top && (
                <g transform={`translate(${top.x.toFixed(1)} ${top.y.toFixed(1)})`} data-testid="profile-summit">
                    <path d="M0 0 V-15" stroke="#0E2A33" strokeWidth="1.4" /><path d="M0 -15 l9 3 l-9 3.2 Z" fill="#F28C6A" stroke="#0E2A33" strokeWidth="0.8" />
                    <text x={top.x > W - 70 ? -5 : 12} y={-9} textAnchor={top.x > W - 70 ? "end" : "start"} fontSize="12.5" fontWeight="600" fill="#0E2A33" stroke="#F4EFE3" strokeWidth="3" paintOrder="stroke">정상</text>
                </g>
            )}
            {now != null && now > 0 && <circle cx={g.x(Math.min(now, g.km))} cy={g.y(eleAtKm(line, now))} r="6" fill="#F28C6A" stroke="#0E2A33" strokeWidth="2" />}
            <text x={PAD_L} y={H - 3} fontSize="12" fill="#0E2A33" fillOpacity="0.62">출발 {Math.round(line[0][2]).toLocaleString("en-US")}m</text>
            <text x={W - PAD_R} y={H - 3} fontSize="12" fill="#0E2A33" fillOpacity="0.62" textAnchor="end">{g.km.toFixed(1)}km</text>
            {/* 가장 높은 곳 — 정상 깃발과 겹치지 않는 쪽에 */}
            <text x={top && top.x > W / 2 ? PAD_L : W - PAD_R} y={13} fontSize="12.5" fill="#0E2A33" fillOpacity="0.72" textAnchor={top && top.x > W / 2 ? "start" : "end"}>가장 높은 곳 {Math.round(g.hi).toLocaleString("en-US")}m</text>
        </svg>
    );
}

const S = 220, M = 18;
/** 길의 모양 — 위가 북쪽. 지도 없이 선만 */
export function CourseTrace({ line, summitKm, pois = [], className }: {
    line: readonly LinePoint[];
    summitKm?: number | null;
    pois?: readonly Pick<MountainPoi, "id" | "kind" | "lat" | "lng">[];
    className?: string;
}) {
    const g = useMemo(() => {
        if (line.length < 2) return null;
        const lat0 = line[0][0], cos = Math.cos((lat0 * Math.PI) / 180);
        const px = (lat: number, lng: number): [number, number] => [(lng - line[0][1]) * cos, -(lat - lat0)];
        const pts = line.map((p) => px(p[0], p[1]));
        const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
        const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
        const k = (S - M * 2) / Math.max(maxX - minX, maxY - minY, 1e-6);
        const ox = (S - (maxX - minX) * k) / 2, oy = (S - (maxY - minY) * k) / 2;
        const at = (lat: number, lng: number): [number, number] => { const [x, y] = px(lat, lng); return [ox + (x - minX) * k, oy + (y - minY) * k]; };
        const seg = (from: number, to: number) => line.slice(from, to + 1).map((p, i) => { const [x, y] = at(p[0], p[1]); return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`; }).join(" ");
        return { at, path: seg(0, line.length - 1), runs: slopeRuns(line).map(([c, i0, i1]) => ({ c, d: seg(i0, i1) })) };
    }, [line]);
    if (!g) return null;
    const a = g.at(line[0][0], line[0][1]), b = g.at(line[line.length - 1][0], line[line.length - 1][1]);
    const top = summitKm != null ? line.reduce((best, p) => (Math.abs(p[3] - summitKm) < Math.abs(best[3] - summitKm) ? p : best), line[0]) : null;
    const t = top ? g.at(top[0], top[1]) : null;
    return (
        <svg viewBox={`0 0 ${S} ${S}`} className={className} role="img" aria-label="길의 모양 — 위가 북쪽" style={{ display: "block", width: "100%" }} data-testid="course-trace">
            {/* 종이 위의 땅 결(장식) — 정상을 감싸는 고리 */}
            {t && [26, 50, 76].map((r) => <circle key={r} cx={t[0]} cy={t[1]} r={r} fill="none" stroke="#1F5560" strokeOpacity="0.1" strokeWidth="1.6" strokeDasharray="3 5" />)}
            <path d={g.path} fill="none" stroke="#F4EFE3" strokeWidth="9" strokeLinejoin="round" strokeLinecap="round" />
            <path d={g.path} fill="none" stroke="#1F556033" strokeWidth="7" strokeLinejoin="round" strokeLinecap="round" />
            {g.runs.map((r, i) => <path key={i} d={r.d} fill="none" stroke={SLOPE_COLOR[r.c]} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />)}
            {pois.map((p) => { const [x, y] = g.at(p.lat, p.lng); return <circle key={p.id} cx={x} cy={y} r="3" fill={POI_COLOR[p.kind] ?? "#8A979B"} stroke="#F4EFE3" strokeWidth="1.2" />; })}
            <circle cx={a[0]} cy={a[1]} r="5.5" fill="#F4EFE3" stroke="#0E2A33" strokeWidth="2" />
            <circle cx={b[0]} cy={b[1]} r="5.5" fill="#0E2A33" stroke="#F4EFE3" strokeWidth="1.5" />
            {t && <path d={`M${t[0] - 7} ${t[1] + 4} L${t[0]} ${t[1] - 8} L${t[0] + 7} ${t[1] + 4} Z`} fill="#F28C6A" stroke="#0E2A33" strokeWidth="1.2" strokeLinejoin="round" />}
            <g transform={`translate(${S - 16} 16)`} aria-hidden><path d="M0 7 L0 -7 M-3.5 -2.5 L0 -7 L3.5 -2.5" fill="none" stroke="#0E2A33B3" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></g>
        </svg>
    );
}
