/**
 * 도장첩에서 받는 것(볼마커 · 트로피)의 기록(2026-10-12 — 기획서 docs/01-plan/features/golf-stamp-collection.md 의 '완성 기록').
 *
 * 도장에서 '무엇을 언제 받았는가'를 계산한다. 서버가 이것으로 golf_stamp_awards 에 한 번 적고(받은 순번 serial 이 붙는다),
 * 화면은 "강원 볼마커 · 12번째 완성 · 2026.10.12"처럼 보여 준다.
 *
 *   book    도장첩 한 권을 다 채움 — key = 권의 id. 받은 때 = 그 권의 마지막 칸을 채운 도장의 날
 *   all     누구나 일곱 권을 전부 — key = "all-open". 받은 때 = 일곱 권 가운데 마지막 칸의 날
 *   trophy  찍은 엘리트 골프장 수(10 · 20 · 30 · 45 · 전부) — key = 그 수. 받은 때 = 그 수째 도장의 날
 *
 * 한 번 받은 것은 거두지 않는다(나중에 기록이 지워져도 남는다) — 서버가 '아직 안 적은 것'만 더한다.
 * 순수 함수만(서버 · 화면이 같이 쓴다).
 */
import { STAMP_ALL_OPEN, STAMP_TROPHY_STEPS, bookStates, type StampLike } from "./golfStampBooks.js";

/**
 * book · all · trophy 는 도장첩에서 받는 것, pin 은 업적 핀(shared/golfPins — 이름표는 "pin:break-100").
 * black · pearl 은 볼마커의 등급(shared/golfStampDepth — 열쇠는 권의 id · 'all-open'),
 * tag 는 시즌 태그("tag:2026:navy"), special 은 한정 볼마커("special:spring:2026" · "special:holeinone") — shared/golfStampExtras.
 */
export type StampAwardKind = "book" | "all" | "trophy" | "pin" | "black" | "pearl" | "tag" | "special";

export interface StampAwardDue {
    kind: StampAwardKind;
    key: string;
    /** 받은 때(ms) — 그것을 채운 도장을 얻은 때 */
    earnedAt: number;
}

/** 받은 것 하나의 이름표 — "book:gangwon" · "all:all-open" · "trophy:10" */
export const stampAwardId = (kind: StampAwardKind, key: string) => `${kind}:${key}`;

/** 얻은 때가 붙은 도장(인증 도장만 넘긴다) */
export interface DatedStamp extends StampLike {
    /** 그 도장을 얻은 때 — Date · ISO 글자 · ms */
    firstDate: Date | string | number;
}

const ms = (v: Date | string | number): number => (v instanceof Date ? v.getTime() : typeof v === "number" ? v : new Date(v).getTime());

/**
 * 도장 → 지금까지 받았어야 할 것 전부(받은 순서).
 * 한 칸에 도장이 둘 걸리면(원장에 두 줄인 골프장) 한 칸으로 센다 — bookStates 와 같은 셈이다.
 */
export function stampAwardsDue(stamps: readonly DatedStamp[]): StampAwardDue[] {
    // 얻은 순서로 놓고 센다 — 같은 칸의 도장이 둘이면 먼저 얻은 쪽이 그 칸의 날이다
    const ordered = [...stamps].filter((s) => Number.isFinite(ms(s.firstDate))).sort((a, b) => ms(a.firstDate) - ms(b.firstDate));
    const states = bookStates(ordered);
    const out: StampAwardDue[] = [];
    const last = (dates: number[]) => Math.max(...dates);

    for (const st of states) {
        if (st.done) out.push({ kind: "book", key: st.book.id, earnedAt: last(st.slots.map((s) => ms(s.stamp!.firstDate))) });
    }
    const open = states.filter((s) => s.book.kind === "open");
    if (open.length > 0 && open.every((s) => s.done)) {
        out.push({ kind: "all", key: STAMP_ALL_OPEN, earnedAt: last(open.flatMap((s) => s.slots.map((x) => ms(x.stamp!.firstDate)))) });
    }
    // 칸마다 하나씩, 얻은 순서로 — N 번째 칸을 채운 날이 그 트로피를 받은 날
    const slotDates = states.flatMap((s) => s.slots.filter((x) => x.stamp).map((x) => ms(x.stamp!.firstDate))).sort((a, b) => a - b);
    for (const step of STAMP_TROPHY_STEPS) {
        if (slotDates.length >= step) out.push({ kind: "trophy", key: String(step), earnedAt: slotDates[step - 1] });
    }
    return out.sort((a, b) => a.earnedAt - b.earnedAt);
}
