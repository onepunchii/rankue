/**
 * 손으로 키우고 끄는 그림 상자(2026-10-13) — 코스 지도(components/CourseMap)가 쓴다. 명산 지도(MountainMap)의 손짓과 같은 약속이다:
 *   · 두 손가락을 벌리면 그 가운데를 붙잡은 채 커진다. 두 번 누르면 그 자리로 2배.
 *   · 한 손가락으로 끄는 것은 **키운 뒤에만** — 안 키웠을 때는 화면 스크롤이 먼저다(touch-action: pan-y).
 *   · 마우스 휠은 ctrl/⌘ 과 함께일 때만(트랙패드의 벌리기) — 평소의 휠은 화면 스크롤에 맡긴다.
 * 상자의 단위는 부르는 쪽 마음이다(코스 지도는 km).
 * home 은 가장 넓게 볼 수 있는 그림(그 밖으로는 나가지 않는다), start 는 처음 보이는 그림(고른 코스에 맞춘 것 — home 보다 좁을 수 있다).
 * start 가 바뀌면(다른 코스를 고르면) 그리로 옮겨 간다. minW 는 가장 크게 키웠을 때의 보이는 너비.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import { clampKmBox, type KmBox } from "@shared/hikingCourseMap";

export function useBoxZoom(home: KmBox, start: KmBox, minW: number) {
    const [view, setView] = useState<KmBox>(start);
    useEffect(() => { setView(start); }, [start]);
    const svgRef = useRef<SVGSVGElement>(null);
    // 화면에서의 실제 너비 — 글자 · 선의 굵기를 px 로 맞추려면 1단위가 몇 px 인지 알아야 한다
    const [px, setPx] = useState(320);
    useEffect(() => {
        const el = svgRef.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver(() => { const w = el.clientWidth; if (w > 0) setPx(w); });
        ro.observe(el); setPx(el.clientWidth || 320);
        return () => ro.disconnect();
    }, []);

    const pointers = useRef(new Map<number, { x: number; y: number }>());
    const grab = useRef<{ view: KmBox; dist: number; mx: number; my: number } | null>(null);
    const dragged = useRef(false);
    const viewRef = useRef(view); viewRef.current = view;
    const homeRef = useRef(home); homeRef.current = home;
    const startRef = useRef(start); startRef.current = start;
    const clamp = useCallback((b: KmBox) => clampKmBox(b, homeRef.current, minW), [minW]);
    const widthOf = (w: number) => { const h = homeRef.current; return Math.min(h.w, Math.max(Math.min(h.w, minW), w)); };

    /** 화면의 한 점을 붙잡은 채 scale 배로 — 그 점 밑의 땅이 그대로 있게 */
    const zoomAt = useCallback((cx: number, cy: number, scale: number) => {
        const el = svgRef.current; if (!el) return;
        const r = el.getBoundingClientRect(), v = viewRef.current, h = homeRef.current;
        const fx = (cx - r.left) / r.width, fy = (cy - r.top) / r.height;
        const w = widthOf(v.w / scale), hh = w * (h.h / h.w);
        setView(clamp({ w, h: hh, x: v.x + fx * v.w - fx * w, y: v.y + fy * v.h - fy * hh }));
    }, [clamp]);

    const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        dragged.current = false;
        const ps = [...pointers.current.values()];
        grab.current = ps.length === 2
            ? { view: viewRef.current, dist: Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) || 1, mx: (ps[0].x + ps[1].x) / 2, my: (ps[0].y + ps[1].y) / 2 }
            : { view: viewRef.current, dist: 0, mx: e.clientX, my: e.clientY };
    };
    const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
        if (!pointers.current.has(e.pointerId) || !grab.current) return;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const el = svgRef.current; if (!el) return;
        const r = el.getBoundingClientRect(), s = grab.current, ps = [...pointers.current.values()], h = homeRef.current;
        if (ps.length >= 2) {
            const dist = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) || 1, mx = (ps[0].x + ps[1].x) / 2, my = (ps[0].y + ps[1].y) / 2;
            const w = widthOf(s.view.w * (s.dist / dist)), hh = w * (h.h / h.w);
            const fx = (s.mx - r.left) / r.width, fy = (s.my - r.top) / r.height;
            setView(clamp({ w, h: hh, x: s.view.x + fx * s.view.w - ((mx - r.left) / r.width) * w, y: s.view.y + fy * s.view.h - ((my - r.top) / r.height) * hh }));
            dragged.current = true;
        } else if (s.view.w < startRef.current.w * 0.98) {
            // 한 손가락 — 처음 그림보다 키운 뒤에만 끈다(안 키웠을 때는 화면 스크롤이 먼저다)
            const dx = e.clientX - s.mx, dy = e.clientY - s.my;
            if (Math.hypot(dx, dy) > 5) dragged.current = true;
            setView(clamp({ ...s.view, x: s.view.x - (dx / r.width) * s.view.w, y: s.view.y - (dy / r.height) * s.view.h }));
        }
    };
    const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
        pointers.current.delete(e.pointerId);
        const ps = [...pointers.current.values()];
        // 한 손가락이 남으면 거기서부터 다시 끈다
        grab.current = ps.length === 1 ? { view: viewRef.current, dist: 0, mx: ps[0].x, my: ps[0].y } : null;
    };
    useEffect(() => {
        const el = svgRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01)); };
        el.addEventListener("wheel", onWheel, { passive: false });
        return () => el.removeEventListener("wheel", onWheel);
    }, [zoomAt]);

    const zoom = start.w / view.w;
    /** 처음 그림보다 키웠다 — 한 손가락으로 끌 수 있다 */
    const zoomed = zoom > 1.02;
    /** 처음 그림에서 벗어났다(키웠거나 줄였거나 옮겼다) — '처음 크기로'를 보인다 */
    const moved = Math.abs(zoom - 1) > 0.02 || Math.abs(view.x - start.x) > start.w * 0.01 || Math.abs(view.y - start.y) > start.h * 0.01;
    /** 가운데를 붙잡고 scale 배 */
    const step = (scale: number) => { const el = svgRef.current; if (!el) return; const r = el.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, scale); };
    return {
        svgRef, view, px, zoom, zoomed, moved, step,
        /** 더 키울 수 있나 · 더 줄일 수 있나 */
        canIn: view.w > Math.min(home.w, minW) * 1.01, canOut: view.w < home.w * 0.99,
        /** 주어진 상자로 간다(처음 그림 안에 가둔다) */
        go: (b: KmBox) => setView(clamp(b)),
        reset: () => setView(startRef.current),
        wide: () => setView(homeRef.current),
        /** 방금 끌었는가 — 끈 손가락이 떨어질 때 '누름'으로 치지 않으려고 */
        wasDragged: () => dragged.current,
        handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onPointerLeave: onPointerUp, onDoubleClick: (e: React.MouseEvent<SVGSVGElement>) => zoomAt(e.clientX, e.clientY, 2) },
        touchAction: zoomed ? "none" as const : "pan-y" as const,
    };
}
