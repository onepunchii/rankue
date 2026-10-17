/**
 * 바람 방위(16방위 영문 → 우리말) · 화살 각도 — 산 위 관측(shared/hikingMountObs)과 바다 예보(shared/fishingSeaFcst)가 같이 쓴다(2026-10-17).
 * ⚠️ 서버가 부른다 — 상대 임포트는 ./x.js.
 */
export const WIND_DIRS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"] as const;
const DIR_KO: Readonly<Record<string, string>> = {
    N: "북", NNE: "북북동", NE: "북동", ENE: "동북동", E: "동", ESE: "동남동", SE: "남동", SSE: "남남동",
    S: "남", SSW: "남남서", SW: "남서", WSW: "서남서", W: "서", WNW: "서북서", NW: "북서", NNW: "북북서",
};
/** 바람이 불어오는 쪽의 이름 — "북서"(풍 없이) */
export const windDirName = (d: string | null | undefined): string | null => (d && DIR_KO[d] ? DIR_KO[d] : null);
/** "북서풍" */
export const windDirKo = (d: string | null | undefined): string | null => (windDirName(d) ? `${windDirName(d)}풍` : null);
/** 화살을 돌릴 각도(바람이 불어 가는 쪽, 북=0°) */
export function windArrowDeg(d: string | null | undefined): number | null {
    const i = d ? (WIND_DIRS as readonly string[]).indexOf(d) : -1;
    return i < 0 ? null : (i * 22.5 + 180) % 360;
}
