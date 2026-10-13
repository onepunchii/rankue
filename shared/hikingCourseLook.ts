/**
 * 코스를 보여 주는 셈(2026-10-13 오너: "등산 코스 디자인을 더 완벽하게") — 힘든 정도 · 가파른 구간 · 그림의 눈금.
 * 그림(client/src/hiking/components/CourseParts)과 코스 카드가 같이 쓴다. 전부 어림값이다(코스 선이 160점으로 줄어 있다) — 화면에 '어림'이라고 적는다.
 * 겨루는 숫자가 아니다: 빠르기는 다루지 않는다.
 * ⚠️ 서버가 임포트할 수 있는 shared 파일 — 상대 임포트는 반드시 './x.js'.
 */
import { walkMinutes, type LinePoint } from "./hikingGeo.js";

export type CourseLevelId = "easy" | "moderate" | "hard";
export interface CourseLevel { id: CourseLevelId; label: string; note: string }
const LEVELS: Readonly<Record<CourseLevelId, CourseLevel>> = {
    easy: { id: "easy", label: "가벼운 길", note: "반나절이면 다녀와요" },
    moderate: { id: "moderate", label: "보통 길", note: "한나절을 잡으세요" },
    hard: { id: "hard", label: "힘든 길", note: "하루를 잡고 일찍 나서세요" },
};
/** 힘든 정도 — 걷는 시간(어림)과 오르막으로. 2시간 반 · 오르막 400m 아래면 가벼운 길, 5시간 반 · 900m 를 넘으면 힘든 길 */
export function courseLevel(c: { km: number; gainM: number }): CourseLevel {
    const min = walkMinutes(c.km, c.gainM);
    if (min <= 150 && c.gainM <= 400) return LEVELS.easy;
    if (min > 330 || c.gainM > 900) return LEVELS.hard;
    return LEVELS.moderate;
}

/** 길의 기울기 — 완만 · 가파름 · 매우 가파름(오르든 내리든) */
export type SlopeClass = 0 | 1 | 2;
export const SLOPE_STEEP = 0.14, SLOPE_VERY = 0.28;
export const SLOPE_LABEL = ["완만한 길", "가파른 길", "매우 가파른 길"] as const;
/** 이만큼(km)의 앞뒤를 보고 기울기를 잰다 — 점 하나의 튐에 흔들리지 않게 */
const SLOPE_WINDOW_KM = 0.12;

/** 점마다의 기울기 등급 — i 번째 값은 i → i+1 구간의 것(길이 = 점 수 − 1) */
export function slopeClasses(line: readonly LinePoint[]): SlopeClass[] {
    const out: SlopeClass[] = [];
    for (let i = 0; i < line.length - 1; i++) {
        const mid = (line[i][3] + line[i + 1][3]) / 2;
        let a = i, b = i + 1;
        while (a > 0 && mid - line[a][3] < SLOPE_WINDOW_KM) a--;
        while (b < line.length - 1 && line[b][3] - mid < SLOPE_WINDOW_KM) b++;
        const run = (line[b][3] - line[a][3]) * 1000;
        const g = run > 1 ? Math.abs(line[b][2] - line[a][2]) / run : 0;
        out.push(g >= SLOPE_VERY ? 2 : g >= SLOPE_STEEP ? 1 : 0);
    }
    return out;
}

/** 같은 등급이 이어지는 토막 — 그림이 토막마다 한 선으로 그린다. [등급, 시작 점, 끝 점(포함)] */
export function slopeRuns(line: readonly LinePoint[]): [SlopeClass, number, number][] {
    const cls = slopeClasses(line);
    const runs: [SlopeClass, number, number][] = [];
    for (let i = 0; i < cls.length; i++) {
        const last = runs[runs.length - 1];
        if (last && last[0] === cls[i]) last[2] = i + 1; else runs.push([cls[i], i, i + 1]);
    }
    return runs;
}

export interface CourseSlopes { steepKm: number; veryKm: number; lossM: number }
/** 가파른 길의 길이(km) · 내리막(m) */
export function courseSlopes(line: readonly LinePoint[]): CourseSlopes {
    const cls = slopeClasses(line);
    let steep = 0, very = 0, loss = 0;
    for (let i = 0; i < cls.length; i++) {
        const d = line[i + 1][3] - line[i][3];
        if (cls[i] === 2) very += d; else if (cls[i] === 1) steep += d;
        const fall = line[i][2] - line[i + 1][2];
        if (fall > 0) loss += fall;
    }
    return { steepKm: Math.round(steep * 10) / 10, veryKm: Math.round(very * 10) / 10, lossM: Math.round(loss) };
}

/** 그림의 눈금 — lo~hi 사이에 2~4개가 놓이는 보기 좋은 간격(50 · 100 · 200 · 250 · 500m) */
export function altitudeTicks(lo: number, hi: number): number[] {
    const span = Math.max(1, hi - lo);
    const step = [50, 100, 200, 250, 500, 1000].find((s) => span / s <= 4) ?? 1000;
    const out: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(v);
    return out;
}
/** 거리의 눈금(km) — 1 · 2 · 5km 가운데 눈금이 여섯 개를 넘지 않는 것 */
export function kmTicks(km: number): number[] {
    const step = [0.5, 1, 2, 5, 10].find((s) => km / s <= 6) ?? 10;
    const out: number[] = [];
    for (let v = step; v < km - step * 0.35; v += step) out.push(Math.round(v * 10) / 10);
    return out;
}
