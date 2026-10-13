/**
 * 해 뜨는 시각 · 해 지는 시각(2026-10-13) — 산 화면의 날씨 구역과 산행 중 화면이 쓴다.
 *
 * 밖에 묻지 않고 셈한다(날짜 · 위도 · 경도만으로 — 널리 쓰는 일출 방정식. 한국에서 공식 발표값과 1~2분 안으로 맞는다).
 * **평지 기준**이다: 높은 정상에서는 지평선이 내려가 해가 몇 분 일찍 뜨고 늦게 진다 — 화면에 그렇게 적는다.
 * 쓰임은 안전 쪽이다: 해 지기 전에 내려올 시간을 남기라는 것. 일출 산행 · 야간 산행을 권하는 말로 쓰지 않는다.
 * ⚠️ 서버가 임포트하는 shared 파일 — 상대 임포트는 반드시 './x.js'. 순수 함수만(지금 시각은 받아서 쓴다).
 */

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
const J1970 = 2440587.5, J2000 = 2451545.0;
const KST_MS = 9 * 3_600_000;

export interface Ymd { y: number; m: number; d: number }
export interface SunTimes {
    /** 해 뜨는 때 · 남중 · 해 지는 때(1970년부터의 ms) */
    rise: number; noon: number; set: number;
}

/** 한국 날짜 — 지금 시각(ms)이 한국에서 몇 년 몇 월 며칠인가 */
export function kstYmd(now: number): Ymd {
    const t = new Date(now + KST_MS);
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}
/** 한국 시계의 시:분 — "06:38" */
export function kstClock(t: number): string {
    const x = new Date(t + KST_MS + 30_000);          // 분으로 반올림
    return `${String(x.getUTCHours()).padStart(2, "0")}:${String(x.getUTCMinutes()).padStart(2, "0")}`;
}

/** 그 날짜 · 그 자리의 해 뜨는 때와 지는 때. 해가 안 뜨거나 안 지는 곳(극지)이면 null — 한국에는 없다 */
export function sunTimes(day: Ymd, lat: number, lng: number): SunTimes | null {
    if (![lat, lng, day.y, day.m, day.d].every(Number.isFinite) || Math.abs(lat) > 89) return null;
    // 그 날짜의 정오(UTC)를 기준으로 한 날수
    const n = Math.round(Date.UTC(day.y, day.m - 1, day.d, 12) / DAY_MS + J1970 - J2000 + 0.0008);
    const js = n - lng / 360;                                       // 그 자리의 평균 태양시
    const M = ((357.5291 + 0.98560028 * js) % 360 + 360) % 360;     // 평균 근점 이각
    const C = 1.9148 * Math.sin(M * RAD) + 0.02 * Math.sin(2 * M * RAD) + 0.0003 * Math.sin(3 * M * RAD);
    const L = ((M + C + 180 + 102.9372) % 360 + 360) % 360;         // 황경
    const transit = J2000 + js + 0.0053 * Math.sin(M * RAD) - 0.0069 * Math.sin(2 * L * RAD);
    const sinDec = Math.sin(L * RAD) * Math.sin(23.4397 * RAD), cosDec = Math.cos(Math.asin(sinDec));
    // 해의 윗가장자리가 지평선에 닿는 때(대기 굴절 포함 −0.833°)
    const cosW = (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * sinDec) / (Math.cos(lat * RAD) * cosDec);
    if (cosW < -1 || cosW > 1) return null;
    const w = Math.acos(cosW) / RAD / 360;
    const ms = (j: number) => Math.round((j - J1970) * DAY_MS);
    return { rise: ms(transit - w), noon: ms(transit), set: ms(transit + w) };
}

/** "11시간 19분" — 60분 아래면 "42분" */
export function spanText(min: number): string {
    const m = Math.max(0, Math.round(min));
    return m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ""}` : `${m}분`;
}

/** 산 화면의 한 줄 — "해 뜸 06:38 · 해 짐 17:57 · 낮 11시간 19분" */
export function sunLine(st: SunTimes): string {
    return `해 뜸 ${kstClock(st.rise)} · 해 짐 ${kstClock(st.set)} · 낮 ${spanText((st.set - st.rise) / 60_000)}`;
}
export const SUN_NOTE = "평지 기준이에요. 높은 정상에서는 몇 분 일찍 뜨고 늦게 져요. 해 지기 전에 내려올 시간을 남겨 두세요.";

/** 이만큼(분) 안으로 해가 지면 산행 중 화면에 알린다 */
export const SUNSET_NOTICE_MIN = 180;
/** 이만큼(분) 안이면 더 눈에 띄게 */
export const SUNSET_URGENT_MIN = 60;

export interface SunsetNotice { text: string; urgent: boolean }
/**
 * 산행 중 화면의 해 지는 때 알림 — 해 지기 세 시간 전부터. 그 전에는 null(화면을 늘리지 않는다).
 * 해가 진 뒤에는 불을 켜고 천천히 내려오라는 말만 한다(밤 산행을 권하지 않는다).
 */
export function sunsetNotice(now: number, st: SunTimes | null): SunsetNotice | null {
    if (!st) return null;
    // 해 뜨기 전(그 날의 새벽)
    if (now < st.rise) return { text: `아직 해 뜨기 전이에요(${kstClock(st.rise)}). 불을 켜고 발밑을 살피세요.`, urgent: true };
    const left = (st.set - now) / 60_000;
    if (left > SUNSET_NOTICE_MIN) return null;
    if (left <= 0) return { text: "해가 졌어요. 불을 켜고 천천히 내려오세요.", urgent: true };
    return { text: `해 지기까지 ${spanText(left)}(${kstClock(st.set)}) — 내려갈 시간을 남겨 두세요.`, urgent: left <= SUNSET_URGENT_MIN };
}
