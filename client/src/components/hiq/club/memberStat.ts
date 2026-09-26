/**
 * 멤버 줄의 대표 기록 하나(2026-09-26) — 크루 멤버 목록과 설정의 멤버 관리가 같은 규칙을 쓴다.
 *
 *  - 골프: 평균 타수(없으면 핸디+72). 예전 설정 화면은 평균 타수에 '핸디'라는 이름을 붙여 보였다.
 *  - 당구: 크루 주 종목이 3쿠션이면 3구 에버, 4구면 4구 에버. 상관없음·포켓볼이면 있는 쪽(4구 우선).
 *    예전엔 3쿠션 크루에서도 늘 4구 에버를 보였다.
 * 기록이 없으면 null — 0.000 을 찍으면 신입이 더 초라해 보였다.
 */
export interface MemberStatInput {
    avg3c?: number | null;
    avg4c?: number | null;
    golfAvgScore?: number | null;
    golfHandicap?: number | null;
}

export interface MemberStat {
    value: string;
    /** 사전 키 */
    labelKey: string;
}

export function golfScoreOf(m: MemberStatInput): number {
    const avg = Number(m.golfAvgScore) || 0;
    const handi = Number(m.golfHandicap) || 0;
    return avg > 0 ? avg : handi > 0 ? handi + 72 : 0;
}

export function memberStat(m: MemberStatInput, sport?: string | null, gameType?: string | null): MemberStat | null {
    if (sport === "GOLF") {
        const score = golfScoreOf(m);
        return score > 0 ? { value: score.toFixed(0), labelKey: "crewMgmt.golfAvgStrokes" } : null;
    }
    const a3 = Number(m.avg3c) || 0;
    const a4 = Number(m.avg4c) || 0;
    const use3c = gameType === "3c" || (gameType !== "4c" && a4 <= 0 && a3 > 0);
    const v = use3c ? a3 : a4;
    return v > 0 ? { value: v.toFixed(3), labelKey: use3c ? "createClub.game3c" : "createClub.game4c" } : null;
}
