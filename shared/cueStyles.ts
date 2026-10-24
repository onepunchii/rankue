/**
 * 큐 상대 · 공 꾸미기의 모양(2026-10-24 오너: "상대(큐의 윗대) 색도 커스텀 · 조건을 달성하면" → "당구는 1단계부터").
 *
 * 큐 케이스의 '상대'(kind shaft) · '공'(kind ball) 아이템이 무엇을 바꾸는지만 안다 — 받는 조건은 shared/cueCase 의 목록이 가진다.
 * 두 렌더러(2D · 3D)와 큐 케이스 그림(SVG)이 같은 값을 쓴다. **겉모습만** 바뀐다(길이 · 굵기 · 공의 크기 · 물리는 그대로 — 레이팅 대전을 지킨다).
 *
 * 공은 **흰 공 · 노란 공의 바탕색을 지킨다** — 누가 어느 공을 치는지가 규칙의 핵심이라, 바꾸는 것은 점 무늬와 마감뿐이다.
 * 점은 회전을 읽는 표시라 모양이 바뀌어도 자리(적도 넷 · 극 둘)는 그대로다. 4구의 빨간 공은 꾸미지 않는다.
 * ⚠️ 서버도 부른다 — 상대 임포트는 ./x.js.
 */

/** 상대(샤프트) 마감 — 나뭇결 · 카본 짜임 · 매끈한 광택 */
export type ShaftFinish = "wood" | "carbon" | "gloss";
export interface ShaftStyle {
    /** 바탕색 */
    readonly base: string;
    /** 결의 색(나뭇결 · 카본 짜임). 없으면 결 없이 */
    readonly grain?: string;
    readonly finish: ShaftFinish;
    /** 이음쇠 쪽 고리 띠 색(없으면 띠 없음) */
    readonly ring?: string;
    /** 끝(팁 쪽)으로 갈수록 바뀌는 색 — 불꽃 같은 것. [이음쇠 쪽, 팁 쪽] */
    readonly fade?: readonly [string, string];
    /** 페룰(팁 아래 흰 토막) · 팁 */
    readonly ferrule: string;
    readonly tip: string;
}

/** 지금의 상대 — 메이플 나무(아이템이 없거나 못 찾으면 이것) */
export const DEFAULT_SHAFT: ShaftStyle = { base: "#C9955A", grain: "#B07F45", finish: "wood", ferrule: "#EDE6D6", tip: "#2F4A66" };

export const SHAFT_STYLES: Readonly<Record<string, ShaftStyle>> = {
    "shaft-white": { base: "#EFE4CC", grain: "#DCCBA8", finish: "wood", ferrule: "#F7F2E7", tip: "#2F4A66" },
    "shaft-ebony": { base: "#3A2A20", grain: "#2A1C14", finish: "wood", ferrule: "#EDE6D6", tip: "#1E2B3A" },
    "shaft-birdseye": { base: "#D8B37A", grain: "#A97C45", finish: "wood", ring: "#3A2A20", ferrule: "#EDE6D6", tip: "#2F4A66" },
    "shaft-carbon": { base: "#1C1E22", grain: "#30343A", finish: "carbon", ferrule: "#E8E8E8", tip: "#1E3A5F" },
    "shaft-carbon-white": { base: "#E9ECEF", grain: "#D2D7DD", finish: "carbon", ferrule: "#FFFFFF", tip: "#1E3A5F" },
    "shaft-carbon-red": { base: "#2A1214", grain: "#7A1E24", finish: "carbon", ring: "#D7263D", ferrule: "#E8E8E8", tip: "#3A0F12" },
    "shaft-carbon-blue": { base: "#121C2E", grain: "#22406E", finish: "carbon", ring: "#3B82F6", ferrule: "#E8E8E8", tip: "#0F2747" },
    "shaft-gold-ring": { base: "#141414", grain: "#2A2A2A", finish: "carbon", ring: "#E8C46A", ferrule: "#F3E3B0", tip: "#3A2A0A" },
    "shaft-flame": { base: "#C9955A", finish: "gloss", fade: ["#3A1A10", "#F28C3A"], ferrule: "#FCE7C8", tip: "#5A1E0E" },
    "shaft-teal": { base: "#0F3A3F", grain: "#1C5C63", finish: "gloss", ring: "#46E4E0", ferrule: "#E6FFFD", tip: "#0B2A2E" },
};
export const shaftStyle = (id: string | null | undefined): ShaftStyle => (id && SHAFT_STYLES[id]) || DEFAULT_SHAFT;

/** 공의 점 모양 — 자리(적도 넷 · 극 둘)는 그대로 */
export type BallDotShape = "dot" | "star" | "ring" | "heart" | "five" | "globe" | "crown";
/** 공 마감 — 바탕색 계열은 지킨다 */
export type BallFinish = "plain" | "carbon" | "pearl" | "marble" | "chrome";
export interface BallStyle {
    /** 점 색. 'rainbow' 면 점마다 다른 색 */
    readonly dot: string | "rainbow";
    readonly shape: BallDotShape;
    readonly finish: BallFinish;
}

/** 지금의 공 — 빨간 점 여섯(아이템이 없으면 이것). 점 색은 렌더러의 팔레트(--ball-red)를 쓴다 */
export const DEFAULT_BALL: BallStyle = { dot: "default", shape: "dot", finish: "plain" };

export const BALL_STYLES: Readonly<Record<string, BallStyle>> = {
    "ball-dot-blue": { dot: "#2F6FD8", shape: "dot", finish: "plain" },
    "ball-dot-green": { dot: "#1E9E5A", shape: "dot", finish: "plain" },
    // 금빛은 짙게 — 노란 공 위에서도 보이게(노란 공을 치는 사람도 같은 무늬를 입는다)
    "ball-dot-gold": { dot: "#9A6A0C", shape: "dot", finish: "plain" },
    "ball-dot-star": { dot: "#2F6FD8", shape: "star", finish: "plain" },
    "ball-dot-ring": { dot: "#D7263D", shape: "ring", finish: "plain" },
    "ball-dot-five": { dot: "#7A3FD0", shape: "five", finish: "plain" },
    "ball-dot-globe": { dot: "#1F7FA8", shape: "globe", finish: "plain" },
    "ball-dot-heart": { dot: "#E2457A", shape: "heart", finish: "plain" },
    "ball-carbon": { dot: "#1C1E22", shape: "dot", finish: "carbon" },
    "ball-pearl": { dot: "#C46AA0", shape: "dot", finish: "pearl" },
    "ball-marble": { dot: "#3A3F48", shape: "dot", finish: "marble" },
    "ball-chrome": { dot: "#1E3A5F", shape: "dot", finish: "chrome" },
    "ball-aurora": { dot: "rainbow", shape: "dot", finish: "pearl" },
    "ball-crown": { dot: "#8E5F0A", shape: "crown", finish: "plain" },
};
export const ballStyle = (id: string | null | undefined): BallStyle => (id && BALL_STYLES[id]) || DEFAULT_BALL;
/** 무지개 점의 색(적도 넷 · 극 둘 차례) — 노란 공 위에서도 보이게 노랑 · 주황은 뺀다 */
export const RAINBOW_DOTS: readonly string[] = ["#E2457A", "#7A3FD0", "#2FB36A", "#2F6FD8", "#D7263D", "#1FA5C8"];

/**
 * 3D 마감의 재질 — 거칠기 · 금속성(공 크기 · 물리는 그대로). 장면에 환경 지도가 없어 금속성을 높이면 흰 공이 잿빛이 된다 —
 * 크롬도 금속성은 조금만, 반짝임은 거칠기를 낮춰 낸다(흰 공 · 노란 공이 갈려 보이는 것이 먼저).
 */
export function ballMaterialOf(finish: BallFinish): { roughness: number; metalness: number } {
    return finish === "chrome" ? { roughness: 0.08, metalness: 0.15 } : finish === "pearl" ? { roughness: 0.15, metalness: 0.05 } : finish === "carbon" ? { roughness: 0.35, metalness: 0 } : { roughness: 0.25, metalness: 0 };
}
/** 3D 상대의 거칠기 — 나무는 무광, 카본 · 광택은 반짝 */
export const shaftRoughnessOf = (st: ShaftStyle): number => (st.finish === "wood" ? 0.5 : st.finish === "carbon" ? 0.3 : 0.22);
