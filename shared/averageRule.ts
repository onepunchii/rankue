// 에버리지 이닝 산정 규칙 — 클라이언트 표시와 서버 저장이 같은 값을 쓰도록 공유한다.
//
// 왜 필요한가(오너 결정 2026-08-19): 4구에서 목표 점수(알다마)를 채우면 그 뒤는 '마무리'
// 구간이다. 마무리는 쿠션을 맞히는 종료 조건이지 득점 경쟁이 아니고, 실제로 점수판은
// 목표 도달 순간 득점 입력을 막는다(FINISH 오버레이). 그런데 이닝 카운터는 마무리 중
// 턴을 넘길 때도 그대로 올라가서, 분자는 고정인데 분모만 커졌다.
//   20점/10이닝 = 2.00 → 마무리 3번 시도 → 20점/13이닝 = 1.54
// 마무리 쿠션을 연습하는 초보일수록 실력이 낮게 기록되는 구조였다(실사용자 제보).
//
// 규칙: **목표 점수에 도달한 이닝까지만** 에버리지에 센다. 그 뒤 이닝은 마무리 구간이라
// 몇 번을 넘기든 에버리지가 변하지 않는다. 마무리 룰 토글과 무관하게 항상 적용한다 —
// 목표 도달 이후에는 어차피 득점이 불가능하므로 어떤 경기에서도 셀 이유가 없다.
//
// 목표에 도달하지 못한 선수(패자)는 친 이닝을 전부 센다. 그쪽은 마무리 구간 자체가 없다.

/**
 * 에버리지 분모로 쓸 이닝 수.
 * @param inningData 이닝별 득점 배열(선수 본인). 없으면 fallbackInnings 를 쓴다.
 * @param target     이 선수의 목표 점수(다마수). 0 이면 목표가 없는 슬롯이라 전부 센다.
 * @param fallbackInnings 배열이 없을 때 쓸 경기 전체 이닝(totalInnings).
 */
export function scoringInnings(
    inningData: unknown,
    target: number | null | undefined,
    fallbackInnings: number,
): number {
    if (!Array.isArray(inningData) || inningData.length === 0) return fallbackInnings;

    // 깨진 페이로드 방어 — 한 선수의 이닝이 경기 전체 이닝을 넘을 수는 없다(기존 규칙 유지).
    const played = fallbackInnings > 0 ? Math.min(inningData.length, fallbackInnings) : inningData.length;

    const t = Number(target ?? 0);
    if (!Number.isFinite(t) || t <= 0) return played;

    // 누적 득점이 목표에 처음 닿는 이닝 = 알다마가 끝난 이닝. 거기까지만 센다.
    // 파울 감점으로 누적이 내려갈 수 있어(4구 음수 정상) '처음 도달'을 순차로 찾는다.
    let sum = 0;
    for (let i = 0; i < played; i++) {
        const v = Number(inningData[i]);
        sum += Number.isFinite(v) ? v : 0;
        if (sum >= t) return i + 1;
    }
    // 목표 미달(패자) — 친 이닝 전부.
    return played;
}
