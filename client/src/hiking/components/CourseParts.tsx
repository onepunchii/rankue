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
import { POI_COLOR } from "../theme";
import type { MountainPoi } from "../lib/api";

const W = 340, H = 150, PAD_X = 6, TOP = 34, BOTTOM = 22;

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
        const x = (k: number) => PAD_X + (k / km) * (W - PAD_X * 2);
        const y = (e: number) => H - BOTTOM - ((e - lo) / span) * (H - TOP - BOTTOM);
        const path = line.map((p, i) => `${i ? "L" : "M"}${x(p[3]).toFixed(1)} ${y(p[2]).toFixed(1)}`).join(" ");
        return { km, lo, hi, x, y, path };
    }, [line]);
    if (!g) return null;
    const here: LinePoint | null = now != null && now > 0 ? [0, 0, eleAtKm(line, now), Math.min(now, g.km)] : null;
    const walked = here ? [...line.filter((p) => p[3] <= here[3]), here] : null;
    return (
        <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label={`높낮이 — 해발 ${Math.round(g.lo)}m 에서 ${Math.round(g.hi)}m, ${g.km.toFixed(1)}km`} style={{ display: "block", width: "100%" }} data-testid="course-profile">
            <path d={`${g.path} L${g.x(g.km).toFixed(1)} ${H - BOTTOM} L${g.x(0).toFixed(1)} ${H - BOTTOM} Z`} fill="#1F556024" />
            <path d={g.path} fill="none" stroke="#1F556080" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
            {walked && <path d={walked.map((p, i) => `${i ? "L" : "M"}${g.x(p[3]).toFixed(1)} ${g.y(p[2]).toFixed(1)}`).join(" ")} fill="none" stroke="#F28C6A" strokeWidth="3.2" strokeLinejoin="round" strokeLinecap="round" />}
            {pois.filter((p) => p.km != null).map((p) => (
                <circle key={p.id} cx={g.x(p.km!)} cy={g.y(eleAtKm(line, p.km!))} r="3.6" fill={POI_COLOR[p.kind] ?? "#8A979B"} stroke="#F4EFE3" strokeWidth="1.4" />
            ))}
            {summitKm != null && (
                <g transform={`translate(${g.x(summitKm).toFixed(1)} ${g.y(eleAtKm(line, summitKm)).toFixed(1)})`} data-testid="profile-summit">
                    <path d="M0 0 V-13" stroke="#0E2A33" strokeWidth="1.3" /><path d="M0 -13 l8 2.6 l-8 2.8 Z" fill="#F28C6A" stroke="#0E2A33" strokeWidth="0.8" />
                </g>
            )}
            {now != null && now > 0 && <circle cx={g.x(Math.min(now, g.km))} cy={g.y(eleAtKm(line, now))} r="6" fill="#F28C6A" stroke="#0E2A33" strokeWidth="2" />}
            <text x={PAD_X} y={H - 5} fontSize="13.5" fill="#0E2A33B3">출발 {Math.round(line[0][2]).toLocaleString("en-US")}m</text>
            <text x={W - PAD_X} y={H - 5} fontSize="13.5" fill="#0E2A33B3" textAnchor="end">{g.km.toFixed(1)}km</text>
            <text x={W - PAD_X} y={14} fontSize="13.5" fill="#0E2A33B3" textAnchor="end">가장 높은 곳 {Math.round(g.hi).toLocaleString("en-US")}m</text>
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
        return { at, path: line.map((p, i) => { const [x, y] = at(p[0], p[1]); return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`; }).join(" ") };
    }, [line]);
    if (!g) return null;
    const a = g.at(line[0][0], line[0][1]), b = g.at(line[line.length - 1][0], line[line.length - 1][1]);
    const top = summitKm != null ? line.reduce((best, p) => (Math.abs(p[3] - summitKm) < Math.abs(best[3] - summitKm) ? p : best), line[0]) : null;
    const t = top ? g.at(top[0], top[1]) : null;
    return (
        <svg viewBox={`0 0 ${S} ${S}`} className={className} role="img" aria-label="길의 모양 — 위가 북쪽" style={{ display: "block", width: "100%" }} data-testid="course-trace">
            <path d={g.path} fill="none" stroke="#1F556040" strokeWidth="7" strokeLinejoin="round" strokeLinecap="round" />
            <path d={g.path} fill="none" stroke="#1F5560" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
            {pois.map((p) => { const [x, y] = g.at(p.lat, p.lng); return <circle key={p.id} cx={x} cy={y} r="3" fill={POI_COLOR[p.kind] ?? "#8A979B"} stroke="#F4EFE3" strokeWidth="1.2" />; })}
            <circle cx={a[0]} cy={a[1]} r="5.5" fill="#F4EFE3" stroke="#0E2A33" strokeWidth="2" />
            <circle cx={b[0]} cy={b[1]} r="5.5" fill="#0E2A33" stroke="#F4EFE3" strokeWidth="1.5" />
            {t && <path d={`M${t[0] - 7} ${t[1] + 4} L${t[0]} ${t[1] - 8} L${t[0] + 7} ${t[1] + 4} Z`} fill="#F28C6A" stroke="#0E2A33" strokeWidth="1.2" strokeLinejoin="round" />}
            <g transform={`translate(${S - 16} 16)`} aria-hidden><path d="M0 7 L0 -7 M-3.5 -2.5 L0 -7 L3.5 -2.5" fill="none" stroke="#0E2A3399" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></g>
        </svg>
    );
}
