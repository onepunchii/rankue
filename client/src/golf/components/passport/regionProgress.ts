/**
 * 지역 정복 — 숫자와 칠하기(2026-10-05 오너: "4번 이미지(지역 정복 지도)를 점과 합치자" → "응 순서대로"의 3번).
 *
 * 예전엔 '지역 정복' 탭의 큰 지도(RegionMap)가 이 셈을 품고 있었다. 그 지도를 발자국 지도 밑에 깔면서(한 장으로 합침)
 * 셈만 여기로 옮겼다 — 규칙은 그대로다: 그 지역 골프장의 **20%를 가 보면 금색**, 그 전까지는 가 본 만큼 라임이 짙어진다.
 * 숫자는 서버가 센다(regionTotals = 그 지역의 서로 다른 골프장 수, regionConquered = 가 본 수 — 인증 도장만).
 */
import { GOLF_REGIONS } from "@shared/golfCourse";

/** 그 지역 골프장의 이만큼을 가 보면 금색(마스터) */
export const MASTER_RATIO = 0.2;

export interface RegionProgress {
    region: string;
    total: number;
    visited: number;
    /** 금색까지 가 봐야 하는 곳 수 */
    goal: number;
    /** 금색까지 얼마나 왔나(0~1) */
    ratio: number;
    mastered: boolean;
}

/** 여섯 지역의 정복 현황 — 지역 순서대로. 모르는 지역은 0 으로(지어내지 않는다) */
export function regionProgress(totals: Readonly<Record<string, number>>, conquered: Readonly<Record<string, number>>): RegionProgress[] {
    return GOLF_REGIONS.map((region) => {
        const total = Math.max(0, Number(totals[region]) || 0), visited = Math.max(0, Number(conquered[region]) || 0);
        const goal = Math.max(1, Math.ceil(total * MASTER_RATIO));
        const ratio = total && visited ? Math.min(1, visited / goal) : 0;
        return { region, total, visited, goal, ratio, mastered: total > 0 && visited >= goal };
    });
}

const LIME = "#64DD17", GOLD = "#FFD700";
const hex2 = (a: number) => Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, "0").toUpperCase();

/**
 * 지도에 칠할 색 — 점과 발자국이 그 위에 올라가므로 면은 옅게(가 본 만큼 10%→26%), 선으로 또렷하게.
 * 안 가 본 지역은 칠하지 않는다(윤곽선 기본색만).
 */
export function regionPaint(list: readonly RegionProgress[]): { fills: Record<string, string>; strokes: Record<string, string> } {
    const fills: Record<string, string> = {}, strokes: Record<string, string> = {};
    for (const r of list) {
        if (!r.visited || !r.total) continue;
        fills[r.region] = r.mastered ? `${GOLD}${hex2(0.2)}` : `${LIME}${hex2(0.1 + 0.16 * r.ratio)}`;
        strokes[r.region] = r.mastered ? `${GOLD}${hex2(0.7)}` : `${LIME}${hex2(0.55)}`;
    }
    return { fills, strokes };
}
/** 칩 글자색 — 금색·라임·흐림 */
export const regionChipColor = (r: RegionProgress): string => (r.mastered ? GOLD : r.visited ? "#8BE84A" : "#FFFFFF8C");
