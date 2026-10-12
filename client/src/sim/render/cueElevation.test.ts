import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CUE_BUTT_W, CUE_CLEARANCE, CUE_ELEVATION_MAX, CUE_LENGTH, CUE_TIP_W, cueElevation, cueGap, cueRadiusAt } from "./threeMath";

/**
 * 2026-10-12 오너: "온라인게임에서 큐가 당구 테두리 안으로 들어간 모습이 보이는데 이건 꼬이지 않게 잘 해 줘"
 * 큐대를 수구 높이에 수평으로 눕혀 그려서, 레일 위를 지나는 자리에서 나무 속에 파묻혔다(레일 윗면 45 mm > 수구 중심 31 mm).
 * 이제 넘어야 할 것(레일·다른 공)이 있으면 뒤를 든다. 여기는 그 각의 셈 — 그리기 전용이고 물리와 무관하다.
 */
const W = 1.422, L = 2.844;      // 대대 플레이 면
const R = 0.03075;               // 공 반지름
const RAIL_TOP = 0.045;
const UP = Math.PI / 2;          // +y 로 겨눈다 → 큐대는 −y 쪽으로 뻗는다
const ball = (id: string, x: number, y: number) => ({ id, r: [x, y, R] });
const elev = (x: number, y: number, phi: number, balls: ReturnType<typeof ball>[] = [], pullback = 0) =>
    cueElevation(x, y, phi, pullback, R, W, L, RAIL_TOP, balls, "white");
/** 축에서 t 만큼 간 자리의 큐대 밑면 높이 */
const underside = (theta: number, t: number, gap: number) => R + t * Math.sin(theta) - cueRadiusAt(t - gap) * Math.cos(theta);

describe("큐대 굵기", () => {
    it("팁 6 mm 에서 손잡이 끝 15 mm 까지 고르게 굵어진다", () => {
        expect(cueRadiusAt(0)).toBeCloseTo(CUE_TIP_W / 2, 12);
        expect(cueRadiusAt(CUE_LENGTH)).toBeCloseTo(CUE_BUTT_W / 2, 12);
        expect(cueRadiusAt(CUE_LENGTH / 2)).toBeCloseTo((CUE_TIP_W + CUE_BUTT_W) / 4, 12);
        expect(cueRadiusAt(-1)).toBe(cueRadiusAt(0));
        expect(cueRadiusAt(9)).toBe(cueRadiusAt(CUE_LENGTH));
    });
});

describe("큐대 올림각 — 넘을 것이 없으면 수평", () => {
    it("큐대가 당구대 안에 다 들어가면 0", () => {
        expect(elev(W / 2, 2.0, UP)).toBe(0);           // 뒤로 1.5 m 남았다
        expect(elev(W / 2, L / 2, 0)).toBe(elev(W / 2, L / 2, Math.PI)); // 좌우 대칭
    });

    it("옆에 있는 공·앞에 있는 공·수구 자신은 상관없다", () => {
        const far = elev(W / 2, 2.0, UP);
        expect(elev(W / 2, 2.0, UP, [ball("white", W / 2, 2.0)])).toBe(far);
        expect(elev(W / 2, 2.0, UP, [ball("red", W / 2, 2.4)])).toBe(far);          // 앞(겨누는 쪽)
        expect(elev(W / 2, 2.0, UP, [ball("red", W / 2 + 0.08, 1.5)])).toBe(far);   // 뒤지만 옆으로 8 cm
    });
});

describe("큐대 올림각 — 레일을 넘는다", () => {
    it("오너가 본 그 자리(브레이크 위치, 큐대가 아래 레일을 지난다): 조금 들려서 레일 위로 지나간다", () => {
        const y = 0.62, theta = elev(W / 2, y, UP);
        expect(theta).toBeGreaterThan(0.02);
        expect(theta).toBeLessThan(0.08);   // 2~4도쯤 — 위에서 보면 길이가 거의 그대로다
        const gap = cueGap(R, 0);
        // 레일 위를 지나는 구간(플레이 면 끝 ~ 레일 바깥 6 cm) 내내 밑면이 레일 윗면보다 높다
        for (let t = y; t <= y + 0.06; t += 0.005) expect(underside(theta, t, gap), `t=${t.toFixed(3)}`).toBeGreaterThanOrEqual(RAIL_TOP + CUE_CLEARANCE - 1e-9);
        // 수평이면 파묻힌다(고치기 전)
        expect(underside(0, y, gap)).toBeLessThan(RAIL_TOP);
    });

    it("네 레일 어느 쪽으로 넘어가도 같다", () => {
        const d = 0.4;
        const down = elev(W / 2, d, UP), up = elev(W / 2, L - d, -UP), left = elev(d, L / 2, 0), right = elev(W - d, L / 2, Math.PI);
        for (const v of [up, left, right]) expect(v).toBeCloseTo(down, 9);
        expect(down).toBeGreaterThan(0);
    });

    it("레일에 가까울수록 더 든다 · 붙어 있으면 상한까지만", () => {
        const a = elev(W / 2, 0.8, UP), b = elev(W / 2, 0.4, UP), c = elev(W / 2, 0.15, UP);
        expect(b).toBeGreaterThan(a);
        expect(c).toBeGreaterThan(b);
        expect(elev(W / 2, R, UP)).toBeCloseTo(CUE_ELEVATION_MAX, 12);   // 레일에 붙은 공을 레일 쪽에서 친다
        expect(elev(W / 2, 0.15, UP)).toBeLessThan(CUE_ELEVATION_MAX);
    });

    it("뒤로 당기면 팁이 레일 밖까지 물러날 수 있다 — 그때도 값이 나오고 상한을 넘지 않는다", () => {
        const v = elev(W / 2, 0.2, UP, [], 1);
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThan(0);
        expect(v).toBeLessThanOrEqual(CUE_ELEVATION_MAX);
    });
});

describe("큐대 올림각 — 다른 공을 넘는다", () => {
    it("큐대 길 위(수구 뒤 50 cm)에 공이 있으면 그 공 위로 지나간다", () => {
        const t = 0.5, theta = elev(W / 2, 2.0, UP, [ball("red", W / 2, 2.0 - t)]);
        expect(theta).toBeGreaterThan(0);
        const gap = cueGap(R, 0), r = cueRadiusAt(t - gap);
        // 그 자리에서 큐대 축이 공 중심에서 (공 + 큐대 + 틈)만큼 떨어져 있다
        const axisAbove = t * Math.sin(theta);
        expect(axisAbove).toBeGreaterThanOrEqual(R + r + CUE_CLEARANCE - 1e-9);
    });

    it("살짝 비켜 있는 공은 그만큼만 든다 · 레일과 공이 둘 다 있으면 더 큰 쪽", () => {
        const on = elev(W / 2, 2.0, UP, [ball("red", W / 2, 1.5)]);
        const off = elev(W / 2, 2.0, UP, [ball("red", W / 2 + 0.03, 1.5)]);
        expect(off).toBeGreaterThan(0);
        expect(off).toBeLessThan(on);
        const railOnly = elev(W / 2, 0.62, UP), both = elev(W / 2, 0.62, UP, [ball("yellow", W / 2, 0.3)]);
        expect(both).toBeGreaterThan(railOnly);
    });

    it("수구에 붙은 공 너머로 칠 때는 상한까지", () => {
        expect(elev(W / 2, 2.0, UP, [ball("red", W / 2, 2.0 - 2 * R)])).toBeCloseTo(CUE_ELEVATION_MAX, 12);
    });
});

describe("조준을 돌려도 끊기지 않는다", () => {
    it("한 바퀴를 0.5도씩 돌리며 — 올림각이 한 번에 2도 넘게 뛰지 않는다(레일·공 둘 다 있는 배치)", () => {
        const balls = [ball("red", 0.9, 0.9), ball("yellow", 0.3, 1.1)];
        let prev = elev(0.6, 0.7, 0, balls), worst = 0;
        for (let deg = 0.5; deg <= 360; deg += 0.5) {
            const v = elev(0.6, 0.7, (deg * Math.PI) / 180, balls);
            worst = Math.max(worst, Math.abs(v - prev));
            prev = v;
        }
        expect(worst).toBeLessThan((2 * Math.PI) / 180);
    });
});

describe("렌더러에 붙인 자리", () => {
    const src = readFileSync(resolve(__dirname, "ThreeRenderer.ts"), "utf8");
    it("올림각은 조준 회전보다 먼저 걸린다(회전 순서 ZXY) — 기본 순서면 조준과 무관한 축으로 기운다", () => {
        expect(src).toContain('this.cueGroup.rotation.order = "ZXY";');
        expect(src).toContain("cueElevation(cb.r[0], cb.r[1], cue.phi, cue.pullback, R, this.table.width, this.table.length, RAIL_TOP, balls, cb.id)");
    });
});
