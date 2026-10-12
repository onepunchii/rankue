/**
 * 등산 — 산행 등급(2026-10-13 오너: "등산도 등급을 줘서 등산러의 마음을 자극하게 … 많이 산을 정복할수록 등급이 높아지게").
 *
 * 등급은 **정상에서 인증한 서로 다른 산의 수** 하나로 정한다(같은 산을 여러 번 올라도 한 곳이다 — 새 산으로 가야 오른다).
 * 이름은 산을 오르며 지나는 자리에서 땄다: 들머리에서 시작해 숲길 · 계곡 · 능선 · 암릉을 지나 정상에 서고, 구름 위(운해)를 거쳐
 * 가장 높은 하늘금(능선이 하늘과 맞닿은 선)에 이른다. 당구의 메달 · 방패, 골프의 볼마커 등급과 이름도 물건(삼각 휘장)도 다르다.
 *
 *   들머리 0 · 숲길 1 · 계곡 3 · 능선 7 · 암릉 15 · 정상 30 · 운해 60 · 하늘금 100
 *
 * 하늘금의 100곳은 100대 명산을 다 오른 사람과 같은 무게다(산은 아무 산이나 센다 — 명산이 아니어도 정상을 아는 산이면 된다).
 * **빨리 · 자주 · 밤에 올라서 오르는 등급은 없다**(산에서는 사고를 부른다). 한 번 오른 등급은 내려가지 않는다(인증 도장은 지워지지 않는다).
 *
 * 순수 함수만(서버 · 화면이 같이 쓴다). ⚠️ 서버가 임포트하는 shared 파일 — 상대 임포트는 반드시 './x.js'.
 */
export type HikingGradeId = "trailhead" | "forest" | "valley" | "ridge" | "rock" | "summit" | "clouds" | "skyline";
export interface HikingGrade {
    id: HikingGradeId;
    name: string;
    /** 이 등급이 되는 산의 수(인증한 서로 다른 산) */
    min: number;
    /** 등급의 한 줄 */
    line: string;
}
export const HIKING_GRADES: readonly HikingGrade[] = [
    { id: "trailhead", name: "들머리", min: 0, line: "산길 앞에 섰어요" },
    { id: "forest", name: "숲길", min: 1, line: "첫 산의 정상을 밟았어요" },
    { id: "valley", name: "계곡", min: 3, line: "물소리를 따라 세 산을 올랐어요" },
    { id: "ridge", name: "능선", min: 7, line: "능선에 올라서니 다음 산이 보여요" },
    { id: "rock", name: "암릉", min: 15, line: "바위 능선도 이제 익숙해요" },
    { id: "summit", name: "정상", min: 30, line: "서른 산의 정상석을 만났어요" },
    { id: "clouds", name: "운해", min: 60, line: "구름을 발아래에 두는 사람" },
    { id: "skyline", name: "하늘금", min: 100, line: "백 개의 산이 하늘금으로 이어졌어요" },
];
export const hikingGradeById = (id: string | null | undefined): HikingGrade | undefined => HIKING_GRADES.find((g) => g.id === id);
/** 휘장 그림의 이름(client/public/hiking/art/grade-<id>.webp) */
export const hikingGradeArt = (id: HikingGradeId) => `grade-${id}`;

export interface HikingGradeState {
    grade: HikingGrade;
    /** 0 = 들머리 … 7 = 하늘금 */
    index: number;
    /** 다음 등급 — 맨 위면 null */
    next: HikingGrade | null;
    /** 다음 등급까지 남은 산 */
    left: number;
    /** 이 등급 안에서 다음 등급까지 온 만큼(0~1). 맨 위면 1 */
    ratio: number;
    /** 인증한 서로 다른 산 */
    count: number;
}
/** 인증한 산의 수 → 등급 */
export function hikingGrade(count: number): HikingGradeState {
    const n = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
    let index = 0;
    for (let i = 0; i < HIKING_GRADES.length; i++) if (n >= HIKING_GRADES[i].min) index = i;
    const grade = HIKING_GRADES[index];
    const next = HIKING_GRADES[index + 1] ?? null;
    return { grade, index, next, left: next ? next.min - n : 0, ratio: next ? (n - grade.min) / (next.min - grade.min) : 1, count: n };
}

/**
 * 도장(얻은 순서) → 오른 등급과 그때. 들머리(0곳)는 받는 것이 아니라 시작이라 넣지 않는다.
 * firstAts 는 인증 도장을 얻은 때(ms)를 **얻은 순서로** 늘어놓은 것.
 */
export function hikingGradesDue(firstAts: readonly number[]): { id: HikingGradeId; earnedAt: number }[] {
    return HIKING_GRADES.filter((g) => g.min >= 1 && firstAts.length >= g.min).map((g) => ({ id: g.id, earnedAt: firstAts[g.min - 1] }));
}

/** 오른 산의 정상 높이를 다 더한 값(m) — 높이를 아는 산만. '오른 높이'가 아니라 '정상 높이의 합'이다(들머리의 높이를 빼지 않았다) */
export function summitHeightSum(mountainIds: readonly string[], heightOf: (id: string) => number | null | undefined): number {
    let sum = 0;
    for (const id of new Set(mountainIds)) { const h = heightOf(id); if (h != null && Number.isFinite(h) && h > 0) sum += h; }
    return Math.round(sum);
}
