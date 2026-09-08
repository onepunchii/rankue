/**
 * 길 찾기(2026-09-08 오너)용 무작위 배치. 결정론 — 같은 씨앗이면 같은 배치가 나온다(공유 링크·테스트).
 * 규칙: 쿠션에서 공 반지름 + 여유만큼 떨어지고, 공끼리도 지름 + 여유만큼 떨어진다(붙은 공은 길이 없다시피 해서 뺀다).
 * 배치가 실패하는 일이 없도록 후보를 여러 번 뽑고, 그래도 안 되면 개시 배치를 준다.
 */
import type { BallState } from "./types";
import type { TableSpec } from "./params";
import { openingLayout } from "./layouts";

/** 쿠션에서 최소 이만큼(공 반지름의 배수) 떨어뜨린다. */
const RAIL_MARGIN_R = 2.2;
/** 공 사이 최소 거리(지름의 배수). */
const BALL_GAP_D = 1.6;

/** mulberry32 — 씨앗 하나로 같은 수열(엔진의 다른 곳과 같은 방식). */
function rng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function randomLayout(gameType: "3c" | "4c", table: TableSpec, seed: number): readonly BallState[] {
    const ids = gameType === "3c" ? ["white", "yellow", "red"] : ["white", "yellow", "red1", "red2"];
    const R = table.ball.R;
    const minX = RAIL_MARGIN_R * R, maxX = table.width - RAIL_MARGIN_R * R;
    const minY = RAIL_MARGIN_R * R, maxY = table.length - RAIL_MARGIN_R * R;
    const gap = BALL_GAP_D * 2 * R;
    const next = rng(seed);
    for (let attempt = 0; attempt < 200; attempt++) {
        const put: { id: string; x: number; y: number }[] = [];
        let okAll = true;
        for (const id of ids) {
            let placed = false;
            for (let i = 0; i < 60 && !placed; i++) {
                const x = minX + next() * (maxX - minX);
                const y = minY + next() * (maxY - minY);
                // Math.hypot 은 결정론 규칙에서 금지(conformance.test) — 제곱 비교로 대신한다
                if (put.every((p) => (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y) >= gap * gap)) { put.push({ id, x, y }); placed = true; }
            }
            if (!placed) { okAll = false; break; }
        }
        if (okAll) return put.map((p) => ({ id: p.id, r: [p.x, p.y, R] as const, v: [0, 0, 0] as const, w: [0, 0, 0] as const, state: "stationary" as const }));
    }
    return openingLayout(gameType, table, "white");
}
