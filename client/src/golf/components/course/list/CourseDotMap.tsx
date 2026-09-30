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
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
// 투영·틀 맞추기·벌집 격자는 shared 로 옮겼다(2026-09-30) — 발자국 지도·공유 카드가 **같은 좌표**로 겹쳐 그려야 해서.
import { fitBox, toCells, type DotTone, type MapBox, type MapDot } from "@shared/golfDotMap";

export type { DotTone, MapDot, MapBox };

const LIVE_FILL: Record<"booking" | "join" | "urgent", string> = {
    booking: "#64DD17",
    join: "#FF6B00",
    urgent: "#FF3B30",
};
/** 한 칸의 골프장 수 → 밝기(1·2·3곳 이상). 한 칸에 점 하나라 반투명이어도 겹쳐 뿌예지지 않는다. */
const ON_FILL = ["#FFFFFF6B", "#FFFFFFA6", "#FFFFFFE6"] as const;
const DIM_FILL = "#FFFFFF1F";
/** 가라앉힌 점(발자국 지도 바탕, 2026-09-30) — 발자국이 주인공이라 한반도 점은 한 단계 흐리게(밝기 단계는 그대로). */
const MUTED_FILL = ["#FFFFFF33", "#FFFFFF4D", "#FFFFFF6B"] as const;
/**
 * 색 바탕 위(홈 배너 주황 카드, 2026-09-24 오너 "배경을 조인 주황으로") — 라임·주황 점이 바탕에 묻힌다.
 * 그래서 점은 흰색 단계로, 글이 있는 칸은 **짙은 점 + 흰 테두리**로 뒤집어 그린다(색 대신 명암으로 '지금 있음'을 말한다).
 */
const ON_COLOR = { on: ["#FFFFFF66", "#FFFFFFA6", "#FFFFFFF2"] as const, dim: "#FFFFFF33", live: "#2A0E00", ring: "#FFFFFF" };

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

export function CourseDotMap({ dots, focus, box: fixedBox, aspect = 0.62, cols = 34, bg = "#111111", onColor = false, muted = false, className, children }: {
    dots: MapDot[];
    /** 당겨 볼 점들(지역·시군의 골프장). 없으면 전국. */
    focus: { lat: number; lng: number }[] | null;
    /**
     * 틀을 직접 준다(발자국 지도, 2026-09-30) — focus 대신. 발자국 틀은 '방문한 곳 + 최소 폭'이라 fitBox 의 이상치 빼기
     * (제주 한 곳을 틀에서 빼는 규칙)를 타면 안 된다: 뺀 도장이 화면 밖으로 나간다. 비율은 aspect 와 같아야 한다.
     */
    box?: MapBox | null;
    /** 너비/높이 */
    aspect?: number;
    /** 가로 칸 수 — 많을수록 점이 잘다. 150px 안팎 카드에 34칸이면 점 지름 ≈ 3px. */
    cols?: number;
    /** 색 점 둘레 테두리(옆 점과 떼는 선) — 지도가 놓인 바탕색 */
    bg?: string;
    /** 색 바탕(주황 카드 등) 위에 그린다 — 흰 점 + 짙은 '지금 있음' 점 */
    onColor?: boolean;
    /** 점을 한 단계 흐리게 — 위에 겹쳐 그린 것(발자국)을 돋보이게 */
    muted?: boolean;
    className?: string;
    /** 점 위에 겹쳐 그릴 것(발자국) — **같은 viewBox 안**이라 당겨 들어가는 동안에도 점과 한 몸으로 움직인다. */
    children?: ReactNode;
}) {
    const fx = fixedBox?.join(",") ?? "";
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 틀은 값(fx)으로 비교한다. 배열이 새로 만들어질 때마다 애니메이션이 다시 돌지 않게.
    const target = useMemo<MapBox>(() => fixedBox ?? fitBox(focus?.length ? focus : dots, aspect), [fx, focus, dots, aspect]);
    const [box, setBox] = useState<MapBox>(target);
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
            setBox(from.map((v, i) => v + (target[i] - v) * k) as MapBox);
            if (k < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, [target]);

    // 격자는 도착할 화면(target) 기준 — 애니메이션 중에 칸이 바뀌면 점이 깜빡인다.
    const g = target[2] / cols;
    const cells = useMemo(() => toCells(dots, g), [dots, g]);

    return (
        // 겹쳐 그린 것(발자국)이 있으면 그쪽이 누를 수 있는 단추를 품는다 — 그때는 지도 전체를 가리지 않는다.
        <svg viewBox={box.join(" ")} preserveAspectRatio="xMidYMid meet" className={className} aria-hidden={children ? undefined : "true"} shapeRendering="geometricPrecision">
            {cells.map((c) => {
                if (c.tone === "booking" || c.tone === "join" || c.tone === "urgent") {
                    return onColor
                        ? <circle key={c.key} cx={c.x} cy={c.y} r={g * 0.46} fill={ON_COLOR.live} stroke={ON_COLOR.ring} strokeWidth={g * 0.14} />
                        : <circle key={c.key} cx={c.x} cy={c.y} r={g * 0.5} fill={LIVE_FILL[c.tone]} stroke={bg} strokeWidth={g * 0.16} paintOrder="stroke" />;
                }
                const fill = onColor
                    ? (c.tone === "dim" ? ON_COLOR.dim : ON_COLOR.on[Math.min(c.n, 3) - 1])
                    : (c.tone === "dim" ? DIM_FILL : (muted ? MUTED_FILL : ON_FILL)[Math.min(c.n, 3) - 1]);
                return <circle key={c.key} cx={c.x} cy={c.y} r={g * 0.3} fill={fill} />;
            })}
            {children}
        </svg>
    );
}
