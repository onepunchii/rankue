/**
 * detect/ballTable.ts — 공중 공의 착지(공–슬레이트) 시각.
 *
 * 출처: pooltool <pooltool/evolution/event_based/detect/ball_table.py>, <pooltool/physics/utils.py> get_airborne_time
 *       (Apache-2.0, NOTICE.md). pooltool 은 −½g t² + v_z t + (z − R) = 0 의 큰 근을 고르고, 우리는 evolve.landingTime 이
 *       "t ≥ 0 이고 그 순간 하강 중인 가장 작은 근"을 고른다 — 정상 상태에서는 같은 값이고, z < R 퇴화 상태를 0 으로 닫는다.
 *
 * 여기서는 1e-9 s(EVENT_EPS) 이하를 현재 이벤트 자신으로 보고 버린다(볼–볼·볼–쿠션과 같은 규약). 타격 직후(z = R,
 * v_z < 0)와 튕김 직후 v_z 가 아주 작아 비행이 1e-9 s 안에 끝나는 경우는 simulate 의 즉시 스윕이 dt = 0 착지로 해석한다.
 * airborne 이 아닌 공은 Infinity. 초월함수 없음, 입력 불변.
 */
import type { BallState } from "../types.js";
import type { BallParams } from "../params.js";
import { landingTime } from "../evolve.js";
import { EVENT_EPS } from "./ballBall.js";

/** 공이 슬레이트(중심 z = R)에 닿을 때까지의 시간 (s). airborne 이 아니거나 EVENT_EPS 이하면 Infinity. */
export function ballTableTime(b: BallState, p: BallParams): number {
    const t = landingTime(b, p);
    return t > EVENT_EPS ? t : Infinity;
}
