/**
 * 조준 보정(스쿼트 자동 보정) — 순수 함수, 테스트 동반.
 *
 * 엔진의 ShotInput.phi 는 **큐 방향**이다. 옆당점 a 를 주면 공은 큐 방향에서 당점 반대쪽으로 스쿼트 각(TP A.31, 기본 큐
 * 엔드매스 비 12 → 링 절반 2.3°, 링 끝 4.2°)만큼 틀어져 출발한다. 실제 선수는 이걸 손으로 보정한다.
 *  - 일반 모드(assist = true): 화면 조준선·고스트·두께 = 공이 실제 출발하는 방향(큐 방향 + 스쿼트). 당점을 바꾸면 리듀서가
 *    큐 방향을 스쿼트 차이만큼 반대로 돌려 화면 조준을 그대로 둔다. 큐대 그림은 큐 방향이라 옆당점이면 살짝 비껴 선다.
 *  - 리얼리티 모드(assist = false): 화면 조준선 = 큐 방향. 보정은 선수 몫이고, 손을 떼면 미리보기가 실제 경로를 보여 준다.
 * 상태에 저장되는 phi 는 언제나 큐 방향이라 해법 적용·리플레이·서버 재판정은 변환 없이 정확히 같은 값을 쓴다.
 */
import { DEFAULT_CUE } from "@shared/sim/params";
import { squirtAngle } from "@shared/sim/resolve/stickBall";
import { normalizeAngle } from "./aim";

/** 옆당점 a(R 비율)의 스쿼트 각(rad). 부호는 a 와 같다(오른쪽 사이드 → 공은 왼쪽으로 = 반시계 +). */
export function squirtFor(a: number): number {
    return squirtAngle(a, DEFAULT_CUE.endmassRatio);
}

/** 화면 조준 방향: 보정 켜짐이면 공의 실제 출발 방향(큐 방향 + 스쿼트), 꺼짐이면 큐 방향 그대로. */
export function aimPhi(phi: number, a: number, assist: boolean): number {
    return assist ? normalizeAngle(phi + squirtFor(a)) : phi;
}

/** 화면 조준 방향 → 엔진에 줄 큐 방향(보정 켜짐이면 스쿼트만큼 반대로). */
export function cuePhiForAim(aim: number, a: number, assist: boolean): number {
    return assist ? normalizeAngle(aim - squirtFor(a)) : aim;
}
