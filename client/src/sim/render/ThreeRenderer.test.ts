/**
 * ThreeRenderer 테스트(node 환경, jsdom 없음).
 *  1) 순수 부분(threeMath): 절두체·투영이 tableGeometry 와 1e-9 안에서 같은지(5 뷰포트 × 2 테이블 × 인셋),
 *     진짜 three OrthographicCamera 로도 같은지, 회전 적분·큐대 배치·다이아몬드 자리.
 *  2) 스모크: WebGL2 컨텍스트를 Proxy 가짜로 대체해 생명주기·좌표·공 풀·큐/링 가시성·컨텍스트 손실·스크린샷·dispose 를 확인한다.
 *     가짜 GL 은 상수를 이름별 고유 숫자로, 함수는 no-op(getParameter/getProgramParameter 등 몇 개만 그럴듯한 값)으로 응답한다.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { OrthographicCamera, PerspectiveCamera, Quaternion, Vector3 } from "three";
import { TABLES } from "@shared/sim/params";
import { openingLayout } from "@shared/sim/layouts";
import type { BallState } from "@shared/sim/types";
import { computeLayout, screenToWorld, worldToScreen } from "./tableGeometry";
import {
    CAMERA_FAR, CAMERA_NEAR, CAMERA_Z, CUE_GAP, CUE_PULLBACK_MAX, cameraBasis, cueGap, cueRotationZ, dampRig, diamondWorld,
    integrateOrientation, makeBasis, makePose, makeRig, orthoFrustum, PLAYER_AHEAD, PLAYER_BACK, PLAYER_FAR, PLAYER_FOV_DEG, PLAYER_HEIGHT,
    PLAYER_MARGIN, PLAYER_MIN_Z, PLAYER_NEAR, PLAYER_SMOOTH_S, playerPose, projectOrtho, projectPerspective, snapRig, unprojectOrtho,
    unprojectPerspective, overviewPose, OVERVIEW_EDGE, OVERVIEW_MARGIN_M, OVERVIEW_SMOOTH_S, rigSmoothTime, type CameraPose,
} from "./threeMath";
import { ThreeRenderer, type ThreeRendererOptions } from "./ThreeRenderer";

const VIEWPORTS = [
    { name: "폰 390×844", width: 390, height: 844 },
    { name: "태블릿 768×1024", width: 768, height: 1024 },
    { name: "소형 360×640", width: 360, height: 640 },
    { name: "가로 1024×600", width: 1024, height: 600 },
    { name: "정사각 500×500", width: 500, height: 500 },
];
const INSETS = { top: 47, right: 0, bottom: 34, left: 0 };
const T = TABLES.DAEDAE;

/* ------------------------------------------------------------------ 순수 부분 */

describe("orthoFrustum — 투영이 tableGeometry 와 같다", () => {
    const samples = (table: typeof T): [number, number][] => [
        [0, 0], [table.width, table.length], [table.width / 2, table.length / 2], [0.3, 1.7], [table.width, 0], [-0.06, -0.06],
    ];
    for (const table of Object.values(TABLES)) {
        for (const vp of VIEWPORTS) {
            for (const insets of [undefined, INSETS]) {
                it(`${table.name} / ${vp.name} / 인셋 ${insets ? "있음" : "없음"}`, () => {
                    const L = computeLayout(vp, table, insets);
                    const f = orthoFrustum(L);
                    // 마운트 가장자리 = 절두체 가장자리
                    expect(f.right - f.left).toBeCloseTo(vp.width / L.scale, 9);
                    expect(f.top - f.bottom).toBeCloseTo(vp.height / L.scale, 9);
                    for (const [x, y] of samples(table)) {
                        const [ex, ey] = worldToScreen(L, x, y);
                        const [px, py] = projectOrtho(f, vp, x, y);
                        expect(Math.abs(px - ex)).toBeLessThan(1e-9);
                        expect(Math.abs(py - ey)).toBeLessThan(1e-9);
                        const [wx, wy] = unprojectOrtho(f, vp, px, py);
                        const [sx, sy] = screenToWorld(L, px, py);
                        expect(Math.abs(wx - sx)).toBeLessThan(1e-9);
                        expect(Math.abs(wy - sy)).toBeLessThan(1e-9);
                        expect(Math.abs(wx - x)).toBeLessThan(1e-9);
                        expect(Math.abs(wy - y)).toBeLessThan(1e-9);
                    }
                    // 헤드 레일(y=0)이 화면 아래
                    expect(projectOrtho(f, vp, 0, 0)[1]).toBeGreaterThan(projectOrtho(f, vp, 0, table.length)[1]);
                });
            }
        }
    }

    it("진짜 three OrthographicCamera 를 통과해도 같은 px 에 떨어진다", () => {
        for (const table of Object.values(TABLES)) {
            for (const vp of VIEWPORTS) {
                const L = computeLayout(vp, table, INSETS);
                const f = orthoFrustum(L);
                const cam = new OrthographicCamera(f.left, f.right, f.top, f.bottom, CAMERA_NEAR, CAMERA_FAR);
                cam.position.set(0, 0, CAMERA_Z);
                cam.updateMatrixWorld(true);
                cam.updateProjectionMatrix();
                for (const [x, y] of [[0.3, 1.7], [table.width, table.length], [0, 0]] as const) {
                    const v = new Vector3(x, y, table.ball.R).project(cam);
                    const px = (v.x + 1) / 2 * vp.width;
                    const py = (1 - v.y) / 2 * vp.height;
                    const [ex, ey] = worldToScreen(L, x, y);
                    expect(Math.abs(px - ex)).toBeLessThan(1e-9);
                    expect(Math.abs(py - ey)).toBeLessThan(1e-9);
                    // 공 높이(z=R)는 near/far 안
                    expect(v.z).toBeGreaterThan(-1);
                    expect(v.z).toBeLessThan(1);
                }
            }
        }
    });
});

describe("integrateOrientation — ω 축으로 |ω|·dt 만큼 돈다(월드 축)", () => {
    const scratch = () => ({ axis: new Vector3(), dq: new Quaternion() });

    it("+x 로 구르는 공(ω = +y 축)은 꼭대기가 +x 쪽으로 기운다", () => {
        const { axis, dq } = scratch();
        const q = new Quaternion();
        integrateOrientation(q, [0, 10, 0], 0.1, axis, dq); // 1 rad
        const top = new Vector3(0, 0, 1).applyQuaternion(q);
        expect(top.x).toBeCloseTo(Math.sin(1), 12);
        expect(top.y).toBeCloseTo(0, 12);
        expect(top.z).toBeCloseTo(Math.cos(1), 12);
        expect(2 * Math.acos(q.w)).toBeCloseTo(1, 12);
        expect(q.length()).toBeCloseTo(1, 12);
    });

    it("이미 z 로 90° 돌아간 공도 ω=(0,w,0) 이면 월드 y 축으로 돈다(premultiply)", () => {
        const { axis, dq } = scratch();
        const q = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2);
        integrateOrientation(q, [0, 5, 0], 0.2, axis, dq); // 1 rad
        const top = new Vector3(0, 0, 1).applyQuaternion(q);
        expect(top.x).toBeCloseTo(Math.sin(1), 12);
        expect(top.z).toBeCloseTo(Math.cos(1), 12);
        // 몸통 x 축(원래 +x 였던 점은 z 회전으로 +y 에 있음)은 y 축 회전에 안 움직인다
        const side = new Vector3(1, 0, 0).applyQuaternion(q);
        expect(side.y).toBeCloseTo(1, 12);
    });

    it("사이드스핀(ω = z 축)은 꼭대기를 안 움직인다", () => {
        const { axis, dq } = scratch();
        const q = new Quaternion();
        integrateOrientation(q, [0, 0, 30], 0.05, axis, dq);
        const top = new Vector3(0, 0, 1).applyQuaternion(q);
        expect(top.z).toBeCloseTo(1, 12);
        const side = new Vector3(1, 0, 0).applyQuaternion(q);
        expect(side.x).toBeCloseTo(Math.cos(1.5), 12);
        expect(side.y).toBeCloseTo(Math.sin(1.5), 12);
    });

    it("ω=0 · dt≤0 · NaN dt 는 그대로", () => {
        const { axis, dq } = scratch();
        const q = new Quaternion(0.1, 0.2, 0.3, 0.9).normalize();
        const before = q.clone();
        integrateOrientation(q, [0, 0, 0], 0.1, axis, dq);
        integrateOrientation(q, [1, 2, 3], 0, axis, dq);
        integrateOrientation(q, [1, 2, 3], -1, axis, dq);
        integrateOrientation(q, [1, 2, 3], Number.NaN, axis, dq);
        expect(q.equals(before)).toBe(true);
    });

    it("여러 프레임을 적분해도 단위 쿼터니언이고 각도가 합산된다", () => {
        const { axis, dq } = scratch();
        const q = new Quaternion();
        for (let i = 0; i < 1000; i++) integrateOrientation(q, [3, 0, 4], 0.001, axis, dq); // |ω| = 5, 총 5 rad
        expect(q.length()).toBeCloseTo(1, 12);
        const ang = 2 * Math.acos(Math.abs(q.w));
        expect(Math.min(ang, 2 * Math.PI - ang)).toBeCloseTo(2 * Math.PI - 5, 9);
    });
});

describe("큐대 배치 — Canvas2DRenderer 와 같은 규칙", () => {
    it("간격 = R + 12 mm + pullback·0.25 m, pullback 은 0..1 클램프", () => {
        const R = T.ball.R;
        expect(cueGap(R, 0)).toBeCloseTo(R + CUE_GAP, 12);
        expect(cueGap(R, 1)).toBeCloseTo(R + CUE_GAP + CUE_PULLBACK_MAX, 12);
        expect(cueGap(R, 0.4)).toBeCloseTo(R + 0.012 + 0.1, 12);
        expect(cueGap(R, -3)).toBe(cueGap(R, 0));
        expect(cueGap(R, 7)).toBe(cueGap(R, 1));
    });

    it("그룹 로컬 +y 가 −phi 방향(공 뒤)을 향한다", () => {
        for (const phi of [0, 0.7, Math.PI / 2, 2.4, Math.PI, -1.1]) {
            const d = new Vector3(0, 1, 0).applyAxisAngle(new Vector3(0, 0, 1), cueRotationZ(phi));
            expect(d.x).toBeCloseTo(-Math.cos(phi), 12);
            expect(d.y).toBeCloseTo(-Math.sin(phi), 12);
            expect(d.z).toBeCloseTo(0, 12);
        }
    });
});

describe("diamondWorld — tableGeometry 의 다이아몬드 화면 자리와 같다", () => {
    for (const table of Object.values(TABLES)) {
        it(table.name, () => {
            const L = computeLayout({ width: 390, height: 844 }, table, INSETS);
            const marks = diamondWorld(table);
            expect(marks).toHaveLength(20);
            expect(L.diamonds).toHaveLength(20);
            marks.forEach((m, i) => {
                const [sx, sy] = worldToScreen(L, m.x, m.y);
                expect(sx).toBeCloseTo(L.diamonds[i].sx, 9);
                expect(sy).toBeCloseTo(L.diamonds[i].sy, 9);
                expect(m.rail).toBe(L.diamonds[i].rail);
            });
        });
    }
});

/* ------------------------------------------------------------------ 선수 시점 카메라(순수) */

/** 시험용 자세: 큐볼 위치·phi 조합(테이블 안쪽·쿠션 옆·코너·먼 끝에서 되돌아보기). */
const POSES: readonly { name: string; cue: [number, number]; phi: number }[] = [
    { name: "헤드 스팟에서 위로", cue: [T.width / 2, T.length / 4], phi: Math.PI / 2 },
    { name: "가운데에서 대각선", cue: [0.5, 1.5], phi: 0.7 },
    { name: "왼쪽 쿠션 옆에서 +x", cue: [T.ball.R + 0.001, 1.2], phi: 0 },
    { name: "코너에서 대각선", cue: [T.ball.R, T.ball.R], phi: Math.PI / 4 },
    { name: "먼 끝에서 되돌아보기", cue: [1.0, T.length - 0.1], phi: -Math.PI / 2 + 0.3 },
    { name: "오른쪽 쿠션으로", cue: [1.2, 2.0], phi: 0.1 },
];

/** three 의 PerspectiveCamera 를 같은 자세로 세운다(GPU 가 하는 것과 같은 행렬). */
function threeCamera(p: CameraPose, aspect: number): PerspectiveCamera {
    const cam = new PerspectiveCamera(PLAYER_FOV_DEG, aspect, PLAYER_NEAR, PLAYER_FAR);
    cam.up.set(0, 0, 1);
    cam.position.set(p.ex, p.ey, p.ez);
    cam.lookAt(p.tx, p.ty, p.tz);
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    return cam;
}

describe("playerPose — 큐볼 뒤 −phi 에 서서 큐볼 앞 +phi 를 본다, 테이블 밖 여유·최저 높이로 클램프", () => {
    it("안쪽 자세는 클램프되지 않는다", () => {
        const p = playerPose(makePose(), T, 0.7, 1.4, 0.7);
        expect(p.ex).toBeCloseTo(0.7 - Math.cos(0.7) * PLAYER_BACK, 12);
        expect(p.ey).toBeCloseTo(1.4 - Math.sin(0.7) * PLAYER_BACK, 12);
        expect(p.ez).toBe(PLAYER_HEIGHT);
        expect(p.tx).toBeCloseTo(0.7 + Math.cos(0.7) * PLAYER_AHEAD, 12);
        expect(p.ty).toBeCloseTo(1.4 + Math.sin(0.7) * PLAYER_AHEAD, 12);
        expect(p.tz).toBe(T.ball.R);
        expect(PLAYER_HEIGHT).toBeGreaterThanOrEqual(PLAYER_MIN_Z);
    });

    it("쿠션 옆·코너에서는 눈이 플레이 면 ± 여유 안에 머물고 큐볼을 지나치지 않는다", () => {
        for (const cue of [[T.ball.R, T.ball.R], [T.width - T.ball.R, T.length - T.ball.R], [T.ball.R, 1.4], [0.7, T.ball.R]] as const) {
            for (let k = 0; k < 16; k++) {
                const phi = (k / 16) * Math.PI * 2;
                const p = playerPose(makePose(), T, cue[0], cue[1], phi);
                expect(p.ex).toBeGreaterThanOrEqual(-PLAYER_MARGIN);
                expect(p.ex).toBeLessThanOrEqual(T.width + PLAYER_MARGIN);
                expect(p.ey).toBeGreaterThanOrEqual(-PLAYER_MARGIN);
                expect(p.ey).toBeLessThanOrEqual(T.length + PLAYER_MARGIN);
                expect(p.ez).toBeGreaterThanOrEqual(PLAYER_MIN_Z);
                // 눈 → 큐볼 방향이 여전히 +phi 쪽(뒤에 서 있다)이고 수평 거리는 0.4 m 이상
                const dx = cue[0] - p.ex, dy = cue[1] - p.ey;
                expect(dx * Math.cos(phi) + dy * Math.sin(phi)).toBeGreaterThan(0.4);
            }
        }
        // 코너에서 +x 로 조준(phi=0)하면 눈은 x 축으로 PLAYER_BACK 만큼 뒤 → 여유(−0.5) 에 클램프된다
        const corner = playerPose(makePose(), T, T.ball.R, T.ball.R, 0);
        expect(corner.ex).toBe(-PLAYER_MARGIN);
        const cornerY = playerPose(makePose(), T, T.ball.R, T.ball.R, Math.PI / 2);
        expect(cornerY.ey).toBe(-PLAYER_MARGIN);
    });
});

describe("cameraBasis / projectPerspective — three 의 PerspectiveCamera 와 같은 px", () => {
    it("기저는 정규 직교이고 z 축이 눈 → 목표의 반대, y 축은 위(+z 성분 양수)", () => {
        for (const pose of POSES) {
            const p = playerPose(makePose(), T, pose.cue[0], pose.cue[1], pose.phi);
            const b = cameraBasis(makeBasis(), p);
            const dot = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => ax * bx + ay * by + az * bz;
            expect(dot(b.xx, b.xy, b.xz, b.xx, b.xy, b.xz)).toBeCloseTo(1, 12);
            expect(dot(b.yx, b.yy, b.yz, b.yx, b.yy, b.yz)).toBeCloseTo(1, 12);
            expect(dot(b.zx, b.zy, b.zz, b.zx, b.zy, b.zz)).toBeCloseTo(1, 12);
            expect(dot(b.xx, b.xy, b.xz, b.yx, b.yy, b.yz)).toBeCloseTo(0, 12);
            expect(dot(b.xx, b.xy, b.xz, b.zx, b.zy, b.zz)).toBeCloseTo(0, 12);
            expect(dot(b.yx, b.yy, b.yz, b.zx, b.zy, b.zz)).toBeCloseTo(0, 12);
            expect(b.xz).toBe(0);
            expect(b.yz).toBeGreaterThan(0);
            expect(b.zz).toBeGreaterThan(0);
            // 목표는 카메라 앞(−z)
            const vz = b.zx * (p.tx - p.ex) + b.zy * (p.ty - p.ey) + b.zz * (p.tz - p.ez);
            expect(vz).toBeLessThan(0);
        }
    });

    it("바로 아래를 보는 퇴화 자세도 유한한 기저를 만든다(three 와 같은 1e-4 밀기)", () => {
        const p: CameraPose = { ex: 0.5, ey: 0.5, ez: 1, tx: 0.5, ty: 0.5, tz: 0 };
        const b = cameraBasis(makeBasis(), p);
        for (const v of Object.values(b)) expect(Number.isFinite(v)).toBe(true);
        const cam = threeCamera(p, 1);
        const px = new Vector3(0.6, 0.55, 0).project(cam);
        const mine = projectPerspective(b, p, PLAYER_FOV_DEG, 1, { width: 2, height: 2 }, 0.6, 0.55, 0);
        expect(mine[0]).toBeCloseTo(px.x + 1, 9);
        expect(mine[1]).toBeCloseTo(1 - px.y, 9);
    });

    for (const pose of POSES) {
        for (const vp of VIEWPORTS) {
            it(`${pose.name} / ${vp.name}: 진짜 카메라와 1e-9 안에서 같다`, () => {
                const p = playerPose(makePose(), T, pose.cue[0], pose.cue[1], pose.phi);
                const b = cameraBasis(makeBasis(), p);
                const aspect = vp.width / vp.height;
                const cam = threeCamera(p, aspect);
                const R = T.ball.R;
                const pts: [number, number, number][] = [
                    [pose.cue[0], pose.cue[1], R], [p.tx, p.ty, p.tz], [T.width / 2, T.length / 2, R], [0, T.length, 0], [T.width, T.length, R],
                    [pose.cue[0] + Math.cos(pose.phi) * 1.2, pose.cue[1] + Math.sin(pose.phi) * 1.2, R], [0.2, 2.6, 0.05],
                ];
                for (const [x, y, z] of pts) {
                    const v = new Vector3(x, y, z).project(cam);
                    if (v.z > 1 || v.z < -1) continue; // 절두체 밖(카메라 뒤·far 너머)은 비교하지 않는다
                    const ex = (v.x + 1) / 2 * vp.width;
                    const ey = (1 - v.y) / 2 * vp.height;
                    const [px, py] = projectPerspective(b, p, PLAYER_FOV_DEG, aspect, vp, x, y, z);
                    expect(Math.abs(px - ex)).toBeLessThan(1e-9);
                    expect(Math.abs(py - ey)).toBeLessThan(1e-9);
                }
                // 큐볼은 화면 가로 가운데(카메라가 −phi 정면 뒤에 선다), 시선 목표는 정확히 화면 중앙, 큐볼은 목표보다 아래
                const cue = projectPerspective(b, p, PLAYER_FOV_DEG, aspect, vp, pose.cue[0], pose.cue[1], R);
                const tgt = projectPerspective(b, p, PLAYER_FOV_DEG, aspect, vp, p.tx, p.ty, p.tz);
                expect(tgt[0]).toBeCloseTo(vp.width / 2, 9);
                expect(tgt[1]).toBeCloseTo(vp.height / 2, 9);
                expect(cue[1]).toBeGreaterThan(tgt[1]);
                if (p.ex === pose.cue[0] - Math.cos(pose.phi) * PLAYER_BACK && p.ey === pose.cue[1] - Math.sin(pose.phi) * PLAYER_BACK) {
                    expect(cue[0]).toBeCloseTo(vp.width / 2, 9);
                }
            });
        }
    }

    it("카메라 뒤·near 안쪽의 점도 유한한 값을 돌려준다(near 깊이로 클램프)", () => {
        const p = playerPose(makePose(), T, 0.7, 1.4, Math.PI / 2);
        const b = cameraBasis(makeBasis(), p);
        const vp = { width: 390, height: 844 };
        for (const [x, y, z] of [[0.7, -0.5, T.ball.R], [p.ex, p.ey, p.ez], [p.ex, p.ey + 0.01, p.ez], [0.7, 0.4, 0.5]] as const) {
            const [px, py] = projectPerspective(b, p, PLAYER_FOV_DEG, vp.width / vp.height, vp, x, y, z);
            expect(Number.isFinite(px)).toBe(true);
            expect(Number.isFinite(py)).toBe(true);
        }
    });
});

describe("unprojectPerspective — 평면 z=R 위 왕복 · 빗나간 광선", () => {
    for (const pose of POSES) {
        it(`${pose.name}: 카메라 앞 테이블 점은 project → unproject 왕복 오차 < 1e-6 m`, () => {
            const p = playerPose(makePose(), T, pose.cue[0], pose.cue[1], pose.phi);
            const b = cameraBasis(makeBasis(), p);
            const R = T.ball.R;
            let checked = 0;
            for (const vp of VIEWPORTS) {
                const aspect = vp.width / vp.height;
                // 큐볼 앞쪽 부채꼴(옆으로 ±0.4 m, 앞으로 0 ~ 2.2 m) 중 테이블 안의 점
                for (let d = 0; d <= 2.2; d += 0.2) {
                    for (const side of [-0.4, -0.15, 0, 0.15, 0.4]) {
                        const x = pose.cue[0] + Math.cos(pose.phi) * d - Math.sin(pose.phi) * side;
                        const y = pose.cue[1] + Math.sin(pose.phi) * d + Math.cos(pose.phi) * side;
                        if (x < 0 || x > T.width || y < 0 || y > T.length) continue;
                        const [px, py] = projectPerspective(b, p, PLAYER_FOV_DEG, aspect, vp, x, y, R);
                        const [wx, wy] = unprojectPerspective(b, p, PLAYER_FOV_DEG, aspect, vp, px, py, R, T);
                        expect(Math.abs(wx - x)).toBeLessThan(1e-6);
                        expect(Math.abs(wy - y)).toBeLessThan(1e-6);
                        checked++;
                    }
                }
            }
            expect(checked).toBeGreaterThan(20); // 쿠션 쪽을 보는 자세는 부채꼴 대부분이 테이블 밖
        });
    }

    it("화면 점을 unproject 한 뒤 다시 project 하면 같은 px(화면 아래쪽 = 테이블 면)", () => {
        const p = playerPose(makePose(), T, T.width / 2, T.length / 4, Math.PI / 2);
        const b = cameraBasis(makeBasis(), p);
        const vp = { width: 390, height: 844 };
        const aspect = vp.width / vp.height;
        for (const [px, py] of [[195, 800], [40, 600], [350, 500], [195, 450]] as const) {
            const [x, y] = unprojectPerspective(b, p, PLAYER_FOV_DEG, aspect, vp, px, py, T.ball.R, T);
            const [qx, qy] = projectPerspective(b, p, PLAYER_FOV_DEG, aspect, vp, x, y, T.ball.R);
            expect(qx).toBeCloseTo(px, 6);
            expect(qy).toBeCloseTo(py, 6);
        }
    });

    it("지평선 위(하늘)를 가리키면 테이블 안의 점을 돌려준다", () => {
        const p = playerPose(makePose(), T, T.width / 2, T.length / 4, Math.PI / 2);
        const b = cameraBasis(makeBasis(), p);
        const vp = { width: 390, height: 844 };
        const aspect = vp.width / vp.height;
        for (const [px, py] of [[195, 0], [0, 0], [390, 5], [195, -100]] as const) {
            const [x, y] = unprojectPerspective(b, p, PLAYER_FOV_DEG, aspect, vp, px, py, T.ball.R, T);
            expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
            expect(x).toBeGreaterThanOrEqual(0);
            expect(x).toBeLessThanOrEqual(T.width);
            expect(y).toBeGreaterThanOrEqual(0);
            expect(y).toBeLessThanOrEqual(T.length);
        }
        // 위쪽 가운데는 먼 쪽(+y) 끝 근처(카메라가 숙여져 화면 위가 먼 레일 언저리에 닿는다), 화면 밖 위는 끝으로 클램프
        expect(unprojectPerspective(b, p, PLAYER_FOV_DEG, aspect, vp, 195, 0, T.ball.R, T)[1]).toBeGreaterThan(T.length * 0.85);
        expect(unprojectPerspective(b, p, PLAYER_FOV_DEG, aspect, vp, 195, -100, T.ball.R, T)[1]).toBe(T.length);
    });
});

describe("dampRig — 임계 감쇠로 목표에 수렴하고, 멈추면 정확히 스냅한다", () => {
    it("60 fps 로 1 s 안에 정착(2 m 이동을 1e-4 m 까지) · 오버슈트 없음 · 마지막엔 false", () => {
        const rig = makeRig();
        const from = playerPose(makePose(), T, 0.3, 0.5, 0.2);
        const to = playerPose(makePose(), T, 1.0, 2.0, 2.5);
        snapRig(rig, from);
        let moving = true;
        let frames = 0;
        let prevDist = Infinity;
        while (moving && frames < 120) {
            moving = dampRig(rig, to, PLAYER_SMOOTH_S, 1 / 60);
            const d = Math.hypot(rig.pose.ex - to.ex, rig.pose.ey - to.ey, rig.pose.tx - to.tx, rig.pose.ty - to.ty);
            expect(d).toBeLessThanOrEqual(prevDist + 1e-12); // 단조 접근(오버슈트 없음)
            prevDist = d;
            frames++;
        }
        expect(moving).toBe(false);
        expect(frames).toBeLessThan(60);
        expect(rig.pose).toEqual(to);
        expect(rig.vel).toEqual({ ex: 0, ey: 0, ez: 0, tx: 0, ty: 0, tz: 0 });
        // 이미 목표면 그대로 false
        expect(dampRig(rig, to, PLAYER_SMOOTH_S, 1 / 60)).toBe(false);
    });

    it("dt=0 이면 자세는 그대로이고 아직 움직이는 중으로 본다", () => {
        const rig = makeRig();
        snapRig(rig, playerPose(makePose(), T, 0.3, 0.5, 0.2));
        const before = { ...rig.pose };
        expect(dampRig(rig, playerPose(makePose(), T, 1.0, 2.0, 2.5), PLAYER_SMOOTH_S, 0)).toBe(true);
        expect(rig.pose).toEqual(before);
    });
});

/* ------------------------------------------------------------------ 가짜 WebGL2 */

type Call = { name: string; args: unknown[] };

function fakeContext2d(calls: Call[]): CanvasRenderingContext2D {
    const gradient = { addColorStop: () => undefined };
    const target: Record<string, unknown> = {};
    return new Proxy(target, {
        get(_t, prop: string) {
            if (prop in target) return target[prop];
            if (prop === "createRadialGradient" || prop === "createLinearGradient") return () => gradient;
            if (prop === "getImageData") return () => undefined;
            return (...args: unknown[]) => { calls.push({ name: prop, args }); };
        },
        set(_t, prop: string, value) {
            target[prop] = value;
            return true;
        },
    }) as unknown as CanvasRenderingContext2D;
}

function fakeCanvas2d(calls: Call[]): HTMLCanvasElement {
    const ctx = fakeContext2d(calls);
    return { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
}

/** WebGL2 컨텍스트 흉내. 대문자 속성 = 고유 상수, 나머지 = 기록되는 함수. */
function fakeGL(canvas: unknown, w: number, h: number) {
    const consts = new Map<string, number>();
    let next = 1;
    const id = (name: string): number => {
        let v = consts.get(name);
        if (v === undefined) { v = next++; consts.set(name, v); }
        return v;
    };
    const calls: string[] = [];
    const gl = new Proxy({} as Record<string, unknown>, {
        get(_t, prop) {
            if (typeof prop !== "string") return undefined;
            if (prop === "canvas") return canvas;
            if (prop === "drawingBufferWidth") return w;
            if (prop === "drawingBufferHeight") return h;
            if (/^[A-Z][A-Z0-9_]*$/.test(prop)) return id(prop);
            return (...args: unknown[]): unknown => {
                calls.push(prop);
                switch (prop) {
                    case "getParameter": {
                        const p = args[0];
                        if (p === id("VERSION")) return "WebGL 2.0 (fake)";
                        if (p === id("SHADING_LANGUAGE_VERSION")) return "WebGL GLSL ES 3.00 (fake)";
                        if (p === id("VIEWPORT") || p === id("SCISSOR_BOX")) return [0, 0, w, h];
                        if (p === id("COLOR_WRITEMASK")) return [true, true, true, true];
                        if (p === id("MAX_TEXTURE_SIZE") || p === id("MAX_CUBE_MAP_TEXTURE_SIZE") || p === id("MAX_3D_TEXTURE_SIZE")) return 4096;
                        if (p === id("MAX_SAMPLES")) return 4;
                        if (p === id("MAX_VERTEX_UNIFORM_VECTORS") || p === id("MAX_FRAGMENT_UNIFORM_VECTORS")) return 1024;
                        return 16;
                    }
                    case "getShaderPrecisionFormat": return { precision: 23, rangeMin: 127, rangeMax: 127 };
                    case "getExtension": return null;
                    case "getSupportedExtensions": return [];
                    case "getContextAttributes": return { alpha: true, antialias: true, depth: true, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false };
                    case "getShaderParameter": return true;
                    case "getProgramParameter": {
                        const p = args[1];
                        return p === id("LINK_STATUS") || p === 0x91b1 ? true : 0;
                    }
                    case "getShaderInfoLog": case "getProgramInfoLog": case "getShaderSource": return "";
                    case "createShader": case "createProgram": case "createBuffer": case "createTexture": case "createVertexArray":
                    case "createFramebuffer": case "createRenderbuffer": case "createQuery": case "createSampler": case "createTransformFeedback":
                        return {};
                    case "isContextLost": return false;
                    case "getError": return 0;
                    case "checkFramebufferStatus": return id("FRAMEBUFFER_COMPLETE");
                    case "getUniformLocation": case "getActiveUniform": case "getActiveAttrib": return null;
                    case "getAttribLocation": return -1;
                    default: return undefined;
                }
            };
        },
    });
    return { gl, calls };
}

type Listener = (e: { preventDefault(): void }) => void;

function fakeGLCanvas(w: number, h: number, withBlob = true) {
    const listeners = new Map<string, Listener[]>();
    const canvas = {
        width: 0,
        height: 0,
        style: {} as Record<string, string>,
        parentNode: null as null | { removeChild(c: unknown): void },
        addEventListener(type: string, fn: Listener) {
            const arr = listeners.get(type) ?? [];
            arr.push(fn);
            listeners.set(type, arr);
        },
        removeEventListener(type: string, fn: Listener) {
            const arr = listeners.get(type);
            if (arr) listeners.set(type, arr.filter((f) => f !== fn));
        },
        setAttribute() { /* noop */ },
        getContext(name: string) { return name === "webgl2" ? gl : null; },
        toBlob: withBlob ? (cb: (b: Blob | null) => void) => cb({ size: 1, type: "image/png" } as Blob) : undefined,
    };
    const { gl, calls } = fakeGL(canvas, w, h);
    const dispatch = (type: string) => {
        let prevented = 0;
        const ev = { preventDefault: () => { prevented++; } };
        for (const fn of [...(listeners.get(type) ?? [])]) fn(ev);
        return prevented;
    };
    const listenerCount = (type: string) => (listeners.get(type) ?? []).length;
    return { canvas: canvas as unknown as HTMLCanvasElement, gl, calls, dispatch, listenerCount };
}

function fakeElement(width: number, height: number) {
    const children: unknown[] = [];
    const el = {
        clientWidth: width,
        clientHeight: height,
        children,
        style: {} as Record<string, string>,
        appendChild(c: { parentNode: unknown }) {
            children.push(c);
            c.parentNode = el;
        },
        removeChild(c: unknown) {
            const i = children.indexOf(c);
            if (i >= 0) children.splice(i, 1);
        },
    };
    return el as unknown as HTMLElement & { children: unknown[]; clientWidth: number; clientHeight: number };
}

function make(width = 390, height = 844, extra: Partial<ThreeRendererOptions> = {}, withBlob = true) {
    const glc = fakeGLCanvas(width, height, withBlob);
    const calls2d: Call[] = [];
    let t = 0;
    const r = new ThreeRenderer({
        dpr: 2,
        insets: INSETS,
        canvas: glc.canvas,
        createCanvas: () => fakeCanvas2d(calls2d),
        now: () => t,
        ...extra,
    });
    const el = fakeElement(width, height);
    return { r, el, glc, calls2d, setTime: (ms: number) => { t = ms; } };
}

const drawCount = (calls: string[]) => calls.filter((c) => c === "drawElements" || c === "drawElementsInstanced" || c === "drawArrays").length;
const clearCount = (calls: string[]) => calls.filter((c) => c === "clear").length;

describe("ThreeRenderer 스모크(가짜 WebGL2)", () => {
    let warn: ReturnType<typeof vi.spyOn>;
    let log: ReturnType<typeof vi.spyOn>;
    let selfSet = false;
    beforeAll(() => {
        // three 가 없는 확장을 경고한다 — 테스트 출력만 조용히
        warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        log = vi.spyOn(console, "log").mockImplementation(() => undefined);
        // three 는 생성 때 self 를 rAF 컨텍스트로 잡고 dispose 때 cancelAnimationFrame 을 부른다(브라우저엔 항상 있음)
        const g = globalThis as unknown as { self?: unknown };
        if (typeof g.self === "undefined") {
            g.self = { requestAnimationFrame: () => 0, cancelAnimationFrame: () => undefined };
            selfSet = true;
        }
    });
    afterAll(() => {
        warn.mockRestore();
        log.mockRestore();
        if (selfSet) delete (globalThis as unknown as { self?: unknown }).self;
    });

    it("mount 는 WebGL 캔버스를 오버레이와 같은 좌표계로 얹고 DPR 배 크기로 만든다", () => {
        const { r, el, glc } = make();
        r.mount(el, T);
        expect(el.children).toHaveLength(1);
        expect(el.children[0]).toBe(glc.canvas);
        expect(glc.canvas.width).toBe(780);
        expect(glc.canvas.height).toBe(1688);
        const st = glc.canvas.style as unknown as Record<string, string>;
        expect(st.position).toBe("absolute");
        expect(st.inset).toBe("0");
        expect(st.width).toBe("100%");
        expect(st.height).toBe("100%");
        expect(st.touchAction).toBe("none");
        const vp = r.viewport();
        expect(vp?.dpr).toBe(2);
        expect(vp?.width).toBe(390);
        expect(vp?.insets.top).toBe(47);
        expect(r.getLayout()?.scale).toBe(computeLayout({ width: 390, height: 844 }, T, INSETS).scale);
        // 라사 텍스처는 2D 컨텍스트로 만들어졌다
        expect(r.stats().clothTextured).toBe(true);
        // 마운트만으로 한 번 그렸다(정적 층)
        expect(clearCount(glc.calls)).toBeGreaterThanOrEqual(1);
    });

    it("project/unproject 는 tableGeometry 와 같다", () => {
        const { r, el } = make();
        r.mount(el, T);
        const L = computeLayout({ width: 390, height: 844 }, T, INSETS);
        const [ex, ey] = worldToScreen(L, 0.7, 1.9);
        const [px, py] = r.project(0.7, 1.9);
        expect(px).toBeCloseTo(ex, 9);
        expect(py).toBeCloseTo(ey, 9);
        const [wx, wy] = r.unproject(px, py);
        expect(wx).toBeCloseTo(0.7, 9);
        expect(wy).toBeCloseTo(1.9, 9);
        expect(r.project(0, 0)[1]).toBeGreaterThan(r.project(0, T.length)[1]);
    });

    it("draw 는 공을 만들고(풀), 큐·강조 링 가시성을 프레임대로 맞추며 그린다", () => {
        const { r, el, glc } = make();
        r.mount(el, T);
        glc.calls.length = 0;
        const balls = openingLayout("3c", T, "white");
        r.draw({ balls, cue: { phi: Math.PI / 2, pullback: 0.3, visible: true }, highlightBallId: "white" });
        expect(r.stats()).toMatchObject({ balls: 3, pooled: 0, cueVisible: true, ringVisible: true, lost: false });
        expect(clearCount(glc.calls)).toBe(1);
        // 라사·레일·받침·코·다이아몬드·스팟·공 3·그림자 3·큐 4·링 2 ≥ 18 드로우
        expect(drawCount(glc.calls)).toBeGreaterThanOrEqual(18);

        r.draw({ balls, cue: { phi: 0, pullback: 0, visible: false } });
        expect(r.stats()).toMatchObject({ balls: 3, cueVisible: false, ringVisible: false });
    });

    it("공 id 가 사라지면 풀로 돌아가고 자세가 초기화된다", () => {
        const { r, el, setTime } = make();
        r.mount(el, T);
        const four = openingLayout("4c", T, "white");
        r.draw({ balls: four });
        expect(r.stats()).toMatchObject({ balls: 4, pooled: 0 });
        // red2 를 굴려 자세를 바꾼다
        const spun: BallState[] = four.map((b) => (b.id === "red2" ? { ...b, w: [0, 10, 0], state: "rolling" } : b));
        setTime(100);
        r.draw({ balls: spun });
        const q = new Quaternion();
        expect(r.getOrientation("red2", q)).toBe(true);
        expect(q.equals(new Quaternion())).toBe(false);

        const three = openingLayout("3c", T, "white");
        setTime(200);
        r.draw({ balls: three });
        expect(r.stats()).toMatchObject({ balls: 3, pooled: 1 });
        expect(r.getOrientation("red2", q)).toBe(false);
        // 다시 나타나면 항등에서 시작
        setTime(300);
        r.draw({ balls: four });
        expect(r.stats()).toMatchObject({ balls: 4, pooled: 0 });
        expect(r.getOrientation("red2", q)).toBe(true);
        expect(q.equals(new Quaternion())).toBe(true);
    });

    it("회전은 벽시계 dt 로 적분한다(같은 프레임을 다시 그려도 ω·dt 만큼 더 돈다)", () => {
        const { r, el, setTime } = make();
        r.mount(el, T);
        const balls = openingLayout("3c", T, "white").map((b) => (b.id === "white" ? { ...b, w: [0, 10, 0] as const, state: "rolling" as const } : b));
        setTime(0);
        r.draw({ balls });
        const q0 = new Quaternion();
        r.getOrientation("white", q0);
        expect(q0.equals(new Quaternion())).toBe(true); // 첫 프레임은 dt = 0
        setTime(100);
        r.draw({ balls });
        const q1 = new Quaternion();
        r.getOrientation("white", q1);
        expect(2 * Math.acos(q1.w)).toBeCloseTo(1, 9); // 10 rad/s × 0.1 s
        // 탭이 숨겨졌다 돌아온 큰 dt 는 MAX_DT 로 잘린다
        setTime(5100);
        r.draw({ balls });
        const q2 = new Quaternion();
        r.getOrientation("white", q2);
        expect(2 * Math.acos(q2.w)).toBeCloseTo(2, 9);
    });

    it("resize 는 배치·절두체를 다시 잡고 마지막 프레임을 다시 그린다", () => {
        const { r, el, glc } = make();
        r.mount(el, T);
        r.draw({ balls: openingLayout("3c", T) });
        glc.calls.length = 0;
        el.clientWidth = 768;
        el.clientHeight = 1024;
        r.resize();
        expect(r.viewport()?.width).toBe(768);
        expect(glc.canvas.width).toBe(1536);
        expect(clearCount(glc.calls)).toBe(1);
        const L = computeLayout({ width: 768, height: 1024 }, T, INSETS);
        expect(r.project(0.5, 0.5)).toEqual(worldToScreen(L, 0.5, 0.5));
    });

    it("setTable 은 배치를 바꾼다", () => {
        const { r, el } = make();
        r.mount(el, T);
        const a = r.viewport()!.scale;
        r.setTable(TABLES.JUNGDAE_KR);
        expect(r.viewport()!.scale).toBeGreaterThan(a);
    });

    it("컨텍스트 손실: 횟수를 세고 onContextLost 를 알리며 그리기를 멈춘다 · 복구되면 다시 그린다", () => {
        const onContextLost = vi.fn();
        const onContextRestored = vi.fn();
        const { r, el, glc } = make(390, 844, { onContextLost, onContextRestored });
        r.mount(el, T);
        r.draw({ balls: openingLayout("3c", T) });
        // three 의 리스너 + 우리 리스너
        expect(glc.listenerCount("webglcontextlost")).toBe(2);
        expect(glc.dispatch("webglcontextlost")).toBeGreaterThanOrEqual(1); // preventDefault
        expect(onContextLost).toHaveBeenCalledTimes(1);
        expect(r.stats()).toMatchObject({ lost: true, losses: 1 });
        glc.calls.length = 0;
        r.draw({ balls: openingLayout("3c", T) });
        expect(clearCount(glc.calls)).toBe(0);

        glc.dispatch("webglcontextrestored");
        expect(onContextRestored).toHaveBeenCalledTimes(1);
        expect(r.stats().lost).toBe(false);
        expect(clearCount(glc.calls)).toBe(1); // 마지막 프레임을 다시 그렸다

        glc.dispatch("webglcontextlost");
        expect(onContextLost).toHaveBeenCalledTimes(2);
        expect(r.stats().losses).toBe(2);
    });

    it("screenshot: 그린 직후 toBlob · toBlob 없거나 컨텍스트를 잃었으면 null", async () => {
        const a = make();
        a.r.mount(a.el, T);
        a.glc.calls.length = 0;
        expect(await a.r.screenshot()).not.toBeNull();
        expect(clearCount(a.glc.calls)).toBe(1); // 같은 틱에 새로 그렸다
        a.glc.dispatch("webglcontextlost");
        expect(await a.r.screenshot()).toBeNull();

        const b = make(390, 844, {}, false);
        b.r.mount(b.el, T);
        expect(await b.r.screenshot()).toBeNull();

        const c = make();
        expect(await c.r.screenshot()).toBeNull(); // 마운트 전
    });

    it("dispose 는 캔버스·리스너를 떼고 이후 draw/project 를 무시한다 · 재마운트는 거부", () => {
        const { r, el, glc } = make();
        r.mount(el, T);
        r.draw({ balls: openingLayout("3c", T) });
        r.dispose();
        expect(el.children).toHaveLength(0);
        expect(glc.listenerCount("webglcontextlost")).toBe(0);
        expect(r.viewport()).toBeNull();
        glc.calls.length = 0;
        r.draw({ balls: openingLayout("3c", T) });
        expect(clearCount(glc.calls)).toBe(0);
        expect(r.project(1, 1)).toEqual([0, 0]);
        expect(r.stats().balls).toBe(0);
        expect(() => r.mount(el, T)).toThrow();
        r.dispose(); // 두 번째는 무시
    });

    it("2D 컨텍스트가 없어도(텍스처 불가) 평면 색으로 동작한다", () => {
        const { r, el } = make(390, 844, { createCanvas: () => ({ width: 0, height: 0, getContext: () => null } as unknown as HTMLCanvasElement) });
        r.mount(el, T);
        expect(r.stats().clothTextured).toBe(false);
        r.draw({ balls: openingLayout("3c", T), cue: { phi: 0, pullback: 0, visible: true } });
        expect(r.stats().balls).toBe(3);
    });

    it("setView('player'): 그려지고 project 가 유한하며 카메라가 큐볼 뒤에 선다 · 'top' 으로 돌아오면 tableGeometry 와 같다", () => {
        const { r, el, glc } = make();
        r.mount(el, T);
        expect(r.getView()).toBe("top");
        expect(r.needsFrame()).toBe(false);
        const balls = openingLayout("3c", T, "white");
        const white = balls.find((b) => b.id === "white")!;
        r.draw({
            balls, cue: { phi: Math.PI / 2, pullback: 0, visible: true, ballId: "white" }, highlightBallId: "white",
            view: { cueBallId: "white", phi: Math.PI / 2 },
        });
        glc.calls.length = 0;
        r.setView("player");
        expect(r.getView()).toBe("player");
        expect(r.stats().view).toBe("player");
        expect(clearCount(glc.calls)).toBe(1); // 마지막 프레임을 새 카메라로 다시 그렸다
        expect(drawCount(glc.calls)).toBeGreaterThanOrEqual(18);
        // 전환은 스냅: 카메라가 바로 큐볼 뒤(−phi = −y) 0.9 m·높이 0.55 m
        const pose = r.getCameraPose(makePose());
        expect(pose.ex).toBeCloseTo(white.r[0], 9);
        expect(pose.ey).toBeCloseTo(white.r[1] - PLAYER_BACK, 9);
        expect(pose.ez).toBe(PLAYER_HEIGHT);
        expect(pose.ty).toBeCloseTo(white.r[1] + PLAYER_AHEAD, 9);
        expect(r.needsFrame()).toBe(false);
        // project: 유한하고, 큐볼은 인셋 사각형(조작 층 밖) 가로 가운데·아래쪽, 먼 쿠션은 위쪽
        const cue = r.project(white.r[0], white.r[1]);
        const far = r.project(T.width / 2, T.length);
        expect(Number.isFinite(cue[0]) && Number.isFinite(cue[1])).toBe(true);
        expect(cue[0]).toBeCloseTo(195, 6);
        expect(cue[1]).toBeGreaterThan(INSETS.top + (844 - INSETS.top - INSETS.bottom) / 2);
        expect(far[1]).toBeLessThan(cue[1]);
        // 카메라 목표(큐볼 앞)는 인셋 사각형의 정중앙 — 캔버스 중앙(422)이 아니다(조작 층 아래로 밀리지 않는다)
        const tgt = r.project(pose.tx, pose.ty);
        expect(tgt[0]).toBeCloseTo(195, 6);
        expect(tgt[1]).toBeCloseTo(INSETS.top + (844 - INSETS.top - INSETS.bottom) / 2, 6);
        // 카메라 뒤(헤드 레일 뒤 멀리)도 유한
        const behind = r.project(white.r[0], -3);
        expect(Number.isFinite(behind[0]) && Number.isFinite(behind[1])).toBe(true);
        // unproject 는 왕복한다
        const [wx, wy] = r.unproject(cue[0], cue[1]);
        expect(wx).toBeCloseTo(white.r[0], 6);
        expect(wy).toBeCloseTo(white.r[1], 6);

        r.setView("top");
        const L = computeLayout({ width: 390, height: 844 }, T, INSETS);
        expect(r.project(0.7, 1.9)).toEqual(worldToScreen(L, 0.7, 1.9));
        expect(r.needsFrame()).toBe(false);
        r.setView("top"); // 같은 뷰는 무시
    });

    it("player 뷰 카메라는 view 를 따라 감쇠 이동하고(needsFrame), view 가 없으면(재생) 그 자리에 머문다", () => {
        const { r, el, setTime } = make();
        r.mount(el, T);
        const balls = openingLayout("3c", T, "white");
        const white = balls.find((b) => b.id === "white")!;
        setTime(0);
        r.draw({ balls, view: { cueBallId: "white", phi: Math.PI / 2 } });
        r.setView("player");
        // 조준을 90° 돌리면 목표가 바뀌고 카메라가 움직이기 시작한다
        setTime(16);
        r.draw({ balls, view: { cueBallId: "white", phi: 0 } });
        expect(r.needsFrame()).toBe(true);
        expect(r.stats().cameraMoving).toBe(true);
        const mid = r.getCameraPose(makePose());
        expect(mid.ex).toBeGreaterThan(white.r[0] - PLAYER_BACK); // 아직 가는 중(x 는 −0.9 쪽으로 이동 중)
        expect(mid.ex).toBeLessThan(white.r[0]);
        let t = 16;
        for (let i = 0; i < 90 && r.needsFrame(); i++) {
            t += 16;
            setTime(t);
            r.draw({ balls, view: { cueBallId: "white", phi: 0 } });
        }
        expect(r.needsFrame()).toBe(false);
        const settled = r.getCameraPose(makePose());
        expect(settled.ex).toBeCloseTo(white.r[0] - PLAYER_BACK, 9);
        expect(settled.ey).toBeCloseTo(white.r[1], 9);
        // 재생: view 없이 공이 움직여도 카메라는 그대로
        const moved: BallState[] = balls.map((b) => (b.id === "white" ? { ...b, r: [1.2, 2.5, b.r[2]] } : b));
        t += 16;
        setTime(t);
        r.draw({ balls: moved });
        expect(r.getCameraPose(makePose())).toEqual(settled);
        expect(r.needsFrame()).toBe(false);
        // 재생이 끝나 view 가 다시 오면 새 자리 뒤로 옮겨 간다
        t += 16;
        setTime(t);
        r.draw({ balls: moved, view: { cueBallId: "white", phi: Math.PI } });
        expect(r.needsFrame()).toBe(true);
    });

    it("player 뷰에서 resize 는 인셋 사각형 비율을 카메라에 주고 다시 그린다 · 마지막 프레임 없이 켜도 기본 자세로 그린다", () => {
        const { r, el, glc } = make();
        r.mount(el, T);
        glc.calls.length = 0;
        r.setView("player"); // lastFrame 없음 → 기본 자세(헤드 스팟에서 +y)
        expect(clearCount(glc.calls)).toBe(1);
        const pose = r.getCameraPose(makePose());
        expect(pose.ex).toBeCloseTo(T.width / 2, 9);
        expect(pose.ey).toBeCloseTo(T.length / 4 - PLAYER_BACK, 9);
        expect(Number.isFinite(r.project(0.5, 0.5)[0])).toBe(true);
        el.clientWidth = 1024;
        el.clientHeight = 600;
        glc.calls.length = 0;
        r.resize();
        expect(clearCount(glc.calls)).toBe(1);
        // 가로 화면: 가운데 목표는 인셋 사각형(위 47 · 아래 34 를 뺀 영역)의 중앙
        const tgt = r.project(pose.tx, pose.ty);
        expect(tgt[0]).toBeCloseTo(512, 6);
        expect(tgt[1]).toBeCloseTo(INSETS.top + (600 - INSETS.top - INSETS.bottom) / 2, 6);
        // 왕복
        const [ux, uy] = r.unproject(tgt[0], tgt[1]);
        expect(ux).toBeCloseTo(pose.tx, 6);
        expect(uy).toBeCloseTo(pose.ty, 6);
        r.dispose();
        r.setView("top"); // dispose 뒤엔 무시(던지지 않는다)
    });
});

describe("overviewPose — 재생 중 부감: 테이블 전체(+여유)가 뷰 사각형에 들어오는 가장 가까운 자세", () => {
    const corners: ReadonlyArray<readonly [number, number]> = [
        [-OVERVIEW_MARGIN_M, -OVERVIEW_MARGIN_M], [T.width + OVERVIEW_MARGIN_M, -OVERVIEW_MARGIN_M],
        [-OVERVIEW_MARGIN_M, T.length + OVERVIEW_MARGIN_M], [T.width + OVERVIEW_MARGIN_M, T.length + OVERVIEW_MARGIN_M],
    ];
    it("네 모서리가 NDC 안(가장자리 여유 포함), 눈은 헤드 레일 쪽 위, 목표는 테이블 중심", () => {
        for (const aspect of [0.45, 0.75, 1, 1.8]) {
            const p = overviewPose(makePose(), T, aspect);
            expect(p.tx).toBeCloseTo(T.width / 2, 12);
            expect(p.ty).toBeCloseTo(T.length / 2, 12);
            expect(p.tz).toBe(0);
            expect(p.ex).toBeCloseTo(T.width / 2, 12);
            expect(p.ey).toBeLessThan(T.length / 2);
            expect(p.ez).toBeGreaterThan(1);
            const b = cameraBasis(makeBasis(), p);
            const size = { width: 2, height: 2 };
            let maxEdge = 0;
            for (const [x, y] of corners) {
                const q = projectPerspective(b, p, PLAYER_FOV_DEG, aspect, size, x, y, 0);
                expect(q[0]).toBeGreaterThanOrEqual(2 * OVERVIEW_EDGE - 1e-9);
                expect(q[0]).toBeLessThanOrEqual(2 - 2 * OVERVIEW_EDGE + 1e-9);
                expect(q[1]).toBeGreaterThanOrEqual(2 * OVERVIEW_EDGE - 1e-9);
                expect(q[1]).toBeLessThanOrEqual(2 - 2 * OVERVIEW_EDGE + 1e-9);
                maxEdge = Math.max(maxEdge, Math.abs(q[0] - 1), Math.abs(q[1] - 1));
            }
            // 가장 가까운 거리: 어느 모서리든 가장자리 여유에 닿아 있다(더 가까우면 벗어난다)
            expect(maxEdge).toBeCloseTo(1 - 2 * OVERVIEW_EDGE, 6);
        }
    });
    it("좁은 화면일수록 더 멀리서 본다, 같은 입력은 같은 결과(결정론)", () => {
        const narrow = overviewPose(makePose(), T, 0.45);
        const square = overviewPose(makePose(), T, 1);
        expect(narrow.ez).toBeGreaterThan(square.ez);
        expect(overviewPose(makePose(), T, 0.45)).toEqual(narrow);
    });
    it("rigSmoothTime: 목표에 있으면 PLAYER_SMOOTH_S, 1 m 이상 멀면 OVERVIEW_SMOOTH_S, 사이는 선형", () => {
        const rig = makeRig();
        const target = playerPose(makePose(), T, 0.7, 1.4, Math.PI / 2);
        snapRig(rig, target);
        expect(rigSmoothTime(rig, target)).toBeCloseTo(PLAYER_SMOOTH_S, 12);
        rig.pose.ez = target.ez + 0.5;
        expect(rigSmoothTime(rig, target)).toBeCloseTo((PLAYER_SMOOTH_S + OVERVIEW_SMOOTH_S) / 2, 12);
        rig.pose.ez = target.ez + 3;
        expect(rigSmoothTime(rig, target)).toBeCloseTo(OVERVIEW_SMOOTH_S, 12);
    });
});

describe("ThreeRenderer 재생 중 부감(view.mode = 'overview')", () => {
    it("재생 프레임을 돌리면 카메라가 테이블 전체가 보이는 높이로 날아올라 정지하고, 조준(follow)으로 돌아오면 큐볼 뒤로 내려온다", () => {
        const { r, el, setTime } = make();
        r.mount(el, T);
        const balls = openingLayout("3c", T, "white");
        const white = balls.find((b) => b.id === "white")!;
        const follow = { cueBallId: "white", phi: Math.PI / 2 };
        r.draw({ balls, view: follow });
        r.setView("player");
        expect(r.getCameraPose(makePose()).ez).toBe(PLAYER_HEIGHT);
        let t = 0;
        let rose = false;
        for (let i = 0; i < 600; i++) {
            t += 1000 / 60;
            setTime(t);
            r.draw({ balls, view: { ...follow, mode: "overview" } });
            if (i === 10) rose = r.needsFrame() && r.getCameraPose(makePose()).ez > PLAYER_HEIGHT;
        }
        expect(rose).toBe(true);
        const top = r.getCameraPose(makePose());
        expect(top.ez).toBeGreaterThan(2);
        expect(top.tx).toBeCloseTo(T.width / 2, 6);
        expect(top.ty).toBeCloseTo(T.length / 2, 6);
        expect(r.needsFrame()).toBe(false);
        // 플레이 면 네 모서리가 인셋 사각형(조작 층 밖) 안에 보인다
        for (const [x, y] of [[0, 0], [T.width, 0], [0, T.length], [T.width, T.length]] as const) {
            const q = r.project(x, y);
            expect(q[0]).toBeGreaterThan(0);
            expect(q[0]).toBeLessThan(390);
            expect(q[1]).toBeGreaterThan(INSETS.top);
            expect(q[1]).toBeLessThan(844 - INSETS.bottom);
        }
        // follow 로 돌아오면 큐볼 뒤 선수 시점으로 내려온다
        for (let i = 0; i < 600; i++) {
            t += 1000 / 60;
            setTime(t);
            r.draw({ balls, view: follow });
        }
        const back = r.getCameraPose(makePose());
        expect(back.ex).toBeCloseTo(white.r[0], 6);
        expect(back.ey).toBeCloseTo(white.r[1] - PLAYER_BACK, 6);
        expect(back.ez).toBeCloseTo(PLAYER_HEIGHT, 6);
        expect(r.needsFrame()).toBe(false);
        // view 가 없으면 그 자리에 머문다(상대 차례 대기)
        t += 1000; setTime(t);
        r.draw({ balls });
        expect(r.getCameraPose(makePose())).toEqual(back);
    });
});
