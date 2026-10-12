/**
 * 업적 핀(2026-10-12) — 기획서 6.2. 골프장을 새로 가지 않아도 붙는 것.
 *
 * **있는 자료로 틀림없이 판정되는 것만** 연다(지금 스무 개). 판정할 수 없는 핀을 목록에 먼저 걸어 두지 않는다(받을 수 없는 것을 보여 주게 된다).
 *
 * 1차(아홉 개)
 *   첫 도장            골프장에서 18홀을 끝낸 첫 라운드(첫 인증 도장)
 *   10 · 50 · 100 라운드  인증 라운드 횟수
 *   100 · 90 · 80 깨기    정규 18홀(총 파 68 이상)에서 99 · 89 · 79타 이하
 *   전국 한 바퀴        '누구나' 일곱 권역 도장첩에 도장이 하나씩
 *   첫 초대            초대장(회원제) 도장첩의 첫 도장
 * 2차(열한 개 — 자료를 하나씩 확인하고 열었다)
 *   세 달 연속 · 열두 달 개근  한국 날짜의 달마다 인증 라운드가 하나 이상, 잇달아 3 · 12달
 *   하루 36홀           같은 날(한국 날짜)에 끝낸 인증 라운드 둘
 *   새벽 첫 티          라운드를 시작한 때가 오전 7시 전(경기의 started_at — 방을 만든 때가 아니다. 옛 경기는 시작한 때가 없어 세지 않는다)
 *   야간 라운드          밤 8시 뒤에 끝낸 라운드(한국은 한여름에도 그 전에 해가 진다)
 *   첫 버디 · 이글 · 보기 없는 9홀  홀 타수와 그 홀의 파 — 파를 아는 홀에서만. 보기 없는 9홀은 전반이나 후반 아홉 홀의 파를 다 알 때만
 *   풀조              같은 라운드에서 넷이 다 인증 기록을 받았다
 *   새 동반자           같이 인증 라운드를 끝낸 회원이 열 명
 *   라운드 사진          내가 올린 라운드 사진 열 장(가려진 사진은 빼고)
 * 아직 열지 않은 것: 니어핀(기록이 쌓이는 곳이 없다) · 긴급 조인 · 첫 원정(라운드와 이어져 있지 않다) · 첫 금테(도장 깊이가 먼저) · 우중 · 한여름 · 한겨울(지난 시각의 날씨).
 *
 * 규칙 둘:
 *  - **인증 라운드만.** 집에서 적은 기록으로는 붙지 않는다(도장과 같다 — shared/golfOnSite).
 *  - **타수 핀은 총 파를 아는 라운드만.** 파3 코스의 18홀 70타가 '80 깨기'가 되지 않게 총 파 68 이상을 본다. 파 자료가 없는 코스(6%쯤)의
 *    라운드는 자료가 채워진 뒤 다음에 기록이 바뀔 때 붙는다(받은 날은 그 라운드의 날).
 *
 * 받은 기록은 도장첩과 같은 표(golf_stamp_awards, kind 'pin')에 적는다 — 순번은 그 핀을 받은 순서.
 * ⚠️ 서버가 임포트하는 shared 파일 — 상대 임포트는 반드시 './x.js'.
 */
import { bookStates } from "./golfStampBooks.js";
import type { DatedStamp } from "./golfStampAwards.js";

export type GolfPinId =
    | "first-stamp" | "rounds-10" | "rounds-50" | "rounds-100" | "break-100" | "break-90" | "break-80" | "tour-korea" | "first-invite"
    | "streak-3" | "streak-12" | "day-36" | "sunrise" | "night" | "birdie" | "eagle" | "clean-9" | "full-group" | "companions-10" | "photos-10";

export interface GolfPin {
    id: GolfPinId;
    name: string;
    /** 받는 조건 한 줄 */
    how: string;
    /** 그림 파일의 이름(client/public/golf/stamp-art/<art>.webp) */
    art: string;
    /** 그림의 빈 판에 코드가 얹는 숫자(타수 핀) */
    num?: string;
}

/** 장식장에 놓이는 순서 */
export const GOLF_PINS: readonly GolfPin[] = [
    { id: "first-stamp", name: "첫 도장", how: "골프장에서 18홀을 끝낸 첫 라운드", art: "pin-tee" },
    { id: "rounds-10", name: "10 라운드", how: "인증 라운드 10번", art: "pin-shoe" },
    { id: "rounds-50", name: "50 라운드", how: "인증 라운드 50번", art: "pin-glove" },
    { id: "rounds-100", name: "100 라운드", how: "인증 라운드 100번", art: "pin-bag" },
    { id: "streak-3", name: "세 달 연속", how: "석 달 내리 인증 라운드", art: "pin-calendar" },
    { id: "streak-12", name: "열두 달 개근", how: "열두 달 내리 인증 라운드", art: "pin-twelve" },
    { id: "day-36", name: "하루 36홀", how: "하루에 두 라운드", art: "pin-36" },
    { id: "sunrise", name: "새벽 첫 티", how: "오전 7시 전에 시작한 라운드", art: "pin-sunrise" },
    { id: "night", name: "야간 라운드", how: "밤 8시 뒤에 끝낸 라운드", art: "pin-moon" },
    { id: "birdie", name: "첫 버디", how: "버디 하나", art: "pin-birdie" },
    { id: "eagle", name: "이글", how: "이글 하나", art: "pin-eagle" },
    { id: "clean-9", name: "보기 없는 9홀", how: "전반이나 후반을 보기 없이", art: "pin-card" },
    { id: "break-100", name: "100 깨기", how: "정규 18홀 99타 이하", art: "pin-break", num: "100" },
    { id: "break-90", name: "90 깨기", how: "정규 18홀 89타 이하", art: "pin-break-silver", num: "90" },
    { id: "break-80", name: "80 깨기", how: "정규 18홀 79타 이하", art: "pin-break-gold", num: "80" },
    { id: "full-group", name: "풀조", how: "넷이 다 인증한 라운드", art: "pin-four" },
    { id: "companions-10", name: "새 동반자", how: "같이 친 회원 열 명", art: "pin-handshake" },
    { id: "photos-10", name: "라운드 사진", how: "라운드 사진 열 장", art: "pin-camera" },
    { id: "tour-korea", name: "전국 한 바퀴", how: "일곱 권역 도장첩에 도장 하나씩", art: "pin-eight" },
    { id: "first-invite", name: "첫 초대", how: "초대장 도장첩의 첫 도장", art: "pin-envelope" },
];
export const golfPin = (id: string): GolfPin | undefined => GOLF_PINS.find((p) => p.id === id);

/** 라운드 수 핀 */
export const PIN_ROUND_STEPS: readonly [GolfPinId, number][] = [["rounds-10", 10], ["rounds-50", 50], ["rounds-100", 100]];
/** 타수 핀 — 이 타수 이하 */
export const PIN_BREAKS: readonly [GolfPinId, number][] = [["break-100", 99], ["break-90", 89], ["break-80", 79]];
/** 타수 핀이 보는 정규 코스의 총 파 */
export const PIN_MIN_PAR = 68;
/** 타수 핀의 후보 — 이 타수를 넘는 라운드는 총 파를 찾을 일이 없다 */
export const PIN_BREAK_MAX = PIN_BREAKS[0][1];

/** 잇달아 친 달 핀 */
export const PIN_STREAKS: readonly [GolfPinId, number][] = [["streak-3", 3], ["streak-12", 12]];
/** 새벽 첫 티 — 한국 시각 이 시 전에 시작(4시부터 — 한밤의 시각은 기록 오류로 본다) */
export const PIN_SUNRISE_BEFORE = 7;
export const PIN_SUNRISE_FROM = 4;
/** 야간 라운드 — 한국 시각 이 시부터 끝낸 라운드 */
export const PIN_NIGHT_FROM = 20;
/** 풀조 — 나 말고 같은 라운드의 인증 회원 수 */
export const PIN_FULL_MATES = 3;
export const PIN_COMPANIONS = 10;
export const PIN_PHOTOS = 10;

/** 인증 라운드 하나(넘기는 쪽이 인증된 것만 준다) */
export interface PinRound {
    /** 라운드를 끝낸 때 */
    at: Date | string | number;
    /** 18홀 타수 */
    score: number | null;
    /** 그 라운드의 총 파 — 18홀을 다 알 때만. 모르면 null */
    par: number | null;
    /** 라운드를 시작한 때(경기의 started_at) — 모르면 null(옛 경기 · 경기 번호가 없는 기록) */
    startAt?: Date | string | number | null;
    /** 홀마다 타수(18칸) — 모르면 null */
    strokes?: readonly (number | null)[] | null;
    /** 홀마다 파(18칸) — 모르는 홀은 null */
    pars?: readonly (number | null)[] | null;
    /** 같은 라운드에서 인증 기록을 받은 다른 회원(나 빼고) */
    mates?: readonly string[];
}

export interface PinDue { id: GolfPinId; earnedAt: number }

const ms = (v: Date | string | number): number => (v instanceof Date ? v.getTime() : typeof v === "number" ? v : new Date(v).getTime());
// 한국 날짜 · 시각(달의 경계 · 하루 · 새벽과 밤은 한국 시계로 본다) — Date 의 지역 시간대를 쓰지 않는다(서버는 UTC 다)
const KST = 9 * 3600_000;
const kstDay = (t: number) => Math.floor((t + KST) / 86_400_000);
const kstHour = (t: number) => new Date(t + KST).getUTCHours();
const kstMonth = (t: number) => { const d = new Date(t + KST); return d.getUTCFullYear() * 12 + d.getUTCMonth(); };
const holeOk = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1;

/**
 * 인증 라운드 + 인증 도장 → 지금까지 받았어야 할 핀 전부(받은 순서).
 * 받은 때는 그 조건을 처음 채운 라운드 · 도장의 때다.
 */
export function pinsDue(rounds: readonly PinRound[], stamps: readonly DatedStamp[], photoTimes: readonly (Date | string | number)[] = []): PinDue[] {
    const out: PinDue[] = [];
    const rs = rounds.map((r) => ({
        at: ms(r.at), score: r.score, par: r.par,
        startAt: r.startAt == null ? null : ms(r.startAt),
        strokes: r.strokes ?? null, pars: r.pars ?? null, mates: r.mates ?? [],
    })).filter((r) => Number.isFinite(r.at)).sort((a, b) => a.at - b.at);
    const ss = stamps.filter((s) => Number.isFinite(ms(s.firstDate)));

    // 첫 도장 — 골프장을 아는 첫 인증 라운드
    if (ss.length > 0) out.push({ id: "first-stamp", earnedAt: Math.min(...ss.map((s) => ms(s.firstDate))) });

    // 라운드 수 — N 번째 인증 라운드를 끝낸 날
    for (const [id, n] of PIN_ROUND_STEPS) if (rs.length >= n) out.push({ id, earnedAt: rs[n - 1].at });

    // 타수 — 정규 18홀(총 파를 아는 라운드)에서 처음 그 타수 이하를 친 날
    for (const [id, max] of PIN_BREAKS) {
        const hit = rs.find((r) => r.score != null && r.score > 0 && r.score <= max && r.par != null && r.par >= PIN_MIN_PAR);
        if (hit) out.push({ id, earnedAt: hit.at });
    }

    // 잇달아 친 달 — 달마다 첫 인증 라운드, 잇달아 N 달이 된 그 달의 첫 라운드가 받은 날
    const monthFirst = new Map<number, number>();
    for (const r of rs) { const m = kstMonth(r.at); if (!monthFirst.has(m)) monthFirst.set(m, r.at); }
    const months = [...monthFirst.keys()].sort((a, b) => a - b);
    for (const [id, n] of PIN_STREAKS) {
        let run = 0;
        for (let i = 0; i < months.length; i++) {
            run = i > 0 && months[i] === months[i - 1] + 1 ? run + 1 : 1;
            if (run >= n) { out.push({ id, earnedAt: monthFirst.get(months[i])! }); break; }
        }
    }

    // 하루 36홀 — 같은 날의 둘째 라운드를 끝낸 때
    const perDay = new Map<number, number>();
    for (const r of rs) {
        const d = kstDay(r.at), n = (perDay.get(d) ?? 0) + 1;
        perDay.set(d, n);
        if (n === 2) { out.push({ id: "day-36", earnedAt: r.at }); break; }
    }

    // 새벽 첫 티 · 야간 라운드 — 시작한 때 · 끝낸 때의 한국 시각
    const early = rs.find((r) => r.startAt != null && Number.isFinite(r.startAt) && kstHour(r.startAt) >= PIN_SUNRISE_FROM && kstHour(r.startAt) < PIN_SUNRISE_BEFORE);
    if (early) out.push({ id: "sunrise", earnedAt: early.at });
    const late = rs.find((r) => kstHour(r.at) >= PIN_NIGHT_FROM);
    if (late) out.push({ id: "night", earnedAt: late.at });

    // 홀 타수 — 파를 아는 홀에서만
    const holes = (r: (typeof rs)[number]) => (r.strokes && r.pars && r.strokes.length === 18 && r.pars.length === 18 ? r.strokes.map((s, i) => ({ s, p: r.pars![i] })) : null);
    const under = (n: number) => (r: (typeof rs)[number]) => !!holes(r)?.some(({ s, p }) => holeOk(s) && holeOk(p) && (n === 1 ? s === p - 1 : s <= p - 2));
    const birdie = rs.find(under(1));
    if (birdie) out.push({ id: "birdie", earnedAt: birdie.at });
    const eagle = rs.find(under(2));
    if (eagle) out.push({ id: "eagle", earnedAt: eagle.at });
    const clean = rs.find((r) => { const h = holes(r); return !!h && [h.slice(0, 9), h.slice(9)].some((nine) => nine.every(({ s, p }) => holeOk(s) && holeOk(p) && s <= p)); });
    if (clean) out.push({ id: "clean-9", earnedAt: clean.at });

    // 동반자 — 같은 라운드의 다른 인증 회원
    const full = rs.find((r) => new Set(r.mates).size >= PIN_FULL_MATES);
    if (full) out.push({ id: "full-group", earnedAt: full.at });
    const met = new Set<string>();
    for (const r of rs) {
        for (const m of r.mates) met.add(m);
        if (met.size >= PIN_COMPANIONS) { out.push({ id: "companions-10", earnedAt: r.at }); break; }
    }

    // 라운드 사진 — 열 번째 사진을 올린 때
    const shots = photoTimes.map(ms).filter(Number.isFinite).sort((a, b) => a - b);
    if (shots.length >= PIN_PHOTOS) out.push({ id: "photos-10", earnedAt: shots[PIN_PHOTOS - 1] });

    // 도장첩 — 권마다 가장 먼저 찍은 날
    const states = bookStates(ss);
    const firstIn = (st: (typeof states)[number]) => { const d = st.slots.filter((x) => x.stamp).map((x) => ms(x.stamp!.firstDate)); return d.length ? Math.min(...d) : null; };
    const open = states.filter((s) => s.book.kind === "open").map(firstIn);
    if (open.length > 0 && open.every((d) => d != null)) out.push({ id: "tour-korea", earnedAt: Math.max(...(open as number[])) });
    const invite = states.filter((s) => s.book.kind === "invite").map(firstIn).filter((d): d is number => d != null);
    if (invite.length > 0) out.push({ id: "first-invite", earnedAt: Math.min(...invite) });

    return out.sort((a, b) => a.earnedAt - b.earnedAt);
}
