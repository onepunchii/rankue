import { describe, it, expect } from "vitest";
import {
    EVE_FROM_HOUR, EVE_UNTIL_HOUR, eveKey, eveNotice, eveUrl, eveWindow, parseRoundRef, roundCardPath, roundDateLabel, roundDeepPath, roundQuery,
    roundShareText, roundShareTitle,
} from "./golfRoundShare";
import { roundBrief } from "./golfRoundBrief";
import type { WxHour } from "./golfWeather";

// 라운드 브리핑을 밖으로 — 공유 글·카드 주소·전날 알림. 화면·카드·알림·검색엔진용 화면이 같은 말을 쓴다.
const D = "20261006";
const SUN = { rise: "06:30", set: "18:08" };
const h = (hr: number, over: Partial<WxHour> = {}): WxHour => ({ t: `${D}${String(hr).padStart(2, "0")}`, tmp: 18, pop: 0, kind: "clear", wsd: 2, pcp: null, ...over });
const day = (f: (hr: number) => Partial<WxHour> = () => ({})) => Array.from({ length: 17 }, (_, i) => h(i + 5, f(i + 5)));
const chilly = roundBrief(day((hr) => ({ tmp: hr < 9 ? 5 : 16 })), 7, SUN)!;
/** 한국 시각 → epoch ms */
const kst = (y: number, m: number, d: number, hh: number, mm = 0) => Date.UTC(y, m - 1, d, hh - 9, mm);

describe("주소에 싣는 라운드(?d=&t=)", () => {
    it("날짜 여덟 자리 + 티오프 시(05~19)만 받는다", () => {
        expect(parseRoundRef("20261006", "7")).toEqual({ ymd: "20261006", hour: 7 });
        expect(parseRoundRef("20261006", "07")).toEqual({ ymd: "20261006", hour: 7 });
        expect(parseRoundRef("20261006", "19")).toEqual({ ymd: "20261006", hour: 19 });
        for (const [d, t] of [["20261006", "4"], ["20261006", "20"], ["20261306", "7"], ["20260230", "7"], ["2026-10-06", "7"], ["20261006", "7.5"], ["20261006", ""],
            [null, "7"], ["20261006", null], [20261006, 7], [["20261006"], "7"], ["20261006", "7; drop"]] as [unknown, unknown][]) expect(parseRoundRef(d, t), `${d} ${t}`).toBeNull();
    });
    it("골프장 주소·카드 주소 — 슬러그는 인코딩", () => {
        const r = { ymd: "20261006", hour: 7 };
        expect(roundQuery(r)).toBe("d=20261006&t=7");
        expect(roundDeepPath("라비에벨CC", r)).toBe(`/golf/course/${encodeURIComponent("라비에벨CC")}?d=20261006&t=7`);
        expect(roundCardPath("라비에벨CC", r)).toBe(`/og/golf-round/${encodeURIComponent("라비에벨CC")}.png?d=20261006&t=7`);
        expect(roundDateLabel("20261006")).toBe("10월 6일(화)");
        expect(roundDateLabel("20270101")).toBe("1월 1일(금)");
    });
});

describe("단톡방에 붙는 글", () => {
    it("어디·언제 / 한 줄 평과 근거 / 챙길 것(그림) / 해 / 주소", () => {
        const text = roundShareText({ name: "라비에벨CC", ymd: D, teeLabel: "07시", brief: chilly, sunset: "18:08", url: "https://www.rankue.co.kr/golf/course/x?d=20261006&t=7" });
        expect(text.split("\n")).toEqual([
            "⛳ 라비에벨CC · 10월 6일(화) 07시 티오프",
            "쌀쌀한 새벽 티 — 비 0% · 바람 2m/s · 5°→16°",
            "챙길 것: 🧥 바람막이",
            "해 짐 18:08 · 18홀은 13:30 전에 티오프",
            "https://www.rankue.co.kr/golf/course/x?d=20261006&t=7",
        ]);
        expect(roundShareTitle("라비에벨CC")).toBe("라비에벨CC 라운드 브리핑");
    });
    it("챙길 것·해가 없으면 그 줄을 뺀다", () => {
        const plain = roundBrief(day(() => ({ tmp: 18 })), 12, SUN)!;
        const lines = roundShareText({ name: "가CC", ymd: D, teeLabel: "12:10", brief: { ...plain, gear: [] }, sunset: null, url: "u" }).split("\n");
        expect(lines).toHaveLength(3);
        expect(lines[0]).toBe("⛳ 가CC · 10월 6일(화) 12:10 티오프");
    });
});

describe("전날 저녁 알림", () => {
    it("보내는 시간 — 한국 시각 19:00~20:59. 21시부터는 조용한 시간이다", () => {
        expect([EVE_FROM_HOUR, EVE_UNTIL_HOUR]).toEqual([19, 21]);
        expect(eveWindow(kst(2026, 10, 5, 18, 59)).due).toBe(false);
        expect(eveWindow(kst(2026, 10, 5, 19, 0)).due).toBe(true);
        expect(eveWindow(kst(2026, 10, 5, 20, 59)).due).toBe(true);
        expect(eveWindow(kst(2026, 10, 5, 21, 0)).due).toBe(false);
        expect(eveWindow(kst(2026, 10, 5, 7, 0)).due).toBe(false);
    });
    it("'내일' — 한국 날짜의 하루를 UTC 글자로(시간대 없는 칸과 맞댄다)", () => {
        expect(eveWindow(kst(2026, 10, 5, 19, 30))).toEqual({ due: true, ymd: "20261006", fromUtc: "2026-10-05 15:00:00", toUtc: "2026-10-06 15:00:00" });
        // 달·해가 넘어가는 날
        expect(eveWindow(kst(2026, 10, 31, 20, 0))).toMatchObject({ ymd: "20261101", fromUtc: "2026-10-31 15:00:00", toUtc: "2026-11-01 15:00:00" });
        expect(eveWindow(kst(2026, 12, 31, 20, 0))).toMatchObject({ ymd: "20270101", fromUtc: "2026-12-31 15:00:00" });
        // 자정 직후(한국) — UTC 로는 아직 전날이지만 '내일'은 한국 날짜로 센다
        expect(eveWindow(kst(2026, 10, 6, 0, 30)).ymd).toBe("20261007");
    });
    it("제목은 내일 시각과 골프장, 본문은 한 줄 평·근거·챙길 것", () => {
        const teeMs = kst(2026, 10, 6, 7, 12);
        expect(eveNotice({ name: "라비에벨CC", teeMs, brief: chilly })).toEqual({ title: "내일 07:12 라비에벨CC 라운드", body: "쌀쌀한 새벽 티 · 비 0% · 바람 2m/s · 5°→16° · 챙길 것 바람막이" });
        expect(eveNotice({ name: "가CC", teeMs, brief: { ...chilly, gear: [] } }).body).toBe("쌀쌀한 새벽 티 · 비 0% · 바람 2m/s · 5°→16°");
    });
    it("날씨를 못 읽으면 지어내지 않는다 — 준비물만 권한다. 장소를 모르면 이름 없이", () => {
        const teeMs = kst(2026, 10, 6, 19, 0);
        expect(eveNotice({ name: "예시 스크린", teeMs, brief: null })).toEqual({ title: "내일 19:00 예시 스크린 라운드", body: "내일 라운드예요. 준비물을 한 번 챙겨 보세요." });
        expect(eveNotice({ name: null, teeMs }).title).toBe("내일 19:00 라운드");
    });
    it("누르면 — 골프장을 알면 그 라운드의 날씨, 모르면 내 예약", () => {
        const teeMs = kst(2026, 10, 6, 7, 12);
        expect(eveUrl("라비에벨CC", teeMs)).toBe(`/golf/course/${encodeURIComponent("라비에벨CC")}?d=20261006&t=7`);
        expect(eveUrl("라비에벨CC", teeMs, 6)).toContain("t=6"); // 예보 칸에 붙인 시각(나흘째의 세 시간 간격)
        expect(eveUrl(null, teeMs)).toBe("/golf/my-bookings");
        expect(parseRoundRef("20261006", String(new URL(`https://x${eveUrl("a", kst(2026, 10, 6, 21, 30))}`).searchParams.get("t")))).not.toBeNull(); // 범위 밖 시각은 19시로 붙인다
        expect(eveKey("abc-123")).toBe("golf-eve:abc-123");
    });
});
