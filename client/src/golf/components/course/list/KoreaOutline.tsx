/**
 * 점 지도 밑에 까는 시도 윤곽선(2026-10-05 오너: "4번 이미지를 … 해당 점과 합치는 건 어때?" → "응 순서대로").
 *
 * CourseDotMap 의 `under` 자리에 넣는다 — 같은 viewBox 안이라 당겨 들어가는 동안에도 점과 한 몸으로 움직인다.
 * 좌표 맞춤은 lib/koreaOutline(재서 구한 일차식). 선 굵기는 화면 기준(non-scaling-stroke)이라 확대해도 굵어지지 않는다.
 *
 * 윤곽선이 생기면서 **누를 자리**가 생겼다: 점은 손가락보다 작아 누를 수 없었는데, 지역 면은 누를 수 있다(onPick).
 * 지역 고르기는 화면의 지역 칩이 이미 하고 있어(링크·키보드) 여기는 손가락용 지름길이다 — 초점을 받지 않는다.
 *
 * ⚠️ 리터럴 색만(CourseShell 머리말).
 */
import { useMemo } from "react";
import { KOREA_MAP_PATHS } from "@/golf/data/koreaMapData";
import { OUTLINE_GROUP, OUTLINE_TO_DOT } from "@/golf/lib/koreaOutline";

export function KoreaOutline({ active, onPick, stroke = "#FFFFFF33", activeStroke = "#64DD17", activeFill = "#64DD1714", fills, strokes, width = 0.9 }: {
    /** 켜 둘 지역 묶음("강원") — 선이 라임으로, 면이 옅게 칠해진다 */
    active?: string | null;
    /** 지역 면을 누르면(없으면 누를 수 없는 그림) */
    onPick?: (group: string) => void;
    stroke?: string; activeStroke?: string; activeFill?: string;
    /** 지역 묶음별 면 색(여권의 '가 본 지역') — active 보다 먼저 */
    fills?: Readonly<Record<string, string>>;
    /** 지역 묶음별 선 색 */
    strokes?: Readonly<Record<string, string>>;
    /** 선 굵기(화면 px) */
    width?: number;
}) {
    // 켜진 지역을 나중에 그린다 — 이웃 지역의 흐린 선이 라임 선을 덮지 않게
    const order = useMemo(() => Object.keys(KOREA_MAP_PATHS).sort((a, b) => Number(OUTLINE_GROUP[a] === active) - Number(OUTLINE_GROUP[b] === active)), [active]);
    return (
        <g transform={OUTLINE_TO_DOT} strokeLinejoin="round" strokeLinecap="round">
            {order.map((id) => {
                const group = OUTLINE_GROUP[id];
                const hot = !!active && group === active;
                return (
                    <path
                        key={id} d={KOREA_MAP_PATHS[id]}
                        fill={fills?.[group] ?? (hot ? activeFill : "none")}
                        stroke={strokes?.[group] ?? (hot ? activeStroke : stroke)}
                        strokeWidth={hot ? width * 1.5 : width} vectorEffect="non-scaling-stroke"
                        pointerEvents={onPick ? "all" : "none"}
                        onClick={onPick ? () => onPick(group) : undefined}
                        style={onPick ? { cursor: "pointer", WebkitTapHighlightColor: "transparent" } : undefined}
                    />
                );
            })}
        </g>
    );
}

/**
 * 지역 묶음 하나를 **한 덩어리 면**으로(2026-10-08 오너: "점과 지역 구역 선이 지저분해 보이지 않아? 두께 때문인가?").
 *
 * 작은 지도(골프장 상세 '이 근처' 카드, 124px)에서 KoreaOutline 의 선이 지저분했던 이유:
 *  · 충청은 충북·충남·대전·세종 네 조각이라 맞닿는 선이 **두 번** 겹쳐 그려진다(반투명이라 더 밝고 굵어 보인다).
 *  · 선이 굵으면 들쭉날쭉한 해안·섬이 뭉개진다.
 * 그래서 두 겹으로 그린다 — 밑에 테두리 색으로 조각들을(선 + 면), 그 위에 면 색으로 조각들을 다시 덮는다.
 * 조각이 맞닿는 안쪽 선은 양쪽 면이 덮어 사라지고 **바깥 테두리만** 가늘게 남는다. 색은 불투명이어야 한다(반투명이면 겹친 데가 비친다).
 * 위의 면에 건 가는 선(seam)은 조각 사이 실금(가장자리 다듬기 틈)을 메운다.
 *
 * ⚠️ 리터럴 색만(CourseShell 머리말).
 */
export function RegionShape({ group, face, edge, edgeWidth = 0.75 }: {
    /** 지역 묶음("충청") */
    group: string;
    /** 면 색 — 불투명 */
    face: string;
    /** 바깥 테두리 색 — 불투명 */
    edge: string;
    /** 바깥 테두리 굵기(화면 px) */
    edgeWidth?: number;
}) {
    const ids = useMemo(() => Object.keys(KOREA_MAP_PATHS).filter((id) => OUTLINE_GROUP[id] === group), [group]);
    const seam = 0.5;
    return (
        <g transform={OUTLINE_TO_DOT} strokeLinejoin="round" strokeLinecap="round" pointerEvents="none">
            {ids.map((id) => <path key={`e:${id}`} d={KOREA_MAP_PATHS[id]} fill={edge} stroke={edge} strokeWidth={edgeWidth * 2 + seam} vectorEffect="non-scaling-stroke" />)}
            {ids.map((id) => <path key={`f:${id}`} d={KOREA_MAP_PATHS[id]} fill={face} stroke={face} strokeWidth={seam} vectorEffect="non-scaling-stroke" />)}
        </g>
    );
}
