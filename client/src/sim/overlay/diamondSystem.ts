/**
 * 다이아몬드 시스템(파이브앤하프 · 코너 5) 훈련 오버레이의 순수 수학. 렌더러·React 무관, 할당은 조준이 바뀔 때만.
 *
 * 숫자 배치(출처 — 코딩 전에 확인한 것)
 *  - D. Alciatore, "VEPS GEMS Part XI: Corner-5 System Intro", Billiards Digest 2010-11, Diagram 1
 *    (https://drdavepoolinfo.com/bd_articles/2010/nov10.pdf): 출발수 D 는 코너 5, 긴 레일 쪽은 다이아몬드마다 −½(4.5·4·3.5·3),
 *    짧은 레일 쪽은 다이아몬드마다 +1(6·7·8). 1쿠션수 F 는 반대편 긴 레일에 먼 단쿠션 쪽 첫 다이아몬드부터 1·2·…·7.
 *    3쿠션수 T 는 수구 쪽 긴 레일에 같은 눈금(먼 쪽 첫 다이아몬드가 1). 공식 T = D − F, 예 2 = 5 − 3.
 *    전제: 구르는 큐볼 + 순회전(running english), 중간 세기. 포켓 없는 캐롬 테이블에서 5-3-2 트랙은 출발 코너로 돌아온다.
 *  - 3C-Master "파이브앤하프 시스템"(https://3c-master.com/systems/five-and-half): 한국식 ×10 표기. "3쿠션값 = 출발값 − 1쿠션값",
 *    예 20 = 50 − 30. 출발값은 긴 쪽 2포인트마다 10(=포인트당 5), 짧은 쪽 포인트마다 10. 1쿠션값·3쿠션값은 포인트당 10.
 *  - "파이브 앤 하프 당구시스템의 큐볼수·수구수"(https://windcjg.blogspot.com/2017/04/3.html): "3쿠션수(20) = 큐볼수(50) − 1쿠션수(30)",
 *    코너 50 에서 1쿠션 30 → 3쿠션 20 → 4쿠션은 출발 코너.
 *  ※ 한국 교재의 보정(1쿠션 50 이후·3쿠션 40 이후·출발 70 이후는 반 포인트마다 10)은 넣지 않았다 — 전 구간 선형(Alciatore 배치).
 *
 * 정규 방향(canonical): 수구 쪽 긴 레일 = right(x = width), 가까운 단쿠션 = bottom(y = 0), 1쿠션 = left, 2쿠션 = top.
 *   출발수  D: 긴 레일 (width, y) → 50 − 40·y/length            코너 50, 다이아몬드마다 −5, 먼 코너 10 (라벨은 50·40·30·20)
 *             단쿠션  (x, 0)      → 50 + 40·(width − x)/width   코너 50, 다이아몬드마다 +10, 반대 코너 90 (라벨은 60·70·80)
 *   1쿠션수 F: (0, y)     → 80·(length − y)/length              먼 코너 0, 다이아몬드마다 +10, 가까운 코너 80 (라벨은 10 … 70)
 *   3쿠션수 T: (width, y) → 80·(length − y)/length              F 와 같은 눈금 (라벨은 0 … 40)
 *   예측 T = D − F. 나머지 세 방향은 x·y 거울 대칭(mirrorPoint)으로 정규 방향에 맞춘 뒤 되돌린다.
 *
 * 읽기 규칙: 접촉수(F·T)는 공 중심이 쿠션에 닿는 위치의 레일 방향 좌표로 읽고(코 라인 안쪽 R 은 무시 — 조준·실제 샷이 같은 규칙),
 * 출발수 D 는 1쿠션 조준점에서 큐볼을 지나 되그은 직선이 코 라인(플레이 면 경계)과 만나는 곳으로 읽는다
 * (Alciatore: "where the aiming line through the CB crosses the rail closest to the shooter"). 다이아몬드 사이는 선형 보간,
 * 레일 끝에서 클램프. 큐볼이 레일에 붙어 있으면 출발수는 그 자리 숫자와 같다.
 */
import type { BallState, CushionId, SimEvent, Snapshot } from "@shared/sim/types";
import type { TableSpec } from "@shared/sim/params";
import { firstContact, type XY } from "../aim";
import { positionAt } from "./paths";

export type LongRail = "left" | "right";
export type ShortRail = "bottom" | "top";

export interface Orientation {
    /** 수구 쪽 긴 레일(3쿠션수·출발수가 붙는 레일). 1쿠션은 그 반대편. */
    readonly ownRail: LongRail;
    /** 수구 쪽 단쿠션(출발수 60·70·80 이 붙는 레일). 2쿠션은 그 반대편. */
    readonly nearShort: ShortRail;
}

export const CANONICAL: Orientation = { ownRail: "right", nearShort: "bottom" };

export type LabelKind = "departure" | "first" | "third";

/** 레일 숫자 라벨. 위치는 코 라인(플레이 면 경계) 위 월드 좌표, (nx, ny) 는 바깥쪽 단위 법선(코너는 대각선). */
export interface SystemLabel {
    readonly kind: LabelKind;
    readonly number: number;
    /** 미리 만든 문자열 — 프레임마다 String() 할당을 피한다. */
    readonly text: string;
    readonly x: number;
    readonly y: number;
    readonly nx: number;
    readonly ny: number;
    readonly rail: CushionId;
    /** 0 = 레일 띠 위, 1 = 레일 바깥 행(긴 레일의 출발수 — 3쿠션수와 같은 레일을 나눠 쓴다). */
    readonly row: 0 | 1;
}

/** 레일 위 한 점과 그 자리의 시스템 숫자. point 는 코 라인 위 월드 좌표. */
export interface RailPoint {
    readonly point: XY;
    readonly number: number;
    readonly rail: CushionId;
}

export interface AimAnalysis {
    readonly orientation: Orientation;
    /** 1쿠션 조준수(큐볼 중심이 닿는 위치). */
    readonly firstRail: RailPoint;
    /** 출발수. rail 이 긴 레일이면 라벨 행 1, 단쿠션이면 행 0 에 표시한다. */
    readonly departure: RailPoint & { readonly side: "long" | "short" };
    /** 예측 3쿠션수 = 출발수 − 1쿠션수. number 는 클램프하지 않은 산술값, point 는 레일 안으로 클램프, onRail 은 0…80 안인지. */
    readonly predictedThird: RailPoint & { readonly onRail: boolean };
}

export interface ShotAnalysis {
    readonly orientation: Orientation;
    /** 출발수(첫 접촉점에서 출발 위치로 되그은 선이 코 라인과 만나는 곳). */
    readonly departure: number;
    readonly firstRailNumber: number;
    readonly thirdRailNumber: number;
    /** 시스템 예측 = departure − firstRailNumber. */
    readonly predicted: number;
    /** 실제 접촉 위치(공 중심, 월드). */
    readonly firstPoint: XY;
    readonly thirdPoint: XY;
}

/** 방향 성분이 이보다 작으면 "그 축으로는 가지 않는다"로 본다. */
const DIR_EPS = 1e-9;

/* ------------------------------------------------------------------ 거울 대칭 */

/** 월드 ↔ 정규 좌표. 자기 역함수다(두 번 적용하면 제자리). */
export function mirrorPoint(p: XY, o: Orientation, table: TableSpec): XY {
    return [
        o.ownRail === "right" ? p[0] : table.width - p[0],
        o.nearShort === "bottom" ? p[1] : table.length - p[1],
    ];
}

function mirrorDir(d: XY, o: Orientation): XY {
    return [o.ownRail === "right" ? d[0] : -d[0], o.nearShort === "bottom" ? d[1] : -d[1]];
}

function mirrorRail(rail: CushionId, o: Orientation): CushionId {
    if (rail === "left" || rail === "right") return o.ownRail === "right" ? rail : rail === "left" ? "right" : "left";
    return o.nearShort === "bottom" ? rail : rail === "bottom" ? "top" : "bottom";
}

function isLong(rail: CushionId): rail is LongRail {
    return rail === "left" || rail === "right";
}

function oppositeLong(rail: LongRail): LongRail {
    return rail === "left" ? "right" : "left";
}

function clamp(v: number, lo: number, hi: number): number {
    return v < lo ? lo : v > hi ? hi : v;
}

/* ------------------------------------------------------------------ 눈금(정규 좌표) */

/** 1쿠션수·3쿠션수 눈금: 먼 코너(y = length) 0, 다이아몬드마다 +10, 가까운 코너 80. [0, 80] 클램프. */
export function railNumber(y: number, table: TableSpec): number {
    return clamp((80 * (table.length - y)) / table.length, 0, 80);
}

/** railNumber 의 역: 숫자 → 정규 y (레일 안으로 클램프). */
export function railY(number: number, table: TableSpec): number {
    return table.length - (clamp(number, 0, 80) * table.length) / 80;
}

function departureLong(y: number, table: TableSpec): number {
    return 50 - (40 * clamp(y, 0, table.length)) / table.length;
}

function departureShort(x: number, table: TableSpec): number {
    return 50 + (40 * (table.width - clamp(x, 0, table.width))) / table.width;
}

/**
 * 출발수(정규 좌표): 1쿠션점 p1 에서 큐볼 c 를 지나 되그은 직선이 수구 쪽 긴 레일(x = width) 또는 가까운 단쿠션(y = 0)의
 * 코 라인과 만나는 곳. 직선이 수구 쪽 레일로 향하지 않으면(dx ≤ 0) null.
 */
export function departureFrom(p1: XY, c: XY, table: TableSpec): { readonly number: number; readonly point: XY; readonly side: "long" | "short" } | null {
    const dx = c[0] - p1[0];
    const dy = c[1] - p1[1];
    if (dx <= DIR_EPS) return null;
    const W = table.width;
    const tLong = (W - c[0]) / dx;
    const yLong = c[1] + dy * tLong;
    if (yLong >= 0 && yLong <= table.length) return { number: departureLong(yLong, table), point: [W, yLong], side: "long" };
    if (dy < 0 && yLong < 0) {
        const tShort = -c[1] / dy;
        const xShort = c[0] + dx * tShort;
        return { number: departureShort(xShort, table), point: [xShort, 0], side: "short" };
    }
    return null;
}

/* ------------------------------------------------------------------ 방향 */

/**
 * 조준 방향으로 본 시스템 방향. 왼쪽으로 가면 수구 레일은 right, 위로 가면 가까운 단쿠션은 bottom.
 * 축과 나란하면(성분 0) 큐볼에서 가까운 레일을 고른다 — 조준이 유효하지 않을 때도 라벨을 안정적으로 그리기 위한 추정이다.
 * analyzeAim 이 non-null 이면 그 orientation 과 항상 같다.
 */
export function guessOrientation(cue: XY, phi: number, table: TableSpec): Orientation {
    const dx = Math.cos(phi);
    const dy = Math.sin(phi);
    const ownRail: LongRail = Math.abs(dx) < DIR_EPS ? (cue[0] * 2 <= table.width ? "left" : "right") : dx < 0 ? "right" : "left";
    const nearShort: ShortRail = Math.abs(dy) < DIR_EPS ? (cue[1] * 2 <= table.length ? "bottom" : "top") : dy > 0 ? "bottom" : "top";
    return { ownRail, nearShort };
}

/* ------------------------------------------------------------------ 라벨 */

const DIAG = Math.SQRT1_2;

/**
 * 시스템 숫자 라벨(주어진 방향). 정규 방향으로 만들고 거울 대칭으로 옮긴다. 라벨 위치는 코 라인 위, 법선은 바깥쪽.
 *  - 3쿠션수: 수구 레일, 먼 코너 0 → 10·20·30·40 (행 0)
 *  - 출발수: 코너 50(행 1) · 긴 레일 40·30·20 (2 다이아몬드마다, 행 1) · 단쿠션 60·70·80 (행 0)
 *  - 1쿠션수: 반대편 긴 레일, 먼 코너부터 10 … 70 (행 0)
 */
export function systemNumbers(table: TableSpec, o: Orientation = CANONICAL): readonly SystemLabel[] {
    const W = table.width, L = table.length;
    const d = L / 8;
    const s = W / 4;
    const out: SystemLabel[] = [];
    const push = (kind: LabelKind, number: number, x: number, y: number, nx: number, ny: number, rail: CushionId, row: 0 | 1): void => {
        const p = mirrorPoint([x, y], o, table);
        const n = mirrorDir([nx, ny], o);
        out.push({ kind, number, text: String(number), x: p[0], y: p[1], nx: n[0], ny: n[1], rail: mirrorRail(rail, o), row });
    };
    push("third", 0, W, L, DIAG, DIAG, "right", 0);
    for (let k = 1; k <= 4; k++) push("third", 10 * k, W, L - k * d, 1, 0, "right", 0);
    push("departure", 50, W, 0, DIAG, -DIAG, "right", 1);
    for (let k = 2; k <= 6; k += 2) push("departure", 50 - 5 * k, W, k * d, 1, 0, "right", 1);
    for (let k = 1; k <= 3; k++) push("departure", 50 + 10 * k, W - k * s, 0, 0, -1, "bottom", 0);
    for (let k = 1; k <= 7; k++) push("first", 10 * k, 0, L - k * d, -1, 0, "left", 0);
    return out;
}

/* ------------------------------------------------------------------ 조준 분석 */

/**
 * 현재 조준의 시스템 읽기. 조준선이 공이나 단쿠션을 먼저 만나거나 긴 레일에 수직이면(2쿠션 방향이 없음) null.
 * 숫자는 보간값(정수 아님) — 화면이 반올림한다.
 */
export function analyzeAim(cueBall: BallState, balls: readonly BallState[], phi: number, table: TableSpec): AimAnalysis | null {
    const fc = firstContact(cueBall, balls, phi, table);
    if (!fc || fc.kind !== "cushion" || !isLong(fc.cushion)) return null;
    const dy = Math.sin(phi);
    if (Math.abs(dy) < DIR_EPS) return null;
    const o: Orientation = { ownRail: oppositeLong(fc.cushion), nearShort: dy > 0 ? "bottom" : "top" };
    const c = mirrorPoint([cueBall.r[0], cueBall.r[1]], o, table);
    const p1 = mirrorPoint(fc.ghost, o, table);
    const first = railNumber(p1[1], table);
    const dep = departureFrom(p1, c, table);
    if (!dep) return null;
    const predicted = dep.number - first;
    return {
        orientation: o,
        firstRail: { point: mirrorPoint([0, p1[1]], o, table), number: first, rail: fc.cushion },
        departure: {
            point: mirrorPoint(dep.point, o, table), number: dep.number,
            rail: dep.side === "long" ? o.ownRail : o.nearShort, side: dep.side,
        },
        predictedThird: {
            point: mirrorPoint([table.width, railY(predicted, table)], o, table), number: predicted,
            rail: o.ownRail, onRail: predicted >= 0 && predicted <= 80,
        },
    };
}

/* ------------------------------------------------------------------ 샷 분석 */

/**
 * 실제 샷의 시스템 읽기: 큐볼의 첫 세 쿠션 접촉이 "긴 레일 → 단쿠션 → 반대편 긴 레일"이고 그 전에 공을 맞히지 않았을 때만.
 * 그 밖(쿠션 3개 미만, 첫 접촉이 단쿠션, 도중 공 접촉, 3쿠션이 수구 레일이 아님)은 null — 큐볼이 그 경로를 가지 않았다.
 */
export function analyzeShot(events: readonly SimEvent[], history: readonly Snapshot[], cueBallId: string, table: TableSpec): ShotAnalysis | null {
    const cushions: { t: number; cushion: CushionId }[] = [];
    for (const e of events) {
        if (e.type === "transition") continue;
        if (!(e.ids as readonly string[]).includes(cueBallId)) continue;
        if (e.type === "ball-ball") return null;
        cushions.push({ t: e.t, cushion: e.cushion });
        if (cushions.length === 3) break;
    }
    if (cushions.length < 3) return null;
    const [c1, c2, c3] = cushions;
    if (!isLong(c1.cushion) || isLong(c2.cushion) || c3.cushion !== oppositeLong(c1.cushion)) return null;
    const start = positionAt(history, cueBallId, 0);
    const p1w = positionAt(history, cueBallId, c1.t);
    const p3w = positionAt(history, cueBallId, c3.t);
    if (!start || !p1w || !p3w) return null;
    const o: Orientation = { ownRail: oppositeLong(c1.cushion), nearShort: c2.cushion === "top" ? "bottom" : "top" };
    const p1 = mirrorPoint(p1w, o, table);
    const p3 = mirrorPoint(p3w, o, table);
    const c = mirrorPoint(start, o, table);
    const first = railNumber(p1[1], table);
    const third = railNumber(p3[1], table);
    const dep = departureFrom(p1, c, table);
    if (!dep) return null;
    return {
        orientation: o,
        departure: dep.number,
        firstRailNumber: first,
        thirdRailNumber: third,
        predicted: dep.number - first,
        firstPoint: p1w,
        thirdPoint: p3w,
    };
}

/* ------------------------------------------------------------------ 화면용 묶음 */

/** Overlay.diamond 로 넘기는 것. numbers 는 현재 방향의 라벨, aim 은 유효한 조준일 때만. */
export interface OverlayDiamond {
    readonly numbers: readonly SystemLabel[];
    readonly aim: AimAnalysis | null;
}

/** 라벨 캐시(방향·테이블이 같으면 같은 배열을 돌려준다). 페이지가 ref 로 하나 들고 있는다. */
export interface NumbersCache {
    key: string;
    labels: readonly SystemLabel[];
}

export function createNumbersCache(): NumbersCache {
    return { key: "", labels: [] };
}

/** rAF 그리기 경로용: 큐볼을 찾고 조준을 분석해 오버레이 상태를 만든다. 큐볼이 없으면 null. */
export function overlayDiamond(balls: readonly BallState[], cueBallId: string, phi: number, table: TableSpec, cache: NumbersCache): OverlayDiamond | null {
    let cue: BallState | null = null;
    for (let i = 0; i < balls.length; i++) if (balls[i].id === cueBallId) { cue = balls[i]; break; }
    if (!cue) return null;
    const aim = analyzeAim(cue, balls, phi, table);
    const o = aim ? aim.orientation : guessOrientation([cue.r[0], cue.r[1]], phi, table);
    const key = `${table.width}x${table.length}:${o.ownRail}:${o.nearShort}`;
    if (cache.key !== key) {
        cache.key = key;
        cache.labels = systemNumbers(table, o);
    }
    return { numbers: cache.labels, aim };
}

/** 샷 뒤 읽어 주는 값. actual 이 null 이면 큐볼이 3쿠션 경로를 가지 않았다(시스템 값은 샷 시점 조준으로). 조준도 유효하지 않았으면 null. */
export interface ShotReadout {
    readonly system: number;
    readonly actual: number | null;
}

export function shotReadout(
    result: { readonly events: readonly SimEvent[]; readonly history: readonly Snapshot[]; readonly input: { readonly cueBallId: string; readonly phi: number } },
    table: TableSpec,
): ShotReadout | null {
    const shot = analyzeShot(result.events, result.history, result.input.cueBallId, table);
    if (shot) return { system: Math.round(shot.predicted), actual: Math.round(shot.thirdRailNumber) };
    const start = result.history[0];
    if (!start) return null;
    const cue = start.balls.find((b) => b.id === result.input.cueBallId);
    if (!cue) return null;
    const aim = analyzeAim(cue, start.balls, result.input.phi, table);
    return aim ? { system: Math.round(aim.predictedThird.number), actual: null } : null;
}

/* ------------------------------------------------------------------ 설정 저장 */

export const DIAMOND_PREF_KEY = "rankue.sim.diamond";

/** 최소 저장소 계약(localStorage 호환, 테스트 대체용). */
export interface PrefStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

/** 저장값이 "1" 일 때만 켜짐. 없거나 읽을 수 없으면 꺼짐(기본). */
export function readDiamondPref(storage: PrefStorage | null | undefined): boolean {
    if (!storage) return false;
    try {
        return storage.getItem(DIAMOND_PREF_KEY) === "1";
    } catch {
        return false;
    }
}

/** 저장 성공 여부. 쓰기 불가 환경(사파리 프라이빗 등)에서는 false. */
export function writeDiamondPref(storage: PrefStorage | null | undefined, on: boolean): boolean {
    if (!storage) return false;
    try {
        storage.setItem(DIAMOND_PREF_KEY, on ? "1" : "0");
        return true;
    } catch {
        return false;
    }
}
