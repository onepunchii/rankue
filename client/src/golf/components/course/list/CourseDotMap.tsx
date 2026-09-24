/**
 * 골프장 점 지도(2026-09-24) — 윤곽선 없이 **골프장 좌표만으로** 한반도를 그린다.
 * 지어낸 게 없다: 점은 골프장 좌표(golf_course_pages.lat/lng)에서만 나오고, 지금 글이 있는 곳만 색이 들어온다.
 *
 * 셋째 판(2026-09-24 오너: "점이 너무 뿌옇게 보여서 깔끔해 보이지 않음 — 쨍쨍한, 깔끔한 점 느낌으로"):
 *   뿌옇던 이유는 두 가지였다 — ① 반투명 점 수백 개가 겹쳐 수도권이 안개처럼 뭉쳤고 ② 점이 1px 남짓이라 번졌다.
 *   그래서 **점 격자(도트 매트릭스)** 로 바꿨다. 화면을 벌집 격자로 나눠 한 칸에 점 하나만 찍는다(겹침 없음).
 *   한 칸에 골프장이 많을수록 밝게(1곳·2곳·3곳+ 세 단계), 글이 있는 칸은 그 색으로 조금 크게.
 *   후광(흐린 원)도 뺐다 — 색 점 둘레에 바탕색 테두리를 둘러 옆 점과 떼어 선명하게 보이게 한다.
 *
 * 지역·시군을 고르면 그쪽으로 부드럽게 당겨 들어간다(viewBox 를 rAF 로 옮긴다). 격자는 **도착할 화면** 기준이라
 * 당겨 들어가는 동안 점이 커지며 자리를 잡는다.
 *
 * 누르는 기능은 없다(점이 손가락보다 작다). 보는 그림이라 aria-hidden.
 */
import { useEffect, useMemo, useRef, useState } from "react";

export type DotTone = "dim" | "on" | "booking" | "join" | "urgent";
export interface MapDot { key: string; lat: number; lng: number; tone: DotTone }

const LIVE_FILL: Record<"booking" | "join" | "urgent", string> = {
    booking: "#64DD17",
    join: "#FF6B00",
    urgent: "#FF3B30",
};
/** 한 칸의 골프장 수 → 밝기(1·2·3곳 이상). 한 칸에 점 하나라 반투명이어도 겹쳐 뿌예지지 않는다. */
const ON_FILL = ["#FFFFFF6B", "#FFFFFFA6", "#FFFFFFE6"] as const;
const DIM_FILL = "#FFFFFF1F";
/**
 * 색 바탕 위(홈 배너 주황 카드, 2026-09-24 오너 "배경을 조인 주황으로") — 라임·주황 점이 바탕에 묻힌다.
 * 그래서 점은 흰색 단계로, 글이 있는 칸은 **짙은 점 + 흰 테두리**로 뒤집어 그린다(색 대신 명암으로 '지금 있음'을 말한다).
 */
const ON_COLOR = { on: ["#FFFFFF66", "#FFFFFFA6", "#FFFFFFF2"] as const, dim: "#FFFFFF33", live: "#2A0E00", ring: "#FFFFFF" };

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

/** 칸 하나에 여러 골프장이 들어오면 가장 급한 색이 이긴다. */
const RANK: Record<DotTone, number> = { dim: 0, on: 1, booking: 2, join: 3, urgent: 4 };

interface Cell { key: string; x: number; y: number; n: number; tone: DotTone }

/** 벌집 격자(홀수 줄은 반 칸 밀기)에 점을 모은다. g = 칸 너비(지도 좌표). */
function toCells(dots: MapDot[], g: number): Cell[] {
    const rowH = g * 0.866;
    const map = new Map<string, Cell>();
    for (const d of dots) {
        const x = px(d.lng), y = py(d.lat);
        const r = Math.round(y / rowH);
        const off = (r & 1) * (g / 2);
        const c = Math.round((x - off) / g);
        const k = `${r}:${c}`;
        const cur = map.get(k);
        if (!cur) map.set(k, { key: k, x: c * g + off, y: r * rowH, n: 1, tone: d.tone });
        else {
            if (d.tone !== "dim") cur.n += 1;
            if (RANK[d.tone] > RANK[cur.tone]) cur.tone = d.tone;
        }
    }
    // 색 있는 칸이 위에 오게(나중에 그린 것이 위)
    return [...map.values()].sort((a, b) => RANK[a.tone] - RANK[b.tone]);
}

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

export function CourseDotMap({ dots, focus, aspect = 0.62, cols = 34, bg = "#111111", onColor = false, className }: {
    dots: MapDot[];
    /** 당겨 볼 점들(지역·시군의 골프장). 없으면 전국. */
    focus: { lat: number; lng: number }[] | null;
    /** 너비/높이 */
    aspect?: number;
    /** 가로 칸 수 — 많을수록 점이 잘다. 150px 안팎 카드에 34칸이면 점 지름 ≈ 3px. */
    cols?: number;
    /** 색 점 둘레 테두리(옆 점과 떼는 선) — 지도가 놓인 바탕색 */
    bg?: string;
    /** 색 바탕(주황 카드 등) 위에 그린다 — 흰 점 + 짙은 '지금 있음' 점 */
    onColor?: boolean;
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

    // 격자는 도착할 화면(target) 기준 — 애니메이션 중에 칸이 바뀌면 점이 깜빡인다.
    const g = target[2] / cols;
    const cells = useMemo(() => toCells(dots, g), [dots, g]);

    return (
        <svg viewBox={box.join(" ")} preserveAspectRatio="xMidYMid meet" className={className} aria-hidden="true" shapeRendering="geometricPrecision">
            {cells.map((c) => {
                if (c.tone === "booking" || c.tone === "join" || c.tone === "urgent") {
                    return onColor
                        ? <circle key={c.key} cx={c.x} cy={c.y} r={g * 0.46} fill={ON_COLOR.live} stroke={ON_COLOR.ring} strokeWidth={g * 0.14} />
                        : <circle key={c.key} cx={c.x} cy={c.y} r={g * 0.5} fill={LIVE_FILL[c.tone]} stroke={bg} strokeWidth={g * 0.16} paintOrder="stroke" />;
                }
                const fill = onColor
                    ? (c.tone === "dim" ? ON_COLOR.dim : ON_COLOR.on[Math.min(c.n, 3) - 1])
                    : (c.tone === "dim" ? DIM_FILL : ON_FILL[Math.min(c.n, 3) - 1]);
                return <circle key={c.key} cx={c.x} cy={c.y} r={g * 0.3} fill={fill} />;
            })}
        </svg>
    );
}
