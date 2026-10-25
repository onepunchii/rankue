/**
 * 내 근처의 산(2026-10-13 오너: "홈에 내 근처 기능으로 근처 산 · 근처 명산 2개 이쁘게 카드로",
 * "근처 맛집이나 가까운 골프장처럼 내 근처를 시각화해서 어떤 산인지 보이면 좋겠네").
 *
 * 동그란 판 가운데가 나, 위가 북 — 가까운 산을 방향과 거리대로 놓는다(명산은 크게 · 짙게, 오른 산은 깃발). 그 아래 카드 둘: 가장 가까운 산 · 가장 가까운 명산.
 * **내 위치는 이 기기 밖으로 나가지 않는다** — 산의 자리 표를 받아 여기서 고른다(shared/hikingNear). 기기에 적어 두는 것도 '켰다'는 표시 하나뿐.
 * 위치를 먼저 묻지 않는다: 단추를 눌렀을 때만 묻고, 한 번 켠 뒤에는 묻지 않고 받을 수 있을 때만 받는다.
 * ⚠️ 리터럴 색만(theme.HK). 글자는 12px 이상, 굵기는 semibold 까지.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getDevicePosition } from "@/hooks/useNativeBridge";
import { hikingMountainPath } from "@shared/hikingMountains";
import { compass8, nearKmText, nearRadiusKm, nearSpot, nearZoomItems, nearZoomNext, nearestMountains, type MountainPoint, type NearMountain } from "@shared/hikingNear";
import { HkSection } from "./HikingShell";
import { MountainPatch } from "../stamps/MountainPatch";
import { hikingCover } from "../theme";
import type { MountainSummary } from "../lib/api";

export const HIKING_POINTS_KEY = ["/api/hiq/hiking/points"] as const;
const KEY = "rankue_hk_near";
const wasOn = (): boolean => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };
const remember = (): void => { try { localStorage.setItem(KEY, "1"); } catch { /* 이번 화면에서만 */ } };

type Phase = "off" | "locating" | "on" | "denied" | "failed";
/** 판에 놓는 산의 수 — 가까운 산 일곱 + 가까운 명산 셋(겹치면 한 번) */
const MAP_NEAR = 7, MAP_FAMOUS = 3;

const heightText = (h: number | null) => (h != null ? `${Math.round(h).toLocaleString("en-US")}m` : "");

export function NearMe({ famous, done }: {
    /** 명산의 목록(허브가 준 것) — 카드의 와펜 · 권역 색을 여기서 찾는다 */
    famous: readonly MountainSummary[];
    done?: ReadonlySet<string>;
}) {
    const [phase, setPhase] = useState<Phase>("off");
    const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
    const points = useQuery<{ points: MountainPoint[] }>({ queryKey: HIKING_POINTS_KEY, enabled: !!me, staleTime: 60 * 60_000 }).data?.points;

    const locate = useCallback(async (prompt: boolean) => {
        setPhase((p) => (p === "on" ? p : "locating"));
        const r = await getDevicePosition({ prompt, highAccuracy: false, timeoutMs: 9000, maximumAgeMs: 5 * 60_000 });
        if (r.status === "granted") { setMe({ lat: r.fix.lat, lng: r.fix.lng }); setPhase("on"); remember(); }
        else if (r.status === "denied") setPhase("denied");
        // 묻지 않고 받으려다 못 받은 것(prompt) — 조용히 처음 모습으로 돌아간다
        else setPhase(prompt ? "failed" : "off");
    }, []);
    // 한 번 켠 사람은 다시 묻지 않고 받는다(권한이 살아 있을 때만 받아진다)
    useEffect(() => { if (wasOn()) void locate(false); }, [locate]);

    const bySlug = useMemo(() => new Map(famous.map((m) => [m.slug, m])), [famous]);
    const near = useMemo(() => (me && points ? nearestMountains(points, me, { limit: MAP_NEAR }) : []), [me, points]);
    const nearFamous = useMemo(() => (me && points ? nearestMountains(points, me, { limit: MAP_FAMOUS, famousOnly: true }) : []), [me, points]);
    const onMap = useMemo(() => {
        const seen = new Set<string>();
        return [...near, ...nearFamous].filter((m) => (seen.has(m.slug) ? false : (seen.add(m.slug), true)));
    }, [near, nearFamous]);
    const isDone = (m: NearMountain) => { const f = bySlug.get(m.slug); return !!f && !!done?.has(f.id); };

    const first = near[0], firstFamous = nearFamous.find((m) => m.slug !== first?.slug) ?? nearFamous[0];
    const loading = phase === "locating" || (phase === "on" && !points);
    const featured = useMemo(() => [first?.slug, firstFamous?.slug].filter((x): x is string => !!x), [first?.slug, firstFamous?.slug]);
    const [more, setMore] = useState(false);
    // 키우기 · 줄이기(2026-10-25 오너) — null 이면 처음 판(가까운 산 일곱 + 명산 셋). 정하면 그 반지름 안의 산을 다 그린다
    const [zoomR, setZoomR] = useState<number | null>(null);
    const autoR = useMemo(() => nearRadiusKm(onMap.map((m) => m.km)), [onMap]);
    const radius = zoomR ?? autoR;
    const zoomItems = useMemo(() => (zoomR != null && me && points ? nearZoomItems(points, me, zoomR) : null), [zoomR, me, points]);
    // 반경 안의 산이 상한(NEAR_ZOOM_MAX)보다 많으면 '몇 곳 중 몇 곳'을 말한다 — 그린 수만 말하면 그게 전부인 줄 안다
    const zoomTotal = useMemo(() => (zoomR != null && me && points ? nearestMountains(points, me, { limit: Number.MAX_SAFE_INTEGER, maxKm: zoomR }).length : 0), [zoomR, me, points]);
    const zoom = useCallback((dir: 1 | -1) => setZoomR((prev) => nearZoomNext(prev ?? autoR, dir) ?? prev), [autoR]);

    return (
        <HkSection title="내 근처의 산" aside={phase === "on" && first ? `가장 가까운 산까지 ${nearKmText(first.km)}` : "가까운 산 · 가까운 명산"}>
            <div data-testid="hk-near" data-phase={loading ? "loading" : phase}>
                {phase === "on" && points && onMap.length > 0 ? (
                    <>
                        <ZoomableDial radius={radius} zoomed={zoomR != null} onZoom={zoom} onReset={() => setZoomR(null)}>
                            <NearDial items={zoomItems ?? onMap} done={isDone} featured={featured} radiusKm={radius} />
                        </ZoomableDial>
                        {zoomItems && (
                            <p className="mt-1.5 text-center text-[12.5px] text-[#F4EFE3B3] break-keep" data-testid="hk-near-zoom-count">
                                {!zoomItems.length ? `반경 ${radius}km 안에는 산이 없어요`
                                    : zoomTotal > zoomItems.length ? `반경 ${radius}km 안의 산 ${zoomTotal}곳 — 명산과 가까운 산 ${zoomItems.length}곳을 그렸어요`
                                    : `반경 ${radius}km 안의 산 ${zoomItems.length}곳`}
                            </p>
                        )}
                        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                            {first && <NearCard kind="가까운 산" m={first} info={bySlug.get(first.slug)} done={isDone(first)} />}
                            {firstFamous && <NearCard kind="가까운 명산" m={firstFamous} info={bySlug.get(firstFamous.slug)} done={isDone(firstFamous)} />}
                        </div>
                        {onMap.length > featured.length && (more
                            ? <NearRows items={onMap} skip={new Set(featured)} done={isDone} />
                            : <button type="button" onClick={() => setMore(true)} data-track-as="hiking-near-more" data-testid="hk-near-more" className="mt-2.5 flex h-11 w-full items-center justify-center rounded-xl bg-[#FFFFFF14] text-[14px] font-medium text-[#F4EFE3] active:bg-[#FFFFFF24]">가까운 산 {onMap.length - featured.length}곳 더 보기</button>)}
                        <p className="mt-2 text-[12.5px] leading-snug text-[#F4EFE380] break-keep">가운데가 지금 자리, 위쪽이 북쪽이에요. 두 손가락이나 + · − 로 키우고 줄일 수 있어요. 직선 거리라 길로 가면 더 멀어요. 내 위치는 이 기기에서만 써요.</p>
                    </>
                ) : phase === "on" && points ? (
                    <p className="rounded-2xl bg-[#FFFFFF0A] px-4 py-6 text-center text-[14px] text-[#F4EFE399] break-keep" data-testid="hk-near-none">근처에서 산을 찾지 못했어요. 전국의 산은 아래 '산' 탭에서 볼 수 있어요.</p>
                ) : loading ? (
                    <div className="h-[168px] animate-pulse rounded-2xl bg-[#FFFFFF0F]" aria-busy="true" />
                ) : (
                    <div className="flex items-center gap-4 rounded-2xl px-4 py-4" style={{ background: "#FFFFFF0A", boxShadow: "inset 0 0 0 1px #FFFFFF14" }}>
                        <DialMark />
                        <div className="min-w-0 flex-1">
                            <p className="text-[15px] font-semibold text-[#F4EFE3] break-keep">{phase === "denied" ? "위치를 쓸 수 없어요" : phase === "failed" ? "위치를 받지 못했어요" : "지금 자리에서 가까운 산"}</p>
                            <p className="mt-0.5 text-[13px] leading-snug text-[#F4EFE399] break-keep">
                                {phase === "denied" ? "기기 설정에서 위치를 허용하면 가까운 산과 명산을 보여 드려요."
                                    : phase === "failed" ? "하늘이 트인 곳에서 다시 눌러 보세요."
                                    : "어느 쪽으로 얼마나 가면 어떤 산이 있는지 한눈에 보여 드려요."}
                            </p>
                            {phase !== "denied" && (
                                <button type="button" onClick={() => void locate(true)} data-track-as="hiking-near-on" data-testid="hk-near-on"
                                    className="mt-2.5 h-10 rounded-full bg-[#F28C6A] px-4 text-[14px] font-semibold text-[#2A1208] active:bg-[#E67C59]">내 근처 산 보기</button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </HkSection>
    );
}

/** 안내 카드의 작은 그림 — 동그란 판과 산 셋 */
function DialMark() {
    return (
        <svg viewBox="0 0 64 64" width="64" height="64" className="shrink-0" aria-hidden>
            <circle cx="32" cy="32" r="30" fill="#F4EFE3" />
            <circle cx="32" cy="32" r="19" fill="none" stroke="#1F556040" strokeDasharray="2 3" />
            <path d="M14 26 l6 -9 l6 9 Z" fill="#1F5560" /><path d="M40 20 l5 -7 l5 7 Z" fill="#7FA39A" /><path d="M41 49 l6 -9 l6 9 Z" fill="#1F5560" />
            <circle cx="32" cy="32" r="5" fill="#F28C6A" stroke="#FFFFFF" strokeWidth="2" />
        </svg>
    );
}

const VB = { w: 340, h: 336 }, C = { x: 170, y: 170 }, R = 118, BEZEL = 20;
const DIRS = [["북", 0], ["동", 90], ["남", 180], ["서", 270]] as const;
const polar = (deg: number, r: number): [number, number] => [C.x + Math.sin((deg * Math.PI) / 180) * r, C.y - Math.cos((deg * Math.PI) / 180) * r];
/** 땅의 결 — 판 위의 구불구불한 등고선(장식). 반지름을 여섯 굽이로 흔든다 */
const contour = (r: number, wobble: number, phase: number): string => {
    const pts = Array.from({ length: 72 }, (_, i) => { const a = (i / 72) * Math.PI * 2; const rr = r + Math.sin(a * 3 + phase) * wobble + Math.sin(a * 5 + phase * 2) * wobble * 0.5; return `${(C.x + Math.cos(a) * rr).toFixed(1)} ${(C.y + Math.sin(a) * rr).toFixed(1)}`; });
    return `M${pts.join(" L")} Z`;
};
const CONTOURS = [contour(R * 0.24, 4, 0.4), contour(R * 0.46, 6, 1.7), contour(R * 0.68, 7, 3.1), contour(R * 0.88, 6, 4.4)].join(" ");

/**
 * 동그란 판 — 가운데가 나, 위가 북. 나침반의 테(눈금 · 동서남북) 안에 산을 방향과 거리대로 놓는다. 이름은 겹치지 않는 것만 단다.
 * 산 화면도 이 판을 쓴다(가운데가 그 산 — 가까운 산의 방향과 거리): centre 로 가운데 표시 밑에 말("이 산")을 달고, label 로 그림을 읽어 주는 말을 바꾼다.
 * featured 는 카드로 따로 소개하는 산 — 가운데에서 점선을 긋고 이름 옆에 거리를 적는다.
 */
export function NearDial({ items, done, centre, label, featured, radiusKm }: {
    items: readonly NearMountain[];
    done: (m: NearMountain) => boolean;
    /** 가운데 표시 밑에 다는 말(산 화면의 "이 산") — 없으면 '나'의 표시만 */
    centre?: string;
    /** 그림을 읽어 주는 말 */
    label?: string;
    /** 카드로 소개하는 산의 주소(slug) — 점선과 거리가 붙는다 */
    featured?: readonly string[];
    /** 판의 반지름을 정해 줄 때(홈의 키우기 · 줄이기) — 없으면 그릴 산이 다 들어가는 값 */
    radiusKm?: number;
}) {
    const [, setLocation] = useLocation();
    const radius = radiusKm ?? nearRadiusKm(items.map((m) => m.km));
    // 산이 많으면(줄여서 넓게 볼 때) 그림을 작게 — 서로 덮지 않게
    const dense = items.length > 60 ? 0.6 : items.length > 24 ? 0.78 : 1;
    const spots = useMemo(() => {
        // 아주 가까운 산(판의 가운데에서 22 안)은 같은 방향으로 22 까지 민다 — 가운데 표시와 '이 산' 글씨를 덮지 않게(표시만, 거리 글은 그대로)
        const out = items.map((m) => {
            const [x, y] = nearSpot(m, radius);
            let px = x * R, py = y * R;
            const r = Math.hypot(px, py), MIN = 22;
            if (r < MIN) { const k = r > 0.01 ? MIN / r : 0; [px, py] = r > 0.01 ? [px * k, py * k] : [0, -MIN]; }
            // 남쪽 바로 아래는 '이 산' 판 자리 — 판에 가리면 판 밖까지 더 민다
            if (centre) {
                const hw = centre.length * 7 + 14;
                for (let i = 0; i < 12 && Math.abs(px) < hw && py > 6 && py < 44; i++) { px *= 1.12; py *= 1.12; }
            }
            return { m, x: C.x + px, y: C.y + py, star: !!featured?.includes(m.slug) };
        });
        // 이름 칸이 겹치면 먼 쪽의 이름을 뺀다(카드의 산 · 명산 · 가까운 산이 먼저) — 산 그림은 다 그린다
        const boxes: { x0: number; x1: number; y0: number; y1: number }[] = centre ? [{ x0: C.x - centre.length * 7 - 8, x1: C.x + centre.length * 7 + 8, y0: C.y - 10, y1: C.y + 35 }] : [{ x0: C.x - 10, x1: C.x + 10, y0: C.y - 10, y1: C.y + 10 }];
        const order = [...out].sort((a, b) => Number(b.star) - Number(a.star) || Number(b.m.famous) - Number(a.m.famous) || a.m.km - b.m.km);
        const labelled = new Map<string, { anchor: "start" | "end"; tx: number; sub?: string }>();
        for (const s of order) {
            const sub = s.star ? nearKmText(s.m.km) : undefined;
            const w = Math.max(s.m.name.length * 13.5, sub ? sub.length * 7.4 : 0) + 6, left = s.x > C.x + R * 0.4;
            const tx = left ? s.x - 12 : s.x + 12;
            const box = { x0: left ? tx - w : tx, x1: left ? tx : tx + w, y0: s.y - 14, y1: s.y + (sub ? 18 : 5) };
            if (box.x0 < 4 || box.x1 > VB.w - 4) continue;
            if (boxes.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)) continue;
            boxes.push(box); labelled.set(s.m.slug, { anchor: left ? "end" : "start", tx, sub });
        }
        return out.sort((a, b) => a.y - b.y).map((s) => ({ ...s, label: labelled.get(s.m.slug) }));
    }, [items, radius, centre, featured]);
    return (
        <svg viewBox={`0 0 ${VB.w} ${VB.h}`} role="img" aria-label={label ?? `내 근처의 산 ${items.length}곳`} style={{ display: "block", width: "100%", background: "#F4EFE3", borderRadius: 18 }} data-testid="hk-near-dial" data-radius={radius}>
            <defs>
                <pattern id="hk-near-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><path d="M0 0 V5" stroke="#1F556010" strokeWidth="1.4" /></pattern>
                <radialGradient id="hk-near-land" cx="50%" cy="46%" r="60%"><stop offset="0%" stopColor="#EEF1DC" /><stop offset="70%" stopColor="#DFE7CB" /><stop offset="100%" stopColor="#CFDAB9" /></radialGradient>
                <clipPath id="hk-near-clip"><circle cx={C.x} cy={C.y} r={R} /></clipPath>
            </defs>
            {/* 나침반의 테 — 눈금과 동서남북 */}
            <circle cx={C.x} cy={C.y} r={R + BEZEL} fill="#0E2A33" />
            <circle cx={C.x} cy={C.y} r={R + BEZEL - 2.5} fill="none" stroke="#F6D9A8" strokeOpacity="0.55" strokeWidth="1" />
            {Array.from({ length: 72 }, (_, i) => { const d = i * 5, long = d % 30 === 0; if (d % 90 === 0) return null; const [x0, y0] = polar(d, R + 2.5), [x1, y1] = polar(d, R + (long ? 9 : 5.5)); return <path key={d} d={`M${x0.toFixed(1)} ${y0.toFixed(1)} L${x1.toFixed(1)} ${y1.toFixed(1)}`} stroke="#F4EFE3" strokeOpacity={long ? 0.75 : 0.38} strokeWidth={long ? 1.3 : 1} />; })}
            {DIRS.map(([t, d]) => { const [x, y] = polar(d, R + BEZEL / 2); return <text key={t} x={x} y={y + 4.6} textAnchor="middle" fontSize="13" fontWeight="600" fill={d === 0 ? "#F28C6A" : "#F4EFE3"}>{t}</text>; })}
            {/* 판 — 땅의 색과 결 */}
            <circle cx={C.x} cy={C.y} r={R} fill="url(#hk-near-land)" />
            <g clipPath="url(#hk-near-clip)">
                <circle cx={C.x} cy={C.y} r={R} fill="url(#hk-near-hatch)" />
                <path d={CONTOURS} fill="none" stroke="#1F5560" strokeOpacity="0.13" strokeWidth="1.1" />
                <path d={`M${C.x} ${C.y - R} V${C.y + R} M${C.x - R} ${C.y} H${C.x + R}`} stroke="#0E2A33" strokeOpacity="0.1" strokeWidth="1" />
            </g>
            <circle cx={C.x} cy={C.y} r={R / 2} fill="none" stroke="#0E2A33" strokeOpacity="0.28" strokeWidth="1" strokeDasharray="3 4" />
            <circle cx={C.x} cy={C.y} r={R} fill="none" stroke="#0E2A33" strokeOpacity="0.5" strokeWidth="1.2" />
            {/* 눈금의 거리 — 남동쪽 대각선에 */}
            {[0.5, 1].map((k) => { const [x, y] = polar(135, R * k - 2); return <text key={k} x={x - 3} y={y - 3} textAnchor="end" fontSize="12" fill="#0E2A33" fillOpacity="0.62" stroke="#E6EAD2" strokeWidth="2.6" paintOrder="stroke">{nearKmText(radius * k)}</text>; })}
            {/* 카드의 산으로 가는 점선 */}
            {spots.filter((s) => s.star).map((s) => <path key={`l:${s.m.slug}`} d={`M${C.x} ${C.y} L${s.x.toFixed(1)} ${s.y.toFixed(1)}`} stroke={s.m.famous ? "#1F5560" : "#B5654A"} strokeOpacity="0.6" strokeWidth="1.4" strokeDasharray="2 4" strokeLinecap="round" />)}
            {spots.map((s) => {
                const size = (s.m.famous ? 9 : 6.5) * (0.85 + Math.min(1, (s.m.heightM ?? 300) / 1500) * 0.5) * (s.star ? 1 : dense);
                const got = done(s.m);
                const fill = got ? "#F28C6A" : s.m.kfs ? "#1F5560" : s.m.famous ? "#4E8A86" : "#8FAE9F", shade = got ? "#D2694A" : s.m.kfs ? "#143D46" : s.m.famous ? "#3A6E6A" : "#6F9183";
                return (
                    <g key={s.m.slug} transform={`translate(${s.x.toFixed(1)} ${s.y.toFixed(1)})`} onClick={() => setLocation(hikingMountainPath(s.m.slug))} style={{ cursor: "pointer" }} data-near={s.m.slug}>
                        <circle r={17 * dense} fill="transparent" />
                        {s.star && <circle r={size + 6} fill="#F4EFE3" fillOpacity="0.72" stroke={s.m.famous ? "#1F5560" : "#B5654A"} strokeOpacity="0.55" strokeWidth="1" />}
                        {s.m.famous && <path d={`M${-size * 1.5} 2 L${-size * 0.72} ${2 - size * 0.72} L${-size * 0.1} 2 Z`} fill={shade} stroke="#0E2A33" strokeWidth="0.9" strokeLinejoin="round" />}
                        <path d={`M${-size} 2 L0 ${2 - size * 1.3} L${size} 2 Z`} fill={fill} stroke="#0E2A33" strokeWidth="0.9" strokeLinejoin="round" />
                        <path d={`M0 ${2 - size * 1.3} L${size} 2 L${size * 0.18} 2 Z`} fill={shade} opacity="0.75" />
                        {(s.m.heightM ?? 0) >= 1000 && <path d={`M${-size * 0.32} ${2 - size * 0.88} L0 ${2 - size * 1.3} L${size * 0.32} ${2 - size * 0.88} L${size * 0.1} ${2 - size * 1} L${-size * 0.1} ${2 - size * 0.86} Z`} fill="#FFF6E3" />}
                        {got && (<><path d={`M0 ${2 - size * 1.3} V${2 - size * 2.2}`} stroke="#0E2A33" strokeWidth="1" /><path d={`M0 ${2 - size * 2.2} l${size * 0.75} ${size * 0.24} l${-size * 0.75} ${size * 0.26} Z`} fill="#F28C6A" stroke="#0E2A33" strokeWidth="0.6" /></>)}
                    </g>
                );
            })}
            <g pointerEvents="none">
                {spots.filter((s) => s.label).map((s) => (
                    <g key={`n:${s.m.slug}`}>
                        <text x={s.label!.tx} y={s.y} textAnchor={s.label!.anchor} fontSize="13.5" fontWeight="600" fill="#0E2A33" stroke="#EEF1DC" strokeWidth="3.4" paintOrder="stroke">{s.m.name}</text>
                        {s.label!.sub && <text x={s.label!.tx} y={s.y + 14} textAnchor={s.label!.anchor} fontSize="12" fill="#0E2A33" fillOpacity="0.72" stroke="#EEF1DC" strokeWidth="3" paintOrder="stroke">{s.label!.sub}</text>}
                    </g>
                ))}
            </g>
            {/* 가운데 — 나(또는 이 산) */}
            <circle cx={C.x} cy={C.y} r="15" fill="#F28C6A" opacity="0.2" />
            <circle cx={C.x} cy={C.y} r="6.5" fill="#F28C6A" stroke="#FFFFFF" strokeWidth="2.4" />
            {/* '이 산' — 가까운 산 그림이 밑에 깔려도 읽히게 종이색 판 위에 */}
            {centre && (
                <g pointerEvents="none">
                    <rect x={C.x - centre.length * 7 - 7} y={C.y + 15} width={centre.length * 14 + 14} height={19} rx={9.5} fill="#F4EFE3" stroke="#0E2A33" strokeOpacity="0.28" strokeWidth="1" />
                    <text x={C.x} y={C.y + 29} textAnchor="middle" fontSize="13" fontWeight="600" fill="#0E2A33">{centre}</text>
                </g>
            )}
        </svg>
    );
}

const ZBTN = "flex h-10 w-10 items-center justify-center text-[20px] leading-none text-[#0E2A33] active:bg-[#E4DCC8] disabled:opacity-35";
const ZFLOAT = { background: "#F4EFE3F2", boxShadow: "0 1px 4px rgba(14,42,51,0.28), inset 0 0 0 1px rgba(14,42,51,0.18)" } as const;

/**
 * 판을 키우고 줄이는 겉 — 오른쪽 위 + · − (코스 지도와 같은 모양), 두 손가락으로 벌리면 키우고 오므리면 줄인다(한 단계씩).
 * 한 손가락은 화면을 그대로 스크롤한다(touch-action: pan-x pan-y — 브라우저의 화면 확대만 막는다). 바꾸면 왼쪽 위에 '처음으로'.
 */
function ZoomableDial({ radius, zoomed, onZoom, onReset, children }: { radius: number; zoomed: boolean; onZoom: (dir: 1 | -1) => void; onReset: () => void; children: React.ReactNode }) {
    const base = useRef<number | null>(null);
    const gap = (t: React.TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    return (
        <div className="relative" style={{ touchAction: "pan-x pan-y" }} data-testid="hk-near-zoom" data-radius={radius}
            onTouchStart={(e) => { base.current = e.touches.length === 2 ? gap(e.touches) : null; }}
            onTouchMove={(e) => {
                if (e.touches.length !== 2 || base.current == null) return;
                const d = gap(e.touches), k = d / base.current;
                if (k > 1.3) { onZoom(1); base.current = d; } else if (k < 0.77) { onZoom(-1); base.current = d; }
            }}
            onTouchEnd={(e) => { if (e.touches.length < 2) base.current = null; }}>
            {children}
            <div className="absolute right-2 top-2 flex flex-col overflow-hidden rounded-xl" style={ZFLOAT}>
                <button type="button" onClick={() => onZoom(1)} disabled={nearZoomNext(radius, 1) == null} aria-label="판 키우기(더 가까이)" data-testid="hk-near-zoom-in" data-track-as="hiking-near-zoom-in" className={ZBTN}>+</button>
                <span className="h-px bg-[#0E2A3326]" aria-hidden />
                <button type="button" onClick={() => onZoom(-1)} disabled={nearZoomNext(radius, -1) == null} aria-label="판 줄이기(더 넓게)" data-testid="hk-near-zoom-out" data-track-as="hiking-near-zoom-out" className={ZBTN}>−</button>
            </div>
            {zoomed && (
                <button type="button" onClick={onReset} data-testid="hk-near-zoom-reset" data-track-as="hiking-near-zoom-reset"
                    className="absolute left-2 top-2 h-9 rounded-full px-3 text-[13px] font-medium text-[#0E2A33] active:bg-[#E4DCC8]" style={ZFLOAT}>처음으로</button>
            )}
        </div>
    );
}

/** 방향 화살표 — 위가 북. deg 만큼 돌린다 */
const Arrow = ({ deg, size = 16 }: { deg: number; size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ transform: `rotate(${deg.toFixed(0)}deg)` }} aria-hidden><path d="M8 1.5 L12.5 13 L8 10.4 L3.5 13 Z" fill="currentColor" /></svg>
);

/** 카드 하나 — 그 산이 있는 권역의 그림 위에 방향 · 거리를 적는다. 100대 명산이면 그 산의 와펜을 단다 */
function NearCard({ kind, m, info, done }: { kind: string; m: NearMountain; info?: MountainSummary; done: boolean }) {
    const facts = [heightText(m.heightM), m.courses > 0 ? `코스 ${m.courses}개` : ""].filter(Boolean).join(" · ");
    const ring = m.famous ? "#F6D9A8" : "#F28C6A";
    return (
        <Link href={hikingMountainPath(m.slug)} className="block overflow-hidden rounded-2xl active:opacity-80" style={{ background: "#0E2A33", boxShadow: `inset 0 0 0 1px ${ring}40, 0 4px 10px rgba(0,0,0,0.25)` }} data-testid={`hk-near-card-${m.famous ? "famous" : "any"}`} data-track-as="hiking-near-card">
            <span className="relative flex h-[112px] items-end justify-center overflow-hidden">
                {/* 그 산이 있는 권역의 표지 그림 — 그 산의 사진이 아니라 장식이다 */}
                <img src={hikingCover(m.region)} alt="" loading="lazy" decoding="async" draggable={false} className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: m.famous ? "50% 55%" : "50% 72%" }} />
                <span className="absolute inset-0" style={{ background: "linear-gradient(180deg,#0B1F2666,#0B1F2600 42%,#0E2A33 98%)" }} aria-hidden />
                {info && m.kfs && <MountainPatch id={info.id} region={info.region} size={66} earned={done} preview className="relative mb-2" />}
                <span className="absolute left-2.5 top-2.5 rounded-full px-2 py-1 text-[12px] font-medium leading-none" style={{ background: "#0B1F26D9", color: ring }}>{kind}</span>
                {done && <span className="absolute right-2.5 top-2.5 rounded-full bg-[#F28C6A] px-2 py-1 text-[12px] font-semibold leading-none text-[#2A1208]">오른 산</span>}
            </span>
            <span className="block px-3 pb-3 pt-1.5">
                <span className="block truncate text-[17px] font-semibold text-[#F4EFE3]">{m.name}</span>
                <span className="mt-1 flex items-center gap-1 text-[13.5px] font-medium tabular-nums" style={{ color: ring }}><Arrow deg={m.bearing} />{compass8(m.bearing)}쪽 {nearKmText(m.km)}</span>
                <span className="mt-0.5 block truncate text-[12.5px] tabular-nums text-[#F4EFE399]">{facts || (m.kfs ? "산림청 100대 명산" : m.famous ? "명산" : "산")}</span>
            </span>
        </Link>
    );
}

/** 가까운 산의 줄 — 판에 놓인 산을 가까운 순으로. 카드의 두 산은 뺀다 */
function NearRows({ items, skip, done }: { items: readonly NearMountain[]; skip: ReadonlySet<string>; done: (m: NearMountain) => boolean }) {
    const rows = items.filter((m) => !skip.has(m.slug)).sort((a, b) => a.km - b.km);
    if (rows.length === 0) return null;
    return (
        <ul className="mt-2.5 rounded-2xl bg-[#FFFFFF0A] px-3.5" data-testid="hk-near-rows">
            {rows.map((m, i) => (
                <li key={m.slug} className={i ? "border-t border-[#FFFFFF14]" : ""}>
                    <Link href={hikingMountainPath(m.slug)} className="flex min-h-[50px] items-center gap-3 py-2 active:opacity-70" data-track-as="hiking-near-row">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: "#FFFFFF14", color: m.famous ? "#F6D9A8" : "#F4EFE3B3" }}><Arrow deg={m.bearing} size={15} /></span>
                        <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                                <span className="truncate text-[15px] text-[#F4EFE3]">{m.name}</span>
                                {m.kfs && <span className="shrink-0 rounded-full bg-[#F6D9A824] px-1.5 py-0.5 text-[12px] leading-none text-[#F6D9A8]">100대 명산</span>}
                                {done(m) && <span className="shrink-0 rounded-full bg-[#F28C6A33] px-1.5 py-0.5 text-[12px] leading-none text-[#F28C6A]">오른 산</span>}
                            </span>
                            <span className="mt-0.5 block truncate text-[12.5px] tabular-nums text-[#F4EFE38C]">{[heightText(m.heightM), m.courses > 0 ? `코스 ${m.courses}개` : ""].filter(Boolean).join(" · ") || "산"}</span>
                        </span>
                        <span className="shrink-0 text-[13px] tabular-nums text-[#F4EFE3B3]">{compass8(m.bearing)}쪽 {nearKmText(m.km)}</span>
                    </Link>
                </li>
            ))}
        </ul>
    );
}

export default NearMe;
