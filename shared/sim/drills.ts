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
}

const D = (id: string, pattern: DrillPattern, cue: [number, number], red: [number, number], yellow: [number, number]): Drill =>
    ({ id, pattern, nameKey: `sim.drill.name.${id}`, hintKey: `sim.drill.hint.${id}`, cue, red, yellow });

/** 드릴 목록. id 는 영구 — 통계 키이므로 바꾸지 말 것. */
export const DRILLS: readonly Drill[] = [
    D("back1", "back-around", [0.55, 0.22], [0.82, 0.30], [0.25, 0.80]),
    D("front1", "front-around", [0.30, 0.25], [0.62, 0.42], [0.20, 0.85]),
    D("side1", "side-around", [0.45, 0.30], [0.75, 0.55], [0.35, 0.80]),
    D("cross1", "cross", [0.25, 0.45], [0.70, 0.50], [0.30, 0.62]),
    D("grand1", "grand-tour", [0.28, 0.18], [0.66, 0.22], [0.45, 0.30]),
    D("bank1", "bank", [0.35, 0.20], [0.80, 0.70], [0.70, 0.78]),
    D("reverse1", "reverse", [0.70, 0.30], [0.88, 0.45], [0.60, 0.75]),
    D("double1", "double-rail", [0.30, 0.35], [0.14, 0.55], [0.22, 0.90]),
    D("short1", "short-back", [0.60, 0.30], [0.85, 0.40], [0.60, 0.70]),
    D("long1", "long-angle", [0.20, 0.20], [0.35, 0.45], [0.80, 0.85]),
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

/** 주차 id → 그 주의 드릴 5개(시드 고정 셔플). 같은 주엔 누구나 같은 순서. */
export function drillsForWeek(weekId: string, pool: readonly Drill[] = DRILLS, count = DRILLS_PER_WEEK): readonly Drill[] {
    let h = 2166136261;
    for (let i = 0; i < weekId.length; i++) { h ^= weekId.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    const rnd = mulberry32(h);
    const idx = pool.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        const t = idx[i]; idx[i] = idx[j]; idx[j] = t;
    }
    return idx.slice(0, Math.min(count, pool.length)).map((i) => pool[i]);
}

export function findDrill(id: string): Drill | undefined {
    return DRILLS.find((d) => d.id === id);
}
