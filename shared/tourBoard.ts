/**
 * 대회 허브의 '일정판'(2026-10-19 디자이너 리뷰) — 앞으로 몇 주의 대회를 리그별 줄에 막대로 깐다.
 * 당구대 한 장처럼: 위 레일에 주마다 다이아몬드(포인트), 공 색이 리그(PBA 흰 공 · LPBA 노란 공 · UMB 빨간 공 · 팀리그 초크 파랑 · 드림투어 빈 공).
 * 계산만 여기(시험이 붙는다) — 창(이번 주 월요일부터 n주) · 줄 · 막대 위치(0~1) · 짧은 이름 · 이름을 막대 안/옆/생략 중 어디에.
 * 날짜는 모두 한국 날짜 'YYYY-MM-DD'(UTC 자정으로 셈) — 서버가 준 today 를 그대로 쓴다.
 */
import type { PbaTourLeague, UpcomingEvent } from "./tournamentMeta.js";

export type BoardLane = PbaTourLeague | "UMB";
/** 줄 차례 — 큰 투어가 위, 세계 대회는 맨 아래 */
export const BOARD_LANES: readonly BoardLane[] = ["PBA", "LPBA", "TEAM", "DREAM", "CHALLENGE", "UMB"];

const DAY = 86_400_000;
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** 그 주 월요일 */
export function weekStart(today: string): string {
    const t = ms(today);
    return iso(t - ((new Date(t).getUTCDay() + 6) % 7) * DAY);
}

export interface BoardBar {
    lane: BoardLane;
    event: UpcomingEvent;
    /** 창 안의 위치(0~1) — 끝날은 그날 저녁까지라 +1일 */
    from: number;
    to: number;
    /** 창 밖으로 이어지는 쪽 — 그쪽 모서리를 둥글리지 않는다 */
    cutL: boolean;
    cutR: boolean;
    live: boolean;
}

export interface BoardLayout {
    start: string;
    days: number;
    lanes: BoardLane[];
    bars: BoardBar[];
    /** 오늘 한가운데 */
    todayX: number;
    /** 다이아몬드 — 창 안의 월요일들(맨 왼쪽 제외) */
    ticks: number[];
    /** 달 이름 — 창 첫날의 달 + 창 안에서 1일이 되는 달 */
    months: { x: number; month: number; year: number }[];
}

export const laneOf = (e: Pick<UpcomingEvent, "source" | "league">): BoardLane => (e.source === "UMB" ? "UMB" : e.league ?? "PBA");

/** 이번 주 월요일부터 weeks 주 — 창과 겹치는 대회만 막대로 */
export function boardLayout(events: readonly UpcomingEvent[], today: string, weeks: number): BoardLayout {
    const start = weekStart(today);
    const days = weeks * 7;
    const s = ms(start), e = s + days * DAY;
    const bars: BoardBar[] = [];
    for (const ev of events) {
        const a = ms(ev.startDate), b = ms(ev.endDate) + DAY;
        if (!(a < e && b > s) || b <= a) continue;
        bars.push({
            lane: laneOf(ev), event: ev,
            from: Math.max(0, (a - s) / (days * DAY)), to: Math.min(1, (b - s) / (days * DAY)),
            cutL: a < s, cutR: b > e,
            live: ev.startDate <= today && today <= ev.endDate,
        });
    }
    const lanes = BOARD_LANES.filter((l) => bars.some((x) => x.lane === l));
    bars.sort((x, y) => BOARD_LANES.indexOf(x.lane) - BOARD_LANES.indexOf(y.lane) || x.from - y.from);
    const ticks = Array.from({ length: weeks - 1 }, (_, i) => ((i + 1) * 7) / days);
    const months: BoardLayout["months"] = [];
    const first = new Date(s);
    months.push({ x: 0, month: first.getUTCMonth() + 1, year: first.getUTCFullYear() });
    for (let d = 1; d < days; d++) {
        const t = new Date(s + d * DAY);
        if (t.getUTCDate() === 1) months.push({ x: d / days, month: t.getUTCMonth() + 1, year: t.getUTCFullYear() });
    }
    return { start, days, lanes, bars, todayX: (ms(today) - s + DAY / 2) / (days * DAY), ticks, months };
}

/** 막대에 붙일 짧은 이름 — 뜻만 고르고 글은 화면이 언어별로 만든다 */
export type BoardLabel =
    | { k: "leg"; n: number }
    | { k: "round"; n: number }
    | { k: "final"; n: number }
    | { k: "post" }
    | { k: "world" }
    | { k: "sponsor"; text: string }
    | { k: "city"; city: string }
    | { k: "country"; code: string }
    | { k: "none" };

export function boardLabel(e: Pick<UpcomingEvent, "source" | "league" | "title" | "titleEn" | "place" | "countryCode">, locale = "ko"): BoardLabel {
    if (e.source === "UMB") return e.place ? { k: "city", city: e.place } : e.countryCode ? { k: "country", code: e.countryCode } : { k: "none" };
    const t = e.title;
    if (/포스트\s*시즌/.test(t)) return { k: "post" };
    const round = t.match(/(\d+)\s*라운드/);
    if (round) return { k: "round", n: Number(round[1]) };
    if (/월드\s*챔피언십/.test(t)) return { k: "world" };
    const dream = t.match(/(\d+)\s*차전/);
    if (dream) return /파이널/.test(t) ? { k: "final", n: Number(dream[1]) } : { k: "leg", n: Number(dream[1]) };
    const leg = t.match(/제\s*(\d+)\s*차/);
    if (leg) return { k: "leg", n: Number(leg[1]) };
    // 스폰서 대회 — 리그 이름 바로 앞 낱말("… NH농협카드 LPBA 챔피언십 26-27" → NH농협카드)
    // 영어 이름은 마지막 낱말만이면 'Card'처럼 뜻이 없어 두 낱말까지("Nonghyup Card" · "Crown Haitai") — 16자를 넘으면 하나
    const en = locale !== "ko" && !!e.titleEn;
    const src = en ? e.titleEn! : t;
    const before = src.split(/\s+L?PBA\b/)[0]?.trim();
    if (!before || before === src.trim()) return { k: "none" };
    const words = before.split(/\s+/);
    const two = words.slice(-2).join(" ");
    return { k: "sponsor", text: en && words.length > 1 && two.length <= 16 ? two : words[words.length - 1] };
}

/** 12px 글자 폭 어림 — 한글 · 한자 12, 그 밖 7 */
export const labelPx = (s: string) => Array.from(s).reduce((w, ch) => w + (/[ᄀ-ᇿ㄰-㆏가-힯一-鿿]/.test(ch) ? 12 : 7), 0);

/**
 * 이름 자리 — 막대 안에 들어가면 안, 아니면 같은 줄 다음 막대(또는 판 끝)까지 빈자리가 있으면 오른쪽, 그것도 없으면 생략.
 * barPx: 막대 폭 · gapPx: 막대 끝에서 다음 막대(판 끝)까지
 */
export function labelSpot(text: string, barPx: number, gapPx: number): "in" | "right" | "none" {
    const w = labelPx(text);
    if (!text) return "none";
    if (barPx - 8 >= w) return "in";
    if (gapPx - 8 >= w) return "right";
    return "none";
}
