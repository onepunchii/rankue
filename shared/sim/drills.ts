/**
 * 3쿠션 드릴(정해진 배치 문제). 주간 래더의 재료 — 같은 주엔 모두 같은 5문제를 받고, 문제당 채점 시도는 한 번이다
 * (제품 리뷰 R5: 자유 세션 에버리지는 비교 가능한 래더가 아니다).
 *
 * 좌표는 테이블 비율(x: 0..1 짧은 변, y: 0..1 긴 변, 헤드 레일 y=0)이라 대대·중대 모두에 쓴다.
 * 큐볼은 white, 적구는 red·yellow. 배치는 고전 패턴을 따르되 수치는 오너·코치 검수 대상(2026-09-07).
 *
 * 이 파일은 shared/sim 규칙을 따른다: 초월함수·Date·Math.random 금지. 주차는 ms 타임스탬프에서 산술로 구한다.
 */
import type { BallState } from "./types.js";
import type { TableSpec } from "./params.js";
import { mulberry32 } from "./rng.js";

export type DrillPattern = "back-around" | "front-around" | "side-around" | "cross" | "grand-tour" | "bank" | "reverse" | "double-rail" | "short-back" | "long-angle";

export interface Drill {
    readonly id: string;
    readonly pattern: DrillPattern;
    /** i18n 키 접미사: sim.drill.name.<id> */
    readonly nameKey: string;
    readonly cue: readonly [number, number];
    readonly red: readonly [number, number];
    readonly yellow: readonly [number, number];
    /** 권장 두께·당점 힌트 (i18n: sim.drill.hint.<id>) */
    readonly hintKey: string;
    /**
     * 가장 잘 들어가는 길의 여유(%). 2026-09-09 엔진 실측(대대·한2005·컨디션 1).
     * 주간 5문제를 난이도 골고루 뽑는 데만 쓴다 — 화면에 내지 않는다.
     */
    readonly easeMargin: number;
}

const D = (
    id: string, pattern: DrillPattern, cue: [number, number], red: [number, number], yellow: [number, number],
    easeMargin: number,
): Drill =>
    ({ id, pattern, nameKey: `sim.drill.name.${id}`, hintKey: `sim.drill.hint.${id}`, cue, red, yellow, easeMargin });

/**
 * 드릴 목록. id 는 영구 — 통계 키이므로 바꾸지 말 것.
 *
 * 2026-09-09 실측 메모: 배치마다 득점 해법이 90~200개 있고 그 대부분이 빈쿠션이다(쿠션이 표적이 넓다).
 * 이름표대로 가는 길은 훨씬 드물다 — 그래서 "이름표대로 성공" 표시가 값을 갖는다.
 * 격자 훑기(조준 1° · 세기 0.15 m/s)로는 뒤돌리기·대회전 등에서 한 건도 못 찾았지만, 그건 격자가 성긴 탓이다.
 * 실제 회원이 대회전을 적구 먼저 쿠션 5개로 넣은 기록이 있다. 그래서 "이 배치엔 그 길이 없다" 고 못박지 않는다.
 */
export const DRILLS: readonly Drill[] = [
    D("back1", "back-around", [0.55, 0.22], [0.82, 0.30], [0.25, 0.80], 14),
    D("front1", "front-around", [0.30, 0.25], [0.62, 0.42], [0.20, 0.85], 43),
    D("side1", "side-around", [0.45, 0.30], [0.75, 0.55], [0.35, 0.80], 21),
    D("cross1", "cross", [0.25, 0.45], [0.70, 0.50], [0.30, 0.62], 36),
    D("grand1", "grand-tour", [0.28, 0.18], [0.66, 0.22], [0.45, 0.30], 21),
    D("bank1", "bank", [0.35, 0.20], [0.80, 0.70], [0.70, 0.78], 50),
    D("reverse1", "reverse", [0.70, 0.30], [0.88, 0.45], [0.60, 0.75], 29),
    D("double1", "double-rail", [0.30, 0.35], [0.14, 0.55], [0.22, 0.90], 50),
    D("short1", "short-back", [0.60, 0.30], [0.85, 0.40], [0.60, 0.70], 43),
    D("long1", "long-angle", [0.20, 0.20], [0.35, 0.45], [0.80, 0.85], 14),
];

export const DRILLS_PER_WEEK = 5;

/** 드릴 → 실제 배치. 반지름을 고려해 공이 쿠션 안쪽에 오도록 클램프한다. */
export function drillLayout(drill: Drill, table: TableSpec): readonly BallState[] {
    const R = table.ball.R;
    const place = (id: string, f: readonly [number, number]): BallState => {
        const x = Math.min(table.width - R, Math.max(R, f[0] * table.width));
        const y = Math.min(table.length - R, Math.max(R, f[1] * table.length));
        return { id, r: [x, y, R], v: [0, 0, 0], w: [0, 0, 0], state: "stationary" };
    };
    return [place("white", drill.cue), place("yellow", drill.yellow), place("red", drill.red)];
}

// ---- ISO 주차 (UTC), Date 없이 ----
const DAY_MS = 86_400_000;

/** days since 1970-01-01 → [year, month, day] (Howard Hinnant, civil_from_days) */
function civilFromDays(z: number): [number, number, number] {
    z += 719468;
    const era = Math.floor(z / 146097);
    const doe = z - era * 146097;
    const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
    const y = yoe + era * 400;
    const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
    const mp = Math.floor((5 * doy + 2) / 153);
    const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
    const m = mp < 10 ? mp + 3 : mp - 9;
    return [m <= 2 ? y + 1 : y, m, d];
}

function daysFromCivil(y: number, m: number, d: number): number {
    y -= m <= 2 ? 1 : 0;
    const era = Math.floor(y / 400);
    const yoe = y - era * 400;
    const doy = Math.floor((153 * (m > 2 ? m - 3 : m + 9) + 2) / 5) + d - 1;
    const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
    return era * 146097 + doe - 719468;
}

/** ms 타임스탬프 → ISO 주차 id "2026-W37" (UTC 기준). 월요일 00:00 UTC 에 바뀐다. */
export function weekIdFor(ms: number): string {
    const day = Math.floor(ms / DAY_MS);
    const weekday = ((day + 3) % 7 + 7) % 7 + 1; // 1970-01-01 = 목요일(4)
    const thursday = day - weekday + 4;
    const [y] = civilFromDays(thursday);
    const jan1 = daysFromCivil(y, 1, 1);
    const week = Math.floor((thursday - jan1) / 7) + 1;
    return `${y}-W${week < 10 ? "0" + week : week}`;
}

/**
 * 이 주차부터 난이도를 섞어 뽑는다. 그 전 주는 옛 방식 그대로 — 이미 친 주의 5문제가 바뀌면
 * 저장된 시도가 이번 주 문제와 어긋나고 래더가 두 벌이 된다(2026-09-09).
 */
export const BALANCED_FROM_WEEK = "2026-W38";

function seedOf(weekId: string): number {
    let h = 2166136261;
    for (let i = 0; i < weekId.length; i++) { h ^= weekId.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h;
}

function shuffled(idx: number[], rnd: () => number): number[] {
    for (let i = idx.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        const t = idx[i]; idx[i] = idx[j]; idx[j] = t;
    }
    return idx;
}

/**
 * 주차 id → 그 주의 드릴 5개. 같은 주엔 누구나 같은 문제, 같은 순서.
 *
 * BALANCED_FROM_WEEK 부터는 그냥 섞지 않는다 — 여유(easeMargin) 순으로 줄을 세워 count 칸으로 나누고
 * 칸마다 하나씩 뽑는다. 무작위로 뽑던 때는 어려운 문제만 걸린 주와 쉬운 문제만 걸린 주의 차이가 커서
 * 같은 래더로 견주기 어려웠다(실측 여유 14%~50%).
 */
export function drillsForWeek(weekId: string, pool: readonly Drill[] = DRILLS, count = DRILLS_PER_WEEK): readonly Drill[] {
    const n = Math.min(count, pool.length);
    const rnd = mulberry32(seedOf(weekId));
    if (weekId < BALANCED_FROM_WEEK) {
        return shuffled(pool.map((_, i) => i), rnd).slice(0, n).map((i) => pool[i]);
    }
    // 쉬운 것부터 줄 세운 뒤 n 칸으로 쪼개고, 칸마다 하나씩. 칸 경계는 나머지를 앞칸에 몰지 않게 비율로 자른다.
    const order = pool.map((_, i) => i).sort((a, b) => pool[a].easeMargin - pool[b].easeMargin || (pool[a].id < pool[b].id ? -1 : 1));
    const picked: number[] = [];
    for (let k = 0; k < n; k++) {
        const from = Math.floor((k * order.length) / n);
        const to = Math.max(from + 1, Math.floor(((k + 1) * order.length) / n));
        picked.push(order[from + Math.floor(rnd() * (to - from))]);
    }
    return shuffled(picked, rnd).map((i) => pool[i]);
}

export function findDrill(id: string): Drill | undefined {
    return DRILLS.find((d) => d.id === id);
}
