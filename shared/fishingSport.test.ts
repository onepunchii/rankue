import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { crewSportOf, isOwnWorldSport } from "./crewSport";
import { sportForPath } from "./sportRoute";
import { SEA_AREAS } from "./fishingSea";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

/**
 * 낚시는 따로 선 종목이다(2026-10-14 오너: "낚시도 골프 · 등산처럼 완전히 구별 — 탭 크기도 같게, 누르면 당구로 가지 않게, 크루가 섞이지 않게").
 */
describe("낚시 — 따로 선 종목", () => {
    it("요청의 종목 · 주소의 종목이 낚시를 안다", () => {
        expect(crewSportOf("FISHING")).toBe("FISHING");
        expect(crewSportOf("fishing")).toBe("BILLIARDS");
        expect([isOwnWorldSport("FISHING"), isOwnWorldSport("HIKING"), isOwnWorldSport("GOLF"), isOwnWorldSport(null)]).toEqual([true, true, false, false]);
        expect(["/fishing", "/fishing/book", "/fishing/points?x=1", "/fishingx", "/dashboard"].map(sportForPath)).toEqual(["FISHING", "FISHING", "FISHING", null, null]);
    });
    it("크루가 섞이지 않는다 — 낚시의 정출판은 낚시 크루만, 종목 없는 목록에는 낚시 크루가 안 나간다", () => {
        expect(read("server/routes/modules/fishing.ts")).toContain('eq(hiqCrews.sportCategory, "FISHING")');
        expect(read("server/storage/crew.repo.ts")).toContain("not in ('HIKING', 'FISHING')");
        expect(read("server/storage/presence.repo.ts")).toContain("c.sport_category not in ('HIKING', 'FISHING')");
        // 낚시 크루는 낚시를 쓸 수 있는 회원만 만들고 든다
        expect(read("server/routes/modules/crew.ts").match(/FISHING_NOT_AVAILABLE/g)).toHaveLength(2);
    });
    it("채팅 · 알림도 낚시끼리만 — 1:1 방은 없고, 낚시 알림은 당구 알림함에 섞이지 않는다", () => {
        const chat = read("server/storage/chat.repo.ts");
        expect(chat).toContain('const dms = sport === "HIKING" || sport === "FISHING" ? [] :');
        expect(read("server/storage/notification.repo.ts")).toContain('ne(hiqNotifications.category, "FISHING")');
    });
    it("화면 — 제 머리줄 · 제 하단 탭을 두지 않고 공용 것을 쓴다(크기가 같다), 탭은 당구로 새지 않는다", () => {
        const page = read("client/src/fishing/FishingPage.tsx");
        expect(page).toContain('<SportHeader sport="FISHING" />');
        expect(page).toContain("<HiqNavigation />");
        expect(page).not.toContain("<nav ");
        expect(page).not.toContain("<header className=\"sticky");
        const nav = read("client/src/components/hiq/HiqNavigation.tsx");
        expect(nav).toContain('{ id: "trip", text: "출조", icon: LucideMap, path: "/fishing/trip", also: ["/fishing/points", "/fishing/rules"] },');
        // 조과 적기는 탭 · 떠 있는 단추에 두지 않는다(오너: "네비게이션바에 + 빼고") — 홈 표지의 단추다
        expect(page).not.toContain("fixed right-4");
        expect(page).toContain('data-testid="fishing-add">조과 적기</button>');
        expect(nav).toContain('{ id: "book", text: "어탁첩", icon: LucideStamp, path: "/fishing/book", also: ["/fishing/guide"] },');
        const ctx = read("client/src/contexts/SportContext.tsx");
        expect(ctx).toContain('else if (sport === "FISHING") document.documentElement.setAttribute("data-skin", "fishing");');
        expect(read("client/src/index.css")).toContain(':root[data-sport="GOLF"][data-skin="fishing"] {');
        expect(read("client/src/pages/hiq/dashboard.tsx")).toContain('<FishingHome view="home" />');
    });
    it("그림 — 표지 셋과 바다 일곱 곳의 표지가 다 있고(한 장 150KB 아래), 바다 지도는 종이 해도다", () => {
        for (const n of ["hero", "cover-trip", "cover-book", "cover-fresh", "cover-log", "band-market", "band-reservoir", "band-boats", ...SEA_AREAS.map((a) => `sea-${a.id}`)]) {
            const file = resolve(__dirname, `../client/public/fishing/art/${n}.webp`);
            expect(existsSync(file), n).toBe(true);
            expect(statSync(file).size, n).toBeLessThan(150_000);
        }
        const chart = read("client/src/fishing/SeaChart.tsx");
        // 구역 일곱 곳이 다 그려지고, 울릉도 · 독도 칸이 있다(윤곽선 자료에 없어 따로 그린다)
        for (const a of SEA_AREAS) expect(chart, a.id).toContain(a.id.includes("-") ? `"${a.id}": {` : `${a.id}: {`);
        expect(chart).toContain("울릉 · 독도");
        // 구역의 네모는 어림이라고 화면에 적는다
        expect(read("client/src/fishing/FishingPage.tsx")).toContain("구역의 네모는 어림이에요.");
    });
    it("낚시 크루의 홈에는 정출판이 서고, 당구의 것(정모 창 · 대회 · 베이스캠프)은 없다", () => {
        const home = read("client/src/components/hiq/tabs/CrewHomeTab.tsx");
        expect(home).toContain("<FishingCrewTrips crewId={crew.id} isMember={isMember} />");
        expect(home).toContain("{isMember && !isGolf && !ownWorld && (");
        expect(home).toContain("{!isFishing && <QuickAction icon={<LucideCalendarPlus />}");
    });
});
