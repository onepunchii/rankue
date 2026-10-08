/**
 * 골프장 상세 '위치·연락'의 지도 — 전국 점 지도에 **이 골프장 하나**를 켠다
 * (2026-10-05 오너: "이 점들이 우리만의 시그니처" → "응 순서대로" 6번: 같은 점 문법을 다른 곳에도).
 *
 * 둘째 판(2026-10-08 오너: "이 골프장이 어디인지 직관적으로 확인이 가능하게 지도를 키워서 좌측으로, 버튼을 우측 배열 …
 * 경계선 및 해당 골프장 점은 다른 색으로"):
 *  · 72px 짜리 작은 창이던 것을 카드 왼쪽에 **세로로 길게**(나라가 꽉 차는 비율) 세운다. 점도 잘게 — 골프장 하나가 점 하나에 가깝게.
 *  · 전부 흰색·회색이라 '여기'가 안 읽혔다. 이 지역(경계선 + 옅은 면)과 '여기' 고리를 **골프 강조색(라임)** 으로 —
 *    허브에서 고른 지역의 윤곽선·주소 옆 핀과 같은 색이다. 다른 지역의 선은 아주 옅게.
 *  · '여기' = 라임 고리 + 가운데 점. 가운데 점은 허브 지도와 **같은 뜻**이다: 지금 글이 올라와 있으면 그 색(긴급 빨강·조인 주황·
 *    부킹 라임)에 숨 쉬는 후광, 내 관심 골프장이면 호박색, 아무것도 아니면 흰 점. 새 뜻을 지어내지 않는다 — 고리는 '자리', 점은 '상태'.
 *  · 이 지역은 한 덩어리 면으로(RegionShape) — 조각이 맞닿는 안쪽 선을 긋지 않는다(같은 날 '이 근처' 카드에서 배운 것).
 *  · 전국 골프장 목록(24KB)은 이 지도가 **화면에 들어올 때** 받는다 — 상세는 검색에서 바로 들어오는 화면이라 첫 화면을 무겁게
 *    하지 않는다(허브·홈을 거쳐 왔으면 이미 캐시에 있다). 받기 전에는 윤곽선과 '여기'만 보인다.
 *  · 보는 그림이다(주소·카카오맵이 옆에 있다) — aria-hidden.
 * ⚠️ 리터럴 색만(CourseShell 머리말).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { KOREA_CORNERS, fitBox, type MapDot } from "@shared/golfDotMap";
import { herePoint, type HereTone } from "@shared/golfHereMap";
import { cn } from "@/lib/utils";
import { useCourseList } from "../../../lib/courseApi";
import { CourseDotMap, DOT_COLOR } from "../list/CourseDotMap";
import { KoreaOutline, RegionShape } from "../list/KoreaOutline";

/** 지도 칸의 바탕 — 카드 면보다 한 단계 어둡게(창처럼). '여기' 고리 안쪽도 이 색 */
const BG = "#0A0A0A";
/**
 * 틀 — 나라가 세로로 꽉 차는 비율. 공유 카드의 틀(shared HERE_BOX, 0.62)보다 좁다: 여기는 세로로 긴 칸에 크게 세운다.
 * '여기'의 자리(herePoint)는 지도 좌표라 틀이 달라도 그대로 쓴다.
 */
const ASPECT = 0.56;
const BOX = fitBox(KOREA_CORNERS, ASPECT);
/** 기준 너비(px) — '여기' 표시의 크기를 이 값으로 잰다. 실제 너비는 화면 폭을 따른다(360 폭 130 · 390 폭 140 · 넓으면 148) */
const BASE_W = 140;
const CSS_W = "clamp(118px, 36vw, 148px)";
/** 골프 강조색 — '여기' 고리. 허브에서 고른 지역의 윤곽선(KoreaOutline activeStroke)과 같은 색 */
const ACCENT = "#64DD17";
/** 이 지역의 면(바탕에 라임 6%)과 테두리(라임 55%) — RegionShape 는 불투명 색을 받는다 */
const REGION_FACE = "#0F170B";
const REGION_EDGE = "#3B7E11";

export function HereMap({ lat, lng, region, tone, className }: {
    lat: number | null; lng: number | null;
    /** 지역 묶음("경기") — 그 지역을 라임 테두리의 면으로 밝힌다 */
    region: string | null;
    /** 가운데 점의 색 — 지금 올라온 글·내 관심(허브 지도와 같은 뜻). 없으면 흰 점 */
    tone: HereTone;
    className?: string;
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
    const u = BOX[2] / BASE_W; // 화면 1px = 지도 칸 u
    const live = tone === "urgent" || tone === "join" || tone === "booking";
    const core = tone ? DOT_COLOR[tone] : "#FFFFFF";
    const halo = live ? core : ACCENT;
    const R = 6.2 * u;
    return (
        // 높이는 비율로 잡히고, 옆 칸(주소·단추)이 더 길면 그만큼 늘어난다 — 지도는 칸 가운데에 선다
        <div ref={ref} aria-hidden="true" className={cn("relative shrink-0 self-stretch rounded-xl overflow-hidden", className)} style={{ width: CSS_W, aspectRatio: String(ASPECT), background: BG }}>
            <CourseDotMap
                dots={dots} focus={null} box={BOX} aspect={ASPECT} cols={26} bg={BG} muted className="absolute inset-0 w-full h-full"
                under={<>
                    <KoreaOutline stroke="#FFFFFF1A" width={0.5} />
                    {region && <RegionShape group={region} face={REGION_FACE} edge={REGION_EDGE} edgeWidth={0.9} />}
                </>}
            >
                <g pointerEvents="none">
                    {live && !still ? (
                        <circle cx={here.x} cy={here.y} r={R * 1.3} fill={halo} fillOpacity={0.3}>
                            <animate attributeName="r" values={`${R * 1.3};${R * 2.5};${R * 1.3}`} dur="2.8s" repeatCount="indefinite" />
                            <animate attributeName="fill-opacity" values="0.3;0.04;0.3" dur="2.8s" repeatCount="indefinite" />
                        </circle>
                    ) : (
                        <circle cx={here.x} cy={here.y} r={R * 1.9} fill={halo} fillOpacity={live ? 0.24 : 0.18} />
                    )}
                    <circle cx={here.x} cy={here.y} r={R} fill={BG} stroke={ACCENT} strokeWidth={2 * u} />
                    <circle cx={here.x} cy={here.y} r={2.9 * u} fill={core} />
                </g>
            </CourseDotMap>
        </div>
    );
}
