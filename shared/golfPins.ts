/**
 * 업적 핀(2026-10-12) — 기획서 6.2. 골프장을 새로 가지 않아도 붙는 것.
 *
 * 1차: **지금 있는 자료로 틀림없이 판정되는 아홉 개**만 연다. 나머지(시각 · 홀 타수 · 동반자 · 날씨 · 원정)는 자료를 하나씩 확인하며 붙인다 —
 * 판정할 수 없는 핀을 목록에 먼저 걸어 두지 않는다(받을 수 없는 것을 보여 주게 된다).
 *
 *   첫 도장            골프장에서 18홀을 끝낸 첫 라운드(첫 인증 도장)
 *   10 · 50 · 100 라운드  인증 라운드 횟수
 *   100 · 90 · 80 깨기    정규 18홀(총 파 68 이상)에서 99 · 89 · 79타 이하
 *   전국 한 바퀴        '누구나' 일곱 권역 도장첩에 도장이 하나씩
 *   첫 초대            초대장(회원제) 도장첩의 첫 도장
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

export type GolfPinId = "first-stamp" | "rounds-10" | "rounds-50" | "rounds-100" | "break-100" | "break-90" | "break-80" | "tour-korea" | "first-invite";

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
    { id: "break-100", name: "100 깨기", how: "정규 18홀 99타 이하", art: "pin-break", num: "100" },
    { id: "break-90", name: "90 깨기", how: "정규 18홀 89타 이하", art: "pin-break-silver", num: "90" },
    { id: "break-80", name: "80 깨기", how: "정규 18홀 79타 이하", art: "pin-break-gold", num: "80" },
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

/** 인증 라운드 하나(넘기는 쪽이 인증된 것만 준다) */
export interface PinRound {
    /** 라운드를 끝낸 때 */
    at: Date | string | number;
    /** 18홀 타수 */
    score: number | null;
    /** 그 라운드의 총 파 — 18홀을 다 알 때만. 모르면 null */
    par: number | null;
}

export interface PinDue { id: GolfPinId; earnedAt: number }

const ms = (v: Date | string | number): number => (v instanceof Date ? v.getTime() : typeof v === "number" ? v : new Date(v).getTime());

/**
 * 인증 라운드 + 인증 도장 → 지금까지 받았어야 할 핀 전부(받은 순서).
 * 받은 때는 그 조건을 처음 채운 라운드 · 도장의 때다.
 */
export function pinsDue(rounds: readonly PinRound[], stamps: readonly DatedStamp[]): PinDue[] {
    const out: PinDue[] = [];
    const rs = rounds.map((r) => ({ at: ms(r.at), score: r.score, par: r.par })).filter((r) => Number.isFinite(r.at)).sort((a, b) => a.at - b.at);
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

    // 도장첩 — 권마다 가장 먼저 찍은 날
    const states = bookStates(ss);
    const firstIn = (st: (typeof states)[number]) => { const d = st.slots.filter((x) => x.stamp).map((x) => ms(x.stamp!.firstDate)); return d.length ? Math.min(...d) : null; };
    const open = states.filter((s) => s.book.kind === "open").map(firstIn);
    if (open.length > 0 && open.every((d) => d != null)) out.push({ id: "tour-korea", earnedAt: Math.max(...(open as number[])) });
    const invite = states.filter((s) => s.book.kind === "invite").map(firstIn).filter((d): d is number => d != null);
    if (invite.length > 0) out.push({ id: "first-invite", earnedAt: Math.min(...invite) });

    return out.sort((a, b) => a.earnedAt - b.earnedAt);
}
