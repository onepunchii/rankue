import { normalizeAngle, TWO_PI } from "../aim";

/**
 * 대전 대기 중 상대의 큐대를 어디에 그릴지(2026-09-16 오너: "멀티가 너무 정적이다").
 *
 * 왜 필요한가: 상대 차례엔 화면이 완전히 멈춘다 — 공도 큐대도 안 움직여서, 상대가 고민 중인지 앱을 껐는지
 * 구분이 안 된다. 상대가 겨누는 방향에 큐대만 얹으면 "저기를 노리는구나" 가 보인다.
 *
 * 왜 그냥 꽂지 않는가: 상대 조준은 1.2초 간격으로 띄엄띄엄 온다(AIM_REPORT_MS). 받은 각도를 그대로 쓰면
 * 큐대가 순간이동해서 기계가 된다. 프레임마다 목표로 조금씩 따라가면 상대가 손으로 돌리는 것처럼 보인다.
 *
 * 길(예측 경로)은 일부러 안 준다 — 상대 조준선까지 보이면 방금 줄인 미리보기 구간(MATCH_PREVIEW_CUSHIONS)을
 * 상대 화면으로 되돌려 받는 셈이고, 남의 계산을 훔쳐보는 게임이 된다.
 */

/** 목표 각도로 따라가는 비율(프레임당). 0.18 이면 60fps 에서 ~0.2초 만에 붙는다 — 사람 손 속도. */
export const OPP_AIM_EASE = 0.18;
/** 이 안으로 붙으면 도착. 약 0.1도 — 더 쫓아 봐야 화면에서 같은 픽셀이다. */
export const OPP_AIM_SNAP_RAD = 0.002;
/** 상대 큐대의 당김(0..1). 세기는 안 보내므로 고정값 — 겨누는 자세만 보여 준다. */
export const OPP_AIM_PULLBACK = 0.35;

/**
 * 이번 프레임에 그릴 상대 큐 각도. 짧은 쪽으로 돈다(0 과 2π 는 이웃이라, 그냥 빼면 한 바퀴를 돌아간다).
 *
 * @param prev 직전 프레임에 그린 각도(없으면 처음)
 * @param target 서버가 전한 상대 조준(없으면 상대가 샷을 쳤거나 값이 낡았다)
 * @returns 그릴 각도와 아직 따라가는 중인지. 목표가 없으면 null — 큐대를 그리지 않는다.
 */
export function easeOppAim(prev: number | null, target: number | null): { phi: number; moving: boolean } | null {
    if (target === null) return null;
    if (prev === null) return { phi: normalizeAngle(target), moving: false }; // 처음 보일 땐 제자리에서 시작
    let d = (target - prev) % TWO_PI;
    if (d > Math.PI) d -= TWO_PI;
    if (d < -Math.PI) d += TWO_PI;
    if (Math.abs(d) < OPP_AIM_SNAP_RAD) return { phi: normalizeAngle(target), moving: false };
    return { phi: normalizeAngle(prev + d * OPP_AIM_EASE), moving: true };
}
