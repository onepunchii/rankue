/**
 * 위판장 소식(2026-10-14) — 지난 이레 동안 전국 수협 위판장에 어떤 어종이 얼마나 자주 올랐는가.
 *
 * 자료: 해양수산부 위판장별 위탁판매 현황(공공데이터포털). 줄 하나가 경매 한 건이라, 어종 이름으로 물어 **하루의 건수**만 센다.
 * 낚시꾼의 조황 글과 달리 꾸밀 수 없는 숫자다 — 다만 **어선이 잡아 위판장에 올린 횟수**이지 낚시로 잡힌 양이 아니다. 화면에 그렇게 적는다.
 * 무게 · 수량은 줄마다 단위가 달라(상자 · 마리 · 깡) 더하지 않는다. 건수만 쓴다.
 * '늘고 있다 · 줄고 있다'는 말하지 않는다 — 평일 · 주말 · 공휴일의 차이가 더 커서 이레로는 흐름을 말할 수 없다(2026-10-14 실제 자료로 확인).
 *
 * 이름: 위판 자료의 어종 이름은 표준명이다(우럭 = 조피볼락 · 광어 = 넙치). 부분 일치로 걸러져서 '갈치'는 먹갈치, '갑오징어'는 입술무늬갑오징어까지 센다.
 *       '볼락'은 조피볼락(우럭)과 겹쳐서 싣지 않는다. 무늬오징어는 위판 이름이 없어 뺀다. 민물 어종은 위판장에 오르지 않는다.
 * ⚠️ 서버가 부른다 — 상대 임포트는 ./x.js.
 */
import { FISH } from "./fishingFish.js";

/** 우리 어종(id) → 위판 자료에 묻는 이름 */
export const MARKET_FISH: readonly { id: string; ask: string }[] = [
    { id: "gamseongdom", ask: "감성돔" }, { id: "chamdom", ask: "참돔" }, { id: "doldom", ask: "돌돔" }, { id: "ureok", ask: "조피볼락" }, { id: "gwangeo", ask: "넙치" },
    { id: "nongeo", ask: "농어" }, { id: "godeungeo", ask: "고등어" }, { id: "busiri", ask: "부시리" }, { id: "samchi", ask: "삼치" }, { id: "galchi", ask: "갈치" },
    { id: "jukkumi", ask: "주꾸미" }, { id: "gabojingeo", ask: "갑오징어" }, { id: "muneo", ask: "문어" },
];

export interface MarketFishWeek { id: string; name: string; /** 날마다의 경매 건수(days 와 같은 차례) */ counts: number[]; total: number }
export interface MarketWeek { /** 오래된 날부터(YYYY-MM-DD) — 어제까지 이레 */ days: string[]; fish: MarketFishWeek[] }
export const MARKET_SOURCE = "해양수산부 위판장별 위탁판매 현황";
export const MARKET_NOTE = "어선이 잡아 위판장에 올린 경매 건수예요. 낚시로 잡힌 양이 아니고, 어제 것은 덜 들어왔을 수 있어요.";

/** 어제까지 이레(오래된 날부터) */
export function marketDays(today: string, n = 7): string[] {
    const t = Date.parse(`${today}T00:00:00Z`);
    return Array.from({ length: n }, (_, i) => new Date(t - (n - i) * 86_400_000).toISOString().slice(0, 10));
}

/** 받아 둔 건수(어종 id → 날 → 건수)를 한 주의 표로 — 많이 오른 순. **이레가 다 찬 어종만** 싣는다(덜 받은 날이 0 으로 보이면 안 된다) */
export function marketWeek(days: readonly string[], have: Readonly<Record<string, Readonly<Record<string, number>>>>): MarketWeek {
    const fish: MarketFishWeek[] = [];
    for (const f of MARKET_FISH) {
        const by = have[f.id];
        if (!by || !days.every((d) => by[d] != null)) continue;
        const counts = days.map((d) => Math.max(0, Math.round(Number(by[d] ?? 0))));
        fish.push({ id: f.id, name: FISH.find((x) => x.id === f.id)?.name ?? f.ask, counts, total: counts.reduce((a, b) => a + b, 0) });
    }
    fish.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "ko"));
    return { days: [...days], fish };
}
