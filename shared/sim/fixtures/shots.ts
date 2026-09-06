/**
 * fixtures/shots.ts — 시드 고정 무작위 샷 생성기 (골든 픽스처·불변량 테스트 공용).
 *
 * 테스트 파일이 아니라 엔진 폴더의 순수 모듈이다(테스트 둘이 같은 생성기를 쓰기 위해). 그래서 이 폴더의
 * 절대 규칙을 똑같이 지킨다: 난수는 rng.mulberry32, 각도는 dmath, 상대 경로 import 만.
 *
 * 배치: 공식 개시 배치(layouts.openingLayout) 또는 무작위 합법 배치(테이블 안, 서로 2R + 2 mm 이상).
 * 입력: 큐볼이 다른 공 하나를 향하는 각 ± 0.35 rad, V0 ∈ [0.8, 9] m/s, (a, b) 는 반지름 0.5 원판 안,
 *       theta ∈ [0, 0.35] rad. 큐볼은 항상 "white".
 */
import type { BallState, ShotInput } from "../types";
import type { CushionModelId, SimParams, TableSpec } from "../params";
import { DEFAULT_CUE, TABLES } from "../params";
import { openingLayout } from "../layouts";
import { atan2, TWO_PI } from "../dmath";
import { mulberry32, uniform } from "../rng";

export type LayoutKind = "opening" | "random";

export interface ShotCase {
    readonly i: number;
    readonly tableId: TableSpec["id"];
    readonly gameType: "3c" | "4c";
    readonly layout: LayoutKind;
    readonly cushionModel: CushionModelId;
    readonly condition: number;
    readonly balls: readonly BallState[];
    readonly input: ShotInput;
}

const IDS_3C = ["white", "yellow", "red"] as const;
const IDS_4C = ["white", "yellow", "red1", "red2"] as const;

/** 테이블 안, 서로 2R + margin 이상 떨어진 무작위 정지 배치. */
export function randomLegalLayout(rnd: () => number, table: TableSpec, gameType: "3c" | "4c", margin = 0.002): readonly BallState[] {
    const R = table.ball.R;
    const ids = gameType === "3c" ? IDS_3C : IDS_4C;
    const out: BallState[] = [];
    const minD = 2 * R + margin;
    for (let k = 0; k < ids.length; k++) {
        for (let attempt = 0; ; attempt++) {
            const x = uniform(rnd, R + margin, table.width - R - margin);
            const y = uniform(rnd, R + margin, table.length - R - margin);
            let ok = true;
            for (let j = 0; j < out.length; j++) {
                const dx = out[j].r[0] - x, dy = out[j].r[1] - y;
                if (dx * dx + dy * dy < minD * minD) { ok = false; break; }
            }
            if (ok || attempt > 1000) {
                out.push({ id: ids[k], r: [x, y, R], v: [0, 0, 0], w: [0, 0, 0], state: "stationary" });
                break;
            }
        }
    }
    return out;
}

/** 큐볼이 다른 공 하나를 향하는 각 ± spread 의 무작위 입력. */
export function randomShotInput(rnd: () => number, balls: readonly BallState[], cueBallId = "white", spread = 0.35): ShotInput {
    const cue = balls.find((b) => b.id === cueBallId) ?? balls[0];
    const others = balls.filter((b) => b.id !== cue.id);
    const target = others.length > 0 ? others[Math.floor(rnd() * others.length)] : cue;
    let phi = atan2(target.r[1] - cue.r[1], target.r[0] - cue.r[0]) + uniform(rnd, -spread, spread);
    if (phi < 0) phi += TWO_PI;
    const V0 = uniform(rnd, 0.8, 9);
    let a = 0, b = 0;
    for (;;) {
        a = uniform(rnd, -0.5, 0.5);
        b = uniform(rnd, -0.5, 0.5);
        if (a * a + b * b <= 0.25) break;
    }
    const theta = uniform(rnd, 0, 0.35);
    return { cueBallId: cue.id, phi, V0, a, b, theta };
}

export interface GenerateOptions {
    /** i → 쿠션 모델. 기본 전부 han2005. */
    readonly modelFor?: (i: number) => CushionModelId;
    /** i → 테이블 컨디션. 기본 전부 1. (난수 소비에 영향이 없으므로 배치·입력은 그대로다.) */
    readonly conditionFor?: (i: number) => number;
}

/** seed 에서 n 개의 샷 케이스. 테이블·종목·배치는 난수로 고른다. */
export function generateShotCases(seed: number, n: number, opts: GenerateOptions = {}): readonly ShotCase[] {
    const rnd = mulberry32(seed);
    const modelFor = opts.modelFor ?? (() => "han2005" as const);
    const conditionFor = opts.conditionFor ?? (() => 1);
    const out: ShotCase[] = [];
    for (let i = 0; i < n; i++) {
        const tableId: TableSpec["id"] = rnd() < 0.5 ? "DAEDAE" : "JUNGDAE_KR";
        const gameType: "3c" | "4c" = rnd() < 0.5 ? "3c" : "4c";
        const layout: LayoutKind = rnd() < 0.5 ? "opening" : "random";
        const table = TABLES[tableId];
        const balls = layout === "opening"
            ? openingLayout(gameType, table, "white", rnd() < 0.5 ? "right" : "left")
            : randomLegalLayout(rnd, table, gameType);
        const input = randomShotInput(rnd, balls, "white");
        out.push({ i, tableId, gameType, layout, cushionModel: modelFor(i), condition: conditionFor(i), balls, input });
    }
    return out;
}

export function paramsOf(c: Pick<ShotCase, "tableId" | "cushionModel" | "condition">): SimParams {
    return { table: TABLES[c.tableId], cue: DEFAULT_CUE, cushionModel: c.cushionModel, condition: c.condition };
}
