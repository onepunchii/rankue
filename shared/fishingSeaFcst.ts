/**
 * 바다 예보(2026-10-17 — 오너가 신청해 준 '기상청_단기예보 통보문 조회서비스'의 해상예보 getSeaFcst).
 * 오늘의 바다에서 바다를 고르면 그 해역의 반나절 예보(오늘 오후 · 내일 오전 …)를 물결 · 바람 · 날씨로 보인다.
 *
 * 구역 코드: 앞 다섯 자리가 중기해상예보의 해역 코드(12A20 서해중부 · 12B20 남해동부 … — 운영에서 확인)와 같은 하위 구역이고,
 * 2026-10-17 실측으로 일곱 곳 모두 값이 온다(12A20200 같은 다른 번호는 NO_DATA). 제주도는 12B10300(네이트 바다날씨의 같은 코드).
 * 반나절의 이름은 발표 시각(tmFc)으로 센다 — 05시 발표면 첫 칸이 오늘 오전, 11시면 오늘 오후, 17시면 오늘 밤, 그다음은 오전 · 오후로 이어진다.
 * ⚠️ "나가도 된다"고 말하지 않는다(오늘의 바다와 같은 선) — 예보 값을 그대로 적는다.
 * ⚠️ 서버가 부른다 — 상대 임포트는 ./x.js.
 */
import { windDirName } from "./windDir.js";

export const SEA_FCST_REG: Readonly<Record<string, string>> = {
    "west-mid": "12A20100",
    "west-south": "12A30100",
    "south-west": "12B10100",
    "south-east": "12B20100",
    jeju: "12B10300",
    "east-mid": "12C20100",
    "east-south": "12C10100",
};
export const SEA_FCST_SOURCE = "기상청 해상예보";

export interface SeaFcstSlot {
    /** "2026-10-17|pm" */
    key: string;
    /** "오늘 오후" · "내일 오전" · "토 오전" */
    label: string;
    wf: string;
    rain: boolean;
    waveMin: number | null;
    waveMax: number | null;
    windFrom: string | null;
    windTo: string | null;
    windMin: number | null;
    windMax: number | null;
}
export interface SeaFcst { area: string; issued: string | null; slots: SeaFcstSlot[] }

const num = (v: unknown): number | null => { const n = Number(v); return v == null || v === "" || !Number.isFinite(n) ? null : n; };
const DAY_WORD = ["오늘", "내일", "모레"];
const DOW = ["일", "월", "화", "수", "목", "금", "토"];

/** KST 날짜(YYYY-MM-DD) 더하기 */
function addDay(ymd: string, n: number): string {
    const t = Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000;
    return new Date(t).toISOString().slice(0, 10);
}
export const kstYmd = (ms: number) => new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);

/** 발표 시각 + 순번 → 그 칸의 날 · 반나절(am · pm · night) */
export function slotOf(tmFc: string, numEf: number): { day: string; part: "am" | "pm" | "night" } | null {
    const m = /^(\d{4})(\d{2})(\d{2})(\d{2})/.exec(String(tmFc));
    if (!m || !Number.isInteger(numEf) || numEf < 0) return null;
    const day0 = `${m[1]}-${m[2]}-${m[3]}`, hour = Number(m[4]);
    if (hour >= 17) {
        if (numEf === 0) return { day: day0, part: "night" };
        const k = numEf - 1;
        return { day: addDay(day0, 1 + Math.floor(k / 2)), part: k % 2 === 0 ? "am" : "pm" };
    }
    const start = hour >= 11 ? 1 : 0; // 0 = 오늘 오전부터 · 1 = 오늘 오후부터
    const k = start + numEf;
    return { day: addDay(day0, Math.floor(k / 2)), part: k % 2 === 0 ? "am" : "pm" };
}

/** 칸 이름 — 오늘 · 내일 · 모레, 그 뒤로는 요일 */
export function slotLabel(day: string, part: "am" | "pm" | "night", todayYmd: string): string {
    const diff = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${todayYmd}T00:00:00Z`)) / 86_400_000);
    const d = diff >= 0 && diff < DAY_WORD.length ? DAY_WORD[diff] : DOW[new Date(`${day}T12:00:00Z`).getUTCDay()];
    return `${d} ${part === "am" ? "오전" : part === "pm" ? "오후" : "밤"}`;
}

/** 그 칸이 끝나는 때(UTC ms) */
export function slotEndMs(day: string, part: "am" | "pm" | "night"): number {
    const h = part === "am" ? 12 : part === "pm" ? 18 : 30;
    return Date.parse(`${day}T00:00:00Z`) + (h - 9) * 3600_000;
}

/** API 줄들 → 지난 칸은 빼고 앞에서부터 */
export function parseSeaFcst(area: string, items: readonly Record<string, unknown>[], nowMs: number): SeaFcst {
    const today = kstYmd(nowMs);
    let issued: string | null = null;
    const slots: SeaFcstSlot[] = [];
    for (const x of [...items].sort((a, b) => Number(a.numEf) - Number(b.numEf))) {
        const tm = String(x.tmFc ?? "");
        const s = slotOf(tm, Number(x.numEf));
        if (!s) continue;
        if (!issued && /^\d{12}$/.test(tm)) issued = `${Number(tm.slice(4, 6))}/${Number(tm.slice(6, 8))} ${Number(tm.slice(8, 10))}시`;
        // 이미 끝난 칸은 뺀다 — 오전은 12시 · 오후는 18시 · 밤은 다음 날 6시(한국 시각)에 끝난다
        if (slotEndMs(s.day, s.part) <= nowMs) continue;
        const w1 = num(x.wh1), w2 = num(x.wh2), s1 = num(x.ws1), s2 = num(x.ws2);
        slots.push({
            key: `${s.day}|${s.part}`, label: slotLabel(s.day, s.part, today), wf: String(x.wf ?? "").trim(),
            rain: Number(x.rnYn) > 0 || /비|눈|소나기/.test(String(x.wf ?? "")),
            waveMin: w1 != null && w2 != null ? Math.min(w1, w2) : w1 ?? w2, waveMax: w1 != null && w2 != null ? Math.max(w1, w2) : w2 ?? w1,
            windFrom: typeof x.wd1 === "string" ? x.wd1 : null, windTo: typeof x.wd2 === "string" ? x.wd2 : null,
            windMin: s1 != null && s2 != null ? Math.min(s1, s2) : s1 ?? s2, windMax: s1 != null && s2 != null ? Math.max(s1, s2) : s2 ?? s1,
        });
    }
    return { area, issued, slots };
}

/** "0.5–2m" */
export const waveText = (s: Pick<SeaFcstSlot, "waveMin" | "waveMax">) =>
    s.waveMin == null && s.waveMax == null ? "–" : s.waveMin === s.waveMax || s.waveMin == null || s.waveMax == null ? `${s.waveMax ?? s.waveMin}m` : `${s.waveMin}–${s.waveMax}m`;
/** "남동 → 남" */
export function windDirText(s: Pick<SeaFcstSlot, "windFrom" | "windTo">): string {
    const a = windDirName(s.windFrom), b = windDirName(s.windTo);
    return a && b && a !== b ? `${a} → ${b}` : a ?? b ?? "";
}
/** "5–12m/s" */
export function windSpeedText(s: Pick<SeaFcstSlot, "windMin" | "windMax">): string {
    return s.windMin == null && s.windMax == null ? "" : s.windMin === s.windMax || s.windMin == null || s.windMax == null ? `${s.windMax ?? s.windMin}m/s` : `${s.windMin}–${s.windMax}m/s`;
}
/** "남동 → 남 · 5–12m/s" */
export function windText(s: Pick<SeaFcstSlot, "windFrom" | "windTo" | "windMin" | "windMax">): string {
    return [windDirText(s), windSpeedText(s)].filter(Boolean).join(" · ");
}
/** 물결의 높이로 칸의 색을 고른다 — 점수가 아니라 값의 크기(앞바다 기준: 1.5m 미만 · 1.5~3m · 3m 이상) */
export function waveLevel(s: Pick<SeaFcstSlot, "waveMax">): "calm" | "mid" | "high" {
    const w = s.waveMax ?? 0;
    return w >= 3 ? "high" : w >= 1.5 ? "mid" : "calm";
}
