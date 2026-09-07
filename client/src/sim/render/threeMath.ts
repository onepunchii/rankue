/**
 * ThreeRenderer 의 순수 수학. DOM·WebGL 없음 — 테스트는 이 파일만으로 카메라·투영·회전 적분·큐대 배치를 검증한다.
 *
 *  - orthoFrustum: tableGeometry 의 letterbox 배치(px = originX + x·scale, py = originY − y·scale)를 그대로 재현하는
 *    오소그래픽 절두체. 카메라를 월드 원점 위 (0, 0, CAMERA_Z) 에 기본 자세(−z 를 보고 +y 가 위)로 두고 절두체를
 *    비대칭으로 잡으면 마운트 사각형 전체가 화면 CSS px 과 1:1 로 맞는다. 카메라를 옮기거나 회전할 필요가 없다.
 *  - projectOrtho / unprojectOrtho: GPU 가 하는 NDC 변환을 CPU 에서 흉내 낸 것. worldToScreen / screenToWorld 와
 *    1e-9 안에서 같아야 오버레이(조준선·고스트볼)가 공 위에 정확히 얹힌다.
 *  - integrateOrientation: BallState 에는 자세가 없으므로 각속도 ω(월드 좌표, rad/s)를 프레임마다 적분한다.
 *    q ← Δq(ω̂, |ω|·dt) ⊗ q  (월드 축 회전이므로 premultiply).
 *  - cueGap / cueRotationZ: Canvas2DRenderer 와 같은 큐대 배치. 간격 = R + 12 mm + pullback·0.25 m, 방향은 −phi.
 */
import type { Quaternion, Vector3 } from "three";
import type { Vec3 } from "@shared/sim/types";
import type { TableSpec } from "@shared/sim/params";
import { diamondMarks } from "../aim";
import { RAIL_WIDTH_M, type Size, type TableLayout } from "./tableGeometry";

/** 카메라 높이(m). 테이블 위 물체(z ≤ 0.1 m)가 near/far 안에 넉넉히 든다. */
export const CAMERA_Z = 5;
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 10;

/** 한 프레임에 적분하는 dt 상한(s). 탭이 숨겨졌다 돌아와도 공이 한 번에 수십 바퀴 돌지 않게. */
export const MAX_DT = 0.1;

// ── 큐대 치수(m). Canvas2DRenderer 와 같은 값 ──────────────────────────
export const CUE_LENGTH = 1.45;
export const CUE_GAP = 0.012;
export const CUE_PULLBACK_MAX = 0.25;
export const CUE_TIP_W = 0.012;
export const CUE_BUTT_W = 0.030;
export const CUE_FERRULE_L = 0.03;
export const CUE_TIP_L = 0.008;

export interface OrthoFrustum {
    readonly left: number;
    readonly right: number;
    readonly top: number;
    readonly bottom: number;
}

/** 배치 → 카메라 절두체(월드 m). 마운트 좌상단이 (left, top), 우하단이 (right, bottom). */
export function orthoFrustum(L: TableLayout): OrthoFrustum {
    const inv = 1 / L.scale;
    return {
        left: -L.originX * inv,
        right: (L.container.width - L.originX) * inv,
        top: L.originY * inv,
        bottom: (L.originY - L.container.height) * inv,
    };
}

/**
 * 절두체를 통과한 월드 (x, y) 의 화면 CSS px. three 의 makeOrthographic 과 같은 식으로 NDC 를 만든 뒤
 * 뷰포트(컨테이너)로 편다: px = (ndcX·0.5 + 0.5)·W, py = (−ndcY·0.5 + 0.5)·H.
 */
export function projectOrtho(f: OrthoFrustum, container: Size, x: number, y: number): [number, number] {
    const w = 1 / (f.right - f.left);
    const h = 1 / (f.top - f.bottom);
    const ndcX = 2 * x * w - (f.right + f.left) * w;
    const ndcY = 2 * y * h - (f.top + f.bottom) * h;
    return [(ndcX * 0.5 + 0.5) * container.width, (-ndcY * 0.5 + 0.5) * container.height];
}

/** projectOrtho 의 역. */
export function unprojectOrtho(f: OrthoFrustum, container: Size, px: number, py: number): [number, number] {
    const ndcX = (px / container.width) * 2 - 1;
    const ndcY = 1 - (py / container.height) * 2;
    return [
        (ndcX + 1) * 0.5 * (f.right - f.left) + f.left,
        (ndcY + 1) * 0.5 * (f.top - f.bottom) + f.bottom,
    ];
}

/**
 * 각속도로 자세를 한 프레임 전진시킨다(제자리 갱신, 할당 없음). |ω|·dt 가 0 이면 아무것도 하지 않는다.
 * axis·dq 는 호출자가 재사용하는 스크래치.
 */
export function integrateOrientation(q: Quaternion, w: Vec3, dt: number, axis: Vector3, dq: Quaternion): void {
    if (!(dt > 0)) return;
    const wx = w[0], wy = w[1], wz = w[2];
    const mag = Math.sqrt(wx * wx + wy * wy + wz * wz);
    if (!(mag > 1e-9)) return;
    axis.set(wx / mag, wy / mag, wz / mag);
    dq.setFromAxisAngle(axis, mag * dt);
    q.premultiply(dq);
    q.normalize();
}

/** 큐볼 중심에서 팁까지 거리(m). pullback 은 0..1 로 클램프. */
export function cueGap(R: number, pullback: number): number {
    const pb = pullback < 0 ? 0 : pullback > 1 ? 1 : pullback;
    return R + CUE_GAP + pb * CUE_PULLBACK_MAX;
}

/**
 * 큐대 그룹의 z 회전. 그룹 로컬 +y 가 큐대 방향(공 뒤쪽, −phi)이 되게 한다:
 * R_z(θ)·(0, 1) = (−sin θ, cos θ) = (−cos phi, −sin phi) ⇒ θ = phi + π/2.
 */
export function cueRotationZ(phi: number): number {
    return phi + Math.PI / 2;
}

export interface DiamondWorld {
    readonly x: number;
    readonly y: number;
    readonly rail: "left" | "right" | "bottom" | "top";
    readonly index: number;
}

/** 다이아몬드 20개의 월드 좌표(레일 중앙선 위). tableGeometry.computeLayout 의 diamonds 와 같은 자리다. */
export function diamondWorld(table: TableSpec): readonly DiamondWorld[] {
    const half = RAIL_WIDTH_M / 2;
    return diamondMarks(table).map((d) => {
        let x = d.x, y = d.y;
        if (d.rail === "left") x -= half;
        else if (d.rail === "right") x += half;
        else if (d.rail === "bottom") y -= half;
        else y += half;
        return { x, y, rail: d.rail, index: d.index };
    });
}
