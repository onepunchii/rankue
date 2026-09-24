/**
 * 골프장 점 지도(2026-09-24) — 윤곽선 없이 **골프장 좌표만으로** 한반도를 그린다.
 * 지어낸 게 없다: 점 하나가 골프장 한 곳(golf_course_pages.lat/lng)이고, 지금 글이 있는 곳만 색이 들어온다.
 *
 * 지역·시군을 고르면 그쪽으로 부드럽게 당겨 들어간다(viewBox 를 rAF 로 옮긴다). 점 크기는 확대와 상관없이
 * 화면에서 같은 크기로 보이게 viewBox 너비에 비례해 다시 잡는다 — 안 그러면 시군으로 들어가면 점이 동전만 해진다.
 *
 * 누르는 기능은 없다(점이 손가락보다 작다). 보는 그림이라 aria-hidden.
 */
import { useEffect, useMemo, useRef, useState } from "react";

export type DotTone = "dim" | "on" | "booking" | "join" | "urgent";
export interface MapDot { key: string; lat: number; lng: number; tone: DotTone }

const TONE_FILL: Record<DotTone, string> = {
    dim: "#FFFFFF14",
    on: "#FFFFFF59",
    booking: "#64DD17",
    join: "#FF6B00",
    urgent: "#FF3B30",
};

// 등거리 투영에 위도 36° 코사인을 곱한다 — 한반도 안에서는 이 정도면 모양이 맞는다.
const px = (lng: number) => (lng - 125.5) * 81;
const py = (lat: number) => (38.8 - lat) * 100;

type Box = [number, number, number, number];

/** 점들을 감싸는 상자를 화면 비율(aspect = 너비/높이)에 맞춰 넓힌다. 너무 좁으면(시군 하나) 최소 폭을 둔다. */
function fitBox(pts: { lat: number; lng: number }[], aspect: number): Box {
    if (!pts.length) return fitBox([{ lat: 33.2, lng: 126.1 }, { lat: 38.4, lng: 129.5 }], aspect);
    // 좌표가 엉뚱한 도에 찍힌 골프장이 몇 곳 있다(2026-09-24 검토: 4곳) — 한 점이 틀을 넓히면 경상·전라를 골라도 확대가 안 된다.
    // 가운데(중앙값)에서 1.2도 넘게 떨어진 점은 틀 계산에서 뺀다(점은 그대로 그린다). 점이 적으면 빼지 않는다.
    if (pts.length >= 5) {
        const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
        const mLat = med(pts.map((p) => p.lat)), mLng = med(pts.map((p) => p.lng));
        const near = pts.filter((p) => Math.abs(p.lat - mLat) <= 1.2 && Math.abs(p.lng - mLng) <= 1.2);
        if (near.length >= Math.ceil(pts.length * 0.8)) pts = near;
    }
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pts) {
        const x = px(p.lng), y = py(p.lat);
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    let w = Math.max(x1 - x0, 44) * 1.22, h = Math.max(y1 - y0, 44) * 1.16;
    if (w / h > aspect) h = w / aspect; else w = h * aspect;
    return [cx - w / 2, cy - h / 2, w, h];
}

/** 색 있는 점이 흐린 점에 덮이지 않게 그리는 순서(나중 것이 위). */
const ORDER: Record<DotTone, number> = { dim: 0, on: 1, booking: 2, join: 3, urgent: 4 };

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

export function CourseDotMap({ dots, focus, aspect = 0.62, className }: {
    dots: MapDot[];
    /** 당겨 볼 점들(지역·시군의 골프장). 없으면 전국. */
    focus: { lat: number; lng: number }[] | null;
    /** 너비/높이 */
    aspect?: number;
    className?: string;
}) {
    const target = useMemo(() => fitBox(focus?.length ? focus : dots, aspect), [focus, dots, aspect]);
    const [box, setBox] = useState<Box>(target);
    const boxRef = useRef(box);
    boxRef.current = box;

    useEffect(() => {
        const from = boxRef.current;
        if (from.every((v, i) => Math.abs(v - target[i]) < 0.01)) return;
        const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        if (reduce) { setBox(target); return; }
        let raf = 0; const t0 = performance.now(); const dur = 650;
        const step = (t: number) => {
            const k = ease(Math.min(1, (t - t0) / dur));
            setBox(from.map((v, i) => v + (target[i] - v) * k) as Box);
            if (k < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, [target]);

    const unit = box[2] / 100; // 화면 너비의 1%
    const sorted = useMemo(() => [...dots].sort((a, b) => ORDER[a.tone] - ORDER[b.tone]), [dots]);

    return (
        <svg viewBox={box.join(" ")} preserveAspectRatio="xMidYMid meet" className={className} aria-hidden="true">
            {sorted.map((d) => {
                const x = px(d.lng), y = py(d.lat);
                const live = d.tone === "booking" || d.tone === "join" || d.tone === "urgent";
                const r = (live ? 2.4 : d.tone === "on" ? 1.15 : 1) * unit;
                return (
                    <g key={d.key}>
                        {/* 지금 티타임이 있는 곳 — 번쩍이는 대신 옅은 후광 하나(2026-09-24 둘째 판) */}
                        {live && <circle cx={x} cy={y} r={r * 2.6} fill={TONE_FILL[d.tone]} opacity={0.18} />}
                        <circle cx={x} cy={y} r={r} fill={TONE_FILL[d.tone]} />
                    </g>
                );
            })}
        </svg>
    );
}
