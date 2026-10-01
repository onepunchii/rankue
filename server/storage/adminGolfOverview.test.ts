// 2026-10-01 오너: "골프 부분이 어드민에 많이 빠져 있다 — 넣을 수 있는 거 다 넣자" — 골프 현황의 순수 판정(시세 상태·긴급 조인 수).
import { describe, it, expect } from "vitest";
import { judgePriceFeed, countUrgent, PRICE_SYNC_LIMIT_HOURS, PRICE_ASOF_LIMIT_DAYS, type UrgentCandidate } from "./adminGolfOverview";

const H = 3_600_000;
/** 한국 시각 → ISO(UTC) */
const kst = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(Date.UTC(y, mo - 1, d, h - 9, mi)).toISOString();

describe("회원권 시세 상태", () => {
    const NOW = Date.parse("2026-10-01T08:30:00Z");   // 한국 10/1 17:30

    it("9/24 뒤로 한 번도 안 들어온 지금 모양은 멈춤(2026-10-01 실측)", () => {
        const p = judgePriceFeed({ asOf: "2026-09-23", items: 234, updatedAt: "2026-09-24T04:59:55Z" }, NOW);
        expect(p.state).toBe("stopped");
        expect(p.asOfAgeDays).toBe(8);
        expect(p.detail).toContain("7일");
        expect(p.detail).toContain(`${PRICE_SYNC_LIMIT_HOURS}시간`);
        expect(p.reason).toBe(`${PRICE_SYNC_LIMIT_HOURS}시간 넘게 새로 못 받음`);
    });

    it("어젯밤에 받았으면 정상, 30시간을 넘으면 멈춤", () => {
        expect(judgePriceFeed({ asOf: "2026-09-30", items: 234, updatedAt: "2026-09-30T12:40:10Z" }, NOW)).toMatchObject({ state: "ok", reason: "" });
        expect(judgePriceFeed({ asOf: "2026-09-30", items: 234, updatedAt: new Date(NOW - 31 * H).toISOString() }, NOW).state).toBe("stopped");
    });

    it("받기는 되는데 기준일이 6일 넘게 그대로면 늦음(주말·연휴는 정상)", () => {
        const fresh = new Date(NOW - 20 * H).toISOString();
        expect(judgePriceFeed({ asOf: "2026-09-25", items: 234, updatedAt: fresh }, NOW).state).toBe("ok");      // 6일
        const late = judgePriceFeed({ asOf: "2026-09-24", items: 234, updatedAt: fresh }, NOW);               // 7일
        expect(late.state).toBe("late");
        expect(late.detail).toContain(`${PRICE_ASOF_LIMIT_DAYS}일`);
        expect(late.reason).toContain("TGM");
    });

    it("기준일은 한국 날짜로 센다 — 한국 새벽 1시면 어제 날짜가 1일 전", () => {
        const kst1am = Date.parse("2026-09-30T16:00:00Z");   // 한국 10/1 01:00
        expect(judgePriceFeed({ asOf: "2026-09-30", items: 10, updatedAt: "2026-09-30T12:40:00Z" }, kst1am).asOfAgeDays).toBe(1);
    });

    it("시세가 하나도 없으면 멈춤", () => {
        expect(judgePriceFeed({ asOf: null, items: 0, updatedAt: null }, NOW)).toMatchObject({ state: "stopped", detail: "시세가 하나도 없음" });
    });
});

describe("오늘의 긴급 조인 수(shared isUrgentJoin)", () => {
    const NOW = Date.parse(kst(2026, 10, 1, 10, 0));   // 한국 10/1 10:00
    const base: UrgentCandidate = {
        listingType: "JOIN", joinType: "FIELD", costMode: "FIXED", greenFee: 20_000,
        datetime: kst(2026, 10, 1, 15, 0), createdAt: kst(2026, 10, 1, 9, 0),
    };

    it("지금 긴급(티오프까지 2시간 넘게)이면 오늘·지금 둘 다", () => {
        expect(countUrgent([base], NOW)).toEqual({ today: 1, now: 1 });
    });

    it("티가 가까워 배지가 떨어졌어도 올린 순간 긴급이었으면 오늘 몫", () => {
        const soon = { ...base, datetime: kst(2026, 10, 1, 11, 30), createdAt: kst(2026, 10, 1, 8, 0) };
        expect(countUrgent([soon], NOW)).toEqual({ today: 1, now: 0 });
    });

    it("어제 올린 오늘 티 — 지금 긴급이면 세고, 배지도 떨어졌으면 안 센다", () => {
        const fromYesterday = { ...base, createdAt: kst(2026, 9, 30, 20, 0) };
        expect(countUrgent([fromYesterday], NOW)).toEqual({ today: 1, now: 1 });
        expect(countUrgent([{ ...fromYesterday, datetime: kst(2026, 10, 1, 11, 30) }], NOW)).toEqual({ today: 0, now: 0 });
    });

    it("떨이가 아닌 글은 안 센다(3만원 초과 · 1/N · 스크린) — 올린 때가 이상한 값이면 지금만 본다", () => {
        expect(countUrgent([
            { ...base, greenFee: 40_000 },
            { ...base, costMode: "SPLIT", greenFee: 0 },
            { ...base, joinType: "SCREEN" },
        ], NOW)).toEqual({ today: 0, now: 0 });
        expect(countUrgent([{ ...base, createdAt: "말도 안 되는 값" }], NOW)).toEqual({ today: 1, now: 1 });
    });
});
