/**
 * 정상의 날씨(2026-10-13 오너: "산 상세페이지의 날씨에 정상에서의 날씨 추가하면 어때? 시간별로는 아니지만 시간 3개 정도는 정상 온도를").
 *
 * 산의 날씨는 **들머리(코스의 가장 낮은 곳) 자리의 격자 예보**다(기상청 단기예보) — 그것이 '산 아래'다. 정상의 값은 **재서 얻은 것이 아니라 고도 차로 어림한 것**이다:
 *   정상 기온 ≈ 산 아래 예보 − (정상 높이 − 들머리 높이) ÷ 100 × 0.6℃      ← 날씨 구역의 각주가 이미 말하던 셈을 대신 해 준다
 *   체감 ≈ 그 기온에 예보의 바람을 넣은 기상청 겨울 체감온도(10℃ 이하 · 바람 1.3m/s 이상일 때만 뜻이 있다)
 * 그래서 화면은 늘 '어림'이라고 적고, 바람은 산 아래 예보 그대로 보인다(정상의 바람은 어림할 근거가 없다 — 더 셀 수 있다는 말만 붙인다).
 * 들머리는 그 산의 코스 가운데 가장 낮은 곳(trailheadPoint). 코스의 높이 자료를 믿을 수 없으면(전부 0 인 선 등) 정상의 날씨를 그리지 않는다.
 *
 * 시각은 셋: 새벽 6시(가장 춥다 · 일출 산행) · 낮 12시(정상에 서는 때) · 오후 3시(내려오는 때). 이미 지난 시각은 비워 둔다.
 */
import { kstParts, addDays, ymdToKey, type WxHour, type WxKind } from "./golfWeather";

/** 100m 오를 때마다 낮아지는 기온(℃) — 날씨 구역의 각주(WEATHER_NOTE)와 같은 수 */
export const LAPSE_PER_100M = 0.6;
export const SUMMIT_HOURS = [6, 12, 15] as const;
export const SUMMIT_HOUR_LABEL: Readonly<Record<number, string>> = { 6: "새벽 6시", 12: "낮 12시", 15: "오후 3시" };
/** 들머리와 정상의 높이 차가 이보다 작으면 그리지 않는다(산 아래 예보와 1℃도 다르지 않다) */
export const SUMMIT_MIN_RISE_M = 200;
/** 며칠 치 — 시간별 예보가 있는 동안(오늘 · 내일 · 모레) */
export const SUMMIT_DAYS = 3;

/**
 * 들머리 — 코스들의 가장 낮은 곳(자리와 높이). 산 아래의 예보를 이 자리의 격자에서 받는다.
 * ⚠️ 정상 좌표의 격자 예보를 '산 아래'로 삼으면 안 된다 — 기상청 격자 값은 이미 그 격자의 높이만큼 낮다(2026-10-13 실측: 설악산 정상 격자는
 *    들머리 격자보다 5~6℃ 낮았다). 거기서 들머리부터의 높이 차를 또 빼면 두 번 낮춘다(새벽 −8° 로 나왔다 — 들머리에서 낮추면 −3°).
 * 높이 자료를 믿을 수 있는 코스만 본다: 가장 높은 곳이 정상 높이의 절반에도 못 미치는 선은 높이가 비어 있거나(전부 0) 정상에 닿지 않는 조각이고,
 * 높이가 0 인 점은 빈 점이다(292m 객산의 들머리가 0m 로 읽혔다 — 바닷가 들머리도 1m 이상으로 적혀 있다).
 * 믿을 점이 하나도 없으면 null(정상의 날씨를 그리지 않는다 — 틀린 높이 차로 어림하느니 안 보인다).
 */
export function trailheadPoint(heightM: number | null, courses: readonly { maxM: number; line: readonly (readonly number[])[] }[]): { lat: number; lng: number; m: number } | null {
    if (heightM == null || heightM <= 0) return null;
    let low: readonly number[] | null = null;
    for (const c of courses) {
        if (!(Number.isFinite(c.maxM) && c.maxM >= heightM * 0.5)) continue;
        for (const p of c.line) if (Number.isFinite(p[2]) && p[2] > 0 && p[2] < heightM && (!low || p[2] < low[2])) low = p;
    }
    return low ? { lat: low[0], lng: low[1], m: Math.round(low[2]) } : null;
}

/** 산의 날씨 응답에 붙는 정상의 바탕 — 정상 높이와 들머리 높이(예보는 들머리 자리의 것이다) */
export interface SummitBase { heightM: number; baseM: number }

/** 정상이 산 아래보다 얼마나 낮은가(℃, 소수 한 자리) — 높이 차가 작거나 모르면 null */
export function summitDrop(heightM: number | null, baseM: number | null): { riseM: number; dropC: number } | null {
    if (heightM == null || baseM == null) return null;
    const riseM = Math.round(heightM - baseM);
    if (riseM < SUMMIT_MIN_RISE_M) return null;
    return { riseM, dropC: Math.round((riseM / 100) * LAPSE_PER_100M * 10) / 10 };
}

/**
 * 기상청 겨울 체감온도(℃) — 기온 10℃ 이하 · 바람 1.3m/s(4.8km/h) 이상에서만 쓰는 식. 그 밖에서는 null(체감을 따로 적지 않는다).
 * 13.12 + 0.6215T − 11.37V^0.16 + 0.3965TV^0.16 (V: km/h)
 */
export function windChillC(tmpC: number, wsdMs: number | null): number | null {
    if (wsdMs == null || tmpC > 10 || wsdMs < 1.3) return null;
    const v = Math.pow(wsdMs * 3.6, 0.16);
    return Math.round(13.12 + 0.6215 * tmpC - 11.37 * v + 0.3965 * tmpC * v);
}

export interface SummitSlot {
    hour: number;
    label: string;
    /** 정상 기온 어림(℃, 정수) — 그 시각의 예보가 없거나 이미 지났으면 null */
    tmp: number | null;
    /** 산 아래 예보(℃) */
    below: number | null;
    /** 체감(℃) — 식이 뜻이 있을 때만 */
    feel: number | null;
    /** 예보의 바람(m/s) — 산 아래 격자의 값 그대로 */
    wsd: number | null;
    kind: WxKind | null;
    pop: number | null;
}
export interface SummitDay {
    /** "YYYY-MM-DD" */
    date: string;
    /** "오늘" · "내일" · "모레" */
    label: string;
    slots: SummitSlot[];
}
export interface SummitWx { heightM: number; baseM: number; riseM: number; dropC: number; days: SummitDay[] }

const DAY_LABEL = ["오늘", "내일", "모레"];

/**
 * 정상의 날씨 — 날마다 세 시각. 시간별 예보(hours)는 '지금 이후'만 들어 있으므로 지난 시각은 저절로 빈다.
 * 한 시각도 없는 날은 뺀다. 그릴 날이 없거나 높이 차를 모르면 null.
 */
export function summitWx(hours: readonly WxHour[], o: { heightM: number | null; baseM: number | null; nowMs: number }): SummitWx | null {
    const drop = summitDrop(o.heightM, o.baseM);
    if (!drop || o.heightM == null || o.baseM == null) return null;
    const byT = new Map(hours.map((h) => [h.t, h]));
    const today = kstParts(o.nowMs).ymd;
    const days: SummitDay[] = [];
    for (let i = 0; i < SUMMIT_DAYS; i++) {
        const ymd = addDays(today, i);
        const slots = SUMMIT_HOURS.map((hour): SummitSlot => {
            const h = byT.get(`${ymd}${String(hour).padStart(2, "0")}`);
            const exact = h?.tmp != null ? h.tmp - drop.dropC : null;
            return {
                hour, label: SUMMIT_HOUR_LABEL[hour], tmp: exact != null ? Math.round(exact) : null, below: h?.tmp != null ? Math.round(h.tmp) : null,
                feel: exact != null ? windChillC(exact, h?.wsd ?? null) : null, wsd: h?.wsd ?? null, kind: h?.kind ?? null, pop: h?.pop ?? null,
            };
        });
        if (slots.some((s) => s.tmp != null)) days.push({ date: ymdToKey(ymd), label: DAY_LABEL[i], slots });
    }
    return days.length ? { heightM: o.heightM, baseM: o.baseM, riseM: drop.riseM, dropC: drop.dropC, days } : null;
}

/** 처음 보일 날 — 시각이 둘 이상 남은 첫 날(오후 늦게는 내일을 먼저 보인다). 없으면 첫 날 */
export function summitFirstDay(days: readonly SummitDay[]): number {
    const i = days.findIndex((d) => d.slots.filter((s) => s.tmp != null).length >= 2);
    return i < 0 ? 0 : i;
}

export const SUMMIT_WX_COPY = {
    title: "정상",
    /** 각주 — 어림이라는 것과 셈을 그대로 */
    note: (riseM: number, dropC: number) => `산 아래 예보에서 높이 차 ${riseM.toLocaleString("ko-KR")}m만큼 낮춰 어림한 값이에요(100m에 ${LAPSE_PER_100M}℃ — 약 ${dropC}℃). 정상의 바람은 예보보다 셀 수 있어요.`,
    passed: "지남",
    feel: "체감",
    below: "산 아래",
} as const;
