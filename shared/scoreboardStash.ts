/**
 * 실전 점수판 기기 보관(2026-10-23 오너: "오프라인 보관").
 *
 * 왜: 점수판은 바뀔 때마다 전체 상태를 서버에 저장하지만, 저장이 실패한 동안의 점수는 **메모리에만** 있었다.
 * 지하 당구장처럼 신호가 약한 곳에서 앱이 꺼지거나(iOS 가 뒤에 둔 앱을 정리) 폰이 재부팅되면 마지막 성공 저장 뒤의 점수가 사라졌다.
 *
 * 그래서 호스트 기기는 바뀔 때마다 최신 상태를 localStorage 에 적어 둔다(경기마다 한 줄). 다시 열었을 때 **보내지 못한 변경이 남아 있고**
 * 서버가 가진 상태가 **이 기기가 보냈거나 알던 것 그대로**일 때만 기기의 것으로 되살리고 서버에 다시 보낸다.
 * 서버가 그 사이 다른 기기에서 바뀌었으면(같은 호스트가 태블릿으로 이어 친 경우) 서버를 믿고 기기 것은 버린다.
 *
 * 서버의 저장에는 순번이 없다 — 그래서 '서버가 지금 가진 것이 내 것인가'를 저장 내용의 지문(fingerprint)으로 본다.
 * 지문은 서버가 받는 칸(routes/game.ts PATCH 화이트리스트)과 같은 칸만 쓴다: 점수 · 이닝 배열 · 하이런 · 총이닝 · 마무리 · 초구.
 */

export const STASH_PREFIX = "rankue.board.stash.";
/** 이보다 오래된 보관은 되살리지 않고 지운다 — 일주일 넘게 이어 치지 않은 경기의 기기 기록은 믿기 어렵다 */
export const STASH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** 서버가 가질 수 있는 '내 것' 지문을 이만큼만 기억한다(보낸 저장마다 하나) */
export const STASH_KNOWN_MAX = 30;

export interface StorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
    readonly length?: number;
    key?(index: number): string | null;
}

type Slot = 1 | 2 | 3 | 4;
const SLOTS: readonly Slot[] = [1, 2, 3, 4];

/** 경기 행 — 지문에 쓰는 칸만 */
export interface StashRow {
    readonly [key: string]: unknown;
    readonly totalInnings?: number | null;
    readonly finishProgress?: Record<string, number> | null;
    readonly breakPlayer?: number | null;
}

/** 점수판 상태 — 지문에 쓰는 칸만(client/src/types/game.ts GameState 의 부분) */
export interface StashState {
    readonly [key: string]: unknown;
    readonly innings: number;
    readonly breaker?: number;
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
const arr = (v: unknown): number[] => (Array.isArray(v) ? v.map(num) : []);

function fp(parts: { s: number[]; h: number[]; a: number[][]; i: number; f: number[]; b: number }): string {
    return JSON.stringify([parts.s, parts.h, parts.a, parts.i, parts.f, parts.b]);
}

/** 서버 행의 지문 */
export function rowFingerprint(row: StashRow): string {
    return fp({
        s: SLOTS.map((n) => num(row[`player${n}Score`])),
        h: SLOTS.map((n) => num(row[`player${n}HighRun`])),
        a: SLOTS.map((n) => arr(row[`player${n}Innings`])),
        i: num(row.totalInnings),
        f: SLOTS.map((n) => num(row.finishProgress?.[String(n)])),
        b: num(row.breakPlayer) || 1,
    });
}

/** 점수판 상태의 지문 — 같은 상태를 PATCH 로 보내면 서버 행의 지문과 같다 */
export function stateFingerprint(s: StashState): string {
    return fp({
        s: SLOTS.map((n) => num(s[`p${n}Score`])),
        h: SLOTS.map((n) => num(s[`p${n}HighRun`])),
        a: SLOTS.map((n) => arr(s[`p${n}Innings`])),
        i: num(s.innings),
        f: SLOTS.map((n) => num(s[`p${n}FinishScore`])),
        b: num(s.breaker) || 1,
    });
}

export interface BoardStash<S> {
    readonly v: 1;
    /** 바뀔 때마다 1 씩 */
    readonly seq: number;
    /** 서버가 받았다고 답한 마지막 seq */
    readonly ackedSeq: number;
    /** 마지막으로 적은 때(ms) */
    readonly at: number;
    readonly state: S;
    /** 서버가 지금 가질 수 있는 '이 기기의' 지문들 — 열 때 받은 행 + 보낸 저장들(답을 못 받은 것 포함) */
    readonly known: readonly string[];
}

export const stashKey = (gameId: string) => `${STASH_PREFIX}${gameId}`;

export function readStash<S>(storage: StorageLike | null | undefined, gameId: string): BoardStash<S> | null {
    if (!storage) return null;
    try {
        const raw = storage.getItem(stashKey(gameId));
        if (!raw) return null;
        const v = JSON.parse(raw) as BoardStash<S>;
        if (!v || v.v !== 1 || typeof v.seq !== "number" || typeof v.ackedSeq !== "number" || !v.state || !Array.isArray(v.known)) return null;
        return v;
    } catch {
        return null;
    }
}

/** 성공 여부. 저장소가 가득 찼거나 막혀 있으면 false — 보관은 덤이라 실패해도 점수판은 그대로 돈다 */
export function writeStash<S>(storage: StorageLike | null | undefined, gameId: string, stash: BoardStash<S>): boolean {
    if (!storage) return false;
    try {
        storage.setItem(stashKey(gameId), JSON.stringify({ ...stash, known: stash.known.slice(-STASH_KNOWN_MAX) }));
        return true;
    } catch {
        return false;
    }
}

export function clearStash(storage: StorageLike | null | undefined, gameId: string): void {
    try { storage?.removeItem(stashKey(gameId)); } catch { /* 막힌 저장소 */ }
}

/** 지문을 하나 더 기억한다(이미 있으면 맨 뒤로) */
export function withKnown(known: readonly string[], f: string): string[] {
    return [...known.filter((k) => k !== f), f].slice(-STASH_KNOWN_MAX);
}

/**
 * 열 때 기기 것을 되살릴까 — 되살릴 상태 또는 null(서버 행을 쓴다).
 *  - 보내지 못한 변경이 없으면(seq ≤ ackedSeq) 서버가 최신이다.
 *  - 서버 행이 이 기기가 보냈거나 알던 지문이 아니면 다른 기기에서 이어 친 것 — 서버를 믿는다.
 *  - 기기 것이 서버와 같으면 되살릴 것이 없다.
 *  - 오래된 보관(STASH_TTL_MS)은 믿지 않는다.
 */
export function pickRestore<S extends StashState>(stash: BoardStash<S> | null, row: StashRow, now: number): S | null {
    if (!stash) return null;
    if (!(now - stash.at <= STASH_TTL_MS)) return null;
    if (stash.seq <= stash.ackedSeq) return null;
    const server = rowFingerprint(row);
    if (!stash.known.includes(server)) return null;
    if (stateFingerprint(stash.state) === server) return null;
    return stash.state;
}

/** 오래된 보관을 지운다(점수판을 열 때 한 번). 지운 수 */
export function pruneStashes(storage: StorageLike | null | undefined, now: number): number {
    if (!storage || typeof storage.length !== "number" || typeof storage.key !== "function") return 0;
    const stale: string[] = [];
    try {
        for (let i = 0; i < storage.length; i++) {
            const k = storage.key(i);
            if (!k || !k.startsWith(STASH_PREFIX)) continue;
            try {
                const v = JSON.parse(storage.getItem(k) ?? "null") as { at?: number } | null;
                if (!v || typeof v.at !== "number" || !(now - v.at <= STASH_TTL_MS)) stale.push(k);
            } catch { stale.push(k); }
        }
        for (const k of stale) storage.removeItem(k);
    } catch { return 0; }
    return stale.length;
}
