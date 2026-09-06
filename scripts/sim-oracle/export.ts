/**
 * export.ts — shared/sim 으로 오라클 비교용 샷을 돌려 두 파일을 쓴다.
 *
 *   out/shots.json    오라클(pooltool) 입력. 공 배치 + 우리 ShotInput + pooltool 규약으로 변환한 큐 파라미터.
 *   out/ours.json     우리 엔진 결과. 타격 직후 상태, 이벤트마다 (종류·시각·id·해당 공들의 사후 상태), 최종 위치.
 *
 * 샷 선택: fixtures/golden.json 에서 tableId=DAEDAE · cushionModel=han2005 인 샷을 순서대로 60개.
 * theta 는 0 으로 고정한다 — pooltool 0.6.0 InstantaneousPoint 는 v_z 를 항상 0 으로 두고(3D FIXME),
 * 우리 v2.0 도 z 운동이 없지만, θ≠0 이면 두 엔진이 ω 축 기울임을 다르게 처리할 여지가 있어 동등성 검증에서 뺀다.
 * (theta 를 바꾸므로 golden 의 해시·final 은 참고하지 않고 여기서 다시 시뮬레이션한다.)
 *
 * pooltool 규약 정렬 (README.md 표 참고)
 *   V0_pt   = V0 × tipEfficiency        pooltool 에는 팁 효율이 없다. 두 엔진 모두 ω ∝ v 라 V0 를 줄이면 v·ω 가 함께 맞는다.
 *   phi_pt  = deg(phi + squirtAngle(a)) pooltool 은 스쿼트로 v 만 돌리고 ω 는 안 돌린다. 우리는 기저 자체를 φ+α 로 만들어
 *                                        v·ω 를 함께 돌린다. squirt_throttle=0 으로 pooltool 스쿼트를 끄고 φ 에 α 를 미리 더하면
 *                                        pooltool 도 φ+α 프레임에서 v·ω 를 계산하므로 우리와 정확히 같아진다.
 *   a_pt    = −a                          pooltool 은 +a 가 왼쪽(left english), 우리는 +a 가 오른쪽.
 *   b_pt    = b                           같다.
 *   theta   = 0 (deg)
 *
 * 실행: cd scripts/sim-oracle && npx tsx export.ts [--n 60] [--out out]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BallState, ShotInput, SimEvent, SimResult } from "../../shared/sim/types";
import { DEFAULT_CUE, TABLES } from "../../shared/sim/params";
import { simulateShot } from "../../shared/sim/simulate";
import { squirtAngle } from "../../shared/sim/resolve/stickBall";
import { ENGINE_VERSION } from "../../shared/sim/version";
import { paramsOf } from "../../shared/sim/fixtures/shots";

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN = join(HERE, "..", "..", "shared", "sim", "fixtures", "golden.json");

interface GoldenShot {
    readonly i: number;
    readonly tableId: "DAEDAE" | "JUNGDAE_KR";
    readonly gameType: "3c" | "4c";
    readonly layout: "opening" | "random";
    readonly cushionModel: "han2005" | "sphereHalfSpace" | "mathavan2010";
    readonly condition: number;
    readonly balls: readonly BallState[];
    readonly input: ShotInput;
}

/** 두 엔진 결과 파일이 공유하는 상태 표현. */
export interface StateOut {
    readonly r: readonly [number, number, number];
    readonly v: readonly [number, number, number];
    readonly w: readonly [number, number, number];
    readonly state: string;
}

export interface EventOut {
    readonly type: "ball-ball" | "ball-cushion" | "transition";
    readonly t: number;
    readonly ids: readonly string[];
    readonly cushion?: string;
    readonly from?: string;
    readonly to?: string;
    /** 이 이벤트 해석 직후 모든 공의 상태. */
    readonly after: Record<string, StateOut>;
}

export interface ShotOut {
    readonly i: number;
    readonly gameType: string;
    readonly layout: string;
    readonly balls: readonly { id: string; r: readonly [number, number, number] }[];
    readonly input: ShotInput;
    readonly pooltoolCue: { V0: number; phi_deg: number; theta_deg: number; a: number; b: number; cue_ball_id: string };
    readonly afterStrike: Record<string, StateOut>;
    readonly events: readonly EventOut[];
    readonly final: Record<string, readonly [number, number]>;
    readonly duration: number;
    readonly truncated: boolean;
    readonly hash?: string;
}

function arg(name: string, fallback: string): string {
    const idx = process.argv.indexOf(name);
    return idx >= 0 && idx + 1 < process.argv.length ? process.argv[idx + 1] : fallback;
}

function toState(b: BallState): StateOut {
    return { r: [b.r[0], b.r[1], b.r[2]], v: [b.v[0], b.v[1], b.v[2]], w: [b.w[0], b.w[1], b.w[2]], state: b.state };
}

function snapshotMap(balls: readonly BallState[]): Record<string, StateOut> {
    const out: Record<string, StateOut> = {};
    for (const b of balls) out[b.id] = toState(b);
    return out;
}

function eventOut(e: SimEvent, after: Record<string, StateOut>): EventOut {
    switch (e.type) {
        case "ball-ball":
            return { type: "ball-ball", t: e.t, ids: [e.ids[0], e.ids[1]], after };
        case "ball-cushion":
            return { type: "ball-cushion", t: e.t, ids: [e.ids[0]], cushion: e.cushion, after };
        default:
            return { type: "transition", t: e.t, ids: [e.ids[0]], from: e.from, to: e.to, after };
    }
}

function main(): void {
    const n = Number(arg("--n", "60"));
    const outDir = join(HERE, arg("--out", "out"));
    mkdirSync(outDir, { recursive: true });

    const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as { seed: number; shots: GoldenShot[] };
    const selected = golden.shots
        .filter((s) => s.tableId === "DAEDAE" && s.cushionModel === "han2005")
        .slice(0, n);

    const table = TABLES.DAEDAE;
    const cue = DEFAULT_CUE;
    const shots: ShotOut[] = [];
    const inputs: object[] = [];

    for (const c of selected) {
        const input: ShotInput = { ...c.input, theta: 0 };
        const params = paramsOf({ tableId: c.tableId, cushionModel: c.cushionModel, condition: c.condition });
        const res: SimResult = simulateShot(c.balls, input, params);

        // pooltool 규약으로 변환한 큐 파라미터 (파일 머리 주석 참고)
        const alpha = squirtAngle(input.a, cue.endmassRatio);
        const pooltoolCue = {
            V0: input.V0 * cue.tipEfficiency,
            phi_deg: (input.phi + alpha) * 180 / Math.PI,
            theta_deg: 0,
            a: -input.a,
            b: input.b,
            cue_ball_id: input.cueBallId,
        };

        const events: EventOut[] = [];
        // history[0] 은 타격 직후, history[k] 는 events[k−1] 해석 직후
        for (let k = 0; k < res.events.length; k++) {
            events.push(eventOut(res.events[k], snapshotMap(res.history[k + 1].balls)));
        }
        const final: Record<string, readonly [number, number]> = {};
        for (const b of res.final) final[b.id] = [b.r[0], b.r[1]];

        const balls = c.balls.map((b) => ({ id: b.id, r: [b.r[0], b.r[1], b.r[2]] as const }));
        shots.push({
            i: c.i,
            gameType: c.gameType,
            layout: c.layout,
            balls,
            input,
            pooltoolCue,
            afterStrike: snapshotMap(res.history[0].balls),
            events,
            final,
            duration: res.duration,
            truncated: res.truncated,
            hash: res.hash,
        });
        inputs.push({ i: c.i, gameType: c.gameType, layout: c.layout, balls, input, pooltoolCue });
    }

    const meta = {
        engineVersion: ENGINE_VERSION,
        goldenSeed: golden.seed,
        table: { id: table.id, width: table.width, length: table.length, cushionHeight: table.cushionHeight },
        ball: table.ball,
        cue,
        cushionModel: "han2005",
        thetaForcedZero: true,
        count: shots.length,
    };
    writeFileSync(join(outDir, "shots.json"), JSON.stringify({ meta, shots: inputs }, null, 1));
    writeFileSync(join(outDir, "ours.json"), JSON.stringify({ meta, shots }, null, 1));
    const totalEvents = shots.reduce((s, x) => s + x.events.length, 0);
    console.log(`exported ${shots.length} shots (${totalEvents} events) → ${outDir}/shots.json, ${outDir}/ours.json`);
}

main();
