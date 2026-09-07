/**
 * simulate.ts — 이벤트 기반 샷 시뮬레이션 루프.
 *
 * 출처: Leckie & Greenspan 2005/2006, Kiefl "pooltool-alg" (2020),
 *       pooltool <pooltool/evolution/event_based/simulate.py> (_SimulationState.step),
 *       <pooltool/physics/resolve/ball_ball/core.py> (resolve = make_kiss → solve → resolve_continually_touching)
 *       (Apache-2.0, NOTICE.md).
 *
 * 루프 (README "simulate.ts")
 *   t = t0, history[0] = 시작 스냅샷
 *   반복: c = nextEvent → 없으면 종료 → 정지가 아닌 모든 공을 evolveBall(dt) → t += dt →
 *         그 이벤트 하나만 resolve → events·history 에 push. MAX_EVENTS 에 닿으면 truncated.
 *   전이 → applyTransition, 착지(ball-table, v2.2) → resolveBallTable, 볼–쿠션 → resolveCushion(모델, 코 높이),
 *   볼–볼 → makeKiss → resolveBallBall → resolveContinuallyTouching.
 *
 * 즉시 접촉 스윕 (detect 의 근 하한 1e-9 s 를 보완)
 *   감지기는 t ≤ 1e-9 s 의 근을 "현재 이벤트 자신"으로 보고 버린다. 그래서 이미 닿은 채 접근 중인 쌍은
 *   감지기가 영원히 보지 못한다 — 처음부터 붙어 있던 공(프로즌·뉴턴 요람), 정확한 코너 입사의 두 번째 면,
 *   전이와 동률이라 밀린 충돌, 접점 속도가 정확히 0 인 미끄럼 공의 전이(dt = 0) 등이 그렇다.
 *   pooltool 은 EPS 가 2e-14 s 라 이 문제가 실질적으로 없지만 우리는 규칙 5 의 동률 폭 1e-9 를 하한으로 쓰므로
 *   감지기를 부르기 전에 "근이 (0, 1e-9] 에 있을 접촉"을 직접 찾아 dt = 0 이벤트로 해석한다:
 *     쿠션: 코 라인까지 여유 gap ≤ |v_n|·1e-9 + 1e-12 이고 쿠션 쪽으로 이동 중, 세그먼트 범위 안
 *     볼–볼: |Δr| − 2R ≤ |Δv_n|·1e-9 + 1e-12 이고 접근 중 (3차원 거리)
 *     착지: airborne 이고 landingTime ≤ 1e-9 — 큐를 든 타격 직후(z = R, v_z < 0)와 v_z ≈ +0 으로 떠난 공이 여기 걸린다
 *     전이: nextTransition 의 dt ≤ 0
 *   동률 순서는 감지기와 같은 compareTied. 같은 시각의 연쇄는 MAX_IMMEDIATE_PER_INSTANT 로 상한을 둔다.
 *
 * 그 밖의 안전장치 (테스트가 debugCounters 로 발동 횟수를 읽는다)
 *   - 쿠션 해석 전에 공이 코 라인을 넘어 있으면(gap < 0) 라인 위로 되민다(cushionSnaps).
 *   - 어떤 resolve 뒤에도 두 공이 2R − 1e-9 보다 가까우면 중심선을 따라 대칭으로 2R + spacer 로 벌린다(overlapFixes).
 *     3차원 중심선이므로 공중 공이 끼면 z 로도 밀리는데, 천 위의 공을 슬레이트 아래(z < R)로 밀지는 않는다(z 를 R 로 자른다).
 *   - 볼–볼 해석 뒤 resolveContinuallyTouching 이 발동하면 continuallyTouching 을 센다.
 *   README 대로 이 안전장치들은 결과에 경고를 남기거나 throw 하지 않는다.
 *
 * 입력 검증 (41-determinism-review 2.1 / 2.9)
 *   NaN·∞ 가 들어오면 물리 경로에는 방어가 없어 최종 상태와 해시까지 NaN 이 흘러간다. NaN 의 비트 패턴은 IEEE 가
 *   규정하지 않아 엔진마다 다르므로(V8 14.9 는 −NaN 부호 비트 보존) 그 해시는 기기 간에 갈릴 수 있다. 그래서 API 경계
 *   (simulateShot·simulateFrom)에서 유한성·범위·id 유일성·condition > 0 을 검사해 RangeError 로 거부한다.
 *   공 배열 순서는 결과 물리에 영향이 없고(감지·해석은 id 로 결정) 해시도 id 정렬로 계산하므로 순서는 계약이 아니다.
 *
 * 초월함수 없음(strike 가 dmath 를 쓴다). 입력 불변. Date·난수 없음.
 */
import type { BallState, CushionSegment, EventCandidate, MotionState, ShotInput, SimEvent, SimResult, Snapshot, Vec3 } from "./types.js";
import type { BallParams, SimParams } from "./params.js";
import { applyCondition, cushionSegments } from "./params.js";
import { HALF_PI } from "./dmath.js";
import { evolveBall, landingTime, nextTransition } from "./evolve.js";
import { compareTied, EVENT_EPS, nextEvent } from "./detect/index.js";
import { strike } from "./resolve/stickBall.js";
import { resolveBallBall } from "./resolve/ballBall.js";
import { resolveBallTable } from "./resolve/ballTable.js";
import { resolveCushion } from "./resolve/cushion/index.js";
import { applyTransition } from "./resolve/transition.js";
import { DEFAULT_SPACER, makeKiss, resolveContinuallyTouching } from "./resolve/kiss.js";
import { hashResult } from "./hash.js";
import { ENGINE_VERSION, paramsHash } from "./version.js";

/** 이벤트 상한. 넘으면 truncated = true 로 강제 종료(규칙은 이 샷을 무효로 본다). */
export const MAX_EVENTS = 2000;
/** 같은 시각(dt = 0)에 연쇄로 해석하는 즉시 접촉 이벤트의 상한. 넘으면 감지기로 넘어가 시간을 진행시킨다. */
export const MAX_IMMEDIATE_PER_INSTANT = 100;
/** 즉시 접촉 판정의 절대 여유 (m). 상대 반올림 1e-3 을 덮고도 남는다. */
const CONTACT_SLACK = 1e-12;
/** 이보다 깊이 겹친 쌍은 밀어 벌린다 (m). README 시험 층 A 의 겹침 허용치와 같다. */
const OVERLAP_TOL = 1e-9;

/** 테스트용 진단 카운터. 결과·해시에는 영향이 없다. */
export const debugCounters = {
    immediateEvents: 0,
    overlapFixes: 0,
    cushionSnaps: 0,
    continuallyTouching: 0,
    sweepOverflows: 0,
};

export function resetDebugCounters(): void {
    debugCounters.immediateEvents = 0;
    debugCounters.overlapFixes = 0;
    debugCounters.cushionSnaps = 0;
    debugCounters.continuallyTouching = 0;
    debugCounters.sweepOverflows = 0;
}

function copyBall(b: BallState): BallState {
    return {
        id: b.id,
        r: [b.r[0], b.r[1], b.r[2]],
        v: [b.v[0], b.v[1], b.v[2]],
        w: [b.w[0], b.w[1], b.w[2]],
        state: b.state,
    };
}

// ---------------------------------------------------------------------------
// 입력 검증
// ---------------------------------------------------------------------------

const MOTION_STATES: readonly MotionState[] = ["stationary", "spinning", "rolling", "sliding", "airborne"];

function isFiniteVec(v: Vec3): boolean {
    return Number.isFinite(v[0]) && Number.isFinite(v[1]) && Number.isFinite(v[2]);
}

/** 공 목록: id 는 비지 않은 문자열이고 유일, r·v·w 는 유한, state 는 알려진 값. 아니면 RangeError. */
export function validateBalls(balls: readonly BallState[]): void {
    const seen = new Set<string>();
    for (let i = 0; i < balls.length; i++) {
        const b = balls[i];
        if (typeof b.id !== "string" || b.id.length === 0) throw new RangeError(`ball #${i}: id must be a non-empty string`);
        if (seen.has(b.id)) throw new RangeError(`duplicate ball id: ${b.id}`);
        seen.add(b.id);
        if (!isFiniteVec(b.r) || !isFiniteVec(b.v) || !isFiniteVec(b.w)) throw new RangeError(`ball ${b.id}: r, v, w must be finite`);
        if (MOTION_STATES.indexOf(b.state) < 0) throw new RangeError(`ball ${b.id}: unknown state ${String(b.state)}`);
    }
}

/** 타격 입력: phi·V0·a·b·theta 유한, V0 ≥ 0, 0 ≤ theta < π/2. (a·b 의 미스큐 범위는 strike 가 검사한다.) */
export function validateShotInput(input: ShotInput): void {
    if (!Number.isFinite(input.phi)) throw new RangeError("shot: phi must be finite");
    if (!Number.isFinite(input.V0) || input.V0 < 0) throw new RangeError("shot: V0 must be finite and ≥ 0");
    if (!Number.isFinite(input.a) || !Number.isFinite(input.b)) throw new RangeError("shot: a, b must be finite");
    if (!Number.isFinite(input.theta) || input.theta < 0 || input.theta >= HALF_PI) throw new RangeError("shot: theta must be in [0, π/2)");
}

/** 파라미터: condition 은 양의 유한수 (0 이면 마찰이 ∞, 음수면 eC 가 NaN). */
export function validateParams(params: SimParams): void {
    if (!Number.isFinite(params.condition) || !(params.condition > 0)) throw new RangeError("params: condition must be a positive finite number");
}

/** 후보의 event.t(지연값)를 절대 시각 t 로 바꾼 새 이벤트. */
function eventAt(e: SimEvent, t: number): SimEvent {
    switch (e.type) {
        case "ball-ball":
            return { type: "ball-ball", t, ids: [e.ids[0], e.ids[1]] };
        case "ball-cushion":
            return { type: "ball-cushion", t, ids: [e.ids[0]], cushion: e.cushion };
        case "ball-table":
            return { type: "ball-table", t, ids: [e.ids[0]] };
        default:
            return { type: "transition", t, ids: [e.ids[0]], from: e.from, to: e.to };
    }
}

// ---------------------------------------------------------------------------
// 쿠션 기하
// ---------------------------------------------------------------------------

interface CushionGap {
    /** 공 중심의 코 라인까지 부호 거리 − R. 음수면 라인을 넘었다. */
    readonly gap: number;
    /** 안쪽 법선 방향 속도. 음수면 쿠션 쪽으로 이동 중. */
    readonly vn: number;
    /** 접점 투영이 세그먼트 범위 [−R, L + R] 안인가. */
    readonly inRange: boolean;
}

function cushionGap(b: BallState, seg: CushionSegment, R: number): CushionGap {
    const nx = seg.normal[0], ny = seg.normal[1];
    const dx = b.r[0] - seg.p1[0], dy = b.r[1] - seg.p1[1];
    const gap = nx * dx + ny * dy - R;
    const vn = nx * b.v[0] + ny * b.v[1];
    const ex = seg.p2[0] - seg.p1[0], ey = seg.p2[1] - seg.p1[1];
    const L = Math.sqrt(ex * ex + ey * ey);
    const along = L === 0 ? 0 : (dx * ex + dy * ey) / L;
    return { gap, vn, inRange: along >= -R && along <= L + R };
}

/** 감지기 근의 반올림(≈ 1e-17 m)보다 깊은 침투만 진단 카운터에 센다 (m). */
const CUSHION_SNAP_COUNT_TOL = 1e-12;

/**
 * 코 라인을 넘은(gap < 0) 공을 법선 방향으로 라인 위(gap = 0)까지 되민다. 아니면 그대로.
 * 감지기 근으로 전진한 공은 반올림으로 절반쯤 gap < 0 이라 늘 조금씩 되밀리지만, 카운터는 즉시 스윕이
 * 잡은 진짜 침투(1e-12 m 초과)만 센다.
 */
function snapIntoTable(b: BallState, seg: CushionSegment, gap: number): BallState {
    if (!(gap < 0)) return b;
    if (gap < -CUSHION_SNAP_COUNT_TOL) debugCounters.cushionSnaps++;
    return {
        id: b.id,
        r: [b.r[0] - seg.normal[0] * gap, b.r[1] - seg.normal[1] * gap, b.r[2]],
        v: [b.v[0], b.v[1], b.v[2]],
        w: [b.w[0], b.w[1], b.w[2]],
        state: b.state,
    };
}

// ---------------------------------------------------------------------------
// 즉시 접촉 스윕
// ---------------------------------------------------------------------------

/** 감지기가 버리는 (0, 1e-9] s 대역의 접촉과 dt = 0 전이 중 동률 규칙상 첫 번째. 없으면 null. */
function immediateCandidate(balls: readonly BallState[], segs: readonly CushionSegment[], p: BallParams): EventCandidate | null {
    let best: EventCandidate | null = null;
    const consider = (c: EventCandidate): void => {
        if (best === null || compareTied(c, best) < 0) best = c;
    };
    const R = p.R;

    for (let i = 0; i < balls.length; i++) {
        const b = balls[i];
        const tr = nextTransition(b, p);
        if (tr !== null && !(tr.dt > 0)) consider({ dt: 0, event: tr.event });

        // 착지: 감지기가 버리는 (0, 1e-9] 의 근과, 이미 z ≤ R 로 내려온(타격 직후) 공. landingTime 이 두 경우를 0 으로 준다.
        if (b.state === "airborne" && landingTime(b, p) <= EVENT_EPS) {
            consider({ dt: 0, event: { type: "ball-table", t: 0, ids: [b.id] } });
        }

        if (b.v[0] === 0 && b.v[1] === 0) continue;   // 병진하지 않으면 쿠션에 접근할 수 없다
        for (let k = 0; k < segs.length; k++) {
            const g = cushionGap(b, segs[k], R);
            if (!(g.vn < 0) || !g.inRange) continue;
            if (g.gap <= -g.vn * EVENT_EPS + CONTACT_SLACK) {
                consider({ dt: 0, event: { type: "ball-cushion", t: 0, ids: [b.id], cushion: segs[k].id } });
            }
        }
    }

    for (let i = 0; i < balls.length; i++) {
        const a = balls[i];
        for (let j = i + 1; j < balls.length; j++) {
            const o = balls[j];
            const dx = o.r[0] - a.r[0], dy = o.r[1] - a.r[1], dz = o.r[2] - a.r[2];
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist === 0) continue;
            // 상대속도의 중심선 성분 (음수면 접근)
            const vrel = ((o.v[0] - a.v[0]) * dx + (o.v[1] - a.v[1]) * dy + (o.v[2] - a.v[2]) * dz) / dist;
            if (!(vrel < 0)) continue;
            if (dist - 2 * R <= -vrel * EVENT_EPS + CONTACT_SLACK) {
                const ids: readonly [string, string] = a.id < o.id ? [a.id, o.id] : [o.id, a.id];
                consider({ dt: 0, event: { type: "ball-ball", t: 0, ids } });
            }
        }
    }
    return best;
}

// ---------------------------------------------------------------------------
// 이벤트 해석
// ---------------------------------------------------------------------------

interface Ctx {
    readonly params: SimParams;
    readonly p: BallParams;
    readonly segs: readonly CushionSegment[];
    readonly index: ReadonlyMap<string, number>;
}

function resolveEvent(balls: BallState[], ev: SimEvent, ctx: Ctx): void {
    const p = ctx.p;
    if (ev.type === "transition") {
        const i = ctx.index.get(ev.ids[0])!;
        balls[i] = applyTransition(balls[i], ev.to, p);
        return;
    }
    if (ev.type === "ball-table") {
        const i = ctx.index.get(ev.ids[0])!;
        balls[i] = resolveBallTable(balls[i], p);
        return;
    }
    if (ev.type === "ball-cushion") {
        const i = ctx.index.get(ev.ids[0])!;
        let seg: CushionSegment | undefined;
        for (let k = 0; k < ctx.segs.length; k++) if (ctx.segs[k].id === ev.cushion) { seg = ctx.segs[k]; break; }
        if (seg === undefined) return;
        const b = snapIntoTable(balls[i], seg, cushionGap(balls[i], seg, p.R).gap);
        balls[i] = resolveCushion(ctx.params.cushionModel, b, seg, p, ctx.params.table.cushionHeight);
        return;
    }
    const i = ctx.index.get(ev.ids[0])!;
    const j = ctx.index.get(ev.ids[1])!;
    const kissed = makeKiss(balls[i], balls[j], p, DEFAULT_SPACER);
    const hit = resolveBallBall(kissed[0], kissed[1], p);
    const out = resolveContinuallyTouching(hit[0], hit[1], p);
    if (out[0] !== hit[0]) debugCounters.continuallyTouching++;
    balls[i] = out[0];
    balls[j] = out[1];
}

/** 2R − OVERLAP_TOL 보다 가까운 쌍을 (3차원) 중심선을 따라 대칭으로 2R + spacer 로 벌린다. z 는 R 아래로 내리지 않는다. */
function fixOverlaps(balls: BallState[], p: BallParams): void {
    const D = 2 * p.R;
    const R = p.R;
    for (let i = 0; i < balls.length; i++) {
        for (let j = i + 1; j < balls.length; j++) {
            const a = balls[i], o = balls[j];
            const dx = o.r[0] - a.r[0], dy = o.r[1] - a.r[1], dz = o.r[2] - a.r[2];
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (!(dist < D - OVERLAP_TOL)) continue;
            debugCounters.overlapFixes++;
            let nx = 1, ny = 0, nz = 0;
            if (dist > 0) { nx = dx / dist; ny = dy / dist; nz = dz / dist; }
            const half = 0.5 * (D + DEFAULT_SPACER - dist);
            const za = a.r[2] - nz * half;
            const zo = o.r[2] + nz * half;
            balls[i] = { ...a, r: [a.r[0] - nx * half, a.r[1] - ny * half, za < R ? R : za] };
            balls[j] = { ...o, r: [o.r[0] + nx * half, o.r[1] + ny * half, zo < R ? R : zo] };
        }
    }
}

// ---------------------------------------------------------------------------
// 루프
// ---------------------------------------------------------------------------

function run(initial: readonly BallState[], params: SimParams, t0: number): Omit<SimResult, "input"> {
    const p = applyCondition(params.table.ball, params.condition);
    const segs = cushionSegments(params.table);
    const index = new Map<string, number>();
    for (let i = 0; i < initial.length; i++) index.set(initial[i].id, i);
    const ctx: Ctx = { params, p, segs, index };

    let balls: BallState[] = initial.map(copyBall);
    let t = t0;
    const events: SimEvent[] = [];
    const history: Snapshot[] = [{ t, balls: balls.slice() }];
    let truncated = false;
    let immediateRun = 0;

    for (;;) {
        if (events.length >= MAX_EVENTS) { truncated = true; break; }

        let cand: EventCandidate | null = null;
        if (immediateRun < MAX_IMMEDIATE_PER_INSTANT) {
            cand = immediateCandidate(balls, segs, p);
        } else {
            debugCounters.sweepOverflows++;
        }

        if (cand !== null) {
            immediateRun++;
            debugCounters.immediateEvents++;
        } else {
            cand = nextEvent(balls, segs, p);
            if (cand === null) break;
            const dt = cand.dt;
            const next: BallState[] = new Array(balls.length);
            for (let i = 0; i < balls.length; i++) {
                const b = balls[i];
                next[i] = b.state === "stationary" ? b : evolveBall(b, dt, p);
            }
            balls = next;
            t += dt;
            immediateRun = 0;
        }

        const ev = eventAt(cand.event, t);
        balls = balls.slice();
        resolveEvent(balls, ev, ctx);
        fixOverlaps(balls, p);
        events.push(ev);
        history.push({ t, balls });
    }

    if (truncated) {
        // pooltool stop_balls: 상한에 걸리면 모든 공을 세워 결과를 닫는다. 공중에 있던 공은 천 높이로 내린다(정지 = 천 위).
        balls = balls.map((b) => {
            const s = applyTransition(b, "stationary", p);
            return s.r[2] === p.R ? s : { id: s.id, r: [s.r[0], s.r[1], p.R], v: s.v, w: s.w, state: s.state };
        });
        history.push({ t, balls });
    }

    return {
        engineVersion: ENGINE_VERSION,
        paramsHash: paramsHash(params),
        events,
        history,
        final: balls,
        duration: t - t0,
        hash: hashResult(events, balls),
        truncated,
    };
}

/**
 * 큐 타격부터 전부 정지까지. 큐볼(input.cueBallId)을 strike 로 때린 뒤 루프를 돈다.
 * 타격 결과 속도·각속도가 모두 0(V0 = 0)이면 이벤트 없이 정지 상태로 끝난다(규칙의 no-shot).
 * θ > 0 이면 큐볼은 airborne(v_z < 0)으로 시작하고 첫 이벤트는 t = 0 의 착지(ball-table)다.
 * 입력이 유한하지 않거나 범위 밖이면(validateBalls·validateShotInput·validateParams) RangeError,
 * 큐볼 id 가 없으면 RangeError, 미스큐면 strike 의 RangeError("miscue") 가 그대로 올라온다.
 */
export function simulateShot(balls: readonly BallState[], input: ShotInput, params: SimParams): SimResult {
    validateBalls(balls);
    validateShotInput(input);
    validateParams(params);
    let idx = -1;
    for (let i = 0; i < balls.length; i++) if (balls[i].id === input.cueBallId) { idx = i; break; }
    if (idx < 0) throw new RangeError(`unknown cue ball id: ${input.cueBallId}`);

    const p = applyCondition(params.table.ball, params.condition);
    let struck = strike(balls[idx], input, p, params.cue);
    const still = struck.v[0] === 0 && struck.v[1] === 0 && struck.v[2] === 0
        && struck.w[0] === 0 && struck.w[1] === 0 && struck.w[2] === 0;
    if (still) struck = applyTransition(struck, "stationary", p);

    const start: BallState[] = new Array(balls.length);
    for (let i = 0; i < balls.length; i++) start[i] = i === idx ? struck : balls[i];
    const core = run(start, params, 0);
    return { ...core, input };
}

/** 주어진 상태(움직이는 공 포함)에서 전부 정지까지. history 의 시각은 t0 부터 센다. 입력 검증은 simulateShot 과 같다(t0 도 유한해야 한다). */
export function simulateFrom(balls: readonly BallState[], params: SimParams, t0 = 0): Omit<SimResult, "input"> {
    validateBalls(balls);
    validateParams(params);
    if (!Number.isFinite(t0)) throw new RangeError("simulateFrom: t0 must be finite");
    return run(balls, params, t0);
}
