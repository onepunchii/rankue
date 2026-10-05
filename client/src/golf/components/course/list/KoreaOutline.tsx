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
