/**
 * 실전(오프라인 매칭 대결) 핸디 기준표 — 최근 공식 10경기 에버리지 평균 → 핸디(다마수).
 * 서버 game.repo(경기 끝에 핸디를 매긴다)와 홈 "내 실전 핸디" 카드(다음 핸디까지 남은 에버)가 같은 표를 쓴다.
 * 위에서부터 처음으로 avg 이상인 줄의 handi. 온라인게임 핸디(shared/sim/handicap)와는 따로다.
 *
 * 2026-10-12 표를 바꿨다(오너: "점수판 에버가 1.5에 마스터가 되나? 4구는 다르지 않아 한번 조사해줘" · 표 둘을 주며 "이걸로 적용해야 정확하지" → "추천대로").
 *  - **4구 = 다마 ÷ 20이닝**(200 = 1.00 · 300 = 1.50 · 500 = 2.50). 예전 표는 다마 ÷ 33이닝이라 에버 1.5 에 500(실전 마스터)이 됐다.
 *    운영 공식 4구 254줄: 스스로 적은 다마를 다 치는 데 평균 19.1이닝(판 길이 중앙값 16이닝) — 20이닝 기준이 맞다.
 *  - **3쿠션 = 대대 점수별 권장 에버리지 16칸**(전자점수판 3사 통계 평균, 12 · 15 는 동호인 실측 — 오너가 준 표). 그 에버리지 이상이면 그 점수.
 *    예전 표는 7칸(12~30)에 0.05~0.13 빡빡했다 — 스스로 20점이라 적고 친 31판의 에버가 0.395(새 표 20점 = 0.411)인데 예전 표로는 15점이 나왔다.
 *    표는 대대 기준이다. 중대에서 친 기록은 에버가 높게 나와 다마가 높게 매겨진다(짠다마와는 반대 방향).
 *
 * ⚠️ 다마의 눈금(3쿠션 12~40 · 4구 3~50)은 실전 등급 구간(shared/realTier)과 서버의 RP 감점 구간(game.repo rpDeltaFor)과 한 몸이다 — 표를 바꾸면 셋을 같이 본다.
 */
export interface HandiStep { avg: number; handi: number }

/** 4구 다마를 다 치는 데 걸리는 기준 이닝 — 에버리지 = 다마 ÷ 이 값 */
export const HANDI_4C_INNINGS = 20;
/** 4구 다마 표의 맨 위(500) — 이보다 큰 목표로 적은 판은 다마를 매길 때 세지 않는다(handiGameAverage) */
export const HANDI_4C_MAX = 50;

export const HANDICAP_MAP_4C: readonly HandiStep[] = [
    { avg: 2.5, handi: 50 },
    { avg: 2.0, handi: 40 },
    { avg: 1.5, handi: 30 },
    { avg: 1.25, handi: 25 },
    { avg: 1.0, handi: 20 },
    { avg: 0.75, handi: 15 },
    { avg: 0.6, handi: 12 },
    { avg: 0.5, handi: 10 },
    { avg: 0.4, handi: 8 },
    { avg: 0.25, handi: 5 },
    { avg: 0.0, handi: 3 },
];

export const HANDICAP_MAP_3C: readonly HandiStep[] = [
    { avg: 1.388, handi: 40 },
    { avg: 1.159, handi: 35 },
    { avg: 0.997, handi: 32 },
    { avg: 0.869, handi: 30 },
    { avg: 0.776, handi: 28 },
    { avg: 0.71, handi: 27 },
    { avg: 0.605, handi: 25 },
    { avg: 0.561, handi: 24 },
    { avg: 0.52, handi: 23 },
    { avg: 0.485, handi: 22 },
    { avg: 0.451, handi: 21 },
    { avg: 0.411, handi: 20 },
    { avg: 0.357, handi: 18 },
    { avg: 0.328, handi: 17 },
    { avg: 0.27, handi: 15 },
    // 표의 12점 권장 에버리지는 0.221 이지만 맨 아래 칸이라 그 아래도 12점이다
    { avg: 0.0, handi: 12 },
];

/** 핸디를 매기는 최소 공식 경기 수 — game.repo 와 같다 */
export const HANDI_MIN_GAMES = 5;
export const HANDI_RECENT_GAMES = 10;

const mapOf = (type: "3c" | "4c") => (type === "4c" ? HANDICAP_MAP_4C : HANDICAP_MAP_3C);

export function handicapFor(avg: number, type: "3c" | "4c"): number {
    const map = mapOf(type);
    for (const s of map) if (avg >= s.avg) return s.handi;
    return map[map.length - 1].handi;
}

/** 지금 핸디 바로 위 칸 — 이미 맨 위면 null */
export function nextHandicap(avg: number, type: "3c" | "4c"): HandiStep | null {
    const map = mapOf(type);
    const cur = handicapFor(avg, type);
    const i = map.findIndex((s) => s.handi === cur);
    return i > 0 ? map[i - 1] : null;
}

/**
 * 지금 핸디 칸 안에서 어디쯤인가(0~1) — 홈 '내 실전 기록'의 다음 다마 막대(2026-10-20 오너 시안 A).
 * 칸의 아래 끝 = 지금 핸디의 권장 에버, 위 끝 = 바로 위 칸의 권장 에버. 맨 위 칸이면 null(막대 대신 '최고 핸디').
 */
export function handiBandProgress(avg: number, type: "3c" | "4c"): number | null {
    if (!Number.isFinite(avg)) return null;
    const map = mapOf(type);
    const i = map.findIndex((s) => s.handi === handicapFor(avg, type));
    if (i <= 0) return null;
    const lo = map[i].avg, hi = map[i - 1].avg;
    return hi > lo ? Math.min(1, Math.max(0, (avg - lo) / (hi - lo))) : null;
}

/** 핸디를 매길 때 보는 한 판 — 기록 줄의 에버리지 글자와, 그 판에서 그 사람이 적은 목표(없으면 null) */
export interface HandiGame { average: string | number; target?: number | null }

/**
 * 핸디에 넣는 그 판의 에버리지. 4구에서 목표를 다마 표의 맨 위(50)보다 크게 적은 판은 **세지 않는다**(null).
 * 점수판은 한 번 누르면 1점이라 그런 목표(150 · 180)는 다마 눈금 밖의 값이다 — 운영에 있던 두 판(2026-07-14)은 이닝 점수가 목표에 비례하는
 * 시험용 기록이었고, 판 에버리지가 5~8 로 남아 그 판이 낀 사람의 다마가 500 으로 매겨졌다(2026-10-12 조사).
 * 10으로 나누는 것도 생각했지만(오너에게 처음 그렇게 말했다), 채팅의 매칭 대결 카드가 4구 목표를 80 으로 적어 주던 때의 판처럼
 * 득점 수로 친 판까지 10으로 나누면 거꾸로 다마가 깎인다 — 눈금 밖의 판은 빼는 쪽이 어느 경우에도 안전하다.
 * 숫자가 아닌 줄도 null.
 */
export function handiGameAverage(g: HandiGame, type: "3c" | "4c"): number | null {
    const v = typeof g.average === "number" ? g.average : parseFloat(g.average);
    if (!Number.isFinite(v)) return null;
    if (type === "4c" && typeof g.target === "number" && g.target > HANDI_4C_MAX) return null;
    return v;
}

/**
 * 핸디를 매기는 값 — 최근 HANDI_RECENT_GAMES 판(최근 것부터 준다) 가운데 셀 수 있는 판의 판별 에버리지 평균과 그 판 수.
 * 셀 판이 하나도 없으면 null. 판 수가 HANDI_MIN_GAMES 에 못 미치면 다마를 매기지 않는 것은 부르는 쪽이 정한다.
 */
export function handiBasis(games: readonly HandiGame[], type: "3c" | "4c"): { avg: number; games: number } | null {
    const vals = games.slice(0, HANDI_RECENT_GAMES).map((g) => handiGameAverage(g, type)).filter((v): v is number => v !== null);
    return vals.length ? { avg: vals.reduce((a, b) => a + b, 0) / vals.length, games: vals.length } : null;
}
export const handiBasisAverage = (games: readonly HandiGame[], type: "3c" | "4c"): number | null => handiBasis(games, type)?.avg ?? null;

/** 다마도 에버리지도 없는 사람(게스트 · 첫 판)의 기본 목표 — 3쿠션 15점 · 4구 150점 */
export const SCOREBOARD_DEFAULT_TARGET = 15;

/** 점수판에 앉는 사람에게서 읽는 값(회원 행의 일부) */
export interface TargetMember { handi3c?: number | null; handi4c?: number | null; avg3c?: number | null; avg4c?: number | null }

/**
 * 점수판 '경기 만들기'가 자리에 미리 적는 목표 = **그 사람의 다마**(2026-10-12 오너: "이 다마대로 점수판 자동 입력으로 하고").
 *  - handi: 서버가 최근 공식 경기로 매긴 다마가 있으면 그 값.
 *  - avg: 아직 다마가 없으면(공식 5판 전) 그 종목 에버리지를 같은 표에 넣은 값.
 *  - default: 둘 다 없으면 SCOREBOARD_DEFAULT_TARGET.
 * 예전에는 표와 다른 셈(3쿠션 에버 × 35 · 4구 에버 × 20)으로 적어, 같은 사람의 '내 다마'와 점수판의 목표가 달랐다
 * (에버 0.4 인 3쿠션 회원: 다마 표는 18점인데 점수판은 14점을 적었다).
 * 적힌 값은 방장이 고칠 수 있다 — 여기서는 처음 값을 줄 뿐이다.
 */
export function scoreboardTarget(m: TargetMember | null | undefined, type: "3c" | "4c"): { target: number; from: "handi" | "avg" | "default" } {
    const handi = type === "3c" ? m?.handi3c : m?.handi4c;
    if (typeof handi === "number" && Number.isFinite(handi) && handi > 0) return { target: Math.round(handi), from: "handi" };
    const avg = type === "3c" ? m?.avg3c : m?.avg4c;
    if (typeof avg === "number" && Number.isFinite(avg) && avg > 0) return { target: handicapFor(avg, type), from: "avg" };
    return { target: SCOREBOARD_DEFAULT_TARGET, from: "default" };
}
