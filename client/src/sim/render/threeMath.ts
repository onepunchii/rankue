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
 *  - 선수 시점(player 뷰): playerPose 가 큐볼·phi 로 눈 위치·시선 목표를 만들고(테이블 밖 여유·최저 높이로 클램프),
 *    cameraBasis 가 three 의 Matrix4.lookAt 과 같은 규칙으로 카메라 축을 만들며, projectPerspective / unprojectPerspective 가
 *    GPU 의 원근 투영(PerspectiveCamera.updateProjectionMatrix → makePerspective)을 CPU 에서 재현한다. dampRig 는
 *    임계 감쇠 스프링으로 카메라를 목표 자세로 부드럽게 옮긴다(할당 없음).
 *  - 재생 중 부감: overviewPose 가 테이블 전체가 뷰 사각형에 들어오는 가장 가까운 부감 자세를 이분법으로 찾고,
 *    rigSmoothTime 이 목표까지 거리로 감쇠 시간을 섞어 먼 비행은 느긋하게, 조준 회전은 즉각 따라오게 한다.
 */
import type { Quaternion, Vector3 } from "three";
import type { Vec3 } from "@shared/sim/types";
import type { TableSpec } from "@shared/sim/params";
import { diamondMarks } from "../aim";
import { RAIL_WIDTH_M, type Size, type TableLayout } from "./tableGeometry";

const DEG2RAD = Math.PI / 180;

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

// ── 선수 시점 카메라(원근) ───────────────────────────────────────────────
/** 세로 시야각(°). 세로 화면에서는 가로 시야가 2·atan(tan(25°)·aspect) 로 좁아진다(폰 ≈ 40°). */
export const PLAYER_FOV_DEG = 45;
export const PLAYER_NEAR = 0.05;
export const PLAYER_FAR = 20;
/** 눈 위치: 큐볼 뒤(−phi) 거리·높이(m). 시선 목표: 큐볼 앞(+phi) 거리(m), 높이는 공 중심(R). */
export const PLAYER_BACK = 0.7;
export const PLAYER_HEIGHT = 0.9;    // 실측(2026-09-07): 0.55 면 화면 위 40% 가 빈 배경 — 더 높이서 더 숙여 본다
export const PLAYER_AHEAD = 0.35;
/** 눈이 플레이 면 밖으로 나갈 수 있는 여유(m) — 큐볼이 쿠션에 붙어도 눈은 이 안에 선다. */
export const PLAYER_MARGIN = 0.5;
/** 눈의 최저 높이(m). */
export const PLAYER_MIN_Z = 0.25;
/** 카메라 감쇠 시간(s) — 목표까지 ~95% 가 약 2·smoothTime 에 끝난다. 조준 드래그가 매끄럽게 따라오는 값. */
export const PLAYER_SMOOTH_S = 0.12;
/** 감쇠가 끝났다고 보는 문턱(m, m/s). 이 안이면 목표에 스냅하고 프레임 요청을 멈춘다. */
const RIG_SETTLE_POS = 1e-4;
const RIG_SETTLE_VEL = 1e-3;
/** 빗나간 unproject 광선을 수평으로 이만큼 보낸 뒤 테이블 안으로 클램프한다(m). */
const MISS_FAR = 100;

/** 카메라 자세: 눈 e 와 시선 목표 t(월드 m, 위쪽은 +z). 제자리 갱신용 가변 구조. */
export interface CameraPose {
    ex: number; ey: number; ez: number;
    tx: number; ty: number; tz: number;
}

export function makePose(): CameraPose {
    return { ex: 0, ey: 0, ez: 1, tx: 0, ty: 1, tz: 0 };
}

export function copyPose(out: CameraPose, src: CameraPose): CameraPose {
    out.ex = src.ex; out.ey = src.ey; out.ez = src.ez;
    out.tx = src.tx; out.ty = src.ty; out.tz = src.tz;
    return out;
}

function clamp(v: number, lo: number, hi: number): number {
    return v < lo ? lo : v > hi ? hi : v;
}

/**
 * 큐볼 (cueX, cueY)·조준 phi → 선수 시점 자세(제자리, 할당 없음).
 * 눈은 큐볼 뒤 −phi 로 PLAYER_BACK, 높이 PLAYER_HEIGHT; x·y 는 플레이 면 ± PLAYER_MARGIN 안으로, z 는 PLAYER_MIN_Z 이상으로 클램프.
 * 시선 목표는 큐볼 앞 +phi 로 PLAYER_AHEAD, 높이 R — 조준선이 화면 세로축을 따라 "멀어지는" 방향으로 놓인다.
 * 클램프는 눈을 테이블 쪽(= 큐볼 쪽)으로만 당기므로 큐볼이 안에 있는 한 눈이 큐볼을 지나치지 않는다(수평 거리 ≥ ~0.5 m).
 */
export function playerPose(out: CameraPose, table: TableSpec, cueX: number, cueY: number, phi: number): CameraPose {
    const c = Math.cos(phi), s = Math.sin(phi);
    out.ex = clamp(cueX - c * PLAYER_BACK, -PLAYER_MARGIN, table.width + PLAYER_MARGIN);
    out.ey = clamp(cueY - s * PLAYER_BACK, -PLAYER_MARGIN, table.length + PLAYER_MARGIN);
    out.ez = Math.max(PLAYER_MIN_Z, PLAYER_HEIGHT);
    out.tx = cueX + c * PLAYER_AHEAD;
    out.ty = cueY + s * PLAYER_AHEAD;
    out.tz = table.ball.R;
    return out;
}

/** 카메라 축(월드 좌표). 카메라는 −z 를 보고 +y 가 위, up 은 월드 +z. three 의 Matrix4.lookAt(eye, target, up) 과 같은 규칙. */
export interface CameraBasis {
    xx: number; xy: number; xz: number;
    yx: number; yy: number; yz: number;
    zx: number; zy: number; zz: number;
}

export function makeBasis(): CameraBasis {
    return { xx: 1, xy: 0, xz: 0, yx: 0, yy: 1, yz: 0, zx: 0, zy: 0, zz: 1 };
}

/** 자세 → 카메라 축(제자리). 눈=목표면 z=(0,0,1), 바로 아래를 보면(z ∥ up) three 처럼 z.x 를 1e-4 밀어 정한다. */
export function cameraBasis(out: CameraBasis, p: CameraPose): CameraBasis {
    let zx = p.ex - p.tx, zy = p.ey - p.ty, zz = p.ez - p.tz;
    let len = Math.sqrt(zx * zx + zy * zy + zz * zz);
    if (len === 0) { zz = 1; len = 1; }
    zx /= len; zy /= len; zz /= len;
    // x = up × z, up = (0, 0, 1)
    let xx = -zy, xy = zx;
    let xl = Math.sqrt(xx * xx + xy * xy);
    if (xl === 0) {
        zx += 0.0001;
        len = Math.sqrt(zx * zx + zy * zy + zz * zz);
        zx /= len; zy /= len; zz /= len;
        xx = -zy; xy = zx;
        xl = Math.sqrt(xx * xx + xy * xy);
    }
    xx /= xl; xy /= xl;
    out.xx = xx; out.xy = xy; out.xz = 0;
    // y = z × x
    out.yx = -zz * xy;
    out.yy = zz * xx;
    out.yz = zx * xy - zy * xx;
    out.zx = zx; out.zy = zy; out.zz = zz;
    return out;
}

/**
 * 월드 (x, y, z) → 화면 CSS px(원근). NDC = (vx / (−vz·tan(fov/2)·aspect), vy / (−vz·tan(fov/2))) — three 의 대칭 절두체와 같다.
 * 카메라 뒤·near 안쪽의 점(−vz < near)은 깊이를 near 로 클램프해 항상 유한한 값을 돌려준다 — 위치는 뜻이 없고 보통 화면 밖이다
 * (오버레이 경로가 카메라 뒤로 지나가면 그 구간은 엉뚱한 곳으로 그어진다 — 감수).
 */
export function projectPerspective(
    b: CameraBasis, p: CameraPose, fovDeg: number, aspect: number, container: Size, x: number, y: number, z: number,
): [number, number] {
    const dx = x - p.ex, dy = y - p.ey, dz = z - p.ez;
    const vx = b.xx * dx + b.xy * dy + b.xz * dz;
    const vy = b.yx * dx + b.yy * dy + b.yz * dz;
    const vz = b.zx * dx + b.zy * dy + b.zz * dz;
    const depth = -vz > PLAYER_NEAR ? -vz : PLAYER_NEAR;
    const t = Math.tan(fovDeg * DEG2RAD * 0.5);
    const ndcX = vx / (depth * t * aspect);
    const ndcY = vy / (depth * t);
    return [(ndcX * 0.5 + 0.5) * container.width, (-ndcY * 0.5 + 0.5) * container.height];
}

/**
 * 화면 CSS px → 평면 z = planeZ 위의 월드 (x, y). 눈에서 화면 점을 지나는 광선과 평면의 교점.
 * 광선이 평면을 눈 앞에서 못 만나면(지평선 위·카메라 뒤) 눈에서 그 수평 방향으로 멀리 간 점을 플레이 면 안으로 클램프한
 * "가장 가까운 테이블 안 점" 을 돌려준다 — 조준 드래그가 하늘을 가리켜도 phi 가 튀지 않는다.
 */
export function unprojectPerspective(
    b: CameraBasis, p: CameraPose, fovDeg: number, aspect: number, container: Size, px: number, py: number, planeZ: number, table: TableSpec,
): [number, number] {
    const t = Math.tan(fovDeg * DEG2RAD * 0.5);
    const cx = ((px / container.width) * 2 - 1) * t * aspect;
    const cy = (1 - (py / container.height) * 2) * t;
    // 카메라 공간 (cx, cy, −1) → 월드 방향
    const dx = b.xx * cx + b.yx * cy - b.zx;
    const dy = b.xy * cx + b.yy * cy - b.zy;
    const dz = b.xz * cx + b.yz * cy - b.zz;
    const s = (planeZ - p.ez) / dz;
    // 평면과 만나도 테이블 밖(먼 레일 너머 등)이면 테이블 안으로 클램프 — 드래그 조준·공 배치 모두 테이블 안 점만 다룬다
    if (s > 0 && Number.isFinite(s)) return [clamp(p.ex + dx * s, 0, table.width), clamp(p.ey + dy * s, 0, table.length)];
    const hl = Math.sqrt(dx * dx + dy * dy);
    let fx = p.ex, fy = p.ey;
    if (hl > 1e-12) { fx += (dx / hl) * MISS_FAR; fy += (dy / hl) * MISS_FAR; }
    return [clamp(fx, 0, table.width), clamp(fy, 0, table.length)];
}

/** 감쇠 카메라: 현재 자세와 성분별 속도. 목표는 호출자가 playerPose 로 채운다. */
export interface CameraRig {
    readonly pose: CameraPose;
    readonly vel: CameraPose;
}

export function makeRig(): CameraRig {
    return { pose: makePose(), vel: { ex: 0, ey: 0, ez: 0, tx: 0, ty: 0, tz: 0 } };
}

/** 즉시 목표 자세로(속도 0). 뷰 전환·첫 프레임용. */
export function snapRig(rig: CameraRig, target: CameraPose): void {
    copyPose(rig.pose, target);
    const v = rig.vel;
    v.ex = v.ey = v.ez = v.tx = v.ty = v.tz = 0;
}

/** 임계 감쇠 스프링 한 성분(Unity SmoothDamp 근사). 새 위치를 돌려주고 속도는 out 에. */
function damp1(x: number, v: number, target: number, omega: number, dt: number, out: { v: number }): number {
    const k = omega * dt;
    const e = 1 / (1 + k + 0.48 * k * k + 0.235 * k * k * k);
    const change = x - target;
    const temp = (v + omega * change) * dt;
    out.v = (v - omega * temp) * e;
    return target + (change + temp) * e;
}

const dampOut = { v: 0 };

/**
 * 카메라를 목표 쪽으로 dt 만큼 전진(제자리, 할당 없음). 아직 움직이는 중이면 true.
 * 위치·속도가 문턱 안으로 들어오면 목표에 스냅하고 false — 이후 프레임을 더 요청하지 않는다.
 */
export function dampRig(rig: CameraRig, target: CameraPose, smoothTime: number, dt: number): boolean {
    const p = rig.pose, v = rig.vel;
    if (dt > 0) {
        const omega = 2 / smoothTime;
        p.ex = damp1(p.ex, v.ex, target.ex, omega, dt, dampOut); v.ex = dampOut.v;
        p.ey = damp1(p.ey, v.ey, target.ey, omega, dt, dampOut); v.ey = dampOut.v;
        p.ez = damp1(p.ez, v.ez, target.ez, omega, dt, dampOut); v.ez = dampOut.v;
        p.tx = damp1(p.tx, v.tx, target.tx, omega, dt, dampOut); v.tx = dampOut.v;
        p.ty = damp1(p.ty, v.ty, target.ty, omega, dt, dampOut); v.ty = dampOut.v;
        p.tz = damp1(p.tz, v.tz, target.tz, omega, dt, dampOut); v.tz = dampOut.v;
    }
    const dp = Math.max(
        Math.abs(p.ex - target.ex), Math.abs(p.ey - target.ey), Math.abs(p.ez - target.ez),
        Math.abs(p.tx - target.tx), Math.abs(p.ty - target.ty), Math.abs(p.tz - target.tz),
    );
    const dv = Math.max(Math.abs(v.ex), Math.abs(v.ey), Math.abs(v.ez), Math.abs(v.tx), Math.abs(v.ty), Math.abs(v.tz));
    if (dp < RIG_SETTLE_POS && dv < RIG_SETTLE_VEL) {
        snapRig(rig, target);
        return false;
    }
    return true;
}

// ── 재생 중 부감(俯瞰) 카메라 ─────────────────────────────────────────────
/**
 * 부감 피치(수평 기준 °). 90 이면 바로 아래(탑다운과 같아진다), 낮을수록 원근이 세지만 다 보이려면 더 멀어진다.
 * 세로 폰(뷰 비율 0.45)에선 가로가 먼저 걸려 66° 는 테이블이 화면 높이의 56 %, 78° 는 63 %, 90° 는 68 % — 원근감을 조금 남기고 78°(실측 2026-09-07).
 */
export const OVERVIEW_PITCH_DEG = 78;
/** 플레이 면 둘레 여유(m): 레일 폭 + 조금. 네 모서리가 이 여유를 더한 채로 화면 안에 들어온다. */
export const OVERVIEW_MARGIN_M = RAIL_WIDTH_M + 0.04;
/** 화면 가장자리 여유(NDC 반폭 비율). */
export const OVERVIEW_EDGE = 0.04;
/** 부감 ↔ 선수 시점 비행의 감쇠 시간(s). 큰 이동은 이 값, 조준 회전 같은 작은 이동은 PLAYER_SMOOTH_S 로 이어진다. */
export const OVERVIEW_SMOOTH_S = 0.45;
/** 감쇠 시간을 섞는 기준 거리(m): 눈이 목표에서 이보다 멀면 OVERVIEW_SMOOTH_S, 가까울수록 PLAYER_SMOOTH_S 쪽. */
export const OVERVIEW_BLEND_M = 1.0;

const overviewBasis = makeBasis();
const overviewProbe = makePose();
const NDC_SIZE: Size = { width: 2, height: 2 };

/**
 * 재생 중 부감 자세(제자리): 테이블 중심을 헤드 레일 쪽에서 OVERVIEW_PITCH_DEG 로 내려다보되, 플레이 면 네 모서리
 * (+ OVERVIEW_MARGIN_M)가 모두 뷰 사각형(aspect) 안에 들어오는 가장 가까운 거리. 이분법 40회(단조: 같은 방향에서 멀수록 다 들어온다).
 * 모드가 바뀌거나 aspect 가 바뀔 때만 부르면 된다(렌더러가 캐시).
 */
export function overviewPose(out: CameraPose, table: TableSpec, aspect: number, fovDeg = PLAYER_FOV_DEG, pitchDeg = OVERVIEW_PITCH_DEG): CameraPose {
    const cx = table.width / 2, cy = table.length / 2;
    const pr = pitchDeg * DEG2RAD;
    const dy = -Math.cos(pr), dz = Math.sin(pr);
    const m = OVERVIEW_MARGIN_M;
    const lo = 2 * OVERVIEW_EDGE, hi = 2 - 2 * OVERVIEW_EDGE;
    const p = overviewProbe;
    p.tx = cx; p.ty = cy; p.tz = 0;
    const fits = (d: number): boolean => {
        p.ex = cx; p.ey = cy + dy * d; p.ez = dz * d;
        cameraBasis(overviewBasis, p);
        for (let i = 0; i < 4; i++) {
            const x = i & 1 ? table.width + m : -m;
            const y = i & 2 ? table.length + m : -m;
            const q = projectPerspective(overviewBasis, p, fovDeg, aspect, NDC_SIZE, x, y, 0);
            if (q[0] < lo || q[0] > hi || q[1] < lo || q[1] > hi) return false;
        }
        return true;
    };
    let a = 0.5, b = 40;
    for (let i = 0; i < 40; i++) {
        const mid = (a + b) / 2;
        if (fits(mid)) b = mid; else a = mid;
    }
    out.ex = cx; out.ey = cy + dy * b; out.ez = dz * b;
    out.tx = cx; out.ty = cy; out.tz = 0;
    return out;
}

/** 목표까지 눈 거리에 따라 감쇠 시간을 섞는다: 부감 비행처럼 먼 이동은 느긋하게(OVERVIEW_SMOOTH_S), 조준 회전은 즉각(PLAYER_SMOOTH_S). */
export function rigSmoothTime(rig: CameraRig, target: CameraPose): number {
    const p = rig.pose;
    const dx = p.ex - target.ex, dy = p.ey - target.ey, dz = p.ez - target.ez;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const k = d >= OVERVIEW_BLEND_M ? 1 : d / OVERVIEW_BLEND_M;
    return PLAYER_SMOOTH_S + (OVERVIEW_SMOOTH_S - PLAYER_SMOOTH_S) * k;
}
