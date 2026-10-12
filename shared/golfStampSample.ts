/**
 * 도장첩의 예시(2026-10-12 오너: "처음 오는 사람도 예시를 보여줘서 와 하게").
 *
 * 비로그인 방문자와 아직 엘리트 도장이 하나도 없는 회원에게 보여 주는 한 사람의 도장첩이다 — 화면은 반드시 "예시" 표시를 붙인다.
 * 홈의 예시 인물(shared/guestSample.ts)과 **같은 사람**이다: 그 사람의 공식 라운드 여덟 번이 곧 도장 여덟 개고, 도장의 타수는 그 라운드의 타수다.
 * 여기서 손으로 적는 것은 '어느 라운드를 어디서 쳤는가'와 날짜뿐이다. 타수는 예시 인물의 라운드에서 읽는다(시험이 맞춘다).
 *
 * 여덟 번을 이렇게 놓았다 — 서해 네 곳을 다 쳐서 볼마커 하나를 받았고, 강원이 세 칸, 경기가 한 칸:
 * 한 화면에서 '다 채운 권 · 채우는 중인 권 · 빈 권'이 다 보이게.
 */
import { GUEST_SAMPLE } from "./guestSample.js";
import { STAMP_BOOKS, type StampLike, type StampSlot } from "./golfStampBooks.js";

/** 예시 라운드(옛 → 최근)가 찍은 칸과 날짜. 길이는 예시 인물의 라운드 수와 같아야 한다 */
const WHERE: readonly [slotKey: string, date: string][] = [
    ["orangedunes", "2026.03.21"],
    ["bearsbest", "2026.04.11"],
    ["lavieestbelle", "2026.05.17"],
    ["island", "2026.06.06"],
    ["paju", "2026.06.27"],
    ["hilldeloci", "2026.07.19"],
    ["sky72", "2026.08.30"],
    ["pineridge", "2026.09.20"],
];

export interface SampleStamp extends StampLike {
    sample: true;
    /** 찍은 날(예시) — "2026.03.21" */
    date: string;
    /** 그 골프장 베스트 = 그 라운드의 타수 */
    score: number;
    rounds: number;
}

const slotByKey = new Map<string, StampSlot>();
for (const b of STAMP_BOOKS) for (const s of b.slots) slotByKey.set(s.key, s);

/** 예시 인물의 도장(얻은 순서) */
export const GOLF_STAMP_SAMPLE: readonly SampleStamp[] = WHERE.map(([key, date], i): SampleStamp => {
    const slot = slotByKey.get(key)!;
    return { sample: true, clubId: slot.clubIds[0], name: slot.ledgerNames[0], date, score: GUEST_SAMPLE.golf.recentScores[i].score, rounds: 1 };
});
