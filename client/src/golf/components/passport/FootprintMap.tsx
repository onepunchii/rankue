/**
 * 도장깨기 발자국 지도(2026-09-30 오너: "내가 어디 구장 순서로 갔는지 귀엽게 나오게").
 *
 * 골프장 점 지도(윤곽선 없이 골프장 좌표로만 그린 한반도, 투영은 shared/golfDotMap) 위에 처음 간 순서대로
 * 살짝 휜 점선 길 → 좌우 번갈아 걷는 발자국(오래된 건 라임, 최근일수록 주황) → 번호 배지. 배지를 누르면 말풍선.
 *
 * 둘째 판(같은 날 오너: "발자국 지도 축소 확대 가능하게") — 두 손가락 확대, 확대 중 한 손가락 끌기, 두 번 두드리기,
 * 모서리 + · − · ⟲, 키보드 + · − · 0 · 방향키, 트랙패드 핀치(ctrl+휠). 1~4배.
 *  - 그림을 두 겹으로 나눴다. **세상 겹**(점·길)은 통째로 k 배 — 길은 non-scaling-stroke 라 굵기·점 간격이 화면 px 그대로.
 *    **표식 겹**(발자국·배지·지역 이름·말풍선)은 자리만 따라가고 크기는 그대로 — 확대해도 부풀지 않고 또렷하다.
 *  - 손가락이 움직이는 동안은 React 를 다시 그리지 않는다. 변환(transform) 속성만 rAF 로 고친다(점·발자국 수백 개).
 *    손을 떼면 그 배율로 **다시 계산**한다: 점 격자를 잘게(확대할수록 더 자세히), 발자국 보폭·배지 떼기·지역 이름을 새로.
 *  - 1배에선 세로 쓸기가 페이지 스크롤이다(touch-action: pan-y). 확대했을 때만 지도가 손가락을 가져간다(none).
 *  - 두드리기와 끌기는 움직인 거리로 가른다. 끌거나 벌린 뒤의 click 은 삼킨다(배지 말풍선이 잘못 열리지 않게).
 *  - 동작 줄이기(prefers-reduced-motion)면 걷는 애니메이션·확대 미끄러짐 없이 바로 그 그림으로.
 * 셋째 판(2026-10-05 오너: "4번(지역 정복 지도)을 점과 합치자" → "응 순서대로" 3번) — 세상 겹 맨 밑에 시도 윤곽선(`under`).
 *  가 본 지역은 옅은 라임, 20% 를 가 본 지역은 금색으로 칠해져 '지역 정복' 지도가 따로 필요 없다.
 * 공유 카드(server/services/golfFootprintsCard.ts)는 이 파일을 쓰지 않는다 — 같은 shared 셈으로 따로 그린다(윤곽선 없이 점만).
 * ⚠️ 리터럴 색만 — 골프 테마가 `.bg-white`·`.text-black/*` 를 바꿔 끼운다.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useLocation } from "wouter";
import { LucideChevronRight, LucideMinus, LucidePlus, LucideRotateCcw } from "@/lib/icons";
import { kstDateLabel } from "@/lib/kst";
import { coursePath } from "@shared/golfCourse";
import { MUTED_DOT_FILL, mapX, mapY, toCells, type MapBox, type MapDot } from "@shared/golfDotMap";
import {
    buildTrail, fitFootprintBox, labelsClear, placeFootprints, placedStops, spreadBadges, mixHex, FOOT, FOOT_COLORS, type FootprintStop,
} from "@shared/golfFootprints";
import {
    IDENTITY, ZOOM_MAX, ZOOM_STEP, mixView, panView, pinchView, project, sameView, visibleBox, zoomAt, type Pt, type ZoomView,
} from "./mapZoom";

/** 지도 칸 비율(너비/높이) — 바깥 틀(aspect-[0.82])과 같아야 말풍선·손가락 좌표가 맞는다 */
export const FOOTPRINT_MAP_ASPECT = 0.82;
/** 번호 배지 반지름(화면 px) */
const R = 12;

// 애니메이션은 CSS 로 — 발자국 수백 개를 JS 로 돌리면 저가 폰에서 끊긴다. 지연(animation-delay)만 발자국마다 다르다.
const CSS = `
@keyframes fp-draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
@keyframes fp-pop { 0% { opacity: 0; transform: scale(.35); } 65% { opacity: 1; transform: scale(1.18); } 100% { opacity: 1; transform: scale(1); } }
@keyframes fp-pulse { 0% { opacity: .6; transform: scale(1); } 100% { opacity: 0; transform: scale(2.3); } }
.fp-reveal { stroke-dasharray: 1 1; stroke-dashoffset: 1; animation: fp-draw var(--fp-dur) linear forwards; }
.fp-pop { opacity: 0; transform-box: fill-box; transform-origin: center; animation: fp-pop .42s cubic-bezier(.3,1.35,.5,1) forwards; }
.fp-pulse { opacity: 0; transform-box: fill-box; transform-origin: center; animation: fp-pulse 2.2s ease-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .fp-reveal { animation: none; stroke-dashoffset: 0; }
  .fp-pop { animation: none; opacity: 1; }
  .fp-pulse { animation: none; display: none; }
}`;

const dateLabel = (iso: string) => kstDateLabel(iso, { year: "numeric", month: "long", day: "numeric" });
const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const n2 = (v: number) => Math.round(v * 100) / 100;
const matrix = (v: ZoomView) => `matrix(${n2(v.k * 1000) / 1000} 0 0 ${n2(v.k * 1000) / 1000} ${n2(v.tx)} ${n2(v.ty)})`;

/**
 * 표식 하나의 자리 — 지도 좌표(x,y)는 보기를 따라가고, 화면 고정 어긋남(ox,oy — 발자국의 좌우 발, 떼어 놓은 배지)과
 * 뒤꼬리 변환(tail — 발자국의 방향·크기)은 배율과 무관하다.
 */
interface Mark { key: string; x: number; y: number; ox: number; oy: number; tail: string }
const place = (m: Mark, v: ZoomView) => `translate(${n2(v.k * m.x + v.tx + m.ox)} ${n2(v.k * m.y + v.ty + m.oy)})${m.tail}`;

export function FootprintMap({ stops, records = [], dots, playKey, selected, onSelect, under }: {
    /** 처음 간 순서 — 인증 도장만(번호·길) */
    stops: FootprintStop[];
    /** 현장 인증 없이 적은 골프장(기록 도장, 2026-09-30) — 번호·길 없이 흐린 점선 동그라미만 */
    records?: FootprintStop[];
    /** 바탕 점(전국 골프장 좌표) */
    dots: MapDot[];
    /** 바뀌면 발자국이 처음부터 다시 걷고 확대가 풀린다(연도 바꾸기) */
    playKey: string;
    /** 고른 도장 번호(1부터) */
    selected: number | null;
    onSelect: (n: number | null) => void;
    /**
     * 점 **밑에** 깔 것(2026-10-05 — 시도 윤곽선과 '가 본 지역' 칠, KoreaOutline). 세상 겹 안이라 확대·이동을 같이 탄다.
     * 누르는 자리는 아니다 — 이 지도의 두드리기는 배지·두 번 두드려 확대가 이미 쓰고 있다(지역은 지도 아래 칸에서 고른다).
     */
    under?: ReactNode;
}) {
    const [, setLocation] = useLocation();
    const wrapRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const worldRef = useRef<SVGGElement>(null);
    const calloutRef = useRef<HTMLDivElement>(null);
    const maskId = `fp-mask-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

    // 지도 폭(px) — 발자국 크기를 화면 기준으로 잡으려고 잰다. 8px 안쪽 변화는 무시(다시 계산할 만큼이 아니다).
    const [w, setW] = useState(340);
    useEffect(() => {
        const el = wrapRef.current;
        if (!el) return;
        const set = () => { const cw = el.clientWidth; if (cw > 0) setW((p) => (Math.abs(p - cw) > 8 ? cw : p)); };
        set();
        if (typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver(set);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const placed = useMemo(() => placedStops(stops), [stops]);
    const pts = useMemo(() => placed.map((s) => ({ x: s.x, y: s.y })), [placed]);
    // 기록 도장 자리 — 틀에는 넣는다(어디서 적었는지는 보이게), 길·번호에는 안 넣는다
    const placedRecords = useMemo(() => records
        .filter((r) => r.lat != null && r.lng != null && Number.isFinite(r.lat) && Number.isFinite(r.lng))
        .map((r) => ({ name: r.name, lat: r.lat as number, lng: r.lng as number, x: mapX(r.lng as number), y: mapY(r.lat as number) })), [records]);
    // 틀은 **값**으로 잡아 둔다 — 같은 도장을 다시 받아(새 배열) 틀이 새로 만들어져도 확대가 풀리지 않게
    const target0 = useMemo(() => fitFootprintBox([...placed, ...placedRecords], FOOTPRINT_MAP_ASPECT), [placed, placedRecords]);
    const targetKey = target0.map((v) => v.toFixed(2)).join(",");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- targetKey 가 값이다
    const target = useMemo(() => target0, [targetKey]);
    const targetRef = useRef(target);
    targetRef.current = target;

    // ── 보기(확대·이동) ── view 는 손을 뗀 뒤의 값(다시 계산의 기준), live 는 손가락이 움직이는 지금 값
    const [view, setView] = useState<ZoomView>(IDENTITY);
    const live = useRef<ZoomView>(IDENTITY);
    /** 마지막으로 다시 계산한 배율 — 두 손가락 도중에 다시 놓을지 가른다 */
    const geomK = useRef(1);
    geomK.current = view.k;

    // ── 연도를 바꾸면 틀이 새 자리로 미끄러진다(650ms) — viewBox 속성만 rAF 로. 확대는 풀린다 ──
    const shown = useRef<MapBox>(target);
    useEffect(() => {
        live.current = IDENTITY;
        setView(IDENTITY);
        const from = shown.current, to = target;
        const svg = svgRef.current;
        if (from.every((v, i) => Math.abs(v - to[i]) < 0.01) || !svg) { shown.current = to; return; }
        if (reducedMotion()) { shown.current = to; svg.setAttribute("viewBox", to.join(" ")); return; }
        let raf = 0; const t0 = performance.now();
        const step = (t: number) => {
            const e = easeOut(Math.min(1, (t - t0) / 650));
            shown.current = from.map((v, i) => v + (to[i] - v) * e) as MapBox;
            svg.setAttribute("viewBox", shown.current.join(" "));
            if (e < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        return () => { cancelAnimationFrame(raf); shown.current = to; };
    }, [target]);

    // ── 걷는 애니메이션: 연도마다 한 번. 끝나면(또는 손가락을 대면) 가만한 그림으로 — 다시 계산할 때 발자국이 또 걷지 않게 ──
    const dur = Math.min(3.4, 1 + 0.5 * Math.max(0, placed.length - 1));
    const [intro, setIntro] = useState<{ key: string; done: boolean }>({ key: playKey, done: false });
    const introDone = intro.key === playKey ? intro.done : false;
    useEffect(() => {
        if (reducedMotion()) { setIntro({ key: playKey, done: true }); return; }
        setIntro({ key: playKey, done: false });
        const t = setTimeout(() => setIntro({ key: playKey, done: true }), (dur + 0.8) * 1000);
        return () => clearTimeout(t);
    }, [playKey, dur]);
    const finishIntro = () => { if (!introDone) setIntro({ key: playKey, done: true }); };

    // ── 기하: 손을 뗀 배율(view.k) 기준으로 다시 잰다 ──
    const u = target[2] / Math.max(200, w); // 화면 1px = 지도 칸 u
    const kc = view.k;
    const uw = u / kc; // 화면 1px = 지도 좌표 uw (확대할수록 작아진다)
    // 점 격자 칸 수도 화면 폭·배율에 맞춘다 — 폰 340px ≈ 36칸(점 지름 약 5.6px). 확대하면 잘게 나눠 더 자세히
    const baseCols = Math.round(Math.min(64, Math.max(30, w / 9.5)));
    const g = target[2] / (baseCols * kc);
    const cells = useMemo(() => toCells(dots, g), [dots, g]);
    /**
     * 점은 원 수백 개 대신 **밝기별 path 셋** — 칸마다 길이 0 인 선(M x y h0)을 둥근 끝으로 그리면 점이 된다.
     * non-scaling-stroke 라 굵기(= 점 지름)가 화면 px 그대로: 손가락으로 벌리는 동안에도 점이 부풀지 않고 자리만 벌어진다
     * (원이었을 땐 4배로 벌리면 점이 45px 동그라미가 됐다 — 2026-09-30 시안). 원소가 셋뿐이라 그리기도 가볍다.
     * 확대하면 한 칸에 골프장이 대개 하나라 가장 흐린 단계만 남는다 — 한 단계 밝혀 지도가 비어 보이지 않게.
     */
    const dotD = 0.6 * (w / baseCols);
    const dotPaths = useMemo(() => {
        const lv: string[][] = [[], [], []];
        const boost = kc >= 1.6 ? 1 : 0;
        for (const c of cells) lv[Math.min(Math.min(c.n, 3) - 1 + boost, 2)].push(`M${n2(c.x)} ${n2(c.y)}h0`);
        return lv.map((a) => a.join(""));
    }, [cells, kc]);
    const trail = useMemo(() => buildTrail(pts), [pts]);
    const geo = useMemo(() => {
        const marks = placeFootprints(trail, pts, 15 * uw, 3.4 * uw, (R + 5) * uw);
        // 붙어 있는 골프장(용인·이천)은 배지를 떼어 놓고 원래 자리까지 선을 긋는다 — 확대하면 덜 떼어도 된다
        const spread = spreadBadges(pts, (2 * R + 4) * uw);
        // 지역 이름은 **보이는 곳** 기준으로 고른다. 글자(11.5px 두 자)+발자국 한 짝만큼 떨어져 있어야 남긴다
        const labels = labelsClear(visibleBox(view, target), spread, (R + 16) * uw, [...marks, ...trail.samples], 26 * uw, 18 * uw);
        return { marks, spread, labels };
    }, [trail, pts, uw, view, target]);
    const lastN = stops.length;

    // ── 표식 겹 목록(이번 그림) — 손가락이 움직일 때 이 목록으로 transform 만 고친다 ──
    const s = u * 0.95;
    const marks: Mark[] = [];
    geo.marks.forEach((m, i) => {
        // placeFootprints 는 좌우 발 어긋남(3.4px)을 이미 더해 준다 — 길 위 점으로 되돌리고, 어긋남은 화면 고정으로 다시 얹는다
        const a = (m.angle * Math.PI) / 180, nx = -Math.sin(a), ny = Math.cos(a);
        const off = 3.4 * m.side;
        marks.push({
            key: `f${i}`, x: m.x - nx * off * uw, y: m.y - ny * off * uw, ox: nx * off * u, oy: ny * off * u,
            tail: ` rotate(${n2(m.angle + 90)}) scale(${n2(m.side * s * 1000) / 1000} ${n2(s * 1000) / 1000})`,
        });
    });
    geo.labels.forEach((l) => marks.push({ key: `t${l.name}`, x: l.x, y: l.y, ox: 0, oy: 0, tail: "" }));
    placedRecords.forEach((r, i) => marks.push({ key: `r${i}`, x: r.x, y: r.y, ox: 0, oy: 0, tail: "" }));
    placed.forEach((st, i) => {
        const b = geo.spread[i];
        const ox = (b.x - st.x) * kc, oy = (b.y - st.y) * kc; // 떼어 놓은 만큼(지도 칸 단위, 배율 고정)
        marks.push({ key: `l${st.n}`, x: st.x, y: st.y, ox: 0, oy: 0, tail: "" });
        marks.push({ key: `b${st.n}`, x: st.x, y: st.y, ox, oy, tail: "" });
    });
    const markRef = useRef<Mark[]>(marks);
    markRef.current = marks;
    const nodes = useRef(new Map<string, SVGGElement>());
    const reg = (key: string) => (el: SVGGElement | null) => { if (el) nodes.current.set(key, el); else nodes.current.delete(key); };

    // ── 손가락 → 화면 ──
    const apply = (v: ZoomView) => {
        worldRef.current?.setAttribute("transform", matrix(v));
        for (const m of markRef.current) nodes.current.get(m.key)?.setAttribute("transform", place(m, v));
    };
    const frame = useRef(0);
    const schedule = () => {
        if (frame.current) return;
        frame.current = requestAnimationFrame(() => { frame.current = 0; apply(live.current); });
    };
    const hideCallout = () => { if (calloutRef.current) calloutRef.current.style.visibility = "hidden"; };
    const commit = (v: ZoomView) => {
        cancelAnimationFrame(frame.current); frame.current = 0;
        live.current = v;
        apply(v);
        setView(v);
        if (calloutRef.current) calloutRef.current.style.visibility = "";
    };
    const anim = useRef(0);
    const animateTo = (to: ZoomView) => {
        cancelAnimationFrame(anim.current);
        const from = live.current;
        if (sameView(from, to) || reducedMotion()) { commit(to); return; }
        hideCallout();
        const t0 = performance.now(), box = targetRef.current;
        const step = (t: number) => {
            const e = easeOut(Math.min(1, (t - t0) / 260));
            live.current = e >= 1 ? to : mixView(from, to, e, box);
            apply(live.current);
            if (e < 1) anim.current = requestAnimationFrame(step); else commit(to);
        };
        anim.current = requestAnimationFrame(step);
    };
    useEffect(() => () => { cancelAnimationFrame(anim.current); cancelAnimationFrame(frame.current); }, []);
    // 다시 그린 직후(연도·폭·배율이 바뀌어 표식이 새로 생김) — 지금 보기로 한 번 맞춘다
    useLayoutEffect(() => { apply(live.current); });
    useLayoutEffect(() => { if (calloutRef.current) calloutRef.current.style.visibility = ""; }, [selected]);

    /** 화면 좌표 → 지도 칸 좌표(틀과 지도 칸의 비율이 같아 여백 없이 그대로 맞는다) */
    const toBox = (cx: number, cy: number): Pt => {
        const r = svgRef.current?.getBoundingClientRect();
        const b = shown.current;
        if (!r || !r.width) return { x: b[0] + b[2] / 2, y: b[1] + b[3] / 2 };
        return { x: b[0] + ((cx - r.left) / r.width) * b[2], y: b[1] + ((cy - r.top) / r.height) * b[3] };
    };
    const boxPerPx = () => { const r = svgRef.current?.getBoundingClientRect(); return r?.width ? shown.current[2] / r.width : u; };
    const center = (): Pt => { const b = targetRef.current; return { x: b[0] + b[2] / 2, y: b[1] + b[3] / 2 }; };
    const zoomBy = (f: number, at: Pt = center()) => animateTo(zoomAt(live.current, live.current.k * f, at, targetRef.current));

    // ── 손가락 ──
    const ptrs = useRef(new Map<number, Pt>());
    const gest = useRef({ mode: "idle" as "idle" | "hold" | "pan" | "pinch", v0: IDENTITY, p0: { x: 0, y: 0 }, m0: { x: 0, y: 0 }, d0: 1, moved: false, t0: 0 });
    const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
    const swallow = useRef(false);
    const two = () => { const [a, b] = [...ptrs.current.values()]; return { m: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, d: Math.hypot(a.x - b.x, a.y - b.y) }; };

    const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        cancelAnimationFrame(anim.current);
        swallow.current = false;
        ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const g0 = gest.current;
        if (ptrs.current.size === 1) {
            Object.assign(g0, { mode: live.current.k > 1.001 ? "pan" : "hold", v0: live.current, p0: { x: e.clientX, y: e.clientY }, moved: false, t0: performance.now() });
            if (g0.mode === "pan") { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 이미 떠난 손가락 */ } }
        } else if (ptrs.current.size === 2) {
            const { m, d } = two();
            Object.assign(g0, { mode: "pinch", v0: live.current, m0: toBox(m.x, m.y), d0: Math.max(1, d), moved: true });
            for (const id of ptrs.current.keys()) { try { e.currentTarget.setPointerCapture(id); } catch { /* 무시 */ } }
            hideCallout();
            finishIntro();
        }
    };
    const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
        if (!ptrs.current.has(e.pointerId)) return;
        ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const g0 = gest.current;
        if (g0.mode === "pinch" && ptrs.current.size >= 2) {
            const { m, d } = two();
            live.current = pinchView(g0.v0, g0.m0, g0.d0, toBox(m.x, m.y), d, targetRef.current);
            schedule();
            // 벌리는 동안 발자국 보폭이 k 배로 벌어진다 — 1.45배 넘게 바뀔 때마다 그 배율로 다시 놓는다(손은 뗀 적 없다)
            if (Math.abs(Math.log(live.current.k / geomK.current)) > Math.log(1.45)) { geomK.current = live.current.k; setView(live.current); }
        } else if (g0.mode === "pan" || g0.mode === "hold") {
            const dx = e.clientX - g0.p0.x, dy = e.clientY - g0.p0.y;
            if (!g0.moved && Math.hypot(dx, dy) > (g0.mode === "pan" ? 5 : 8)) {
                g0.moved = true;
                if (g0.mode === "pan") { hideCallout(); finishIntro(); }
            }
            if (g0.mode === "pan" && g0.moved) {
                const k = boxPerPx();
                live.current = panView(g0.v0, dx * k, dy * k, targetRef.current);
                schedule();
            }
        }
    };
    const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
        if (!ptrs.current.delete(e.pointerId)) return;
        const g0 = gest.current;
        if (g0.mode === "pinch" && ptrs.current.size === 1) {
            // 한 손가락만 떼면 남은 손가락으로 이어서 끈다
            const [p] = ptrs.current.values();
            Object.assign(g0, { mode: live.current.k > 1.001 ? "pan" : "hold", v0: live.current, p0: p, moved: true });
            return;
        }
        if (ptrs.current.size > 0) return;
        const mode = g0.mode;
        g0.mode = "idle";
        if (mode === "pinch" || (mode === "pan" && g0.moved)) {
            swallow.current = true;
            // 1배 근처에서 놓으면 1배로 딱 맞춘다(틀이 조금 밀린 채 남지 않게)
            if (live.current.k < 1.04) animateTo(IDENTITY); else commit(live.current);
            return;
        }
        if (g0.moved || e.type !== "pointerup" || performance.now() - g0.t0 > 350) return;
        // 두드리기 — 두 번이면 그 자리를 두 배로(끝까지 확대돼 있으면 처음 크기로)
        const now = performance.now(), lt = lastTap.current;
        if (lt && now - lt.t < 320 && Math.hypot(e.clientX - lt.x, e.clientY - lt.y) < 30) {
            lastTap.current = null;
            swallow.current = true; // 두 번째 click 이 말풍선을 도로 닫지 않게
            finishIntro();
            const at = toBox(e.clientX, e.clientY);
            animateTo(live.current.k >= ZOOM_MAX - 0.01 ? IDENTITY : zoomAt(live.current, live.current.k * 2, at, targetRef.current));
        } else {
            lastTap.current = { t: now, x: e.clientX, y: e.clientY };
        }
    };

    // 트랙패드 핀치·ctrl+휠만 확대 — 그냥 휠은 페이지 스크롤이다(지도가 스크롤을 뺏지 않게)
    const wheelCommit = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        const el = wrapRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            if (!e.ctrlKey && !e.metaKey) return;
            e.preventDefault();
            cancelAnimationFrame(anim.current);
            hideCallout();
            // 트랙패드 핀치는 작은 값이 여러 번, ctrl+마우스 휠은 한 칸에 100 안팎 — 한 칸 ≈ 1.6배가 되게
            live.current = zoomAt(live.current, live.current.k * Math.exp(-e.deltaY * 0.005), toBox(e.clientX, e.clientY), targetRef.current);
            schedule();
            if (wheelCommit.current) clearTimeout(wheelCommit.current);
            wheelCommit.current = setTimeout(() => commit(live.current), 160);
        };
        el.addEventListener("wheel", onWheel, { passive: false });
        return () => { el.removeEventListener("wheel", onWheel); if (wheelCommit.current) clearTimeout(wheelCommit.current); };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- 셈은 전부 ref 로 읽는다
    }, []);

    const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        const zoomed = live.current.k > 1.001;
        const step = 48 * boxPerPx();
        const pan = (dx: number, dy: number) => animateTo(panView(live.current, dx, dy, targetRef.current));
        switch (e.key) {
            case "+": case "=": zoomBy(ZOOM_STEP); break;
            case "-": case "_": zoomBy(1 / ZOOM_STEP); break;
            case "0": animateTo(IDENTITY); break;
            case "ArrowLeft": if (!zoomed) return; pan(step, 0); break;
            case "ArrowRight": if (!zoomed) return; pan(-step, 0); break;
            case "ArrowUp": if (!zoomed) return; pan(0, step); break;
            case "ArrowDown": if (!zoomed) return; pan(0, -step); break;
            default: return;
        }
        e.preventDefault();
    };

    const toes = FOOT.toes.map(([cx, cy, r], i) => <circle key={i} cx={cx} cy={cy} r={r} />);
    const pop = (delay: number) => (introDone ? undefined : { className: "fp-pop", style: { animationDelay: `${delay.toFixed(3)}s` } });
    const sel = selected != null ? placed.findIndex((p) => p.n === selected) : -1;
    const lv = live.current;
    const byKey = new Map(marks.map((m) => [m.key, m]));
    const at = (key: string) => place(byKey.get(key)!, lv);
    const zoomed = view.k > 1.001;

    return (
        <div className="absolute inset-0">
            <style>{CSS}</style>
            <div
                ref={wrapRef}
                tabIndex={0}
                role="group"
                aria-roledescription="지도"
                aria-label="발자국 지도 — 두 손가락이나 더하기·빼기 키로 확대해요"
                className="absolute inset-0 outline-none select-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#64DD17] rounded-3xl"
                // 1배: 세로 쓸기는 페이지 스크롤(pan-y). 확대했을 때만 지도가 손가락을 다 가져간다
                style={{ touchAction: zoomed ? "none" : "pan-y", WebkitTouchCallout: "none", WebkitUserSelect: "none", cursor: zoomed ? "grab" : undefined }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerEnd}
                onPointerCancel={onPointerEnd}
                onClickCapture={(e) => { if (swallow.current) { swallow.current = false; e.stopPropagation(); e.preventDefault(); } }}
                onClick={() => onSelect(null)}
                onKeyDown={onKeyDown}
            >
                <svg ref={svgRef} viewBox={shown.current.join(" ")} preserveAspectRatio="xMidYMid meet" className="absolute inset-0 w-full h-full" shapeRendering="geometricPrecision">
                    {/* 세상 겹 — 점과 길은 통째로 확대된다 */}
                    <g ref={worldRef} transform={matrix(lv)}>
                        {under}
                        {dotPaths.map((d, i) => d && (
                            <path key={i} d={d} fill="none" stroke={MUTED_DOT_FILL[i]} strokeWidth={dotD} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                        ))}
                        {trail.d && (
                            <g key={playKey}>
                                {!introDone && (
                                    <defs>
                                        <mask id={maskId} maskUnits="userSpaceOnUse" x={target[0] - target[2]} y={target[1] - target[3]} width={target[2] * 3} height={target[3] * 3}>
                                            <path d={trail.d} fill="none" stroke="#FFFFFF" strokeWidth={12 * u} strokeLinecap="round" pathLength={1} className="fp-reveal" style={{ "--fp-dur": `${dur}s` } as CSSProperties} />
                                        </mask>
                                    </defs>
                                )}
                                {/* non-scaling-stroke: 굵기 1.7·점 간격 5.2 는 화면 px 그대로(확대해도 길이 굵어지지 않는다) */}
                                <path
                                    d={trail.d} mask={introDone ? undefined : `url(#${maskId})`} fill="none" stroke="#FFFFFF" strokeOpacity={0.32}
                                    strokeWidth={1.7} strokeLinecap="round" strokeDasharray="0.1 5.2" vectorEffect="non-scaling-stroke"
                                />
                            </g>
                        )}
                    </g>

                    {/* 표식 겹 — 자리만 따라가고 크기는 화면 px 그대로 */}
                    <g key={`o-${playKey}`}>
                        {geo.labels.map((l) => (
                            <g key={`t${l.name}`} ref={reg(`t${l.name}`)} transform={at(`t${l.name}`)} aria-hidden="true">
                                <text textAnchor="middle" dominantBaseline="central" fontSize={11.5 * u} fontWeight={600} fill="#FFFFFF" fillOpacity={0.3}>{l.name}</text>
                            </g>
                        ))}
                        {/* 기록 도장 — 흐린 점선 동그라미. 누르지 않는다(목록에서 본다) */}
                        {placedRecords.map((r, i) => (
                            <g key={`r${i}`} ref={reg(`r${i}`)} transform={at(`r${i}`)} aria-hidden="true">
                                <circle r={R * u * 0.78} fill="#0F0F0F" fillOpacity={0.75} stroke="#FFFFFF" strokeOpacity={0.6} strokeWidth={1.4 * u} strokeDasharray={`${2.6 * u} ${2 * u}`} />
                                <circle r={1.8 * u} fill="#FFFFFF" fillOpacity={0.55} />
                            </g>
                        ))}
                        {geo.marks.map((m, i) => (
                            <g key={`f${i}`} ref={reg(`f${i}`)} transform={at(`f${i}`)}>
                                <g {...pop(m.t * dur)} fill={mixHex(FOOT_COLORS.old, FOOT_COLORS.recent, m.t)}>
                                    <path d={FOOT.sole} />
                                    {toes}
                                </g>
                            </g>
                        ))}
                        {/* 떼어 놓은 배지 → 원래 자리 */}
                        {placed.map((st, i) => {
                            const b = geo.spread[i];
                            const dx = (b.x - st.x) * kc, dy = (b.y - st.y) * kc;
                            if (Math.hypot(dx, dy) < R * u * 0.3) return null;
                            return (
                                <g key={`l${st.n}`} ref={reg(`l${st.n}`)} transform={at(`l${st.n}`)}>
                                    <g {...pop(geo.spread.length ? trail.stopAt[i] * dur : 0)}>
                                        <line x1={0} y1={0} x2={dx} y2={dy} stroke="#FFFFFF" strokeOpacity={0.45} strokeWidth={1.2 * u} />
                                        <circle cx={0} cy={0} r={2.2 * u} fill="#FFFFFF" fillOpacity={0.85} />
                                    </g>
                                </g>
                            );
                        })}
                        {placed.map((st, i) => {
                            const latest = st.n === lastN;
                            const on = selected === st.n;
                            const c = latest ? FOOT_COLORS.latest : FOOT_COLORS.stop;
                            return (
                                <g
                                    key={`b${st.n}`}
                                    ref={reg(`b${st.n}`)}
                                    transform={at(`b${st.n}`)}
                                    role="button"
                                    tabIndex={0}
                                    aria-label={`${st.n}번째 발자국 ${st.name}, 첫 방문 ${dateLabel(st.firstVisitedAt)}, ${st.visits}회`}
                                    aria-pressed={on}
                                    onClick={(e) => { e.stopPropagation(); onSelect(on ? null : st.n); }}
                                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onSelect(on ? null : st.n); } }}
                                    className="cursor-pointer outline-none"
                                >
                                    {/* 손가락 크기 누르는 자리(보이지 않음) */}
                                    <circle r={22 * u} fill="transparent" />
                                    {latest && <circle className="fp-pulse" r={R * u} fill="none" stroke={c} strokeWidth={2 * u} style={{ animationDelay: `${introDone ? 0 : dur.toFixed(2)}s` }} />}
                                    <g {...pop(trail.stopAt[i] * dur)}>
                                        <circle r={R * u * (latest ? 1.6 : 1.42)} fill={c} fillOpacity={latest ? 0.24 : 0.16} />
                                        {on && <circle r={(R + 3.4) * u} fill="none" stroke="#FFFFFF" strokeWidth={2 * u} />}
                                        <circle r={R * u} fill={c} stroke="#0F0F0F" strokeWidth={2 * u} />
                                        <text
                                            textAnchor="middle" dominantBaseline="central"
                                            fontSize={(st.n >= 10 ? 10 : 12.5) * u} fontWeight={800}
                                            fill={latest ? "#FFFFFF" : FOOT_COLORS.stopInk}
                                            style={{ fontVariantNumeric: "tabular-nums" }}
                                        >
                                            {st.n}
                                        </text>
                                    </g>
                                </g>
                            );
                        })}
                    </g>
                </svg>

                {sel >= 0 && (() => {
                    const st = placed[sel];
                    const p = project(view, geo.spread[sel]);
                    const lx = ((p.x - target[0]) / target[2]) * 100;
                    const ty = ((p.y - target[1]) / target[3]) * 100;
                    if (lx < -2 || lx > 102 || ty < -2 || ty > 102) return null; // 확대해서 화면 밖으로 나간 배지
                    const tx = lx < 28 ? "-14%" : lx > 72 ? "-86%" : "-50%";
                    const above = ty > 34;
                    const latest = st.n === lastN;
                    return (
                        <div
                            ref={calloutRef}
                            className="absolute z-10 w-max max-w-[230px]"
                            style={{ left: `${lx}%`, top: `${ty}%`, transform: `translate(${tx}, ${above ? `calc(-100% - ${R + 12}px)` : `${R + 12}px`})` }}
                            onClick={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                        >
                            <div className="rounded-2xl bg-[#FFFFFF] px-3.5 py-2.5 shadow-xl shadow-[#00000066]">
                                <p className={latest ? "text-[11.5px] font-semibold text-[#E85200]" : "text-[11.5px] font-semibold text-[#3F8F0F]"}>
                                    {st.n}번째 발자국{latest ? " · 최근" : ""}
                                </p>
                                <p className="mt-0.5 text-[15px] font-bold leading-snug text-[#0A0A0A] truncate">{st.name}</p>
                                <p className="mt-0.5 text-[12.5px] text-[#0A0A0A99] tabular-nums whitespace-nowrap">
                                    첫 방문 {dateLabel(st.firstVisitedAt)} · {st.visits}회
                                </p>
                                {st.slug && (
                                    <button
                                        type="button"
                                        onClick={() => setLocation(coursePath(st.slug!))}
                                        className="mt-1.5 -mb-0.5 inline-flex items-center gap-0.5 text-[12.5px] font-semibold text-[#0A0A0A] active:opacity-60"
                                    >
                                        골프장 보기 <LucideChevronRight weight="bold" className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })()}
            </div>

            {/* 확대 단추 — 오른쪽 아래. ⟲ 는 확대했을 때만 */}
            <div className="absolute right-2.5 bottom-2.5 flex flex-col items-center rounded-2xl bg-[#161616E6] ring-1 ring-inset ring-[#FFFFFF1A] shadow-lg shadow-[#00000059] backdrop-blur-sm overflow-hidden">
                <ZoomButton label="확대" disabled={view.k >= ZOOM_MAX - 0.01} onClick={() => zoomBy(ZOOM_STEP)}><LucidePlus weight="bold" className="w-4 h-4" /></ZoomButton>
                <span aria-hidden="true" className="w-5 h-px bg-[#FFFFFF1F]" />
                <ZoomButton label="축소" disabled={!zoomed} onClick={() => zoomBy(1 / ZOOM_STEP)}><LucideMinus weight="bold" className="w-4 h-4" /></ZoomButton>
                {zoomed && (
                    <>
                        <span aria-hidden="true" className="w-5 h-px bg-[#FFFFFF1F]" />
                        <ZoomButton label="처음 크기로" onClick={() => animateTo(IDENTITY)}><LucideRotateCcw weight="bold" className="w-[15px] h-[15px]" /></ZoomButton>
                    </>
                )}
            </div>
        </div>
    );
}

function ZoomButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            disabled={disabled}
            onClick={onClick}
            className="w-9 h-9 flex items-center justify-center text-[#ffffff] active:bg-[#FFFFFF14] disabled:text-[#FFFFFF40] disabled:active:bg-transparent transition-colors"
        >
            {children}
        </button>
    );
}
