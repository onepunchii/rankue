import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { boardLabel, boardLayout, labelSpot, weekStart } from "./tourBoard";
import { CAROM_CITIES } from "./caromCities";
import { cityKo, type UpcomingEvent } from "./tournamentMeta";

/** 대회 허브의 일정판(2026-10-19) — 창 · 막대 · 짧은 이름 · 이름 자리 */
const ev = (p: Partial<UpcomingEvent>): UpcomingEvent => ({
    source: "PBA", league: "PBA", kind: null, title: "", titleEn: null, startDate: "2026-10-20", endDate: "2026-10-26",
    place: null, countryCode: null, country: null, org: null, postponed: false, href: null, officialUrl: "https://example.org", ...p,
});

describe("일정판 — 창과 막대", () => {
    it("창은 이번 주 월요일부터(일요일도 그 주 월요일)", () => {
        expect(weekStart("2026-10-19")).toBe("2026-10-19");
        expect(weekStart("2026-10-25")).toBe("2026-10-19");
        expect(weekStart("2026-11-01")).toBe("2026-10-26");
    });
    it("어제 시작한 대회는 왼쪽이 잘린 막대, 창 밖 대회는 빠진다, 줄은 큰 투어부터", () => {
        const b = boardLayout([
            ev({ source: "UMB", league: null, title: "World Cup", startDate: "2026-11-02", endDate: "2026-11-08", place: "Yanggu" }),
            ev({ league: "LPBA", startDate: "2026-10-18", endDate: "2026-10-25" }),
            ev({ league: "PBA", startDate: "2026-10-20", endDate: "2026-10-26" }),
            ev({ league: "DREAM", startDate: "2027-01-09", endDate: "2027-01-12" }),
        ], "2026-10-19", 8);
        expect(b.start).toBe("2026-10-19");
        expect(b.lanes).toEqual(["PBA", "LPBA", "UMB"]);
        const lpba = b.bars.find((x) => x.lane === "LPBA")!;
        expect(lpba.cutL).toBe(true);
        expect(lpba.from).toBe(0);
        expect(lpba.live).toBe(true);
        // 끝날 저녁까지 — 10/25 일요일 밤 = 7일째 끝
        expect(lpba.to).toBeCloseTo(7 / 56);
        const umb = b.bars.find((x) => x.lane === "UMB")!;
        expect(umb.from).toBeCloseTo(14 / 56);
        expect(umb.live).toBe(false);
        expect(b.todayX).toBeCloseTo(0.5 / 56);
    });
    it("다이아몬드는 주마다, 달 이름은 창 첫날 + 1일", () => {
        const b = boardLayout([], "2026-10-19", 8);
        expect(b.ticks).toHaveLength(7);
        expect(b.months.map((m) => m.month)).toEqual([10, 11, 12]);
        expect(b.months[1].x).toBeCloseTo(13 / 56);
    });
});

describe("일정판 — 짧은 이름", () => {
    it("PBA 일정 이름에서 뜻만", () => {
        expect(boardLabel(ev({ title: "PBA 제6차 투어" }))).toEqual({ k: "leg", n: 6 });
        expect(boardLabel(ev({ league: "TEAM", title: "PBA 팀리그 - 4라운드" }))).toEqual({ k: "round", n: 4 });
        expect(boardLabel(ev({ league: "TEAM", title: "PBA 팀리그 - 포스트시즌" }))).toEqual({ k: "post" });
        expect(boardLabel(ev({ league: "DREAM", title: "2026-2027 PBA 드림투어 5차전" }))).toEqual({ k: "leg", n: 5 });
        expect(boardLabel(ev({ league: "DREAM", title: "2026-2027 PBA 드림투어 8차전 (파이널)" }))).toEqual({ k: "final", n: 8 });
        expect(boardLabel(ev({ title: "PBA 월드 챔피언십" }))).toEqual({ k: "world" });
        expect(boardLabel(ev({ league: "LPBA", title: "지금 잘사는 방법 zgm NH농협카드 LPBA 챔피언십 26-27" }))).toEqual({ k: "sponsor", text: "NH농협카드" });
        expect(boardLabel(ev({ title: "크라운해태 PBA 챔피언십 2026" }))).toEqual({ k: "sponsor", text: "크라운해태" });
        // 영어는 두 낱말 — 'Card' 하나로는 뜻이 없다
        expect(boardLabel(ev({ title: "x NH농협카드 PBA 챔피언십", titleEn: "NH Nonghyup Card PBA Championship 26-27" }), "en")).toEqual({ k: "sponsor", text: "Nonghyup Card" });
        expect(boardLabel(ev({ title: "x", titleEn: "Recreation area for Nationals high1 Resort PBA CHAMPIONSHIP 2026" }), "en")).toEqual({ k: "sponsor", text: "high1 Resort" });
    });
    it("UMB 는 도시, 도시가 없으면 나라", () => {
        expect(boardLabel(ev({ source: "UMB", league: null, place: "Yanggu" }))).toEqual({ k: "city", city: "Yanggu" });
        expect(boardLabel(ev({ source: "UMB", league: null, place: null, countryCode: "CO" }))).toEqual({ k: "country", code: "CO" });
    });
    it("이름은 막대 안 → 오른쪽 빈자리 → 생략", () => {
        expect(labelSpot("6차", 40, 0)).toBe("in");
        expect(labelSpot("NH농협카드", 28, 200)).toBe("right");
        expect(labelSpot("NH농협카드", 28, 30)).toBe("none");
    });
});

describe("도시 한글 이름은 한 벌", () => {
    it("허브 · 세계랭킹 지도 · 일정판이 같은 이름을 쓴다(호치민 · 베겔 …)", () => {
        for (const c of Object.values(CAROM_CITIES)) {
            const ko = cityKo(c.en.normalize("NFD").replace(/[̀-ͯ]/g, ""));
            if (ko !== c.en.normalize("NFD").replace(/[̀-ͯ]/g, "")) expect(c.ko, c.en).toBe(ko);
        }
        expect(cityKo("Yanggu")).toBe("양구");
        expect(cityKo("Gradignan")).toBe("그라디냥");
    });
    it("허브가 일정판 · UMB 지도를 단다", () => {
        const s = readFileSync(resolve(__dirname, "..", "client/src/pages/hiq/tournaments.tsx"), "utf8");
        expect(s).toContain("<ScheduleBoard");
        expect(s).toContain("<UmbEventMap");
    });
});
