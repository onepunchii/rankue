/**
 * 물때(2026-10-14) — 낚시꾼이 날마다 먼저 보는 것. 음력 날짜로 센다(바깥 자료가 필요 없다).
 *
 *  - 서해는 7물때식: 음력 1일 7물 … 7일 13물 · 8일 조금 · 9일 무시 · 10일 1물 … 15일 6물.
 *  - 남해 · 동해 · 제주는 8물때식: 하나씩 늦다 — 1일 8물 … 7일 14물 · 8일 조금 · 9일 1물 … 15일 7물(무시가 없다).
 *  - 29일까지뿐인 달은 30일을 건너뛴다(29일 다음이 1일).
 * 확인한 곳: 바다타임 동해항 2025년 9월 · 서귀포 2024년 4월 표(shared/fishingTide.test.ts 에 그대로 박아 둠).
 *
 * ⚠️ 음력은 반드시 **한국 달력**(Intl 의 dangi)으로 센다. chinese 는 합삭이 자정 근처인 달에 하루 어긋난다
 *    (2026-10-14: dangi 9월 4일 = 서해 10물 · chinese 9월 5일 = 11물로 틀림).
 * ⚠️ 여기서 말하는 것은 물의 세기뿐이다. 만조 · 간조 시각은 항구마다 다르고(국립해양조사원), 잘 낚인다는 말은 하지 않는다.
 * ⚠️ 서버도 부를 수 있게 상대 임포트는 ./x.js 로(지금은 임포트가 없다).
 */

export type TideSea = "west" | "south";
export const TIDE_SEAS: readonly { id: TideSea; name: string; note: string }[] = [
    { id: "west", name: "서해", note: "7물때" },
    { id: "south", name: "남해 · 동해 · 제주", note: "8물때" },
];

let lunarFmt: Intl.DateTimeFormat | null | undefined;
function fmt(): Intl.DateTimeFormat | null {
    if (lunarFmt !== undefined) return lunarFmt;
    try {
        const f = new Intl.DateTimeFormat("ko-KR-u-ca-dangi", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" });
        // 한국 달력을 모르는 기기는 다른 달력으로 물러선다 — 그러면 틀린 물때를 내느니 아무것도 내지 않는다
        lunarFmt = f.resolvedOptions().calendar === "dangi" ? f : null;
    } catch { lunarFmt = null; }
    return lunarFmt;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const noon = (ymd: string) => Date.parse(`${ymd}T03:00:00Z`); // 한국 낮 12시
export function tideAddDays(ymd: string, n: number): string {
    return new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** 그날(한국 날짜)의 음력 월 · 일. 윤달이면 leap. 달력을 못 쓰는 기기는 null */
export function lunarDay(ymd: string): { month: number; day: number; leap: boolean } | null {
    const f = fmt();
    if (!f || !DAY.test(ymd) || Number.isNaN(noon(ymd))) return null;
    const parts = f.formatToParts(new Date(noon(ymd)));
    const raw = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const month = Number(raw("month").replace(/\D/g, "")), day = Number(raw("day").replace(/\D/g, ""));
    if (!(month >= 1 && month <= 12) || !(day >= 1 && day <= 30)) return null;
    return { month, day, leap: /윤|bis|L/i.test(raw("month")) };
}

/** 음력 날짜 → 물때 이름 */
export function tideName(day: number, sea: TideSea): string {
    const i = ((day + (sea === "west" ? 5 : 6)) % 15) + 1; // 1..15
    if (sea === "west") return i <= 13 ? `${i}물` : i === 14 ? "조금" : "무시";
    return i <= 14 ? `${i}물` : "조금";
}

export type TidePhase = "neap" | "rising" | "spring" | "falling";
/** 물의 세기를 말로 — 낚시꾼이 쓰는 말(산 물 · 죽는 물) */
export const TIDE_PHASE_TEXT: Readonly<Record<TidePhase, string>> = {
    neap: "물이 거의 안 가는 날",
    rising: "물이 살아나는 날",
    spring: "물이 세게 가는 날",
    falling: "물이 죽어 가는 날",
};

export interface Tide {
    ymd: string;
    lunar: { month: number; day: number; leap: boolean };
    name: string;
    /** 사리(보름 · 그믐) · 조금(반달)인 날에만 */
    mark: "사리" | "조금" | null;
    phase: TidePhase;
    /** 물의 세기 0(조금)~1(사리 뒤 하루쯤) — 띠의 높이에만 쓴다 */
    flow: number;
}

export function tideOf(ymd: string, sea: TideSea): Tide | null {
    const lunar = lunarDay(ymd);
    if (!lunar) return null;
    const d = lunar.day;
    const k = (d + 22) % 15; // 조금(8일 · 23일)부터 며칠째인가 0..14
    // 그믐사리: 30일. 29일까지뿐인 달이면 그 다음 날인 1일에 건다
    const shortMonth = d === 1 && lunarDay(tideAddDays(ymd, -1))?.day === 29;
    return {
        ymd, lunar, name: tideName(d, sea),
        mark: d === 15 || d === 30 || shortMonth ? "사리" : d === 8 || d === 23 ? "조금" : null,
        phase: k <= 1 ? "neap" : k <= 5 ? "rising" : k <= 9 ? "spring" : "falling",
        flow: Math.round((0.5 - 0.5 * Math.cos((2 * Math.PI * k) / 15)) * 100) / 100,
    };
}

/** 그날부터 n일 */
export function tideDays(ymd: string, sea: TideSea, n = 7): Tide[] {
    const out: Tide[] = [];
    for (let i = 0; i < n; i++) { const t = tideOf(tideAddDays(ymd, i), sea); if (t) out.push(t); }
    return out;
}

/** 앞으로 가장 가까운 사리 · 조금까지 며칠(오늘이면 0). 보름 안에 없으면 null */
export function nextTideMark(ymd: string, mark: "사리" | "조금"): { ymd: string; inDays: number } | null {
    for (let i = 0; i < 16; i++) {
        const day = tideAddDays(ymd, i);
        if (tideOf(day, "west")?.mark === mark) return { ymd: day, inDays: i };
    }
    return null;
}

export interface TideTally { total: number; byPhase: Record<TidePhase, number>; /** 가장 많이 나온 날의 갈래 — 셋 넘게 쌓이고 혼자 앞설 때만 */ top: TidePhase | null }
/** 내 조과가 어떤 물에 나왔는가 — 물때가 붙은 줄만 센다(민물 · 옛 줄은 빠진다). 내 기록을 세는 것이지 예보가 아니다 */
export function tideTally(list: readonly { day: string; tideSea?: TideSea | null }[]): TideTally {
    const byPhase: Record<TidePhase, number> = { neap: 0, rising: 0, spring: 0, falling: 0 };
    let total = 0;
    for (const c of list) {
        const t = c.tideSea ? tideOf(c.day, c.tideSea) : null;
        if (t) { byPhase[t.phase] += 1; total += 1; }
    }
    const max = Math.max(...Object.values(byPhase));
    const tops = (Object.keys(byPhase) as TidePhase[]).filter((p) => byPhase[p] === max);
    return { total, byPhase, top: total >= 3 && tops.length === 1 ? tops[0] : null };
}

const WEEK = ["일", "월", "화", "수", "목", "금", "토"] as const;
export const tideWeekday = (ymd: string): string => WEEK[new Date(Date.parse(`${ymd}T00:00:00Z`)).getUTCDay()];
