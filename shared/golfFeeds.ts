/**
 * 골프 › 외부 수집(2026-10-17 어드민 전수 조사 골프 ⑤ — "골프 현황은 랭킹과 시세만 본다 · 남은 티 · 날씨 · 전날 알림은 볼 곳이 없다").
 * 남은 티(golf_open_tee_days — 골프장마다 다음 이레) · 날씨(golf_weather_grid · golf_weather_mid — 지금 쓰는 격자만) · 전날 저녁 알림(hiq_cron_runs 'golf_eve').
 * 랭킹 · 시세는 '골프 현황'에 이미 있다. 순수 규칙만(서버 · 화면이 같이 쓴다).
 */
export type TeeClubState = "ok" | "partial" | "fail" | "none";
export interface TeeClubRow {
    slug: string; days: number; ok: number; miss: number; tees: number;
    lastAt: string | null; lastError: string | null; family: string; page: string;
}
export interface GolfWeatherState {
    enabled: boolean;
    /** 지금 골프장 페이지가 쓰는 단기 격자 */
    grids: number; gridsFresh: number; gridsStale: number; gridsMissing: number; latestBase: string;
    oldestAt: string | null;
    mids: number; midsFresh: number; latestMidBase: string;
}
export interface GolfEveRun { at: string; ok: boolean; rounds: number | null; players: number | null; sent: number | null; failed: number | null; error: string | null }
export interface GolfFeeds {
    tees: { enabled: boolean; quiet: boolean; clubs: TeeClubRow[] };
    weather: GolfWeatherState;
    eve: GolfEveRun[];
}

/** 남은 티 한 곳의 상태 — 이레 가운데 받은 날 · 못 받은 날로 */
export function teeClubState(r: Pick<TeeClubRow, "days" | "ok" | "miss">): TeeClubState {
    if (r.days === 0) return "none";
    if (r.ok === 0) return "fail";
    return r.miss > 0 ? "partial" : "ok";
}
export const TEE_STATE_LABEL: Readonly<Record<TeeClubState, string>> = { ok: "잘 받음", partial: "일부 못 받음", fail: "못 받음", none: "아직 안 봄" };

/** 격자 하나가 쓸 만한가 — 가장 새 발표(latest)거나 그 바로 전 발표(발표 직후 받기 전) */
export function gridFresh(base: string | null, latest: string, previous: string): boolean {
    return !!base && (base >= latest || base >= previous);
}

/** 크론 실행 기록(hiq_cron_runs.result) → 한 줄 */
export function eveRunOf(r: { at: string; ok: boolean; result: unknown }): GolfEveRun {
    const x = (r.result && typeof r.result === "object" ? r.result : {}) as Record<string, unknown>;
    const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    return { at: r.at, ok: r.ok, rounds: n(x.rounds), players: n(x.players), sent: n(x.sent), failed: n(x.failed), error: typeof x.error === "string" ? x.error : null };
}
