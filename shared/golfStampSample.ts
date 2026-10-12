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
import { GOLF_SEASONS, stampDepths, type MarkerTier, type SlotDepth } from "./golfStampDepth.js";
import { SPECIAL_MARKERS, seasonTagOf, specialKey, type SeasonTagYear } from "./golfStampExtras.js";

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

/**
 * 다 모았을 때의 예시(2026-10-12 오너: "볼마커 장식장 예시는 다 획득했다라는 예시가 좋을 거 같은데").
 * 장식장과 '?' 안내가 '다 모으면 이렇게 된다'를 보여 줄 때 쓴다 — 볼마커 열 개 · 트로피 다섯 개가 다 놓인 모습.
 * 위의 예시 인물(여덟 번 친 사람)과는 **다른 예시**다: 화면은 "다 모았을 때"라고 적는다(그 사람이 다 모았다고 하지 않는다).
 * 날짜 · 타수는 칸의 순서에서 만든 값이다(2024.03.02 부터 17일 간격, 84~96타).
 */
const FULL_START = Date.UTC(2024, 2, 2), FULL_STEP_DAYS = 17;
const fullDate = (i: number): string => {
    const d = new Date(FULL_START + i * FULL_STEP_DAYS * 86_400_000);
    const two = (n: number) => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}.${two(d.getUTCMonth() + 1)}.${two(d.getUTCDate())}`;
};
export const GOLF_STAMP_FULL_SAMPLE: readonly SampleStamp[] = STAMP_BOOKS.flatMap((b) => b.slots).map((slot, i): SampleStamp => ({
    sample: true, clubId: slot.clubIds[0], name: slot.ledgerNames[0], date: fullDate(i), score: 84 + ((i * 7) % 13), rounds: 1,
}));

// ── 도장의 깊이 · 시즌 태그 · 한정 볼마커의 예시(2026-10-12) ─────────────
const sampleMs = (date: string): number => { const [y, m, d] = date.split(".").map(Number); return Date.UTC(y, m - 1, d, 6); };
/**
 * 예시 인물이 돈 코스 — 코스가 셋 이상인 골프장에서만 적는다(나머지는 18홀이라 조각이 없다).
 * 코스 이름은 그 골프장 원장의 이름이다(2026-10-12 운영 자료에서 읽었다). 한 번씩만 갔으므로 다 '2/3' · '2/4' — 한 코스가 남은 모습.
 */
const SAMPLE_NINES: Readonly<Record<string, readonly string[]>> = {
    bearsbest: ["USA", "아시아", "유럽"],
    lavieestbelle: ["올드 IN", "올드 OUT", "듄스 IN", "듄스 OUT"],
    island: ["East", "South", "West"],
    pineridge: ["LAKE", "PINE", "RIDGE"],
};
/** 예시 인물의 깊이 — 진짜 규칙(stampDepths)으로 계산한다 */
export const GOLF_DEPTH_SAMPLE: readonly SlotDepth[] = Array.from(stampDepths(
    WHERE.map(([key, date]) => { const slot = slotByKey.get(key)!; return { at: sampleMs(date), clubId: slot.clubIds[0], name: slot.ledgerNames[0], nines: (SAMPLE_NINES[key] ?? []).slice(0, 2) }; }),
    SAMPLE_NINES,
).values());
/** 예시 인물의 시즌 태그 — 2026년에 여덟 번 */
export const GOLF_TAG_SAMPLE: readonly SeasonTagYear[] = [seasonTagOf(2026, WHERE.length)];
/** 예시 인물이 받은 한정 볼마커 — 봄 · 여름 · 가을에 도장첩의 골프장을 갔다(날짜가 그렇다) */
export const GOLF_SPECIAL_SAMPLE: readonly string[] = [specialKey("spring", 2026), specialKey("summer", 2026), specialKey("autumn", 2026)];

/**
 * 다 모았을 때의 예시 — 오래 모은 사람의 장식장. 볼마커가 세 등급으로 섞여 보이게:
 * 서해는 자개(전부 사철), 경기 · 강원은 블랙(전부 금테), 나머지 권은 일반(도장 절반이 금테).
 */
export const GOLF_MARKER_TIER_FULL_SAMPLE: Readonly<Record<string, MarkerTier>> = { seohae: "pearl", gyeonggi: "black", gangwon: "black" };
export const GOLF_DEPTH_FULL_SAMPLE: readonly SlotDepth[] = STAMP_BOOKS.flatMap((b) => b.slots.map((slot, i): SlotDepth => {
    const tier = GOLF_MARKER_TIER_FULL_SAMPLE[b.id];
    const four = tier === "pearl", gold = !!tier || i % 2 === 0;
    return { slotKey: slot.key, bookId: b.id, visits: four ? 5 : gold ? 2 : 1, nines: null, seasons: four ? [...GOLF_SEASONS] : gold ? ["spring", "autumn"] : ["spring"], gold, goldAt: null, four, fourAt: null };
}));
export const GOLF_TAG_FULL_SAMPLE: readonly SeasonTagYear[] = [seasonTagOf(2026, 14), seasonTagOf(2025, 26), seasonTagOf(2024, 16)];
/** 다 모았을 때 — 한정 볼마커도 전부(올해 것) */
export const GOLF_SPECIAL_FULL_SAMPLE: readonly string[] = SPECIAL_MARKERS.map((m) => specialKey(m.id, 2026));
