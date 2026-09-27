/**
 * 실전(오프라인 매칭 대결) 핸디 기준표 — 최근 공식 10경기 에버리지 평균 → 핸디(다마수).
 * 서버 game.repo(경기 끝에 핸디를 매긴다)와 홈 "내 실전 핸디" 카드(다음 핸디까지 남은 에버)가 같은 표를 쓴다.
 * 위에서부터 처음으로 avg 이상인 줄의 handi. 온라인게임 핸디(shared/sim/handicap)와는 따로다.
 */
export interface HandiStep { avg: number; handi: number }

export const HANDICAP_MAP_4C: readonly HandiStep[] = [
    { avg: 1.5, handi: 50 },
    { avg: 1.2, handi: 40 },
    { avg: 0.9, handi: 30 },
    { avg: 0.75, handi: 25 },
    { avg: 0.6, handi: 20 },
    { avg: 0.45, handi: 15 },
    { avg: 0.35, handi: 12 },
    { avg: 0.3, handi: 10 },
    { avg: 0.24, handi: 8 },
    { avg: 0.15, handi: 5 },
    { avg: 0.0, handi: 3 },
];

export const HANDICAP_MAP_3C: readonly HandiStep[] = [
    { avg: 1.0, handi: 30 },
    { avg: 0.7, handi: 25 },
    { avg: 0.6, handi: 23 },
    { avg: 0.5, handi: 20 },
    { avg: 0.4, handi: 18 },
    { avg: 0.3, handi: 15 },
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
