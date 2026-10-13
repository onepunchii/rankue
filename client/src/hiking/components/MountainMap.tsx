/**
 * 내 산 지도(2026-10-13 오너: "우리나라 지도를 일러스트 감성으로 등산객들이 좋아할 만한 느낌으로").
 *
 * 종이 지도 위에 산 그림을 놓는다 — 높은 산일수록 크게, 오른 산(done)에는 깃발. 산의 자리는 좌표로 정확히 놓고(틀리면 안 된다),
 * 파도 · 빗금 · 종이색 같은 장식만 그린다. 권역을 고르면 그 권역이 커지고 산 이름이 보인다.
 *
 * 윤곽선은 골프의 점 지도가 쓰는 것(golf/data/koreaMapData)을 **화면에서만** 빌려 쓴다 — 출처 기록이 없는 자료라 서버가 밖으로 내보내는
 * 그림(공유 카드)에는 쓰지 않는다. 그 윤곽선에는 울릉도 · 독도가 없어서 오른쪽 위에 따로 그려 넣는다(성인봉도 거기에 놓는다).
 * ⚠️ 리터럴 색만. 글자는 화면에서 12px 아래로 내려가지 않게 viewBox 에 맞춰 키운다.
 */
import { useMemo } from "react";
import { useLocation } from "wouter";
import { KOREA_MAP_PATHS } from "@/golf/data/koreaMapData";
import { latLngToOutline } from "@/golf/lib/koreaOutline";
import { hikingMountainPath } from "@shared/hikingMountains";
import type { MountainSummary } from "../lib/api";

/** 전체 보기 — 동해 쪽을 넉넉히 둔다(울릉도 · 독도 칸이 뭍과 겹치지 않게) */
const FULL = { x: 40, y: 15, w: 436, h: 640 };
/** 울릉도 · 독도 칸(전체 보기의 동해 위) */
const INSET = { x: 384, y: 150, w: 86, h: 56 };
/** 당겨 들어간 그림의 가로:세로 */
const ZOOM_ASPECT = 0.82;
const LAND = Object.values(KOREA_MAP_PATHS);
const isUlleung = (m: MountainSummary) => m.sigungu === "울릉군";

interface Spot { m: MountainSummary; x: number; y: number }

export function MountainMap({ mountains, done, region, fit = false, labelAll = false, className }: {
    /** 지도에 놓을 산(명산) */
    mountains: readonly MountainSummary[];
    /** 오른 산의 id — 깃발을 꽂는다 */
    done?: ReadonlySet<string>;
    /** 고른 권역 — 그 권역으로 당겨 들어간다 */
    region?: string | null;
    /** 놓인 산들이 한쪽에 몰려 있으면 그쪽으로 당겨 들어간다(묶음 목록 — 권역을 고르지 않았을 때만) */
    fit?: boolean;
    labelAll?: boolean;
    className?: string;
}) {
    const [, setLocation] = useLocation();
    const spots = useMemo<Spot[]>(() => mountains.filter((m) => m.lat != null && m.lng != null).map((m) => {
        if (isUlleung(m)) return { m, x: INSET.x + 24, y: INSET.y + 27 };
        const [x, y] = latLngToOutline(m.lat!, m.lng!);
        return { m, x, y };
    }).sort((a, b) => a.y - b.y), [mountains]);

    const view = useMemo(() => {
        const inRegion = region ? spots.filter((s) => s.m.region === region && !isUlleung(s.m)) : fit ? spots.filter((s) => !isUlleung(s.m)) : [];
        if (inRegion.length === 0) return FULL;
        const xs = inRegion.map((s) => s.x), ys = inRegion.map((s) => s.y);
        const pad = 26;
        let x = Math.min(...xs) - pad, y = Math.min(...ys) - pad, w = Math.max(...xs) - Math.min(...xs) + pad * 2, h = Math.max(...ys) - Math.min(...ys) + pad * 2;
        // 묶음의 산이 나라 곳곳에 퍼져 있으면(또는 울릉도의 산이 끼어 있으면) 당기지 않는다 — 전체 지도가 '어디어디인지'를 더 잘 말한다
        if (!region && (w > FULL.w * 0.62 || h > FULL.h * 0.62 || spots.some((s) => isUlleung(s.m)))) return FULL;
        // 그림 칸의 비(가로 39 : 세로 50)에 맞춰 넓힌다 — 좁은 권역이 길쭉하게 잘리지 않게
        const want = ZOOM_ASPECT;
        if (w / h < want) { const nw = h * want; x -= (nw - w) / 2; w = nw; } else { const nh = w / want; y -= (nh - h) / 2; h = nh; }
        return { x, y, w, h };
    }, [region, fit, spots]);

    const u = view.w / FULL.w;          // 당겨 들어가면 그림 · 글자를 그만큼 줄인다
    const zoomed = view !== FULL;
    const shown = zoomed ? spots.filter((s) => (region ? s.m.region === region : true) && !isUlleung(s.m)) : spots;
    // 당겨 들어간 그림에서는 100대 명산만 이름을 단다 — 플러스까지 달면 강원 · 경남은 글자가 겹친다
    const label = (s: Spot) => labelAll || (zoomed ? s.m.lists.includes("kfs100") : ["한라산", "지리산", "설악산", "태백산", "덕유산", "북한산", "무등산", "소백산"].includes(s.m.slug));

    return (
        <svg viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} className={className} role="img" aria-label="명산 지도" style={{ display: "block", width: "100%", background: "#F4EFE3", borderRadius: 18 }} data-testid="mountain-map" data-zoom={zoomed ? region ?? "" : "full"}>
            <defs>
                <pattern id="hk-wave" width="26" height="12" patternUnits="userSpaceOnUse"><path d="M0 6 q6.5 -5 13 0 t13 0" fill="none" stroke="#1F556030" strokeWidth="1" /></pattern>
                <pattern id="hk-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><path d="M0 0 V5" stroke="#1F556014" strokeWidth="1.4" /></pattern>
            </defs>
            <rect x={view.x - 50} y={view.y - 50} width={view.w + 100} height={view.h + 100} fill="url(#hk-wave)" />
            <g fill="#C9D2B4" opacity="0.5" transform="translate(2.5 3)">{LAND.map((d, i) => <path key={i} d={d} />)}</g>
            <g fill="#E4E9CF" stroke="#0E2A3338" strokeWidth={0.5} strokeLinejoin="round">{LAND.map((d, i) => <path key={i} d={d} />)}</g>
            <g fill="url(#hk-hatch)">{LAND.map((d, i) => <path key={i} d={d} />)}</g>
            {!zoomed && (
                <g data-testid="map-ulleung">
                    <rect x={INSET.x} y={INSET.y} width={INSET.w} height={INSET.h} rx="6" fill="#F4EFE3" stroke="#0E2A3340" strokeWidth="0.7" strokeDasharray="2 2" />
                    <ellipse cx={INSET.x + 24} cy={INSET.y + 22} rx="11" ry="9" fill="#E4E9CF" stroke="#0E2A3338" strokeWidth="0.5" />
                    <circle cx={INSET.x + 62} cy={INSET.y + 25} r="2.2" fill="#E4E9CF" stroke="#0E2A3355" strokeWidth="0.5" />
                    <circle cx={INSET.x + 67} cy={INSET.y + 23.5} r="1.7" fill="#E4E9CF" stroke="#0E2A3355" strokeWidth="0.5" />
                    <text x={INSET.x + INSET.w / 2} y={INSET.y + 48} textAnchor="middle" fontSize="12.5" fill="#0E2A33B3">울릉도 · 독도</text>
                </g>
            )}
            {shown.map((s) => {
                const big = s.m.lists.includes("kfs100");
                const size = (big ? 7.5 : 5) * (0.8 + Math.min(1, (s.m.heightM ?? 300) / 1900) * 0.7) * (zoomed ? Math.max(u, 0.55) * 1.25 : 1);
                const got = !!done?.has(s.m.id);
                const fill = got ? "#F28C6A" : big ? "#1F5560" : "#7FA39A";
                return (
                    <g key={s.m.id} transform={`translate(${s.x.toFixed(1)} ${s.y.toFixed(1)})`} onClick={() => setLocation(hikingMountainPath(s.m.slug))} style={{ cursor: "pointer" }} data-mountain={s.m.slug} data-done={got ? "1" : "0"}>
                        <circle r={Math.max(size * 1.6, 9 * u)} fill="transparent" />
                        <path d={`M${-size} 0 L0 ${-size * 1.25} L${size} 0 Z`} fill={fill} stroke="#0E2A33" strokeWidth={0.7 * Math.max(u, 0.5)} strokeLinejoin="round" />
                        {(s.m.heightM ?? 0) >= 1200 && <path d={`M${-size * 0.34} ${-size * 0.82} L0 ${-size * 1.25} L${size * 0.34} ${-size * 0.82} L${size * 0.12} ${-size * 0.94} L${-size * 0.1} ${-size * 0.8} Z`} fill="#FFF6E3" />}
                        {got && (<><path d={`M0 ${-size * 1.25} V${-size * 2.1}`} stroke="#0E2A33" strokeWidth={0.8 * Math.max(u, 0.5)} /><path d={`M0 ${-size * 2.1} l${size * 0.7} ${size * 0.22} l${-size * 0.7} ${size * 0.24} Z`} fill="#F28C6A" stroke="#0E2A33" strokeWidth={0.5 * Math.max(u, 0.5)} /></>)}
                    </g>
                );
            })}
            {/* 이름은 산 그림 위의 층에 — 뒤에 그린 산이 앞의 이름을 덮지 않게. 이름끼리 겹치면 100대 명산 · 높은 산의 이름을 남긴다 */}
            <g pointerEvents="none">
                {(() => {
                    const fs = (zoomed ? 15 : 13.5) * u;
                    const boxes: { x0: number; x1: number; y0: number; y1: number }[] = [];
                    return shown.filter(label)
                        .sort((a, b) => Number(b.m.lists.includes("kfs100")) - Number(a.m.lists.includes("kfs100")) || (b.m.heightM ?? 0) - (a.m.heightM ?? 0))
                        .map((s) => {
                            const big = s.m.lists.includes("kfs100");
                            const size = (big ? 7.5 : 5) * (0.8 + Math.min(1, (s.m.heightM ?? 300) / 1900) * 0.7) * (zoomed ? Math.max(u, 0.55) * 1.25 : 1);
                            const x = s.x + size + 2.5 * u, y = s.y + 3 * u;
                            const box = { x0: x - 1 * u, x1: x + s.m.name.length * fs * 0.98, y0: y - fs * 0.95, y1: y + fs * 0.3 };
                            if (boxes.some((o) => box.x0 < o.x1 && box.x1 > o.x0 && box.y0 < o.y1 && box.y1 > o.y0)) return null;
                            boxes.push(box);
                            return <text key={`label:${s.m.id}`} x={x} y={y} fontSize={fs} fontWeight="600" fill="#0E2A33" stroke="#F4EFE3" strokeWidth={3 * u} paintOrder="stroke">{s.m.name}</text>;
                        });
                })()}
            </g>
        </svg>
    );
}

export default MountainMap;
