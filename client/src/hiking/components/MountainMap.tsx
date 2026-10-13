/**
 * 내 산 지도(2026-10-13 오너: "우리나라 지도를 일러스트 감성으로" → "지도도 디자인 개선 및 손가락 확대 축소 가능하게, 조금 더 디테일하게").
 *
 * 종이 지도 위에 산 그림을 놓는다 — 높은 산일수록 크게, 오른 산(done)에는 깃발. 산의 자리는 좌표로 정확히 놓고(틀리면 안 된다),
 * 파도 · 빗금 · 종이색 같은 장식만 그린다. 권역을 고르면 그 권역으로, 묶음(fit)이면 산이 몰린 쪽으로 당겨 들어가 시작한다.
 *
 * 손으로 움직인다: 두 손가락으로 벌려 키우고 오므려 줄인다 · 키운 뒤에는 한 손가락으로 끈다 · 두 번 누르면 그 자리로 두 배 ·
 * 오른쪽 위 단추(+ · − · 처음으로)로도 된다(두 손가락이 어려운 사람 · 마우스). 키우지 않은 동안에는 한 손가락이 화면을 그대로 스크롤한다.
 * 키울수록 더 많은 산의 이름이 보이고(겹치는 이름은 100대 명산 · 높은 산을 남긴다), 높이가 같이 적힌다.
 * 디테일: 시도 이름 · 바다 이름 · 위경도 눈금 · 축척 막대 · 방위표. 글자는 **화면에서 12px 아래로 내려가지 않게** 실제 너비를 재서 키운다.
 *
 * 윤곽선은 골프의 점 지도가 쓰는 것(golf/data/koreaMapData)을 **화면에서만** 빌려 쓴다 — 출처 기록이 없는 자료라 서버가 밖으로 내보내는
 * 그림(공유 카드)에는 쓰지 않는다. 그 윤곽선에는 울릉도 · 독도가 없어서 오른쪽 위에 따로 그려 넣는다(성인봉도 거기에 놓는다).
 * ⚠️ 리터럴 색만.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { KOREA_MAP_PATHS } from "@/golf/data/koreaMapData";
import { latLngToOutline } from "@/golf/lib/koreaOutline";
import { hikingMountainPath } from "@shared/hikingMountains";
import type { MountainSummary } from "../lib/api";

interface Box { x: number; y: number; w: number; h: number }
/** 전체 보기 — 동해 쪽을 넉넉히 둔다(울릉도 · 독도 칸이 뭍과 겹치지 않게) */
const FULL: Box = { x: 40, y: 15, w: 436, h: 640 };
/** 울릉도 · 독도 칸(전체 보기의 동해 위) */
const INSET = { x: 384, y: 150, w: 86, h: 56 };
/** 당겨 들어간 그림의 가로:세로 */
const ZOOM_ASPECT = 0.82;
/** 손으로 키울 수 있는 한도 — 시작 그림의 몇 배까지 */
const MAX_ZOOM = 8;
const LAND = Object.values(KOREA_MAP_PATHS);
const isUlleung = (m: MountainSummary) => m.sigungu === "울릉군";

/** 시도 이름을 놓는 자리(위경도 · 그 시도의 가운데쯤) — city 는 넓게 볼 때 숨기는 광역시 */
const PLACES: readonly { name: string; lat: number; lng: number; city?: boolean }[] = [
    { name: "경기", lat: 37.28, lng: 127.42 }, { name: "강원", lat: 37.72, lng: 128.32 }, { name: "충북", lat: 36.78, lng: 127.72 }, { name: "충남", lat: 36.52, lng: 126.82 },
    { name: "전북", lat: 35.72, lng: 127.12 }, { name: "전남", lat: 34.88, lng: 126.92 }, { name: "경북", lat: 36.38, lng: 128.82 }, { name: "경남", lat: 35.36, lng: 128.22 }, { name: "제주", lat: 33.27, lng: 126.56 },
    { name: "서울", lat: 37.56, lng: 126.98, city: true }, { name: "인천", lat: 37.46, lng: 126.66, city: true }, { name: "대전", lat: 36.34, lng: 127.39, city: true }, { name: "대구", lat: 35.84, lng: 128.57, city: true },
    { name: "광주", lat: 35.15, lng: 126.85, city: true }, { name: "부산", lat: 35.16, lng: 129.06, city: true }, { name: "울산", lat: 35.55, lng: 129.28, city: true }, { name: "세종", lat: 36.56, lng: 127.26, city: true },
];
const SEAS: readonly { name: string; lat: number; lng: number }[] = [{ name: "동해", lat: 36.55, lng: 130.05 }, { name: "서해", lat: 36.05, lng: 125.55 }, { name: "남해", lat: 33.95, lng: 128.25 }];
/** 지도의 가로 1단위가 몇 km 인가(위도 36° 근처) — 축척 막대에 쓴다 */
const KM_PER_UNIT = 90.1 / 93.94;
const SCALE_STEPS = [100, 50, 20, 10, 5, 2, 1] as const;

interface Spot { m: MountainSummary; x: number; y: number }
const clampBox = (v: Box, home: Box): Box => {
    const w = Math.min(home.w, Math.max(home.w / MAX_ZOOM, v.w)), h = w * (home.h / home.w);
    return { w, h, x: Math.min(home.x + home.w - w, Math.max(home.x, v.x)), y: Math.min(home.y + home.h - h, Math.max(home.y, v.y)) };
};

export function MountainMap({ mountains, done, region, fit = false, labelAll = false, interactive = true, className }: {
    /** 지도에 놓을 산(명산) */
    mountains: readonly MountainSummary[];
    /** 오른 산의 id — 깃발을 꽂는다 */
    done?: ReadonlySet<string>;
    /** 고른 권역 — 그 권역으로 당겨 들어간다 */
    region?: string | null;
    /** 놓인 산들이 한쪽에 몰려 있으면 그쪽으로 당겨 들어간다(묶음 목록 — 권역을 고르지 않았을 때만) */
    fit?: boolean;
    labelAll?: boolean;
    /** 손으로 키우고 끌 수 있는가 — 작게 세우는 자리('여기' 지도)에서는 끈다(단추 · 글자도 그리지 않는다) */
    interactive?: boolean;
    className?: string;
}) {
    const [, setLocation] = useLocation();
    const spots = useMemo<Spot[]>(() => mountains.filter((m) => m.lat != null && m.lng != null).map((m) => {
        if (isUlleung(m)) return { m, x: INSET.x + 24, y: INSET.y + 27 };
        const [x, y] = latLngToOutline(m.lat!, m.lng!);
        return { m, x, y };
    }).sort((a, b) => a.y - b.y), [mountains]);

    // 시작 그림 — 권역 · 몰려 있는 묶음이면 당겨 들어간 상자, 아니면 전체
    const home = useMemo<Box>(() => {
        const inRegion = region ? spots.filter((s) => s.m.region === region && !isUlleung(s.m)) : fit ? spots.filter((s) => !isUlleung(s.m)) : [];
        if (inRegion.length === 0) return FULL;
        const xs = inRegion.map((s) => s.x), ys = inRegion.map((s) => s.y);
        const pad = 26;
        let x = Math.min(...xs) - pad, y = Math.min(...ys) - pad, w = Math.max(...xs) - Math.min(...xs) + pad * 2, h = Math.max(...ys) - Math.min(...ys) + pad * 2;
        // 묶음의 산이 나라 곳곳에 퍼져 있으면(또는 울릉도의 산이 끼어 있으면) 당기지 않는다 — 전체 지도가 '어디어디인지'를 더 잘 말한다
        if (!region && (w > FULL.w * 0.62 || h > FULL.h * 0.62 || spots.some((s) => isUlleung(s.m)))) return FULL;
        // 그림 칸의 비(가로 39 : 세로 50)에 맞춰 넓힌다 — 좁은 권역이 길쭉하게 잘리지 않게
        if (w / h < ZOOM_ASPECT) { const nw = h * ZOOM_ASPECT; x -= (nw - w) / 2; w = nw; } else { const nh = w / ZOOM_ASPECT; y -= (nh - h) / 2; h = nh; }
        return { x, y, w, h };
    }, [region, fit, spots]);
    const regional = home !== FULL;

    // 지금 보는 상자 — 손으로 키우고 끌면 바뀐다. 시작 그림이 바뀌면(권역을 바꿈) 거기로 돌아간다
    const [view, setView] = useState<Box>(home);
    useEffect(() => { setView(home); }, [home]);
    const zoom = home.w / view.w;
    const zoomed = zoom > 1.02;

    // 화면에서의 실제 크기 — 글자를 12px 아래로 내리지 않으려면 1단위가 몇 px 인지 알아야 한다
    const svgRef = useRef<SVGSVGElement>(null);
    const [px, setPx] = useState(340);
    useEffect(() => {
        const el = svgRef.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver(() => { const w = el.clientWidth; if (w > 0) setPx(w); });
        ro.observe(el); setPx(el.clientWidth || 340);
        return () => ro.disconnect();
    }, []);
    const unit = view.w / px;              // 화면 1px = 지도 몇 단위
    const u = view.w / FULL.w;             // 전체 그림에 견준 지금 상자의 너비
    const fs = 12.5 * unit;                // 화면에서 12.5px 인 글자

    // ── 손짓 ─────────────────────────────────────────────────────────────
    const pointers = useRef(new Map<number, { x: number; y: number }>());
    const start = useRef<{ view: Box; dist: number; mx: number; my: number } | null>(null);
    const dragged = useRef(false);
    const viewRef = useRef(view); viewRef.current = view;
    const homeRef = useRef(home); homeRef.current = home;
    /** 화면의 한 점(clientX · clientY)을 붙잡은 채 scale 배로 — 그 점 밑의 땅이 그대로 있게 */
    const zoomAt = useCallback((cx: number, cy: number, scale: number, from?: Box) => {
        const el = svgRef.current; if (!el) return;
        const r = el.getBoundingClientRect(), v = from ?? viewRef.current, h = homeRef.current;
        const fx = (cx - r.left) / r.width, fy = (cy - r.top) / r.height;
        const w = Math.min(h.w, Math.max(h.w / MAX_ZOOM, v.w / scale)), hh = w * (h.h / h.w);
        setView(clampBox({ w, h: hh, x: v.x + fx * v.w - fx * w, y: v.y + fy * v.h - fy * hh }, h));
    }, []);
    const onDown = (e: React.PointerEvent<SVGSVGElement>) => {
        if (!interactive) return;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        dragged.current = false;
        const ps = [...pointers.current.values()];
        if (ps.length === 2) start.current = { view: viewRef.current, dist: Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) || 1, mx: (ps[0].x + ps[1].x) / 2, my: (ps[0].y + ps[1].y) / 2 };
        else start.current = { view: viewRef.current, dist: 0, mx: e.clientX, my: e.clientY };
    };
    const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
        if (!interactive || !pointers.current.has(e.pointerId) || !start.current) return;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const el = svgRef.current; if (!el) return;
        const r = el.getBoundingClientRect(), s = start.current, ps = [...pointers.current.values()];
        if (ps.length >= 2) {
            // 두 손가락 — 벌린 만큼 키우고, 두 손가락의 가운데가 움직인 만큼 끈다
            const dist = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) || 1, mx = (ps[0].x + ps[1].x) / 2, my = (ps[0].y + ps[1].y) / 2;
            const h = homeRef.current, w = Math.min(h.w, Math.max(h.w / MAX_ZOOM, s.view.w * (s.dist / dist))), hh = w * (h.h / h.w);
            const fx = (s.mx - r.left) / r.width, fy = (s.my - r.top) / r.height;
            setView(clampBox({ w, h: hh, x: s.view.x + fx * s.view.w - ((mx - r.left) / r.width) * w, y: s.view.y + fy * s.view.h - ((my - r.top) / r.height) * hh }, h));
            dragged.current = true;
        } else if (s.view.w < homeRef.current.w * 0.98) {
            // 한 손가락 — 키운 뒤에만 끈다(안 키웠을 때는 화면 스크롤이 먼저다)
            const dx = e.clientX - s.mx, dy = e.clientY - s.my;
            if (Math.hypot(dx, dy) > 5) dragged.current = true;
            setView(clampBox({ ...s.view, x: s.view.x - (dx / r.width) * s.view.w, y: s.view.y - (dy / r.height) * s.view.h }, homeRef.current));
        }
    };
    const onUp = (e: React.PointerEvent<SVGSVGElement>) => {
        pointers.current.delete(e.pointerId);
        const ps = [...pointers.current.values()];
        // 한 손가락이 남으면 거기서부터 다시 끈다
        start.current = ps.length === 1 ? { view: viewRef.current, dist: 0, mx: ps[0].x, my: ps[0].y } : null;
    };
    // 마우스 휠(트랙패드의 벌리기는 ctrl+휠로 온다) — 평소의 휠은 화면 스크롤에 맡긴다
    useEffect(() => {
        const el = svgRef.current;
        if (!el || !interactive) return;
        const onWheel = (e: WheelEvent) => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01)); };
        el.addEventListener("wheel", onWheel, { passive: false });
        return () => el.removeEventListener("wheel", onWheel);
    }, [interactive, zoomAt]);
    const step = (scale: number) => { const el = svgRef.current; if (!el) return; const r = el.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, scale); };
    const open = (slug: string) => { if (!dragged.current) setLocation(hikingMountainPath(slug)); };

    // ── 그릴 것 ──────────────────────────────────────────────────────────
    const shown = regional && region ? spots.filter((s) => s.m.region === region && !isUlleung(s.m)) : regional ? spots.filter((s) => !isUlleung(s.m)) : spots;
    const inView = (x: number, y: number, pad = 0) => x >= view.x - pad && x <= view.x + view.w + pad && y >= view.y - pad && y <= view.y + view.h + pad;
    /** 산 그림의 크기(단위) — 키울수록 화면에서는 조금씩만 커진다 */
    const glyph = (m: MountainSummary) => (m.lists.includes("kfs100") ? 7.5 : 5) * (0.8 + Math.min(1, (m.heightM ?? 300) / 1900) * 0.7) * Math.max(0.2, Math.pow(u, 0.62)) * (px < 200 ? 1.5 : 1);

    const labels = useMemo(() => {
        if (!interactive) return [] as { key: string; x: number; y: number; text: string; sub?: string; kind: "peak" | "place" | "sea" }[];
        const out: { key: string; x: number; y: number; text: string; sub?: string; kind: "peak" | "place" | "sea" }[] = [];
        const boxes: { x0: number; x1: number; y0: number; y1: number }[] = [];
        const free = (b: { x0: number; x1: number; y0: number; y1: number }) => !boxes.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0);
        // 산 이름 — 전체를 볼 때는 100대 명산만 후보, 당겨 들어가거나 키우면 보이는 산 전부. 겹치면 100대 명산 · 높은 산이 남는다
        const all = labelAll || regional || zoom >= 1.5;
        const cand = shown.filter((s) => inView(s.x, s.y) && (all || s.m.lists.includes("kfs100")))
            .sort((a, b) => Number(b.m.lists.includes("kfs100")) - Number(a.m.lists.includes("kfs100")) || (b.m.heightM ?? 0) - (a.m.heightM ?? 0));
        const withHeight = zoom >= 2.4 || (regional && zoom >= 1.6);
        // 전체를 볼 때 산이 아주 많으면(허브의 명산 300곳) 이름을 몇 개만 — 키우면 다 나온다
        const cap = all ? Infinity : mountains.length > 150 ? 16 : 44;
        let placed = 0;
        for (const s of cand) {
            if (placed >= cap) break;
            const g = glyph(s.m), x = s.x + g + 2.2 * unit, y = s.y + fs * 0.25;
            const sub = withHeight && s.m.heightM != null ? `${Math.round(s.m.heightM).toLocaleString("en-US")}m` : undefined;
            const w = Math.max(s.m.name.length * fs * 0.98, sub ? sub.length * fs * 0.6 : 0);
            const box = { x0: s.x - g, x1: x + w, y0: y - fs * 0.95, y1: y + (sub ? fs * 1.25 : fs * 0.3) };
            if (box.x1 > view.x + view.w - 2 * unit || !free(box)) continue;
            boxes.push(box); out.push({ key: `p:${s.m.id}`, x, y, text: s.m.name, sub, kind: "peak" });
            placed++;
        }
        // 시도 이름 — 산 이름이 먼저 자리를 잡고, 남는 자리에만 흐리게
        for (const p of PLACES) {
            if (p.city && zoom < 1.8 && !regional) continue;
            const [x, y] = latLngToOutline(p.lat, p.lng);
            if (!inView(x, y)) continue;
            const w = p.name.length * fs * 1.25;
            const box = { x0: x - w / 2, x1: x + w / 2, y0: y - fs, y1: y + fs * 0.35 };
            if (!free(box)) continue;
            boxes.push(box); out.push({ key: `a:${p.name}`, x, y, text: p.name, kind: "place" });
        }
        for (const p of SEAS) {
            const [x, y] = latLngToOutline(p.lat, p.lng);
            if (inView(x, y)) out.push({ key: `s:${p.name}`, x, y, text: p.name, kind: "sea" });
        }
        return out;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shown, view, px, labelAll, regional, interactive, mountains.length]);

    // 위경도 눈금 — 1도마다(키우면 0.5도마다)
    const grid = useMemo(() => {
        const stepDeg = zoom >= 3 ? 0.5 : 1, lines: string[] = [];
        for (let lat = 33; lat <= 39; lat += stepDeg) { const [x0, y] = latLngToOutline(lat, 124.5), [x1] = latLngToOutline(lat, 131.5); lines.push(`M${x0.toFixed(1)} ${y.toFixed(1)} H${x1.toFixed(1)}`); }
        for (let lng = 125; lng <= 131; lng += stepDeg) { const [x, y0] = latLngToOutline(39.5, lng), [, y1] = latLngToOutline(32.5, lng); lines.push(`M${x.toFixed(1)} ${y0.toFixed(1)} V${y1.toFixed(1)}`); }
        return lines.join(" ");
    }, [zoom >= 3]);
    // 축척 막대 — 화면에서 60px 안쪽인 가장 긴 눈금
    const scaleKm = SCALE_STEPS.find((k) => k / KM_PER_UNIT / unit <= 64) ?? 1;
    const scaleW = scaleKm / KM_PER_UNIT;

    const svg = (
        <svg ref={svgRef} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} className={interactive ? undefined : className} role="img" aria-label="명산 지도"
            style={{ display: "block", width: "100%", background: "#F4EFE3", borderRadius: 18, touchAction: !interactive ? "auto" : zoomed ? "none" : "pan-y", userSelect: "none", WebkitUserSelect: "none" }}
            data-testid="mountain-map" data-zoom={regional ? "1" : "0"} data-scale={zoom.toFixed(2)}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={onUp}
            onDoubleClick={interactive ? (e) => zoomAt(e.clientX, e.clientY, 2) : undefined}>
            <defs>
                <pattern id="hk-wave" width="26" height="12" patternUnits="userSpaceOnUse"><path d="M0 6 q6.5 -5 13 0 t13 0" fill="none" stroke="#1F556030" strokeWidth="1" /></pattern>
                <pattern id="hk-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><path d="M0 0 V5" stroke="#1F556014" strokeWidth="1.4" /></pattern>
            </defs>
            <rect x={FULL.x - 80} y={FULL.y - 80} width={FULL.w + 160} height={FULL.h + 160} fill="url(#hk-wave)" />
            <path d={grid} fill="none" stroke="#1F55601F" strokeWidth={0.6 * Math.max(u, 0.3)} strokeDasharray={`${2 * Math.max(u, 0.3)} ${3 * Math.max(u, 0.3)}`} />
            {/* 뭍 — 물가의 그늘 · 땅 · 빗금 · 시도의 경계 */}
            <g fill="#1F556026" transform="translate(0 0)" stroke="#1F556026" strokeWidth="5" strokeLinejoin="round">{LAND.map((d, i) => <path key={i} d={d} />)}</g>
            <g fill="#C9D2B4" opacity="0.55" transform="translate(2.5 3)">{LAND.map((d, i) => <path key={i} d={d} />)}</g>
            <g fill="#E6EAD2" stroke="#0E2A3340" strokeWidth={0.55} strokeLinejoin="round">{LAND.map((d, i) => <path key={i} d={d} />)}</g>
            <g fill="url(#hk-hatch)">{LAND.map((d, i) => <path key={i} d={d} />)}</g>
            {!regional && (
                <g data-testid="map-ulleung">
                    <rect x={INSET.x} y={INSET.y} width={INSET.w} height={INSET.h} rx="6" fill="#F4EFE3" stroke="#0E2A3340" strokeWidth="0.7" strokeDasharray="2 2" />
                    <ellipse cx={INSET.x + 24} cy={INSET.y + 22} rx="11" ry="9" fill="#E6EAD2" stroke="#0E2A3338" strokeWidth="0.5" />
                    <circle cx={INSET.x + 62} cy={INSET.y + 25} r="2.2" fill="#E6EAD2" stroke="#0E2A3355" strokeWidth="0.5" />
                    <circle cx={INSET.x + 67} cy={INSET.y + 23.5} r="1.7" fill="#E6EAD2" stroke="#0E2A3355" strokeWidth="0.5" />
                    {interactive && <text x={INSET.x + INSET.w / 2} y={INSET.y + 48} textAnchor="middle" fontSize={Math.min(fs, 13)} fill="#0E2A33B3">울릉도 · 독도</text>}
                </g>
            )}
            {/* 바다 · 시도 이름은 산 그림 밑에 */}
            <g pointerEvents="none">
                {labels.filter((l) => l.kind === "sea").map((l) => <text key={l.key} x={l.x} y={l.y} textAnchor="middle" fontSize={fs * 1.05} fontStyle="italic" letterSpacing={fs * 0.5} fill="#1F556073">{l.text}</text>)}
                {labels.filter((l) => l.kind === "place").map((l) => <text key={l.key} x={l.x} y={l.y} textAnchor="middle" fontSize={fs} letterSpacing={fs * 0.25} fill="#0E2A3359">{l.text}</text>)}
            </g>
            {shown.map((s) => {
                const big = s.m.lists.includes("kfs100");
                const size = glyph(s.m);
                const got = !!done?.has(s.m.id);
                const fill = got ? "#F28C6A" : big ? "#1F5560" : "#7FA39A", shade = got ? "#D2694A" : big ? "#143D46" : "#5F877E";
                const sw = 0.7 * Math.max(u, 0.2);
                return (
                    <g key={s.m.id} transform={`translate(${s.x.toFixed(1)} ${s.y.toFixed(1)})`} onClick={() => open(s.m.slug)} style={{ cursor: "pointer" }} data-mountain={s.m.slug} data-done={got ? "1" : "0"}>
                        <circle r={Math.max(size * 1.6, 11 * unit)} fill="transparent" />
                        {/* 큰 산은 어깨 봉우리를 하나 더 */}
                        {big && <path d={`M${-size * 1.55} 0 L${-size * 0.75} ${-size * 0.72} L${-size * 0.1} 0 Z`} fill={shade} stroke="#0E2A33" strokeWidth={sw} strokeLinejoin="round" />}
                        <path d={`M${-size} 0 L0 ${-size * 1.25} L${size} 0 Z`} fill={fill} stroke="#0E2A33" strokeWidth={sw} strokeLinejoin="round" />
                        {/* 볕이 안 드는 쪽 */}
                        <path d={`M0 ${-size * 1.25} L${size} 0 L${size * 0.18} 0 Z`} fill={shade} opacity="0.75" />
                        {(s.m.heightM ?? 0) >= 1200 && <path d={`M${-size * 0.34} ${-size * 0.82} L0 ${-size * 1.25} L${size * 0.34} ${-size * 0.82} L${size * 0.12} ${-size * 0.94} L${-size * 0.1} ${-size * 0.8} Z`} fill="#FFF6E3" />}
                        {got && (<><path d={`M0 ${-size * 1.25} V${-size * 2.1}`} stroke="#0E2A33" strokeWidth={0.8 * Math.max(u, 0.2)} /><path d={`M0 ${-size * 2.1} l${size * 0.7} ${size * 0.22} l${-size * 0.7} ${size * 0.24} Z`} fill="#F28C6A" stroke="#0E2A33" strokeWidth={0.5 * Math.max(u, 0.2)} /></>)}
                    </g>
                );
            })}
            {/* 산 이름은 산 그림 위의 층에 — 뒤에 그린 산이 앞의 이름을 덮지 않게 */}
            <g pointerEvents="none">
                {labels.filter((l) => l.kind === "peak").map((l) => (
                    <g key={l.key}>
                        <text x={l.x} y={l.y} fontSize={fs} fontWeight="600" fill="#0E2A33" stroke="#F4EFE3" strokeWidth={fs * 0.26} paintOrder="stroke">{l.text}</text>
                        {l.sub && <text x={l.x} y={l.y + fs * 0.98} fontSize={fs * 0.96} fill="#0E2A33A6" stroke="#F4EFE3" strokeWidth={fs * 0.24} paintOrder="stroke">{l.sub}</text>}
                    </g>
                ))}
            </g>
            {/* 방위표 · 축척 막대 — 보는 상자의 아래쪽에 붙어 다닌다 */}
            {interactive && (
                <g pointerEvents="none" data-testid="map-scale" data-km={scaleKm}>
                    <g transform={`translate(${view.x + 16 * unit} ${view.y + view.h - 16 * unit}) scale(${unit})`}>
                        <circle r="11" fill="#F4EFE3E6" stroke="#0E2A3355" strokeWidth="1" />
                        <path d="M0 -8 L3.2 3 L0 1 L-3.2 3 Z" fill="#0E2A33" />
                    </g>
                    <g transform={`translate(${view.x + view.w - 12 * unit - scaleW} ${view.y + view.h - 10 * unit})`}>
                        <path d={`M0 ${-4 * unit} V0 H${scaleW} V${-4 * unit}`} fill="none" stroke="#0E2A33" strokeWidth={1.4 * unit} />
                        <text x={scaleW / 2} y={-5 * unit} textAnchor="middle" fontSize={fs * 0.96} fill="#0E2A33" stroke="#F4EFE3" strokeWidth={fs * 0.24} paintOrder="stroke">{scaleKm}km</text>
                    </g>
                </g>
            )}
        </svg>
    );
    if (!interactive) return svg;
    const BTN = "flex h-10 w-10 items-center justify-center rounded-xl text-[20px] leading-none text-[#0E2A33] active:bg-[#E4DCC8] disabled:opacity-35";
    return (
        <div className={`relative ${className ?? ""}`} data-testid="mountain-map-wrap">
            {svg}
            <div className="absolute right-2 top-2 flex flex-col overflow-hidden rounded-xl" style={{ background: "#F4EFE3F2", boxShadow: "0 1px 4px rgba(14,42,51,0.28), inset 0 0 0 1px rgba(14,42,51,0.18)" }}>
                <button type="button" onClick={() => step(1.8)} disabled={zoom >= MAX_ZOOM - 0.01} aria-label="지도 키우기" data-testid="map-zoom-in" className={BTN}>+</button>
                <span className="h-px bg-[#0E2A3326]" aria-hidden />
                <button type="button" onClick={() => step(1 / 1.8)} disabled={!zoomed} aria-label="지도 줄이기" data-testid="map-zoom-out" className={BTN}>−</button>
            </div>
            {zoomed ? (
                <button type="button" onClick={() => setView(home)} data-testid="map-zoom-reset" className="absolute left-2 top-2 h-9 rounded-full px-3 text-[13px] font-medium text-[#0E2A33] active:bg-[#E4DCC8]" style={{ background: "#F4EFE3F2", boxShadow: "0 1px 4px rgba(14,42,51,0.28), inset 0 0 0 1px rgba(14,42,51,0.18)" }}>처음 크기로</button>
            ) : (
                <span className="pointer-events-none absolute left-2.5 top-2.5 rounded-full px-2.5 py-1.5 text-[12px] leading-none text-[#0E2A33B3]" style={{ background: "#F4EFE3D9" }} aria-hidden>두 손가락으로 키워 보세요</span>
            )}
        </div>
    );
}

export default MountainMap;
