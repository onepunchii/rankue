/**
 * 골프장 상세 '위치·연락'의 작은 지도 — 전국 점 지도에 **이 골프장 하나**를 켠다
 * (2026-10-05 오너: "이 점들이 우리만의 시그니처" → "응 순서대로" 6번: 같은 점 문법을 다른 곳에도).
 *
 *  · 켜진 점의 색은 허브 지도와 **같은 뜻**이다: 지금 글이 올라와 있으면 그 색(긴급 빨강·조인 주황·부킹 라임)에 숨 쉬는 테두리,
 *    내 관심 골프장이면 호박색, 아무것도 아니면 흰 점. 새 색을 지어내지 않는다.
 *  · 전국 골프장 목록(24KB)은 이 지도가 **화면에 들어올 때** 받는다 — 상세는 검색에서 바로 들어오는 화면이라 첫 화면을 무겁게
 *    하지 않는다(허브·홈을 거쳐 왔으면 이미 캐시에 있다). 받기 전에는 윤곽선과 켜진 점만 보인다.
 *  · 보는 그림이다(주소·카카오맵이 옆에 있다) — aria-hidden.
 * ⚠️ 리터럴 색만(CourseShell 머리말).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { MapDot } from "@shared/golfDotMap";
import { HERE_ASPECT, HERE_BOX, herePoint, type HereTone } from "@shared/golfHereMap";
import { useCourseList } from "../../../lib/courseApi";
import { CourseDotMap, DOT_COLOR } from "../list/CourseDotMap";
import { KoreaOutline } from "../list/KoreaOutline";

/** 지도 칸의 바탕 — 카드 면보다 한 단계 어둡게(작은 창처럼). 켜진 점의 테두리도 이 색 */
const BG = "#0A0A0A";

export function HereMap({ lat, lng, region, tone, width = 72 }: {
    lat: number | null; lng: number | null;
    /** 지역 묶음("경기") — 그 지역의 윤곽선을 조금 밝힌다 */
    region: string | null;
    tone: HereTone;
    /** 너비(px) — 높이는 비율로 */
    width?: number;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const [seen, setSeen] = useState(false);
    useEffect(() => {
        const el = ref.current;
        if (!el || seen) return;
        if (typeof IntersectionObserver === "undefined") { setSeen(true); return; }
        const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: "300px 0px" });
        io.observe(el);
        return () => io.disconnect();
    }, [seen]);

    const list = useCourseList({}, seen);
    const dots = useMemo<MapDot[]>(() => (list.data ?? [])
        .filter((c) => c.lat != null && c.lng != null)
        .map((c) => ({ key: c.slug, lat: c.lat as number, lng: c.lng as number, tone: "on" as const })), [list.data]);
    const still = useMemo(() => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, []);

    const here = herePoint(lat, lng);
    if (!here) return null;
    const u = HERE_BOX[2] / width; // 화면 1px = 지도 칸 u
    const live = tone === "urgent" || tone === "join" || tone === "booking";
    const color = tone ? DOT_COLOR[tone] : "#FFFFFF";
    const r = 3.4 * u;
    return (
        <div ref={ref} aria-hidden="true" className="relative shrink-0 rounded-xl overflow-hidden" style={{ width, aspectRatio: String(HERE_ASPECT), background: BG }}>
            <CourseDotMap
                dots={dots} focus={null} box={HERE_BOX} aspect={HERE_ASPECT} cols={15} bg={BG} muted className="absolute inset-0 w-full h-full"
                under={<KoreaOutline active={region} stroke="#FFFFFF26" activeStroke="#FFFFFF80" activeFill="#FFFFFF0F" width={0.6} />}
            >
                <g pointerEvents="none">
                    {live && !still ? (
                        <circle cx={here.x} cy={here.y} r={r * 1.3} fill={color} fillOpacity={0.3}>
                            <animate attributeName="r" values={`${r * 1.3};${r * 2.7};${r * 1.3}`} dur="2.8s" repeatCount="indefinite" />
                            <animate attributeName="fill-opacity" values="0.3;0.04;0.3" dur="2.8s" repeatCount="indefinite" />
                        </circle>
                    ) : (
                        <circle cx={here.x} cy={here.y} r={r * 2.1} fill={color} fillOpacity={live ? 0.24 : 0.16} />
                    )}
                    <circle cx={here.x} cy={here.y} r={r} fill={color} stroke={BG} strokeWidth={1.3 * u} paintOrder="stroke" />
                </g>
            </CourseDotMap>
        </div>
    );
}
