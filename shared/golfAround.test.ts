import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
    NEARBY_MAX_TRIES, NEARBY_MENUS, NEARBY_KINDS, addressDong, addressRoad, cleanCourseName, menuChips, menuForBrief, nearbyMenu, nearbyQuery, nearbySearchNames,
} from "./golfAround";
import { roundBrief } from "./golfRoundBrief";
import type { WxHour } from "./golfWeather";

// 메뉴 칩(이모지)과 '날씨가 고른 첫 칩'. 낱말은 실측으로 고른 것만 — 여기서는 꼴과 규칙을 붙든다.
const D = "20261006";
const SUN = { rise: "06:30", set: "18:08" };
const h = (hr: number, over: Partial<WxHour> = {}): WxHour => ({ t: `${D}${String(hr).padStart(2, "0")}`, tmp: 18, pop: 0, kind: "clear", wsd: 2, pcp: null, ...over });
const day = (f: (hr: number) => Partial<WxHour> = () => ({})) => Array.from({ length: 17 }, (_, i) => h(i + 5, f(i + 5)));
const pickAt = (tee: number, f?: (hr: number) => Partial<WxHour>) => menuForBrief(roundBrief(day(f), tee, SUN)!);

describe("메뉴 칩", () => {
    it("열쇠·낱말·이모지가 겹치지 않고, 낱말은 한글 두세 자", () => {
        expect(new Set(NEARBY_MENUS.map((m) => m.key)).size).toBe(NEARBY_MENUS.length);
        expect(new Set(NEARBY_MENUS.map((m) => m.word)).size).toBe(NEARBY_MENUS.length);
        expect(new Set(NEARBY_MENUS.map((m) => m.emoji)).size).toBe(NEARBY_MENUS.length);
        for (const m of NEARBY_MENUS) { expect(m.key).toMatch(/^[a-z]+$/); expect(m.word).toMatch(/^[가-힣]{2,3}$/); }
    });
    it("이모지는 2017년 이전 것만 — 오래된 안드로이드에 없는 것(2019년 이후: U+1F90C~, U+1FA70~)은 쓰지 않는다", () => {
        for (const m of NEARBY_MENUS) {
            for (const ch of m.emoji) {
                const cp = ch.codePointAt(0)!;
                if (cp === 0xfe0f) continue; // 그림 꼴 선택자
                expect(cp >= 0x1fa70 || [0x1f9ca, 0x1f9c6, 0x1f9c7, 0x1f9c8, 0x1f9c9, 0x1f9cb].includes(cp), `${m.word} ${cp.toString(16)}`).toBe(false);
            }
        }
    });
    it("검색어는 골프장 이름 + 근처 + 낱말", () => {
        expect(nearbyQuery("라비에벨CC", "haejang")).toBe("라비에벨CC 근처 해장국");
        expect(nearbyQuery("라비에벨CC", "hanwoo")).toBe("라비에벨CC 근처 한우");
        expect(nearbyMenu("kalguksu")).toMatchObject({ word: "칼국수", emoji: "🍜" });
        expect(NEARBY_KINDS).toHaveLength(NEARBY_MENUS.length);
    });
    it("실측에서 약했던 낱말은 싣지 않는다(국수·고기집·파전·아침식사·횟집)", () => {
        const words = NEARBY_MENUS.map((m) => m.word);
        for (const w of ["국수", "고기집", "파전", "아침식사", "횟집"]) expect(words).not.toContain(w);
    });
    it("냉면 칩은 여름이거나 골라져 있을 때만 깔린다", () => {
        const has = (cur: Parameters<typeof menuChips>[0], month: number) => menuChips(cur, month).some((m) => m.key === "naengmyeon");
        expect(has("food", 10)).toBe(false);
        expect(has("food", 1)).toBe(false);
        expect(has("food", 6)).toBe(true);
        expect(has("food", 8)).toBe(true);
        expect(has("naengmyeon", 10)).toBe(true);
        expect(menuChips("food", 10)).toHaveLength(NEARBY_MENUS.length - 1);
        expect(menuChips("food", 10)[0].key).toBe("food");
    });
});

describe("날씨가 고른 첫 칩 — 한 줄 평의 갈래를 따른다", () => {
    it("쌀쌀한 새벽 티 → 해장국", () => {
        expect(pickAt(7, (hr) => ({ tmp: hr < 9 ? 9 : 16 }))).toEqual({ kind: "haejang", line: "쌀쌀한 새벽 티, 뜨끈한 국물부터" });
    });
    it("쌀쌀한 날(낮 티) → 해장국, 말만 다르다", () => {
        expect(pickAt(12, () => ({ tmp: 8 }))).toEqual({ kind: "haejang", line: "쌀쌀한 날엔 뜨끈한 국물" });
    });
    it("영하 → 해장국(언 몸)", () => {
        expect(pickAt(7, (hr) => ({ tmp: hr < 9 ? -2 : 4 }))).toEqual({ kind: "haejang", line: "언 몸 녹이는 뜨끈한 국물" });
    });
    it("비 → 칼국수 · 눈 → 해장국", () => {
        expect(pickAt(7, (hr) => (hr === 9 ? { kind: "rain", pop: 70 } : {})).kind).toBe("kalguksu");
        expect(pickAt(7, (hr) => (hr === 9 ? { kind: "snow", pop: 70, tmp: -1 } : { tmp: 1 }))).toEqual({ kind: "haejang", line: "눈 오는 날엔 뜨끈한 국물" });
    });
    it("비 소식만(30~59%) → 칼국수", () => {
        expect(pickAt(12, () => ({ pop: 40 }))).toEqual({ kind: "kalguksu", line: "비 소식 있는 날엔 따뜻한 칼국수" });
    });
    it("강풍 → 칼국수 · 더위 → 냉면", () => {
        expect(pickAt(12, () => ({ wsd: 10 })).kind).toBe("kalguksu");
        expect(pickAt(12, () => ({ tmp: 32 }))).toEqual({ kind: "naengmyeon", line: "더운 날엔 시원한 냉면" });
    });
    it("라베 날씨 → 한우", () => {
        expect(pickAt(12)).toEqual({ kind: "hanwoo", line: "라베 날씨, 끝나고 고기 한 판" });
    });
    it("야간 라운드 → 맛집(치기 전에)", () => {
        expect(pickAt(17)).toEqual({ kind: "food", line: "야간 라운드, 치기 전에 든든하게" });
    });
    it("무난한 날 — 1부는 치기 전 한 그릇, 2부는 점심, 3부는 이른 저녁", () => {
        const mild = () => ({ wsd: 6 }); // 바람 5m/s 이상이면 '라베 날씨'가 아니라 '무난한 날씨'
        expect(pickAt(7, mild)).toEqual({ kind: "haejang", line: "티오프 전에 든든하게 한 그릇" });
        expect(pickAt(12, mild)).toEqual({ kind: "food", line: "점심 먹고 여유 있게 티오프" });
        expect(menuForBrief({ tone: "ok", teeHour: 16, minTmp: 18, pop: 0 })).toEqual({ kind: "food", line: "라운드 전에 이른 저녁" });
    });
    it("술을 권하는 말이 없다 — 다들 차를 몰고 온다", () => {
        const tones = ["good", "ok", "rain", "snow", "wind", "cold", "heat", "night"] as const;
        for (const tone of tones) for (const teeHour of [7, 12, 17]) for (const pop of [0, 40]) for (const minTmp of [-3, 12]) {
            expect(menuForBrief({ tone, teeHour, minTmp, pop }).line).not.toMatch(/한잔|한 잔|술|맥주|소주|막걸리/);
        }
    });
});

describe("검색에 쓸 이름 — 이름 그대로는 다섯 곳 중 한 곳꼴로 안 잡힌다(2026-10-05 오너 신고: 스카이72)", () => {
    const names = (p: Parameters<typeof nearbySearchNames>[0]) => nearbySearchNames(p).map((x) => `${x.name}${x.area ? "@" : ""}`);
    it("이름 다듬기 — 괄호와 그 안, C.C·G.C 의 점, &·쉼표", () => {
        expect(cleanCourseName("SKY72 골프클럽(바다코스)")).toBe("SKY72 골프클럽");
        expect(cleanCourseName("구니C.C")).toBe("구니CC");
        expect(cleanCourseName("더반G.C.")).toBe("더반GC");
        expect(cleanCourseName("오션힐스포항C.C(")).toBe("오션힐스포항CC"); // 닫히지 않은 괄호
        expect(cleanCourseName("한맥C.C&노블리아")).toBe("한맥CC 노블리아");
        expect(cleanCourseName("클럽72CC 레이크,클래식코스")).toBe("클럽72CC 레이크 클래식코스");
        expect(cleanCourseName("레이크사이드CC")).toBe("레이크사이드CC"); // 멀쩡한 이름은 그대로
    });
    it("주소의 읍·면·동 — 괄호 속 동도, 도로 이름(공항동로)은 아니다", () => {
        expect(addressDong("경기 용인시 처인구 모현읍 능원로 181")).toBe("모현읍");
        expect(addressDong("울진군 매화면 오산리 산26")).toBe("매화면");
        expect(addressDong("안산시 상록구 태마당로28(부곡동)")).toBe("부곡동");
        expect(addressDong("대전 유성구 유성대로 1689번길 69(전민동 463번지)")).toBe("전민동");
        for (const a of ["인천시 중구 공항동로 392", "제주시 명림로 375", "경북 안동시 풍산로 1", "", null, undefined]) expect(addressDong(a), String(a)).toBeNull();
    });
    it("주소의 도로 이름 — 갈래 길 번호는 뗀다", () => {
        expect(addressRoad("제주시 명림로 375")).toBe("명림로");
        expect(addressRoad("인천 중구 영종해안남로321번길 184")).toBe("영종해안남로");
        expect(addressRoad("인천시 강화군 해안남로 474번길 59")).toBe("해안남로");
        expect(addressRoad("울산 울주군 서생면 용연길 206-52")).toBe("용연길");
        expect(addressRoad("제주특별자치도 제주시 516로 2695번지")).toBe("516로");
        for (const a of ["경기 용인시 처인구", "", null]) expect(addressRoad(a), String(a)).toBeNull();
    });
    it("스카이72 — 괄호를 뗀 이름이 먼저, 그다음 줄인 이름", () => {
        expect(names({ name: "SKY72 골프클럽(바다코스)", aliases: ["클럽72CC 오션코스", "클럽72CC 레이크,클래식코스"], city: "인천시", address: "인천시 중구 공항동로 392" }))
            .toEqual(["SKY72 골프클럽", "SKY72CC", "SKY72 골프장", "클럽72CC 오션코스", "클럽72CC 레이크 클래식코스", "인천 공항동로@"]);
    });
    it("점이 든 이름·긴 이름·별칭·마지막 낱말을 뗀 이름·주소", () => {
        expect(names({ name: "구니C.C", city: "군위군", address: "경북 군위군 군위읍 동서길 1" })).toEqual(["구니CC", "구니 골프장", "군위 군위읍@"]);
        expect(names({ name: "뉴데이컨트리클럽", city: "천안시", address: "충남 천안시 동남구 북면 위례성로 1" })).toEqual(["뉴데이컨트리클럽", "뉴데이CC", "뉴데이 골프장", "천안 북면@"]);
        expect(names({ name: "클럽72CC 하늘코스", aliases: ["SKY72 골프클럽(하늘코스)"], city: "인천시", address: "인천시 중구 공항동로135번길 267" }))
            .toEqual(["클럽72CC 하늘코스", "SKY72 골프클럽", "클럽72CC", "인천 공항동로@"]);
        expect(names({ name: "라헨느", city: "제주시", address: "제주시 명림로 375" })).toEqual(["라헨느", "제주 명림로@"]);
        expect(names({ name: "대덕복지센터", city: null, address: "대전 유성구 유성대로 1689번길 69(전민동 463번지)" })).toEqual(["대덕복지센터", "대전 전민동@"]);
    });
    it("멀쩡한 이름은 첫 이름이 그대로다 — 대부분 한 번에 끝난다", () => {
        const got = nearbySearchNames({ name: "레이크사이드CC", city: "용인시", address: "경기 용인시 처인구 모현읍 능원로 181" });
        expect(got[0]).toEqual({ name: "레이크사이드CC" });
        expect(got.at(-1)).toEqual({ name: "용인 모현읍", area: true });
    });
    it("겹치지 않고, 여섯을 넘지 않고, 주소 이름은 늘 마지막에 남는다", () => {
        const got = nearbySearchNames({ name: "가나 다라 마바 골프클럽(동코스)", aliases: ["별칭하나CC", "별칭둘CC", "별칭셋CC"], city: "용인시", address: "경기 용인시 처인구 백암면 1" });
        expect(got.length).toBeLessThanOrEqual(NEARBY_MAX_TRIES);
        expect(new Set(got.map((x) => x.name)).size).toBe(got.length);
        expect(got.at(-1)).toEqual({ name: "용인 백암면", area: true });
        expect(got.filter((x) => x.area)).toHaveLength(1);
        // 이름이 비어도 터지지 않는다
        expect(nearbySearchNames({ name: "(가)", city: "용인시", address: "" }).length).toBeGreaterThanOrEqual(1);
    });
});

describe("골프장 상세 — 구역의 key 는 서로 다르다(2026-10-05 '소개'가 두 번 뜬 사고)", () => {
    it("같은 key 를 쓰는 형제가 없다 — 넷이 똑같이 key={d.slug} 였을 때 옛 구역이 지워지지 않았다", () => {
        const src = readFileSync(path.resolve(process.cwd(), "client/src/golf/pages/GolfCoursePage.tsx"), "utf8");
        const body = src.slice(src.indexOf("function Body("));
        const keys = [...body.matchAll(/<(\w+) key=\{([^}]+\}?`?)\}/g)].map((m) => `${m[2]}`);
        expect(keys.length).toBeGreaterThanOrEqual(4);
        expect(new Set(keys).size).toBe(keys.length);
        expect(body).not.toMatch(/<\w+ key=\{d\.slug\}/);
    });
});
