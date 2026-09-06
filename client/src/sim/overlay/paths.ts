/**
 * 예측 경로·직선 조준 안내를 만드는 순수 헬퍼. Overlay 가 그리고, useSimulator 가 만든다.
 *
 * - simulateShot 결과({history, events})를 공별 폴리라인으로 바꾼다. history 는 이벤트마다 스냅샷이 있으므로
 *   스냅샷 사이를 직선으로 잇고, 긴 구름 구간엔 최대 8개 중간점을 선형 보간으로 끼운다(안내선이라 근사면 충분).
 * - 컷오프: 두 번째 적구 접촉 / N 쿠션 / 시각 / 끝. 규칙 판정(rules/evaluate.walkEvents)과 같은 순서로 이벤트를 걸어
 *   접촉·쿠션 시각을 뽑는다. 쿠션 수 자체는 walkEvents 를 그대로 써서 판정과 어긋나지 않게 한다.
 * - 직선 안내: aim.firstContact 를 감싸 고스트볼·접촉점·적구 진행 방향·고스트 너머 연장선을 한 번에 돌려준다.
 *
 * 렌더러·DOM 의존 없음. 결정론 규칙(dmath)은 입력을 만드는 쪽이 아니라 그리는 쪽이므로 적용하지 않는다.
 */
import type { BallState, CushionId, SimEvent, Snapshot } from "@shared/sim/types";
import type { TableSpec } from "@shared/sim/params";
import { walkEvents, objectBallIds, opponentCueBall } from "@shared/sim/rules/evaluate";
import type { GameType } from "@shared/sim/rules/types";
import { firstContact, rayCushionDistance, THICKNESS_STEPS, type FirstContact, type XY } from "../aim";

export interface PathSource {
    readonly history: readonly Snapshot[];
    readonly events: readonly SimEvent[];
}

/** 경로를 어디까지 그릴지. */
export type PathCutoff =
    | { readonly kind: "second-contact" }
    | { readonly kind: "cushions"; readonly n: number }
    | { readonly kind: "time"; readonly t: number }
    | { readonly kind: "end" };

export interface PathPoint {
    readonly x: number;
    readonly y: number;
    readonly t: number;
}

export interface BallPath {
    readonly id: string;
    /** 최소 2점. 움직이지 않은 공은 목록에서 빠진다. */
    readonly points: readonly PathPoint[];
}

/** 큐볼 경로 위 쿠션 접촉 표식. index 는 1부터. */
export interface CushionMark {
    readonly index: number;
    readonly t: number;
    readonly x: number;
    readonly y: number;
    readonly cushion: CushionId;
}

export interface PreviewPaths {
    readonly paths: readonly BallPath[];
    /** 컷오프 이전의 큐볼 쿠션 접촉(번호 순). */
    readonly cushions: readonly CushionMark[];
    /** 두 번째 적구 접촉 전 큐볼 쿠션 수 — rules/evaluate.walkEvents 와 동일한 값. */
    readonly cushionCount: number;
    /** 큐볼이 맞힌 적구 id, 순서대로(최대 2). */
    readonly contactIds: readonly string[];
    readonly cutoffT: number;
}

export interface PathOptions {
    readonly cueBallId: string;
    readonly gameType: GameType;
    /** 기본 second-contact. */
    readonly cutoff?: PathCutoff;
    /** 한 구간에 끼우는 최대 중간점 수. 기본 8. */
    readonly maxInterp?: number;
    /** 중간점 간격(m). 기본 0.15. */
    readonly interpStep?: number;
    /**
     * 적구 경로 범위. "cutoff" = 큐볼과 같은 컷오프까지, "first-leg" = 맞은 뒤 첫 이벤트(쿠션·공)까지만.
     * 기본 "first-leg" — README 의 "적구 첫 구간".
     */
    readonly objectBalls?: "cutoff" | "first-leg";
}

const EPS_T = 1e-9;
const EPS_D = 1e-7;

/* ------------------------------------------------------------------ 이벤트 타임라인 */

export interface CueTimeline {
    /** 큐볼이 적구를 맞힌 시각(순서대로, 최대 2). walkEvents.contacts 와 같은 규칙. */
    readonly contacts: readonly { readonly id: string; readonly t: number }[];
    /** 큐볼의 모든 쿠션 접촉(시간순). */
    readonly cushions: readonly { readonly t: number; readonly cushion: CushionId }[];
    /** 두 번째 적구 접촉 시각. 없으면 null. */
    readonly secondContactT: number | null;
}

/**
 * walkEvents 와 같은 순서로 큐볼 이벤트를 걸어가되 시각을 남긴다.
 * (walkEvents 는 집계만 돌려주므로 컷오프·표식 위치를 위해 시각이 필요하다.)
 */
export function cueTimeline(events: readonly SimEvent[], cueBallId: string, objectIds: readonly string[], opponentId: string | null): CueTimeline {
    const contacts: { id: string; t: number }[] = [];
    const cushions: { t: number; cushion: CushionId }[] = [];
    for (const e of events) {
        if (e.type === "ball-cushion") {
            if (e.ids[0] === cueBallId) cushions.push({ t: e.t, cushion: e.cushion });
            continue;
        }
        if (e.type !== "ball-ball") continue;
        const [p, q] = e.ids;
        if (p !== cueBallId && q !== cueBallId) continue;
        const other = p === cueBallId ? q : p;
        if (opponentId && other === opponentId) continue;
        if (!objectIds.includes(other)) continue;
        if (contacts.length > 0 && (contacts.some((c) => c.id === other) || contacts.length >= 2)) continue;
        contacts.push({ id: other, t: e.t });
    }
    return { contacts, cushions, secondContactT: contacts.length >= 2 ? contacts[1].t : null };
}

/** 두 번째 적구 접촉 전 큐볼 쿠션 수. 판정 엔진의 walkEvents 를 그대로 쓴다. */
export function countCushionsBeforeSecond(events: readonly SimEvent[], cueBallId: string, gameType: GameType): number {
    const objectIds = objectBallIds(gameType, cueBallId);
    const opponentId = gameType === "4c" ? opponentCueBall(cueBallId) : null;
    return walkEvents(events, cueBallId, objectIds, opponentId).cushionsBeforeSecond;
}

/** 컷오프 시각. history 끝을 넘지 않는다. */
export function cutoffTime(src: PathSource, timeline: CueTimeline, cutoff: PathCutoff): number {
    const end = src.history.length ? src.history[src.history.length - 1].t : 0;
    switch (cutoff.kind) {
        case "second-contact":
            return timeline.secondContactT ?? end;
        case "cushions": {
            const c = timeline.cushions[cutoff.n - 1];
            return c ? Math.min(c.t, end) : end;
        }
        case "time":
            return Math.max(0, Math.min(cutoff.t, end));
        case "end":
            return end;
    }
}

/* ------------------------------------------------------------------ 스냅샷 보간 */

/** history 에서 t 이상인 첫 스냅샷 인덱스(이진 탐색). 없으면 history.length. */
export function snapshotIndexAt(history: readonly Snapshot[], t: number): number {
    let lo = 0, hi = history.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (history[mid].t < t - EPS_T) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

function ballIn(snap: Snapshot, id: string): BallState | null {
    const bs = snap.balls;
    for (let i = 0; i < bs.length; i++) if (bs[i].id === id) return bs[i];
    return null;
}

/** 시각 t 의 공 위치(스냅샷 사이는 직선 보간). 공이 없으면 null. */
export function positionAt(history: readonly Snapshot[], id: string, t: number): XY | null {
    if (history.length === 0) return null;
    const i = snapshotIndexAt(history, t);
    if (i >= history.length) {
        const b = ballIn(history[history.length - 1], id);
        return b ? [b.r[0], b.r[1]] : null;
    }
    const s1 = history[i];
    const b1 = ballIn(s1, id);
    if (!b1) return null;
    if (i === 0 || s1.t - t <= EPS_T) return [b1.r[0], b1.r[1]];
    const s0 = history[i - 1];
    const b0 = ballIn(s0, id);
    if (!b0) return [b1.r[0], b1.r[1]];
    const span = s1.t - s0.t;
    const u = span <= EPS_T ? 1 : (t - s0.t) / span;
    return [b0.r[0] + (b1.r[0] - b0.r[0]) * u, b0.r[1] + (b1.r[1] - b0.r[1]) * u];
}

/* ------------------------------------------------------------------ 폴리라인 */

function pushSegment(out: PathPoint[], x0: number, y0: number, t0: number, x1: number, y1: number, t1: number, maxInterp: number, step: number): void {
    const dx = x1 - x0, dy = y1 - y0;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < EPS_D) return; // 정지 구간
    const k = Math.min(maxInterp, Math.floor(d / step));
    for (let j = 1; j <= k; j++) {
        const u = j / (k + 1);
        out.push({ x: x0 + dx * u, y: y0 + dy * u, t: t0 + (t1 - t0) * u });
    }
    out.push({ x: x1, y: y1, t: t1 });
}

/**
 * 한 공의 [tFrom, tTo] 구간 폴리라인. 스냅샷 사이는 직선, 긴 구간은 중간점을 끼운다.
 * 움직임이 없으면 점 1개(호출자가 걸러낸다).
 */
export function ballPolyline(history: readonly Snapshot[], id: string, tFrom: number, tTo: number, maxInterp = 8, step = 0.15): PathPoint[] {
    const out: PathPoint[] = [];
    if (history.length === 0 || tTo < tFrom) return out;
    const start = positionAt(history, id, tFrom);
    if (!start) return out;
    out.push({ x: start[0], y: start[1], t: tFrom });
    let px = start[0], py = start[1], pt = tFrom;
    const i0 = snapshotIndexAt(history, tFrom);
    for (let i = i0; i < history.length; i++) {
        const s = history[i];
        if (s.t <= tFrom + EPS_T) continue;
        if (s.t > tTo + EPS_T) break;
        const b = ballIn(s, id);
        if (!b) continue;
        pushSegment(out, px, py, pt, b.r[0], b.r[1], s.t, maxInterp, step);
        px = b.r[0]; py = b.r[1]; pt = s.t;
    }
    if (tTo > pt + EPS_T) {
        const end = positionAt(history, id, tTo);
        if (end) pushSegment(out, px, py, pt, end[0], end[1], tTo, maxInterp, step);
    }
    return out;
}

/** 적구의 "첫 구간": 처음 맞은 시각부터 그 다음 자기 이벤트(쿠션·공)까지. 안 맞았으면 null. */
export function firstLegWindow(events: readonly SimEvent[], id: string): { readonly from: number; readonly to: number | null } | null {
    let from: number | null = null;
    for (const e of events) {
        if (e.type === "transition") continue;
        if (!(e.ids as readonly string[]).includes(id)) continue;
        if (from === null) { from = e.t; continue; }
        if (e.t > from + EPS_T) return { from, to: e.t };
    }
    return from === null ? null : { from, to: null };
}

/** 결과 → 공별 폴리라인 + 큐볼 쿠션 표식 + 판정과 같은 쿠션 수. */
export function buildPreviewPaths(src: PathSource, opts: PathOptions): PreviewPaths {
    const { cueBallId, gameType } = opts;
    const maxInterp = opts.maxInterp ?? 8;
    const step = opts.interpStep ?? 0.15;
    const objectMode = opts.objectBalls ?? "first-leg";
    const objectIds = objectBallIds(gameType, cueBallId);
    const opponentId = gameType === "4c" ? opponentCueBall(cueBallId) : null;

    const timeline = cueTimeline(src.events, cueBallId, objectIds, opponentId);
    const cutoffT = cutoffTime(src, timeline, opts.cutoff ?? { kind: "second-contact" });
    const cushionCount = walkEvents(src.events, cueBallId, objectIds, opponentId).cushionsBeforeSecond;

    const paths: BallPath[] = [];
    const ids = src.history.length ? src.history[0].balls.map((b) => b.id) : [];
    for (const id of ids) {
        let from = 0, to = cutoffT;
        if (id !== cueBallId && objectMode === "first-leg") {
            const w = firstLegWindow(src.events, id);
            if (!w || w.from > cutoffT + EPS_T) continue;
            from = w.from;
            to = w.to === null ? cutoffT : Math.min(w.to, cutoffT);
        }
        const points = ballPolyline(src.history, id, from, to, maxInterp, step);
        if (points.length >= 2) paths.push({ id, points });
    }

    const cushions: CushionMark[] = [];
    for (const c of timeline.cushions) {
        if (c.t > cutoffT + EPS_T) break;
        const p = positionAt(src.history, cueBallId, c.t);
        if (!p) continue;
        cushions.push({ index: cushions.length + 1, t: c.t, x: p[0], y: p[1], cushion: c.cushion });
    }

    return {
        paths,
        cushions,
        cushionCount,
        contactIds: timeline.contacts.map((c) => c.id),
        cutoffT,
    };
}

/* ------------------------------------------------------------------ 직선 안내 */

export interface StraightGuide {
    readonly cue: XY;
    /** 단위 방향. */
    readonly dir: XY;
    readonly ghost: XY;
    /** 큐볼 중심 이동 거리(m). */
    readonly s: number;
    readonly contact: FirstContact;
    /** 고스트 너머 연장선 끝(공 접촉: 같은 방향으로 다음 쿠션까지, 쿠션 접촉: 반사 방향으로 다음 쿠션까지). */
    readonly beyond: XY | null;
    /** 공 접촉일 때만. */
    readonly ball: {
        readonly id: string;
        /** 고스트 원주 위 접촉점. */
        readonly contactPoint: XY;
        /** 적구가 나아갈 단위 방향(고스트 중심 → 적구 중심). */
        readonly objectDir: XY;
        readonly thickness: number;
        readonly side: "left" | "right" | "center";
    } | null;
}

function reflect(dir: XY, cushion: CushionId): XY {
    return cushion === "left" || cushion === "right" ? [-dir[0], dir[1]] : [dir[0], -dir[1]];
}

/** aim.firstContact 를 감싼 직선 조준 안내. 접촉이 없으면 null. */
export function straightGuide(cueBall: BallState, balls: readonly BallState[], phi: number, table: TableSpec): StraightGuide | null {
    const contact = firstContact(cueBall, balls, phi, table);
    if (!contact) return null;
    const cue: XY = [cueBall.r[0], cueBall.r[1]];
    const dir: XY = [Math.cos(phi), Math.sin(phi)];
    const ghost = contact.ghost;
    const R = table.ball.R;

    let beyond: XY | null = null;
    let ball: StraightGuide["ball"] = null;
    if (contact.kind === "ball") {
        const next = rayCushionDistance(ghost, phi, table);
        if (next) beyond = [ghost[0] + dir[0] * next.s, ghost[1] + dir[1] * next.s];
        const target = balls.find((b) => b.id === contact.id);
        if (target) {
            const ox = target.r[0] - ghost[0], oy = target.r[1] - ghost[1];
            const od = Math.hypot(ox, oy) || 1;
            const objectDir: XY = [ox / od, oy / od];
            ball = {
                id: contact.id,
                contactPoint: [ghost[0] + objectDir[0] * R, ghost[1] + objectDir[1] * R],
                objectDir,
                thickness: contact.thickness,
                side: contact.side,
            };
        }
    } else {
        const rd = reflect(dir, contact.cushion);
        const next = rayCushionDistance(ghost, Math.atan2(rd[1], rd[0]), table);
        if (next) beyond = [ghost[0] + rd[0] * next.s, ghost[1] + rd[1] * next.s];
    }
    return { cue, dir, ghost, s: contact.s, contact, beyond, ball };
}

/* ------------------------------------------------------------------ 두께 라벨 */

const STEP_LABELS: Readonly<Record<number, string>> = {
    1: "100%",
    0.75: "¾",
    0.5: "½",
    0.333: "⅓",
    0.25: "¼",
    0.125: "⅛",
};

/**
 * 두께(0~1)를 짧은 라벨로. 선수가 말하는 단계(½·⅓·¼·⅛·¾)에 가까우면 분수, 아니면 퍼센트.
 * 정면(1)은 fullLabel — 화면은 i18n 의 `sim.aim.fullBall`("정면")을 넘기고, 기본값은 로케일 무관한 "100%".
 */
export function thicknessLabel(value: number, tolerance = 0.035, fullLabel = STEP_LABELS[1]): string {
    const v = Math.max(0, Math.min(1, value));
    for (const step of THICKNESS_STEPS) {
        if (Math.abs(v - step) <= tolerance) return step === 1 ? fullLabel : STEP_LABELS[step];
    }
    return `${Math.round(v * 100)}%`;
}
