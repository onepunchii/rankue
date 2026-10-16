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
        // 2026-10-16 오너가 고른 정리안 — 오늘 바다 · 크루 · 수족관(메인) · 일지 · 채팅. 출조는 홈의 '바다 도구함'으로
        expect(nav).toContain('{ id: "home", text: "오늘 바다", icon: LucideHome, path: "/dashboard", also: ["/fishing/trip", "/fishing/points", "/fishing/rules"] },');
        expect(nav).toContain('{ id: "tank", text: "수족관", icon: LucideFish, path: "/fishing/tank", also: ["/fishing/book", "/fishing/guide", "/fishing/rank"] },');
        expect(nav).toContain('{ id: "log", text: "일지", icon: LucideBookOpen, path: "/fishing/log", also: ["/fishing/gear"] },');
        // 조과 적기는 탭 · 떠 있는 단추에 두지 않는다(오너: "네비게이션바에 + 빼고") — 홈 표지의 단추다
        expect(page).not.toContain("fixed right-4");
        expect(page).toContain('data-testid="fishing-add" data-tour="fs-add">조과 적기</button>');
        // 수족관 = 헤엄치는 어탁(three 를 더 쓰지 않는다) + 어탁첩. 홈에는 미리보기 한 칸과 바다 도구함
        const tank = read("client/src/fishing/FishingAquarium.tsx");
        expect(tank).not.toContain('from "three"');
        expect(tank).toContain("export function isNightKst(ms = Date.now()): boolean {");
        // 수조의 동작 — 물을 누르면 먹이 셋 · 물고기를 누르면 놀란 뒤 그 어종의 한 장 · 처음 보는 어종은 위에서 물보라와 함께
        expect(tank).toContain("foodRef.current.push(...[-9, 0, 9].map((dx, i) => ({ x: x + dx, y: y + (i === 1 ? -4 : 0), born: now })));");
        expect(tank).toContain("window.setTimeout(() => onFish?.(hit.id), 320);");
        expect(tank).toContain('const SEEN_KEY = "rankue.fishing.tank.seen";');
        expect(tank).not.toContain("roundRect(");
        expect(page).toContain('{(tab === "tank" || tab === "book") && (');
        expect(page).toContain('<FishingAquarium list={empty ? [] : list} mini onOpen={() => setTab("tank")} />');
        expect(page).toContain('testid="fishing-tools"');
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
    it("바다의 픽셀 — 지점의 값을 거리로 섞은 어림이라고 적고, 닿는 거리 밖은 칠하지 않는다 · 칸을 누르면 그 바다의 한 장", () => {
        const chart = read("client/src/fishing/SeaChart.tsx");
        expect(chart).toContain('data-testid="fishing-chart-pixels"');
        expect(chart).toContain("export const PIXEL_REACH_KM = 42;");
        expect(chart).toContain("if (d > PIXEL_REACH_KM) continue;");
        const page = read("client/src/fishing/FishingPage.tsx");
        expect(page).toContain("바다의 칸은 그 값을 거리로 섞은 어림이고 지점에서 {PIXEL_REACH_KM}km 안만 칠했어요. 랭큐가 매긴 값이 아니에요.");
        // 칸을 누르면 팝업 — 이 근처 내 기록은 위치가 아니라 적은 곳의 이름으로 찾는다(조과는 위치를 재지 않는다)
        const popup = read("client/src/fishing/SeaPopup.tsx");
        expect(page).toContain("<SeaPopup spot={picked}");
        expect(popup).toContain('data-testid="fishing-spot-mine"');
        expect(popup).toContain("랭큐가 매긴 값이 아니에요.");
        // 사진 밑에 작가 · 라이선스(위키미디어 공용 — CC BY · BY-SA 의 표시 의무)
        expect(popup).toContain("<PhotoCredit key={c.name}");
        for (const f of [page, popup, chart]) expect(f).not.toMatch(/navigator\.geolocation|upload\.wikimedia\.org/);
        // 확대 · 단추 그림
        expect(chart).toContain("useBoxZoom(HOME, HOME, VIEW.w / 6)");
        for (const n of ["wave", "wind", "temp", "tide", "storm"]) expect(existsSync(resolve(__dirname, `../client/public/fishing/art/icon-${n}.webp`)), n).toBe(true);
    });
});

