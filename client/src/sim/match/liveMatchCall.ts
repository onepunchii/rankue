/**
 * 앱 어디서나 뜨는 대전 호출 띠(LiveMatchBanner)의 순수 계산. 앱 첫 번들에 들어가므로 게임 코드(matchApi·규칙 엔진)를
 * import 하지 않는다 — 필요한 필드만 직접 읽는다.
 */
import { SHOT_CLOCK_S } from "@shared/sim/rules/session";

export const CALL_CLOCK_S = SHOT_CLOCK_S;

export interface CallMatch {
    readonly id: string;
    readonly status: string;
    readonly myIndex: number;
    readonly turn: number;
    readonly shots: number;
    readonly version: number;
    readonly turnSeenAt: string | null;
    readonly serverNow: string | null;
    readonly opponentName: string;
}
type MatchPublic = CallMatch;

/** GET /sim/matches 응답 → 호출에 필요한 필드만. 모양이 이상한 줄은 버린다. */
export function parseCallRows(raw: unknown): CallMatch[] {
    if (!Array.isArray(raw)) return [];
    const str = (v: unknown) => (typeof v === "string" ? v : null);
    const out: CallMatch[] = [];
    for (const r of raw) {
        if (!r || typeof r !== "object") continue;
        const o = r as Record<string, unknown>;
        if (typeof o.id !== "string") continue;
        const myIndex = Number(o.myIndex);
        out.push({
            id: o.id, status: String(o.status ?? ""), myIndex, turn: Number(o.turn), shots: Number(o.shots ?? 0),
            version: Number(o.version ?? 0), turnSeenAt: str(o.turnSeenAt), serverNow: str(o.serverNow),
            opponentName: (myIndex === 1 ? str(o.hostName) : str(o.guestName)) ?? "",
        });
    }
    return out;
}

/** 띄울 대전: 진행 중 · 내 차례. 여럿이면 시계가 먼저 끝나는 것(시계가 없는 대전은 뒤로). */
export function pickCallMatch(rows: readonly MatchPublic[]): MatchPublic | null {
    const mine = rows.filter((m) => m.status === "playing" && m.myIndex >= 0 && m.turn === m.myIndex);
    if (mine.length === 0) return null;
    const clockOf = (m: MatchPublic) => (m.turnSeenAt ? Date.parse(m.turnSeenAt) : Number.POSITIVE_INFINITY);
    return [...mine].sort((a, b) => clockOf(a) - clockOf(b))[0];
}

/** 시간 초과까지 남은 초(시계가 아직 안 걸렸거나 모르면 null). 자리 비움 유예도 합친다. */
export function secondsLeft(m: Pick<MatchPublic, "turnSeenAt" | "serverNow">, nowMs: number, fetchedAtMs: number): number | null {
    if (!m.turnSeenAt) return null;
    const seen = Date.parse(m.turnSeenAt);
    const server = m.serverNow ? Date.parse(m.serverNow) : NaN;
    // 서버 시각 보정: 응답을 받은 순간의 서버 시각 + 그 뒤 흐른 시간
    const serverNowMs = Number.isFinite(server) ? server + (nowMs - fetchedAtMs) : nowMs;
    if (!Number.isFinite(seen)) return null;
    return Math.max(0, Math.ceil((seen + SHOT_CLOCK_S * 1000 - serverNowMs) / 1000));
}

/**
 * 지금 대전 화면(판)을 보고 있는 대전 id — SimulatorPage 가 대전 모드에 들어가고 나올 때 적는다. 띠는 그 화면 위에는 안 뜬다.
 * /online-game 주소만으로 가리면 같은 주소의 로비·대시보드에 있는 방장이 호출을 못 봤다.
 */
let activeMatchScreen: string | null = null;
const listeners = new Set<() => void>();
export function setActiveMatchScreen(id: string | null): void {
    if (activeMatchScreen === id) return;
    activeMatchScreen = id;
    for (const l of listeners) l();
}
export function subscribeActiveMatchScreen(l: () => void): () => void {
    listeners.add(l);
    return () => { listeners.delete(l); };
}
export function getActiveMatchScreen(): string | null {
    return activeMatchScreen;
}
