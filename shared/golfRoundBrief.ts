/**
 * 라운드 브리핑(2026-10-05 오너: "골퍼들이 좋아할 만한 UI/UX" → "응 진행") — 날씨를 '내 티타임' 기준으로 다시 읽는다.
 *
 * 일반 날씨 앱은 "오늘 날씨"를 말한다. 골퍼가 궁금한 건 "내 티오프부터 끝날 때까지 어떤가, 뭘 챙기나, 해는 언제 지나"다.
 * 그래서 티오프 시각을 고르면 그 라운드 다섯 시간(여섯 칸)만 잘라 전반·후반으로 보여 주고, 한 줄 평과 준비물을 붙인다.
 *
 * 한 줄 평·준비물은 **규칙**이다 — 기상청 숫자 셋(비·바람·기온)과 해 지는 시각에서 아래 순서로 정한다. 점수도 AI 도 없다.
 * 화면에는 늘 근거 숫자를 같이 적는다(비 0% · 바람 3m/s · 9°→18°) — 말만 있고 근거가 없으면 장식이다.
 * 화면(WeatherCard)과 검색엔진용 화면(prerender)이 같은 함수를 쓴다.
 * ⚠️ shared 상대 임포트는 반드시 ./x.js(서버리스 규칙).
 */
import { WIND_LEVEL, WX_LABEL, isWet, type WxDay, type WxHour, type WxKind } from "./golfWeather.js";

/** 18홀 한 라운드에 걸리는 시간(분) — 전반·그늘집·후반 합쳐 네 시간 반. 시간 창과 '마지막 티' 역산에 쓴다 */
export const ROUND_MINUTES = 270;
/** 해 진 뒤에도 공이 보이는 시간(분) — 박명 */
export const DUSK_MINUTES = 20;
/** 부를 누르면 잡는 티오프 시각. 부의 경계는 shared/golfCourse teePart 와 같다(11시 전 · 15시 전 · 그 뒤) */
export const PART_TEE_HOUR: Record<1 | 2 | 3, number> = { 1: 7, 2: 12, 3: 17 };
export const partOfHour = (h: number): 1 | 2 | 3 => (h < 11 ? 1 : h < 15 ? 2 : 3);
/** 티오프로 고를 수 있는 시각의 범위 */
export const TEE_HOUR_MIN = 5, TEE_HOUR_MAX = 19;

const toMin = (hm: string) => +hm.slice(0, 2) * 60 + +hm.slice(3, 5);
const hm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const hourOf = (h: WxHour) => +h.t.slice(8, 10);

/** 18홀을 해 지기 전에 마치려면 이 시각 전에 나가야 한다 — 일몰에서 네 시간 반을 빼고 10분 단위로 내린다 */
export function lastTee18(sunset: string): string {
    const m = toMin(sunset) - ROUND_MINUTES;
    return hm(Math.max(0, Math.floor(m / 10) * 10));
}

/** 그 날 티오프로 고를 수 있는 시각들 — 예보가 있는 시각 가운데 05~19시(나흘째는 세 시간 간격이라 6·9·12·15·18) */
export function teeHours(dayHours: readonly WxHour[]): number[] {
    return [...new Set(dayHours.map(hourOf))].filter((h) => h >= TEE_HOUR_MIN && h <= TEE_HOUR_MAX).sort((a, b) => a - b);
}
/** 고를 수 있는 시각 가운데 원하는 시각에 가장 가까운 것(같으면 이른 쪽). 없으면 null */
export function nearestTee(avail: readonly number[], want: number): number | null {
    if (!avail.length) return null;
    return avail.reduce((best, h) => (Math.abs(h - want) < Math.abs(best - want) ? h : best), avail[0]);
}

export type BriefTone = "good" | "ok" | "rain" | "snow" | "wind" | "cold" | "heat" | "night";
export interface RoundBrief {
    teeHour: number;
    /** 티오프 시각부터 끝날 때까지 — 한 시간 간격이면 여섯 칸 */
    hours: WxHour[];
    /** 앞쪽 몇 칸이 전반인가(나머지는 후반) */
    frontCount: number;
    startTmp: number | null; endTmp: number | null; minTmp: number | null; maxTmp: number | null;
    /** 라운드 중 가장 높은 강수확률 */
    pop: number | null;
    /** 라운드 중 가장 센 바람 m/s — 숫자로 온 시간만. 단계로만 온 날은 wq(1~3) */
    wind: number | null;
    wq?: number;
    /** 라운드 중 비·눈이 예보된 시간이 있으면 가장 센 것 */
    wet: WxKind | null;
    /** 해가 라운드 도중에 진다(박명 20분을 지나서까지 친다) */
    dusk: boolean;
    /** 한 줄 평 — 골퍼 말투. 아래 verdictOf 의 순서로 정한다 */
    verdict: string;
    tone: BriefTone;
    /** 준비물 — 많아도 셋 */
    gear: string[];
}

const WET_RANK: WxKind[] = ["shower", "rain", "sleet", "snow"];

/**
 * 한 줄 평. 위에서부터 먼저 걸리는 것 하나 — 라운드를 가장 크게 바꾸는 것부터 본다:
 * 눈 → 비 → 얼음 → 강풍 → 더위 → 해 → 비 올 수도 → 쌀쌀 → (다 괜찮으면) 라베 날씨 → 무난.
 */
function verdictOf(b: Omit<RoundBrief, "verdict" | "tone" | "gear">): { verdict: string; tone: BriefTone } {
    if (b.wet === "snow" || b.wet === "sleet") return { verdict: "눈 예보, 휴장부터 확인", tone: "snow" };
    if (b.wet || (b.pop ?? 0) >= 60) return { verdict: "우중 라운드", tone: "rain" };
    if (b.minTmp != null && b.minTmp <= 0) return { verdict: b.teeHour < 10 ? "서리 내린 아침" : "언 그린 주의", tone: "cold" };
    if ((b.wind ?? 0) >= 9 || (b.wq ?? 0) >= 3) return { verdict: "바람이 변수", tone: "wind" };
    if (b.maxTmp != null && b.maxTmp >= 31) return { verdict: "한낮 더위", tone: "heat" };
    if (b.dusk) return { verdict: "야간 라운드", tone: "night" };
    if ((b.pop ?? 0) >= 30) return { verdict: "우산은 챙겨요", tone: "ok" };
    // 10° 이하로 시작하면 쌀쌀 — 준비물의 '바람막이'와 같은 선
    if (b.startTmp != null && b.startTmp <= 10) return { verdict: b.teeHour < 10 ? "쌀쌀한 새벽 티" : "쌀쌀한 날", tone: "cold" };
    const calm = (b.wind ?? 0) < 5 && (b.wq ?? 0) <= 1;
    const mild = b.minTmp != null && b.maxTmp != null && b.minTmp >= 10 && b.maxTmp <= 27;
    if (calm && mild) return { verdict: "라베 날씨", tone: "good" };
    return { verdict: "무난한 날씨", tone: "ok" };
}

/** 준비물 — 비·추위·더위·해 순서로, 셋까지 */
function gearOf(b: Omit<RoundBrief, "verdict" | "tone" | "gear">): string[] {
    const out: string[] = [];
    const add = (s: string) => { if (!out.includes(s)) out.push(s); };
    if (b.wet === "snow" || b.wet === "sleet") add("방한 장갑");
    else if (b.wet || (b.pop ?? 0) >= 60) { add("우산·비옷"); add("여벌 장갑"); }
    else if ((b.pop ?? 0) >= 30) add("우산");
    if (b.minTmp != null && b.minTmp <= 3) add("핫팩");
    if (b.startTmp != null && b.startTmp <= 10) add("바람막이");
    // 서늘하게 시작해 9° 넘게 오르는 날 — 바람막이를 권한 날(10° 이하)엔 겹치지 않게 뺀다
    if (b.startTmp != null && b.endTmp != null && b.endTmp - b.startTmp >= 9 && b.startTmp > 10 && b.startTmp <= 14) add("겹쳐 입기");
    if (b.maxTmp != null && b.maxTmp >= 28) add("얼음물");
    if (b.maxTmp != null && b.maxTmp >= 22 && !b.wet && (b.pop ?? 0) < 60 && !b.dusk) add("선크림·모자");
    if (b.dusk) add("라이트 코스 확인");
    return out.slice(0, 3);
}

/**
 * 한 라운드의 브리핑. dayHours 는 그 날의 시간별 예보(오늘이면 남은 시간), teeHour 는 티오프 시각(시).
 * 그 시각의 예보가 없으면 null — 지어내지 않는다.
 */
export function roundBrief(dayHours: readonly WxHour[], teeHour: number, sun: { rise: string; set: string } | null): RoundBrief | null {
    const hours = dayHours.filter((h) => { const hr = hourOf(h); return hr >= teeHour && hr <= teeHour + 5; }).sort((a, b) => (a.t < b.t ? -1 : 1));
    if (!hours.length || hourOf(hours[0]) !== teeHour) return null;
    const temps = hours.map((h) => h.tmp).filter((v): v is number => v != null);
    const pops = hours.map((h) => h.pop).filter((v): v is number => v != null);
    const winds = hours.map((h) => h.wsd).filter((v): v is number => v != null);
    const wqs = hours.map((h) => h.wq).filter((v): v is number => v != null);
    let wet: WxKind | null = null;
    for (const h of hours) if (isWet(h.kind) && (!wet || WET_RANK.indexOf(h.kind) > WET_RANK.indexOf(wet))) wet = h.kind;
    const base: Omit<RoundBrief, "verdict" | "tone" | "gear"> = {
        teeHour, hours, frontCount: Math.ceil(hours.length / 2),
        startTmp: hours[0].tmp, endTmp: hours[hours.length - 1].tmp,
        minTmp: temps.length ? Math.min(...temps) : null, maxTmp: temps.length ? Math.max(...temps) : null,
        pop: pops.length ? Math.max(...pops) : null,
        wind: winds.length ? Math.round(Math.max(...winds) * 10) / 10 : null,
        wet,
        dusk: !!sun && teeHour * 60 + ROUND_MINUTES > toMin(sun.set) + DUSK_MINUTES,
    };
    if (!winds.length && wqs.length) base.wq = Math.max(...wqs);
    return { ...base, ...verdictOf(base), gear: gearOf(base) };
}

// ── 글 한 줄에 붙이는 티타임 날씨(2026-10-05, 조인·부킹 글의 날씨 배지) ─────────────
/**
 * 조인·부킹 글 옆에 붙는 작은 날씨. short = 그 골프장 격자의 그 라운드(앞 나흘), mid = 넓은 지역 예보의 그 날 반나절(시간별이 없다).
 * 글 줄에는 그림 + 티오프 기온 + (비 확률이 30% 이상일 때만) 확률만 보이고, 한 줄 평·근거는 눌렀을 때 쓰는 말이다.
 */
export interface TeeWx {
    kind: WxKind;
    /** 티오프 때 기온 — 넓은 지역 예보에는 없다 */
    tmp: number | null;
    /** 라운드 중(또는 그 반나절) 가장 높은 강수확률 */
    pop: number | null;
    src: "short" | "mid";
    /** 한 줄 평과 근거 — short 만 */
    verdict?: string;
    reason?: string;
}
/** 예보의 시각이 티오프 시각과 이만큼(시간) 넘게 벌어지면 붙이지 않는다 — 나흘째는 세 시간 간격이라 한 시간 반까지는 가장 가까운 칸을 쓴다 */
const TEE_SNAP_HOURS = 2;
/** 그 날의 시간별 예보에서 — 티오프 시각에 가장 가까운 칸으로 그 라운드를 본다. 맞는 칸이 없으면 null */
export function teeWxFromHours(dayHours: readonly WxHour[], teeHour: number, sun: { rise: string; set: string } | null): TeeWx | null {
    const tee = nearestTee(teeHours(dayHours), teeHour);
    if (tee == null || Math.abs(tee - teeHour) > TEE_SNAP_HOURS) return null;
    const b = roundBrief(dayHours, tee, sun);
    if (!b) return null;
    return { kind: b.wet ?? b.hours[0].kind, tmp: b.startTmp, pop: b.pop, src: "short", verdict: b.verdict, reason: briefReason(b) };
}
/** 넓은 지역 예보의 하루에서 — 티오프가 낮 12시 전이면 오전, 아니면 오후 */
export function teeWxFromDay(day: WxDay, teeHour: number): TeeWx | null {
    const half = (teeHour < 12 ? day.am : day.pm) ?? day.pm ?? day.am;
    return half ? { kind: half.kind, tmp: null, pop: half.pop, src: "mid" } : null;
}
/** 글 줄에 적는 말 — "9°", "9° 비 60%", (넓은 지역 예보) "비 40%" 또는 빈 문자열(그림만) */
export function teeWxText(w: TeeWx): string {
    return [w.tmp != null ? `${w.tmp}°` : "", (w.pop ?? 0) >= 30 ? `비 ${w.pop}%` : ""].filter(Boolean).join(" ");
}

/** 근거 숫자 한 줄 — "비 0% · 바람 3m/s · 9°→18°" */
export function briefReason(b: RoundBrief): string {
    const wind = b.wind != null ? `바람 ${b.wind}m/s` : b.wq ? `바람 ${WIND_LEVEL[b.wq]}` : "";
    // 티오프 때 → 끝날 때. 둘이 같으면(한낮 라운드: 19°→21°→19°) 그 사이의 낮은 값~높은 값으로 — "19°" 하나로는 오른 게 안 보인다
    const temp = b.startTmp == null || b.endTmp == null ? ""
        : b.startTmp !== b.endTmp ? `${b.startTmp}°→${b.endTmp}°`
        : b.minTmp != null && b.maxTmp != null && b.minTmp !== b.maxTmp ? `${b.minTmp}°~${b.maxTmp}°` : `${b.startTmp}°`;
    return [`비 ${b.pop ?? 0}%`, wind, temp].filter(Boolean).join(" · ");
}

/** 해 한 줄 — 골프 말로. "해 뜸 06:30 · 해 짐 18:08 · 18홀은 13:30 전에 티오프" */
export function sunLine(sun: { rise: string; set: string }): string {
    return `해 뜸 ${sun.rise} · 해 짐 ${sun.set} · 18홀은 ${lastTee18(sun.set)} 전에 티오프`;
}

/** 검색엔진용 한 줄 — "1부(07시 티오프) 쌀쌀한 새벽 티 — 맑음, 비 0% · 바람 2m/s · 9°→18°" */
export function briefLine(b: RoundBrief): string {
    const sky = b.wet ? WX_LABEL[b.wet] : WX_LABEL[mostSky(b.hours)];
    return `${partOfHour(b.teeHour)}부(${String(b.teeHour).padStart(2, "0")}시 티오프) ${b.verdict} — ${sky}, ${briefReason(b)}`;
}
function mostSky(hours: readonly WxHour[]): WxKind {
    const count: Partial<Record<WxKind, number>> = {};
    for (const h of hours) count[h.kind] = (count[h.kind] ?? 0) + 1;
    let best: WxKind = "clear", n = 0;
    for (const k of ["clear", "partly", "cloudy"] as WxKind[]) if ((count[k] ?? 0) >= n && count[k]) { best = k; n = count[k]!; }
    return best;
}
