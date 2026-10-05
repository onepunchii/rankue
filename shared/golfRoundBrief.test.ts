import { describe, it, expect } from "vitest";
import { briefLine, briefReason, lastTee18, nearestTee, partOfHour, roundBrief, sunLine, teeHours, PART_TEE_HOUR } from "./golfRoundBrief";
import { teePart } from "./golfCourse";
import type { WxHour } from "./golfWeather";

const D = "20261006";
const SUN = { rise: "06:30", set: "18:08" };
const h = (hr: number, over: Partial<WxHour> = {}): WxHour => ({ t: `${D}${String(hr).padStart(2, "0")}`, tmp: 18, pop: 0, kind: "clear", wsd: 2, pcp: null, ...over });
/** 하루치(05~21시) — f 로 시간마다 바꾼다 */
const day = (f: (hr: number) => Partial<WxHour> = () => ({})) => Array.from({ length: 17 }, (_, i) => h(i + 5, f(i + 5)));

describe("부와 티오프 시각", () => {
    it("부의 경계는 조인·부킹 글의 부(teePart)와 같다", () => {
        for (let hr = 5; hr <= 19; hr++) {
            const iso = new Date(Date.UTC(2026, 9, 6, hr - 9, 0)).toISOString();
            expect(partOfHour(hr)).toBe(teePart(iso));
        }
        expect([partOfHour(PART_TEE_HOUR[1]), partOfHour(PART_TEE_HOUR[2]), partOfHour(PART_TEE_HOUR[3])]).toEqual([1, 2, 3]);
    });
    it("고를 수 있는 시각 — 예보가 있는 05~19시만(나흘째는 세 시간 간격)", () => {
        expect(teeHours(day())).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
        expect(teeHours([0, 3, 6, 9, 12, 15, 18, 21].map((x) => h(x)))).toEqual([6, 9, 12, 15, 18]);
        expect(teeHours(day().filter((x) => +x.t.slice(8) >= 14))).toEqual([14, 15, 16, 17, 18, 19]); // 오후에 연 오늘
    });
    it("가장 가까운 시각 — 세 시간 간격인 날은 1부=6시·3부=18시로 붙는다", () => {
        expect(nearestTee([6, 9, 12, 15, 18], 7)).toBe(6);
        expect(nearestTee([6, 9, 12, 15, 18], 17)).toBe(18);
        expect(nearestTee([14, 15, 16], 7)).toBe(14);
        expect(nearestTee([], 7)).toBeNull();
    });
});

describe("roundBrief — 라운드 다섯 시간", () => {
    it("티오프부터 여섯 칸, 앞 셋이 전반", () => {
        const b = roundBrief(day((hr) => ({ tmp: hr + 2 })), 7, SUN)!;
        expect(b.hours.map((x) => +x.t.slice(8))).toEqual([7, 8, 9, 10, 11, 12]);
        expect(b.frontCount).toBe(3);
        expect(b).toMatchObject({ startTmp: 9, endTmp: 14, minTmp: 9, maxTmp: 14, pop: 0, wind: 2, wet: null, dusk: false });
    });
    it("그 시각의 예보가 없으면 null — 지어내지 않는다", () => {
        expect(roundBrief(day().filter((x) => +x.t.slice(8) >= 14), 7, SUN)).toBeNull();
        expect(roundBrief([], 7, SUN)).toBeNull();
        expect(roundBrief([0, 3, 6, 9, 12, 15, 18, 21].map((x) => h(x)), 7, SUN)).toBeNull(); // 세 시간 간격인 날의 7시
    });
    it("세 시간 간격인 날은 두 칸(전반 하나·후반 하나), 바람은 단계", () => {
        const b = roundBrief([6, 9, 12, 15].map((x) => h(x, { wsd: null, wq: x === 9 ? 2 : 1 })), 6, SUN)!;
        expect(b.hours).toHaveLength(2);
        expect(b.frontCount).toBe(1);
        expect(b).toMatchObject({ wind: null, wq: 2 });
        expect(briefReason(b)).toBe("비 0% · 바람 약간 강함 · 18°");
    });
});

describe("한 줄 평 — 라운드를 가장 크게 바꾸는 것부터", () => {
    const v = (f: (hr: number) => Partial<WxHour>, tee = 12, sun = SUN) => { const b = roundBrief(day(f), tee, sun)!; return [b.verdict, b.tone]; };

    it("다 괜찮으면 라베 날씨", () => {
        expect(v(() => ({ tmp: 20, wsd: 3, pop: 20 }))).toEqual(["라베 날씨", "good"]);
    });
    it("눈 → 비 순서. 비는 한 시간만 있어도, 확률 60% 부터도", () => {
        expect(v((hr) => (hr === 14 ? { kind: "snow", pop: 70 } : hr === 13 ? { kind: "rain" } : {}))).toEqual(["눈 예보, 휴장부터 확인", "snow"]);
        expect(v((hr) => (hr === 14 ? { kind: "shower", pop: 40 } : {}))).toEqual(["우중 라운드", "rain"]);
        expect(v(() => ({ pop: 60, kind: "cloudy" }))).toEqual(["우중 라운드", "rain"]);
    });
    it("라운드 밖 시간의 비는 보지 않는다", () => {
        expect(v((hr) => (hr === 8 ? { kind: "rain", pop: 90 } : { tmp: 20 }), 12)).toEqual(["라베 날씨", "good"]);
    });
    it("영하면 서리(아침)·언 그린(낮)", () => {
        expect(v((hr) => ({ tmp: hr - 8 }), 7)).toEqual(["서리 내린 아침", "cold"]);
        expect(v(() => ({ tmp: -1 }), 12)).toEqual(["언 그린 주의", "cold"]);
    });
    it("바람 9m/s 부터 변수 — 단계 예보는 '강함'", () => {
        expect(v(() => ({ wsd: 9.2 }))).toEqual(["바람이 변수", "wind"]);
        expect(v(() => ({ wsd: 8.9, tmp: 20 }))[0]).toBe("무난한 날씨"); // 5~9 는 라베도 변수도 아니다
        const b = roundBrief([12, 15].map((x) => h(x, { wsd: null, wq: 3 })), 12, SUN)!;
        expect(b.verdict).toBe("바람이 변수");
    });
    it("31° 부터 한낮 더위", () => {
        expect(v(() => ({ tmp: 32 }))).toEqual(["한낮 더위", "heat"]);
    });
    it("해가 라운드 도중에 지면 야간 라운드 — 박명 20분까지는 봐준다", () => {
        expect(v(() => ({ tmp: 20 }), 17)).toEqual(["야간 라운드", "night"]);
        expect(roundBrief(day(), 14, SUN)!.dusk).toBe(true);   // 14:00 + 4:30 = 18:30 > 18:08 + 0:20
        expect(roundBrief(day(), 13, SUN)!.dusk).toBe(false);  // 17:30
        expect(roundBrief(day(), 14, { rise: "05:11", set: "19:57" })!.dusk).toBe(false); // 하지
        expect(roundBrief(day(), 17, null)!.dusk).toBe(false);  // 해 시각을 모르면 말하지 않는다
    });
    it("비 올 수도(30~59%) → 우산은 챙겨요, 쌀쌀(10° 이하 시작) → 새벽 티", () => {
        expect(v(() => ({ pop: 40, tmp: 20 }))).toEqual(["우산은 챙겨요", "ok"]);
        expect(v((hr) => ({ tmp: hr + 1 }), 7)).toEqual(["쌀쌀한 새벽 티", "cold"]);
        expect(v(() => ({ tmp: 7 }), 12)).toEqual(["쌀쌀한 날", "cold"]);
        expect(v((hr) => ({ tmp: hr + 3 }), 7)).toEqual(["쌀쌀한 새벽 티", "cold"]);   // 10° 는 쌀쌀
        expect(v((hr) => ({ tmp: hr + 4 }), 7)[0]).not.toBe("쌀쌀한 새벽 티");          // 11° 부터는 아니다
    });
    it("라베도 아니고 걸리는 것도 없으면 무난", () => {
        expect(v(() => ({ tmp: 29, wsd: 3 }))).toEqual(["무난한 날씨", "ok"]);   // 27° 를 넘는다
        expect(v(() => ({ tmp: 20, wsd: 6 }))).toEqual(["무난한 날씨", "ok"]);   // 바람 5m/s 를 넘는다
    });
});

describe("준비물 — 셋까지", () => {
    const g = (f: (hr: number) => Partial<WxHour>, tee = 12, sun: typeof SUN | null = SUN) => roundBrief(day(f), tee, sun)!.gear;
    it("비 → 우산·비옷과 여벌 장갑, 올 수도 → 우산", () => {
        expect(g((hr) => (hr === 13 ? { kind: "rain", pop: 80 } : { tmp: 18 }))).toEqual(["우산·비옷", "여벌 장갑"]);
        expect(g(() => ({ pop: 40, tmp: 18 }))).toEqual(["우산"]);
    });
    it("추운 아침 → 핫팩·바람막이, 낮에 더우면 선크림까지", () => {
        expect(g((hr) => ({ tmp: hr - 5 }), 7)).toEqual(["핫팩", "바람막이"]);          // 2° → 7°
        expect(g((hr) => ({ tmp: 2 + (hr - 7) * 4 }), 7)).toEqual(["핫팩", "바람막이", "선크림·모자"]); // 2° → 22°
    });
    it("서늘하게 시작해 크게 오르면 겹쳐 입기(바람막이를 권한 날은 빼고)", () => {
        expect(g((hr) => ({ tmp: 12 + (hr - 7) * 2 }), 7)).toEqual(["겹쳐 입기", "선크림·모자"]); // 12° → 22°
        expect(g((hr) => ({ tmp: 9 + (hr - 7) * 2 }), 7)).toEqual(["바람막이"]);                  // 9° → 19°
    });
    it("더우면 얼음물·선크림, 해 지면 라이트 코스 확인(선크림 대신)", () => {
        expect(g(() => ({ tmp: 30 }))).toEqual(["얼음물", "선크림·모자"]);
        expect(g(() => ({ tmp: 23 }), 17)).toEqual(["라이트 코스 확인"]);
    });
    it("아무것도 안 걸리면 빈 목록 — 억지로 채우지 않는다", () => {
        expect(g(() => ({ tmp: 18 }))).toEqual([]);
    });
});

describe("해·문구", () => {
    it("마지막 티 — 일몰에서 네 시간 반을 빼고 10분 단위로 내린다", () => {
        expect(lastTee18("18:08")).toBe("13:30");
        expect(lastTee18("19:57")).toBe("15:20");
        expect(lastTee18("17:17")).toBe("12:40");
        expect(sunLine(SUN)).toBe("해 뜸 06:30 · 해 짐 18:08 · 18홀은 13:30 전에 티오프");
    });
    it("근거 숫자 — 티오프 때→끝날 때, 둘이 같으면 그 사이 낮은 값~높은 값", () => {
        expect(briefReason(roundBrief(day((hr) => ({ tmp: hr + 2 })), 7, SUN)!)).toBe("비 0% · 바람 2m/s · 9°→14°");
        expect(briefReason(roundBrief(day((hr) => ({ tmp: hr <= 14 ? hr + 7 : 36 - hr })), 12, SUN)!)).toBe("비 0% · 바람 2m/s · 19°~21°"); // 19→21→19
        expect(briefReason(roundBrief(day(() => ({ tmp: 18 })), 12, SUN)!)).toBe("비 0% · 바람 2m/s · 18°");
    });
    it("검색엔진용 한 줄", () => {
        const b = roundBrief(day((hr) => ({ tmp: hr + 2, pop: hr === 9 ? 20 : 0, kind: hr < 9 ? "clear" : "partly" })), 7, SUN)!;
        expect(briefLine(b)).toBe("1부(07시 티오프) 쌀쌀한 새벽 티 — 구름많음, 비 20% · 바람 2m/s · 9°→14°");
        const rain = roundBrief(day((hr) => (hr >= 13 ? { kind: "rain", pop: 70, tmp: 16 } : { tmp: 16 })), 12, SUN)!;
        expect(briefLine(rain)).toBe("2부(12시 티오프) 우중 라운드 — 비, 비 70% · 바람 2m/s · 16°");
    });
});
