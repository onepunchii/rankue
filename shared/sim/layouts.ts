/**
 * 개시 배치. 좌표는 params.ts 규약(x 짧은 변, y 긴 변, 헤드 레일 y=0), z = R.
 *
 * 3쿠션(UMB 세계규칙 개시 배치): 빨간 공은 상단 스팟(y = ¾L), 상대 큐볼은 하단 스팟(y = ¼L),
 * 선공 큐볼은 같은 헤드 라인 위에서 상대 큐볼로부터 182.5 mm 옆.
 * 4구(국내 관행): 빨간 공 둘을 세로 중심선 상단 스팟과 중앙 스팟에, 큐볼은 3쿠션과 같게.
 *   ※ 4구 배치는 당구장마다 다르다 — 오너 확인 대상(2026-09-07).
 */
import type { BallState } from "./types.js";
import type { TableSpec } from "./params.js";

function still(id: string, x: number, y: number, R: number): BallState {
    return { id, r: [x, y, R], v: [0, 0, 0], w: [0, 0, 0], state: "stationary" };
}

export const OPENING_SIDE_OFFSET = 0.1825;

export function openingLayout(gameType: "3c" | "4c", table: TableSpec, cueBallId: "white" | "yellow" = "white", side: "left" | "right" = "right"): readonly BallState[] {
    const R = table.ball.R;
    const cx = table.width / 2;
    const L = table.length;
    const dx = side === "right" ? OPENING_SIDE_OFFSET : -OPENING_SIDE_OFFSET;
    const opponent = cueBallId === "white" ? "yellow" : "white";
    const cue = still(cueBallId, cx + dx, L / 4, R);
    const opp = still(opponent, cx, L / 4, R);
    if (gameType === "3c") {
        return [cue, opp, still("red", cx, (3 * L) / 4, R)];
    }
    return [cue, opp, still("red1", cx, (3 * L) / 4, R), still("red2", cx, L / 2, R)];
}

/** 위치 비교 허용 오차(m). 개시 배치 생성값은 비트 동일하지만 3·(L/4) 와 (3·L)/4 같은 계산 차이를 흡수한다. */
const OPENING_EPS = 1e-6;

function near(a: number, b: number): boolean {
    return Math.abs(a - b) <= OPENING_EPS;
}

/**
 * 공이 개시 배치 그대로인가(선수가 옮기지 않음). 테이블 치수 없이 상대 위치로 판정한다:
 * 큐볼·상대 큐볼이 같은 y(헤드 라인) 위에서 182.5 mm 떨어져 있고, 상대 큐볼과 빨간 공이 같은 x(세로 중심선),
 * 빨간 공 y = 3 × 상대 큐볼 y(¼L → ¾L). 4구는 red1(¾L)·red2(½L = 2 × ¼L) 둘 다.
 * white·yellow 어느 쪽이 큐볼이든, 좌·우 어느 쪽에 놓였든 참. 개시 규칙(3쿠션 첫 접촉은 빨간 공)과 기본 조준의 근거.
 */
export function isOpeningLayout(balls: readonly BallState[], gameType: "3c" | "4c"): boolean {
    const expected = gameType === "3c" ? 3 : 4;
    if (balls.length !== expected) return false;
    const byId = new Map<string, BallState>();
    for (const b of balls) byId.set(b.id, b);
    if (byId.size !== expected) return false;
    const white = byId.get("white"), yellow = byId.get("yellow");
    if (!white || !yellow) return false;
    const reds: BallState[] = [];
    for (const id of gameType === "3c" ? ["red"] : ["red1", "red2"]) {
        const r = byId.get(id);
        if (!r) return false;
        reds.push(r);
    }
    const pairs: ReadonlyArray<readonly [BallState, BallState]> = [[white, yellow], [yellow, white]];
    for (const [cue, opp] of pairs) {
        if (!near(cue.r[1], opp.r[1])) continue;
        if (!near(Math.abs(cue.r[0] - opp.r[0]), OPENING_SIDE_OFFSET)) continue;
        const cx = opp.r[0], q = opp.r[1];
        if (!(near(reds[0].r[0], cx) && near(reds[0].r[1], 3 * q))) continue;
        if (gameType === "4c" && !(near(reds[1].r[0], cx) && near(reds[1].r[1], 2 * q))) continue;
        return true;
    }
    return false;
}

/** 배치 유효성: 테이블 안, 서로 겹치지 않음. 자유 배치(드래그) 입력 검증용. */
export function isValidLayout(balls: readonly BallState[], table: TableSpec): boolean {
    const R = table.ball.R;
    const ids = new Set<string>();
    for (const b of balls) {
        if (ids.has(b.id)) return false;
        ids.add(b.id);
        const [x, y] = b.r;
        if (!(x >= R && x <= table.width - R && y >= R && y <= table.length - R)) return false;
    }
    for (let i = 0; i < balls.length; i++) {
        for (let j = i + 1; j < balls.length; j++) {
            const dx = balls[i].r[0] - balls[j].r[0];
            const dy = balls[i].r[1] - balls[j].r[1];
            if (dx * dx + dy * dy < (2 * R) * (2 * R)) return false;
        }
    }
    return true;
}
