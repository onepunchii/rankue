/**
 * 당구 용어 사전의 그림(2026-10-19) — 용어 페이지(client/src/pages/billiards-term)가 정의 바로 아래에 그린다.
 * 그림은 **본문의 예시 글을 그대로 옮긴 개념도**다 — 새 사실을 더하지 않는다. 길은 쿠션에서 들어온 각 = 나간 각으로 계산해 맞췄다
 * (회전 · 힘에 따른 휨은 그리지 않는다 — 캡션에 '개념도'라고 적는다).
 *
 * 좌표: 당구대 안쪽(펠트) x 0..2 · y 0..1(위가 0). 공의 중심 좌표로 적고, 쿠션에 닿는 점은 테두리(x=0·2, y=0·1)로 적는다 —
 * 그리는 쪽이 공 반지름만큼 안으로 들인다. 쿠션 번호는 수구의 길에서 테두리 위의 점을 차례로 센다.
 * ⚠️ 서버가 부를 수도 있다 — 상대 임포트는 ./x.js(지금은 없다).
 */

export type DiagramBall = "white" | "yellow" | "red" | "red2";
export interface TablePath {
    /** 누구의 길 — 수구(cue)는 굵은 점선 + 쿠션 번호, 적구(object)는 가는 점선 */
    by: "cue" | "object";
    points: readonly [number, number][];
    /** 이 점에서 끊긴다(키스) — 그 뒤는 옅게 */
    cutAt?: number;
}
export interface TableDiagram {
    kind: "table";
    balls: readonly { id: DiagramBall; x: number; y: number }[];
    paths: readonly TablePath[];
    /** 그림 위 표시(쫑 · 파울 같은 말) */
    marks?: readonly { x: number; y: number; text: string; tone?: "warn" | "note"; below?: boolean }[];
    caption: string;
}
export interface TipDiagram { kind: "tip"; caption: string }
export interface ThicknessDiagram { kind: "thickness"; caption: string }
export type TermDiagram = TableDiagram | TipDiagram | ThicknessDiagram;

/** 공 반지름(펠트 길이 2 기준) — 대대 2.84m · 공 61.5mm 의 비율 */
export const BALL_R = 0.043;

const BANK: TableDiagram = {
    kind: "table",
    balls: [{ id: "white", x: 1.5, y: 0.3 }, { id: "red", x: 0.5, y: 0.7 }, { id: "yellow", x: 0.15, y: 0.525 }],
    paths: [{ by: "cue", points: [[1.5, 0.3], [2, 0.55], [1.1, 1], [0.5, 0.7], [0.3, 0], [0.15, 0.525]] }],
    caption: "단쿠션 → 장쿠션을 먼저 맞고 빨간 공, 다시 장쿠션을 거쳐 노란 공. 두 번째 적구 전 쿠션 셋 · 첫 접촉이 쿠션이라 PBA 규칙에서 2점",
};

export const TERM_DIAGRAMS: Readonly<Record<string, TermDiagram>> = {
    "3쿠션": {
        kind: "table",
        balls: [{ id: "white", x: 0.55, y: 0.62 }, { id: "red", x: 0.9, y: 0.4 }, { id: "yellow", x: 1.1, y: 0.8 }],
        paths: [{ by: "cue", points: [[0.55, 0.62], [0.9, 0.4], [1.4, 0], [2, 0.48], [1.35, 1], [1.1, 0.8]] }],
        caption: "빨간 공을 맞고 장쿠션 → 단쿠션 → 장쿠션, 노란 공. 두 번째 적구 전에 쿠션 셋이라 1점",
    },
    "뱅크샷": BANK,
    "빈쿠션": { ...BANK, caption: "적구보다 쿠션을 먼저 맞히는 길 — 쿠션 둘을 먼저 쌓고 빨간 공, 장쿠션 하나 더 거쳐 노란 공(3쿠션 득점 조건을 채운다)" },
    "4구": {
        kind: "table",
        balls: [{ id: "white", x: 0.45, y: 0.6 }, { id: "red", x: 1.0, y: 0.45 }, { id: "red2", x: 1.55, y: 0.62 }, { id: "yellow", x: 1.25, y: 0.3 }],
        paths: [{ by: "cue", points: [[0.45, 0.6], [1.0, 0.45], [1.55, 0.62]] }],
        marks: [{ x: 1.25, y: 0.3, text: "상대 공 — 맞히면 파울", tone: "warn" }],
        caption: "내 수구(흰 공)로 빨간 공 두 개를 모두 맞히면 득점. 상대의 수구(노란 공)를 맞히면 파울",
    },
    "대회전": {
        kind: "table",
        balls: [{ id: "white", x: 0.35, y: 0.6 }, { id: "red", x: 0.7, y: 0.45 }, { id: "yellow", x: 0.25, y: 0.745 }],
        paths: [{ by: "cue", points: [[0.35, 0.6], [0.7, 0.45], [1.2, 0], [2, 0.72], [1.689, 1], [0.578, 0], [0, 0.52], [0.25, 0.745]] }],
        caption: "제1적구를 맞힌 수구가 쿠션 다섯을 차례로 돌며 테이블을 크게 한 바퀴 — 쿠션을 넷 이상 거치기도 하는 3쿠션 형태",
    },
    "키스": {
        kind: "table",
        balls: [{ id: "white", x: 0.5, y: 0.75 }, { id: "red", x: 0.8, y: 0.55 }, { id: "yellow", x: 1.7, y: 0.72 }],
        paths: [
            { by: "cue", points: [[0.5, 0.75], [0.8, 0.55], [1.106, 0.291], [1.45, 0], [2, 0.466], [1.7, 0.72]], cutAt: 2 },
            { by: "object", points: [[0.8, 0.55], [1.0, 0], [1.106, 0.291]] },
        ],
        marks: [{ x: 1.106, y: 0.291, text: "쫑(키스)", tone: "warn" }],
        caption: "두껍게 맞은 제1적구가 장쿠션을 찍고 되돌아와 수구의 길목에서 부딪힌다 — 세 번째 쿠션에 닿기 전에 끊겨 득점이 안 된다",
    },
    "끌어치기": {
        kind: "table",
        balls: [{ id: "white", x: 0.6, y: 0.5 }, { id: "red", x: 1.3, y: 0.5 }],
        paths: [
            { by: "object", points: [[1.3, 0.5], [1.85, 0.5]] },
            // 되돌아오는 길은 들어온 길과 겹치지 않게 살짝 비켜 그린다(그림만)
            { by: "cue", points: [[0.6, 0.5], [1.214, 0.5], [1.17, 0.57], [0.75, 0.57]] },
        ],
        marks: [{ x: 0.8, y: 0.57, text: "되돌아온다", tone: "note", below: true }],
        caption: "중앙 아래를 쳐 역회전 — 적구를 정면으로 맞힌 수구가 왔던 길로 되돌아온다",
    },
    "밀어치기": {
        kind: "table",
        balls: [{ id: "white", x: 0.6, y: 0.5 }, { id: "red", x: 1.1, y: 0.5 }],
        paths: [
            { by: "object", points: [[1.1, 0.5], [1.85, 0.5]] },
            { by: "cue", points: [[0.6, 0.5], [1.014, 0.5], [1.06, 0.43], [1.5, 0.43]] },
        ],
        marks: [{ x: 1.5, y: 0.43, text: "따라 나간다", tone: "note" }],
        caption: "중앙 위를 쳐 앞 회전 — 적구를 맞힌 수구가 잠깐 느려졌다가 적구를 따라 앞으로 굴러간다",
    },
    "당점": { kind: "tip", caption: "수구를 정면에서 본 모습 — 위는 밀어치기, 아래는 끌어치기, 좌우는 옆 회전. '오른쪽 2팁'은 중심에서 팁 두 개 폭만큼 오른쪽" },
    "두께": { kind: "thickness", caption: "치는 자리에서 본 모습 — 겨냥한 수구의 윤곽(점선)이 적구와 겹치는 만큼이 두께. 다 겹치면 정면(두껍게), 가장자리만 스치면 얇게" },
};

/** 쿠션에 닿은 점(테두리 위의 점)인가 */
export const onRail = ([x, y]: readonly [number, number]) => x <= 0.0005 || x >= 1.9995 || y <= 0.0005 || y >= 0.9995;

/** 그리기 좌표 — 테두리 점은 공 반지름만큼 안으로 */
export function inset([x, y]: readonly [number, number], r = BALL_R): [number, number] {
    return [Math.min(2 - r, Math.max(r, x)), Math.min(1 - r, Math.max(r, y))];
}

/** 쿠션 번호 — 수구 길의 테두리 점에 1부터. cutAt 뒤(끊긴 뒤)는 세지 않는다 */
export function cushionMarks(path: TablePath): { at: [number, number]; n: number }[] {
    const end = path.cutAt ?? path.points.length - 1;
    let n = 0;
    return path.points.flatMap((p, i) => (i > 0 && i <= end && onRail(p) ? [{ at: inset(p), n: ++n }] : []));
}
