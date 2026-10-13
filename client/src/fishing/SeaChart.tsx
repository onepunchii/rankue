/**
 * 바다 지도(2026-10-14 오너: "등산처럼 지도 이런 것도 제작해서 … 우와 소리 나게") — 종이 해도 위에 뭍과 바다 일곱 구역.
 *
 * 풍랑특보가 걸린 구역은 색이 바뀌고(색마다 뜻 하나), 구역을 누르면 그 바다를 고른다. 관측소의 수온을 받으면 그 자리에 숫자를 적는다.
 * 등산의 '내 산 지도'와 같은 손: 종이색 · 뭍의 그림자와 빗금 · 물결 무늬 · 위경도 눈금 · 방위표. 글자는 **화면에서 12px 아래로 내려가지 않게**
 * 실제 너비를 재서 키운다.
 *
 * 뭍의 윤곽선은 골프의 점 지도가 쓰는 것(golf/data/koreaMapData)을 **화면에서만** 빌려 쓴다(출처 기록이 없는 자료 — 밖으로 내보내는 그림에는 쓰지 않는다).
 * 그 윤곽선에는 울릉도 · 독도가 없어서 동해에 칸을 따로 그려 넣는다.
 * ⚠️ 구역의 네모는 **어림**이다(기상청 해상 광역의 실제 경계선이 아니다) — 화면에도 그렇게 적는다. 특보가 어디에 걸렸는지는 글(아래 줄)이 말한다.
 * ⚠️ 리터럴 색만.
 */
import { useLayoutEffect, useRef, useState } from "react";
import { KOREA_MAP_PATHS } from "@/golf/data/koreaMapData";
import { latLngToOutline } from "@/golf/lib/koreaOutline";
import { SEA_AREAS, type SeaArea, type SeaState } from "@shared/fishingSea";

const VIEW = { x: -44, y: -6, w: 544, h: 692 } as const;
const LAND = Object.values(KOREA_MAP_PATHS);
const INSET = { x: 392, y: 190, w: 104, h: 60 } as const;

/** 구역의 네모(위경도 — 어림) · 이름을 적는 자리 */
const ZONES: Readonly<Record<string, { lat: [number, number]; lng: [number, number]; at: [number, number] }>> = {
    "west-mid": { lat: [36.05, 37.85], lng: [124.9, 126.9], at: [37.0, 125.62] },
    "west-south": { lat: [34.8, 36.0], lng: [124.9, 126.6], at: [35.32, 125.58] },
    "south-west": { lat: [33.8, 34.75], lng: [126.05, 127.75], at: [34.08, 127.16] },
    "south-east": { lat: [34.2, 35.15], lng: [127.8, 129.35], at: [34.45, 128.72] },
    jeju: { lat: [32.85, 33.74], lng: [125.85, 127.15], at: [33.02, 126.52] },
    "east-mid": { lat: [37.1, 38.6], lng: [128.45, 130.6], at: [37.98, 129.6] },
    "east-south": { lat: [35.2, 37.05], lng: [129.25, 130.6], at: [36.05, 130.0] },
};

/** 색은 뜻 하나씩 — 종이 위의 옅은 물감 */
const WASH: Readonly<Record<SeaState, { fill: string; line: string; word: string | null; ink: string }>> = {
    clear: { fill: "#1F5A7817", line: "#1F5A7840", word: null, ink: "#0F2838A6" },
    pre: { fill: "#F2C56A73", line: "#B8862A99", word: "예비특보", ink: "#7A5510" },
    far: { fill: "#F2C56A73", line: "#B8862A99", word: "먼바다", ink: "#7A5510" },
    warn: { fill: "#EE7B5B8C", line: "#B7462AB3", word: "주의보", ink: "#8E2A14" },
    alert: { fill: "#D8432FB8", line: "#8E2A14CC", word: "경보", ink: "#5E1608" },
};
export const SEA_LEGEND: readonly { state: SeaState; text: string }[] = [
    { state: "clear", text: "특보 없음" }, { state: "far", text: "먼바다 · 예비" }, { state: "warn", text: "주의보" }, { state: "alert", text: "경보" },
];
export const seaWashColor = (s: SeaState) => WASH[s].fill;
export const seaWashLine = (s: SeaState) => WASH[s].line;

export interface SeaTemp { name: string; lat: number; lng: number; wtem: number }

export function SeaChart({ areas, picked, onPick, temps, ports, port }: {
    areas: readonly SeaArea[]; picked: string | null; onPick: (id: string) => void; temps?: readonly SeaTemp[];
    /** 항구의 점 — 고른 항구(port)는 이름과 함께 도드라진다 */
    ports?: readonly { code: string; name: string; lat: number; lng: number }[]; port?: string | null;
}) {
    const ref = useRef<SVGSVGElement>(null);
    // 화면에서 12px 가 그림에서 몇 칸인가 — 실제 너비를 재서 글자를 키운다
    const [u, setU] = useState(VIEW.w / 320);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const measure = () => { const w = el.getBoundingClientRect().width; if (w > 0) setU(VIEW.w / w); };
        measure();
        const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
        ro?.observe(el);
        return () => ro?.disconnect();
    }, []);
    const fs = 12.4 * u;
    const by = new Map(areas.map((a) => [a.id, a]));
    // 위경도 눈금(위도 33~38 · 경도 125~130)
    const grid = [
        ...[33, 34, 35, 36, 37, 38].map((lat) => { const [, y] = latLngToOutline(lat, 127); return `M${VIEW.x} ${y} H${VIEW.x + VIEW.w}`; }),
        ...[125, 126, 127, 128, 129, 130].map((lng) => { const [x] = latLngToOutline(36, lng); return `M${x} ${VIEW.y} V${VIEW.y + VIEW.h}`; }),
    ].join(" ");
    return (
        <svg ref={ref} viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} className="block w-full" role="group" aria-label="바다 지도" data-testid="fishing-chart">
            <defs>
                <pattern id="fs-wave" width="26" height="12" patternUnits="userSpaceOnUse"><path d="M0 6 q6.5 -5 13 0 t13 0" fill="none" stroke="#1F5A782B" strokeWidth="1" /></pattern>
                <pattern id="fs-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><path d="M0 0 V5" stroke="#0F283812" strokeWidth="1.4" /></pattern>
            </defs>
            <rect x={VIEW.x} y={VIEW.y} width={VIEW.w} height={VIEW.h} fill="#F3ECDD" />
            <rect x={VIEW.x} y={VIEW.y} width={VIEW.w} height={VIEW.h} fill="url(#fs-wave)" />
            <path d={grid} fill="none" stroke="#1F5A7826" strokeWidth={0.6 * u} strokeDasharray={`${2 * u} ${3 * u}`} />

            {/* 바다 일곱 구역 — 뭍보다 먼저 그려서 뭍이 위에 덮인다 */}
            {SEA_AREAS.map((def) => {
                const z = ZONES[def.id], a = by.get(def.id);
                if (!z || !a) return null;
                const [x1, y1] = latLngToOutline(z.lat[1], z.lng[0]), [x2, y2] = latLngToOutline(z.lat[0], z.lng[1]);
                const w = WASH[a.state], on = picked === def.id;
                return (
                    <g key={def.id} role="button" tabIndex={0} aria-pressed={on} aria-label={`${def.name} ${w.word ?? "특보 없음"}`} onClick={() => onPick(def.id)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(def.id); } }}
                        data-testid={`fishing-sea-${def.id}`} data-state={a.state} style={{ cursor: "pointer", outline: "none" }}>
                        <rect x={x1} y={y1} width={x2 - x1} height={y2 - y1} rx={16} fill={w.fill} stroke={on ? "#0F2838" : w.line} strokeWidth={(on ? 1.9 : 0.9) * u} strokeDasharray={on ? undefined : `${4 * u} ${3 * u}`} />
                    </g>
                );
            })}

            {/* 뭍 — 그림자 · 종이색 · 빗금 */}
            <g fill="#0F283826" stroke="#0F283826" strokeWidth="5" strokeLinejoin="round" pointerEvents="none">{LAND.map((d, i) => <path key={i} d={d} />)}</g>
            <g fill="#C9BFA4" opacity="0.6" transform="translate(2.5 3)" pointerEvents="none">{LAND.map((d, i) => <path key={i} d={d} />)}</g>
            <g fill="#EAE2CC" stroke="#0F283855" strokeWidth={0.6} strokeLinejoin="round" pointerEvents="none">{LAND.map((d, i) => <path key={i} d={d} />)}</g>
            <g fill="url(#fs-hatch)" pointerEvents="none">{LAND.map((d, i) => <path key={i} d={d} />)}</g>

            {/* 울릉도 · 독도 — 윤곽선 자료에 없어 따로 그린다 */}
            <g pointerEvents="none">
                <rect x={INSET.x} y={INSET.y} width={INSET.w} height={INSET.h} rx="6" fill="#F3ECDD" stroke="#0F283840" strokeWidth="0.7" strokeDasharray="2 2" />
                <ellipse cx={INSET.x + 30} cy={INSET.y + 19} rx="12" ry="10" fill="#EAE2CC" stroke="#0F283845" strokeWidth="0.5" />
                <circle cx={INSET.x + 72} cy={INSET.y + 21} r="2.4" fill="#EAE2CC" stroke="#0F283855" strokeWidth="0.5" />
                <circle cx={INSET.x + 78} cy={INSET.y + 19.5} r="1.9" fill="#EAE2CC" stroke="#0F283855" strokeWidth="0.5" />
                <text x={INSET.x + INSET.w / 2} y={INSET.y + 52} textAnchor="middle" fontSize={fs * 0.97} fill="#0F2838A6">울릉 · 독도</text>
            </g>

            {/* 구역의 이름과 한마디 */}
            <g pointerEvents="none">
                {SEA_AREAS.map((def) => {
                    const z = ZONES[def.id], a = by.get(def.id);
                    if (!z || !a) return null;
                    const [x, y] = latLngToOutline(z.at[0], z.at[1]);
                    const w = WASH[a.state];
                    return (
                        <g key={def.id}>
                            <text x={x} y={y} textAnchor="middle" fontSize={fs} fontWeight="600" fill={w.word ? w.ink : "#0F2838CC"} stroke="#F3ECDD" strokeWidth={fs * 0.22} paintOrder="stroke">{def.name}</text>
                            {w.word && <text x={x} y={y + fs * 1.12} textAnchor="middle" fontSize={fs} fill={w.ink} stroke="#F3ECDD" strokeWidth={fs * 0.22} paintOrder="stroke">{w.word}</text>}
                        </g>
                    );
                })}
            </g>

            {/* 관측소의 수온 — 받은 것만 */}
            {temps && temps.length > 0 && (
                <g pointerEvents="none" data-testid="fishing-chart-temps">
                    {temps.map((t) => {
                        const [x, y] = latLngToOutline(t.lat, t.lng);
                        return (
                            <g key={t.name} transform={`translate(${x} ${y})`}>
                                <circle r={2.4 * u} fill="#1F5A78" stroke="#F3ECDD" strokeWidth={0.8 * u} />
                                <text x={3.6 * u} y={fs * 0.34} fontSize={fs * 0.97} fill="#1F5A78" stroke="#F3ECDD" strokeWidth={fs * 0.22} paintOrder="stroke" className="tabular-nums">{t.wtem.toFixed(1)}°</text>
                            </g>
                        );
                    })}
                </g>
            )}

            {/* 항구 — 작은 먹점. 고른 항구는 붉은 점과 이름 */}
            {ports && ports.length > 0 && (
                <g pointerEvents="none" data-testid="fishing-chart-ports">
                    {ports.filter((p) => p.code !== port).map((p) => { const [x, y] = latLngToOutline(p.lat, p.lng); return x > VIEW.x + VIEW.w - 6 ? null : <circle key={p.code} cx={x} cy={y} r={1.7 * u} fill="#0F2838" opacity="0.55" />; })}
                    {ports.filter((p) => p.code === port).map((p) => {
                        const [px, y] = latLngToOutline(p.lat, p.lng);
                        // 그림 밖의 항구(울릉도)는 울릉 · 독도 칸의 섬 자리에 찍는다
                        const off = px > VIEW.x + VIEW.w - 6, x = off ? INSET.x + 30 : px, cy = off ? INSET.y + 19 : y;
                        const left = x > VIEW.x + VIEW.w * 0.62;
                        return (
                            <g key={p.code} data-testid="fishing-chart-port">
                                <circle cx={x} cy={cy} r={6.5 * u} fill="#C8372D" opacity="0.2" />
                                <circle cx={x} cy={cy} r={3.3 * u} fill="#C8372D" stroke="#F3ECDD" strokeWidth={1.2 * u} />
                                <text x={x + (left ? -6 : 6) * u} y={cy - 5 * u} textAnchor={left ? "end" : "start"} fontSize={fs} fontWeight="600" fill="#8E2A14" stroke="#F3ECDD" strokeWidth={fs * 0.24} paintOrder="stroke">{p.name}</text>
                            </g>
                        );
                    })}
                </g>
            )}

            {/* 방위표 */}
            <g transform={`translate(${VIEW.x + 30 * u} ${VIEW.y + VIEW.h - 30 * u}) scale(${u})`} pointerEvents="none">
                <circle r="12" fill="#F3ECDDE6" stroke="#0F283855" strokeWidth="1" />
                <path d="M0 -9 L3.4 3.4 L0 1.2 L-3.4 3.4 Z" fill="#0F2838" />
            </g>
        </svg>
    );
}
