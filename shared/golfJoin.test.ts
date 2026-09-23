import { describe, it, expect } from "vitest";
import { distanceKm, formatDistance, isKoreaCoord, isUrgentJoin, kstHour, normalizeSlots, openSlotCount, slotsFromLegacy, JOIN_OPTIONS, URGENT_MAX_FEE, URGENT_MIN_LEAD_MS } from "./golfJoin";

describe("골프 조인 자리(slot) 규칙", () => {
    it("호스트는 있으면 첫 자리에만, 모집 자리가 하나는 있어야 하고, 2~4자리", () => {
        const ok = normalizeSlots([{ role: "HOST", gender: "M" }, { role: "GUEST", gender: "F" }, { role: "OPEN", gender: "ANY" }, { role: "OPEN", gender: "M" }]);
        expect(ok).not.toBeNull();
        expect(openSlotCount(ok!)).toBe(2);
        expect(normalizeSlots([{ role: "HOST", gender: "M" }])).toBeNull();                                   // 혼자
        expect(normalizeSlots([{ role: "HOST", gender: "M" }, { role: "GUEST", gender: "F" }])).toBeNull();     // 모집 자리 없음
        expect(normalizeSlots([{ role: "OPEN", gender: "ANY" }, { role: "HOST", gender: "M" }])).toBeNull();    // 호스트가 둘째 칸에 있다(자리 그림의 첫 칸이어야 한다)
        expect(normalizeSlots([{ role: "HOST", gender: "M" }, { role: "HOST", gender: "F" }, { role: "OPEN", gender: "ANY" }])).toBeNull(); // 호스트 둘
        expect(normalizeSlots(Array.from({ length: 5 }, (_, i) => ({ role: i === 0 ? "HOST" : "OPEN", gender: "ANY" })))).toBeNull();
        expect(normalizeSlots([{ role: "HOST", gender: "X" }, { role: "OPEN", gender: "ANY" }])).toBeNull();
        expect(normalizeSlots("nope")).toBeNull();
    });

    /**
     * 2026-09-23 오너: 확정이 취소돼 **한 자리도 안 팔린** 티타임을 조인으로 돌릴 수 있어야 한다.
     * 예전 규칙은 첫 칸을 HOST 로 못 박아 OPEN 이 최대 3이었고, 매장 매니저는 그 팀에서 치지 않으니
     * 그 HOST 는 아무도 안 앉는 유령 자리였다("1자리는 이미 팔렸고" 라는 거짓말이 화면에 남았다).
     */
    it("호스트 없는 자리 구성 — 전환 글은 넷 다 모집일 수 있다", () => {
        const all = normalizeSlots(Array.from({ length: 4 }, () => ({ role: "OPEN", gender: "ANY" })));
        expect(all).not.toBeNull();
        expect(openSlotCount(all!)).toBe(4);
        // 이미 팔린 자리는 GUEST 로 적는다 — 호스트가 없어도 통과해야 한다
        const two = normalizeSlots([{ role: "GUEST", gender: "ANY" }, { role: "GUEST", gender: "ANY" }, { role: "OPEN", gender: "M" }, { role: "OPEN", gender: "ANY" }]);
        expect(two).not.toBeNull();
        expect(openSlotCount(two!)).toBe(2);
        // 첫 칸이 GUEST 여도 된다(팔린 자리 하나 + 모집 셋)
        expect(normalizeSlots([{ role: "GUEST", gender: "ANY" }, { role: "OPEN", gender: "ANY" }, { role: "OPEN", gender: "ANY" }, { role: "OPEN", gender: "ANY" }])).not.toBeNull();
    });

    /**
     * 규칙을 넓혔으니 **옛 글이 그대로 통과하는지**가 진짜 질문이다(2026-09-23 리뷰).
     * "통과한다"로는 모자란다 — 값이 조용히 바뀌면 이미 저장된 글의 자리 수·성별이 달라진다.
     * 그래서 입력과 출력이 **같은 값**인지까지 본다. 운영 DB 의 slots 도 같은 방식으로 대조했다(전부 HOST 첫 칸, 0건 변형).
     */
    it("옛 글(HOST 첫 칸)은 값 그대로 통과한다", () => {
        const 옛것 = [
            [{ role: "HOST", gender: "M" }, { role: "OPEN", gender: "ANY" }, { role: "OPEN", gender: "F" }, { role: "OPEN", gender: "ANY" }],
            [{ role: "HOST", gender: "M" }, { role: "GUEST", gender: "F" }, { role: "OPEN", gender: "ANY" }],
            [{ role: "HOST", gender: "F" }, { role: "GUEST", gender: "ANY" }, { role: "GUEST", gender: "M" }, { role: "OPEN", gender: "ANY" }],
            [{ role: "HOST", gender: "ANY" }, { role: "OPEN", gender: "ANY" }],
        ];
        for (const input of 옛것) {
            const out = normalizeSlots(input);
            expect(out, JSON.stringify(input)).not.toBeNull();
            expect(out).toEqual(input);          // 값이 그대로여야 한다 — 저장된 글의 뜻이 바뀌면 안 된다
            expect(openSlotCount(out!)).toBe(input.filter((s) => s.role === "OPEN").length);
        }
    });

    it("호스트 자리는 여전히 첫 칸에 하나뿐이다", () => {
        expect(normalizeSlots([{ role: "OPEN", gender: "ANY" }, { role: "HOST", gender: "M" }, { role: "OPEN", gender: "ANY" }])).toBeNull();  // 둘째 칸
        expect(normalizeSlots([{ role: "OPEN", gender: "ANY" }, { role: "OPEN", gender: "ANY" }, { role: "HOST", gender: "M" }])).toBeNull();  // 끝 칸
        expect(normalizeSlots([{ role: "GUEST", gender: "ANY" }, { role: "HOST", gender: "M" }, { role: "OPEN", gender: "ANY" }])).toBeNull(); // GUEST 뒤
        expect(normalizeSlots([{ role: "HOST", gender: "M" }, { role: "HOST", gender: "F" }, { role: "OPEN", gender: "ANY" }])).toBeNull();    // 둘
        expect(normalizeSlots([{ role: "GUEST", gender: "ANY" }, { role: "GUEST", gender: "ANY" }])).toBeNull();                               // 모집 자리 없음
        expect(normalizeSlots([{ role: "OPEN", gender: "ANY" }])).toBeNull();                                                                  // 1칸
        expect(normalizeSlots(Array.from({ length: 5 }, () => ({ role: "OPEN", gender: "ANY" })))).toBeNull();                                 // 5칸
    });

    it("옛 글은 모집 인원·조건으로 자리를 만든다", () => {
        expect(slotsFromLegacy(2, "남성").map((s) => `${s.role}:${s.gender}`)).toEqual(["HOST:ANY", "OPEN:M", "OPEN:M"]);
        expect(slotsFromLegacy(3, "여성")[1].gender).toBe("F");
        expect(slotsFromLegacy(3, "부부/커플")[1].gender).toBe("ANY");
        expect(slotsFromLegacy(null, null)).toHaveLength(4);
        expect(slotsFromLegacy(9, null)).toHaveLength(4);   // 3자리 상한
    });

    it("옵션 칩은 id 가 겹치지 않고 종목 표시가 있다", () => {
        expect(new Set(JOIN_OPTIONS.map((o) => o.id)).size).toBe(JOIN_OPTIONS.length);
        for (const o of JOIN_OPTIONS) expect(o.types.length).toBeGreaterThan(0);
    });
});

describe("거리", () => {
    it("서울시청 ↔ 부산시청 ≈ 325 km, 같은 점은 0", () => {
        const d = distanceKm(37.5663, 126.9779, 35.1798, 129.0750);
        expect(d).toBeGreaterThan(315);
        expect(d).toBeLessThan(335);
        expect(distanceKm(37.5, 127, 37.5, 127)).toBe(0);
    });

    it("표시 형식", () => {
        expect(formatDistance(0.32)).toBe("300m");
        expect(formatDistance(0.01)).toBe("50m");
        expect(formatDistance(2.34)).toBe("2.3km");
        expect(formatDistance(23.4)).toBe("23km");
        expect(formatDistance(Number.NaN)).toBe("");
    });

    it("한국 밖·뒤바뀐 좌표는 거른다", () => {
        expect(isKoreaCoord(37.5, 127)).toBe(true);
        expect(isKoreaCoord(127, 37.5)).toBe(false);
        expect(isKoreaCoord("37.5", 127)).toBe(false);
        expect(isKoreaCoord(null, null)).toBe(false);
    });
});

describe("긴급 조인(당일 떨이)", () => {
    /** 한국 시각을 UTC 밀리초로 — 테스트가 돌아가는 기기 시간대에 결과가 흔들리지 않게 직접 만든다. */
    const kst = (y: number, m: number, d: number, h: number, min = 0) => Date.UTC(y, m - 1, d, h - 9, min);

    // 기준: 한국 2026-09-23(수) 09:00. 티오프는 같은 날 14:00(5시간 뒤).
    const now = kst(2026, 9, 23, 9);
    const base = { listingType: "JOIN", joinType: "FIELD", costMode: "FIXED", greenFee: 10000, datetime: new Date(kst(2026, 9, 23, 14)) };

    it("오늘·필드·고정가·싼 값·시간 여유면 긴급이다", () => {
        expect(isUrgentJoin(base, now)).toBe(true);
        expect(isUrgentJoin({ ...base, datetime: new Date(kst(2026, 9, 23, 14)).toISOString() }, now)).toBe(true);  // 문자열 datetime 도 같다
    });

    it("값 경계: 19,999 · 20,000 은 긴급, 20,001 은 아니다", () => {
        // 오너 확정(2026-09-23): 3만원 이하가 '던지는 가격'. 보통 조인은 10~15만원이라 섞이지 않는다.
        expect(URGENT_MAX_FEE).toBe(30_000);
        expect(isUrgentJoin({ ...base, greenFee: 25_000 }, now)).toBe(true);
        expect(isUrgentJoin({ ...base, greenFee: 29_999 }, now)).toBe(true);
        expect(isUrgentJoin({ ...base, greenFee: URGENT_MAX_FEE }, now)).toBe(true);
        expect(isUrgentJoin({ ...base, greenFee: URGENT_MAX_FEE + 1 }, now)).toBe(false);
        expect(isUrgentJoin({ ...base, greenFee: 100_000 }, now)).toBe(false);
        expect(isUrgentJoin({ ...base, greenFee: 0 }, now)).toBe(true);
        expect(isUrgentJoin({ ...base, greenFee: undefined }, now)).toBe(false);   // 값이 비면 0 으로 읽지 않는다
        expect(isUrgentJoin({ ...base, greenFee: null }, now)).toBe(false);
        expect(isUrgentJoin({ ...base, greenFee: -1 }, now)).toBe(false);
    });

    it("남은 시간 경계: 1시간 59분은 아니고 2시간 1분은 긴급", () => {
        expect(isUrgentJoin({ ...base, datetime: new Date(now + URGENT_MIN_LEAD_MS - 60_000) }, now)).toBe(false);
        expect(isUrgentJoin({ ...base, datetime: new Date(now + URGENT_MIN_LEAD_MS) }, now)).toBe(true);        // 딱 2시간은 포함
        expect(isUrgentJoin({ ...base, datetime: new Date(now + URGENT_MIN_LEAD_MS + 60_000) }, now)).toBe(true);
        expect(isUrgentJoin({ ...base, datetime: new Date(now - 3600_000) }, now)).toBe(false);                 // 이미 지난 티타임
    });

    it("어제·내일 티오프는 긴급이 아니다(한국 날짜 기준)", () => {
        expect(isUrgentJoin({ ...base, datetime: new Date(kst(2026, 9, 22, 14)) }, now)).toBe(false);
        expect(isUrgentJoin({ ...base, datetime: new Date(kst(2026, 9, 24, 14)) }, now)).toBe(false);
        // 한국 자정 직전/직후 — UTC 날짜로 세면 둘 다 틀린다(UTC 로는 23일 15:00 이 24일이 아니다).
        const lateNight = kst(2026, 9, 23, 21);
        expect(isUrgentJoin({ ...base, datetime: new Date(kst(2026, 9, 23, 23, 30)) }, lateNight)).toBe(true);
        expect(isUrgentJoin({ ...base, datetime: new Date(kst(2026, 9, 24, 1)) }, lateNight)).toBe(false);
    });

    it("SPLIT(1/N) · 스크린 · 파크 · 부킹은 긴급이 아니다", () => {
        expect(isUrgentJoin({ ...base, costMode: "SPLIT", greenFee: 0 }, now)).toBe(false);
        expect(isUrgentJoin({ ...base, costMode: null }, now)).toBe(false);
        expect(isUrgentJoin({ ...base, joinType: "SCREEN" }, now)).toBe(false);
        expect(isUrgentJoin({ ...base, joinType: "PARK" }, now)).toBe(false);
        expect(isUrgentJoin({ ...base, joinType: null }, now)).toBe(false);
        expect(isUrgentJoin({ ...base, listingType: "BOOKING" }, now)).toBe(false);
        expect(isUrgentJoin({ ...base, datetime: "말도 안 되는 값" }, now)).toBe(false);
    });

    it("kstHour 는 한국 시각의 시를 준다(조용한 시간 판정)", () => {
        expect(kstHour(kst(2026, 9, 23, 0, 30))).toBe(0);
        expect(kstHour(kst(2026, 9, 23, 8))).toBe(8);
        expect(kstHour(kst(2026, 9, 23, 20, 59))).toBe(20);
        expect(kstHour(kst(2026, 9, 23, 21))).toBe(21);
    });
});
