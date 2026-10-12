import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { crewSportOf, HIKING_ACTIVITY_CATEGORY } from "./crewSport";
import { activityCategoryLabelKey } from "./crewActivity";
import { crewDescription } from "./crewMeta";
import { isBettingTag } from "./crewTags";
import { screenCrewProfile } from "../server/utils/crewModeration.js";

const root = resolve(__dirname, "..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

// 크루 · 채팅 라우트가 요청의 종목을 읽는 규칙 — 등산이 들어와도 당구 · 골프는 예전 그대로여야 한다.
describe("crewSportOf", () => {
    it("골프 · 등산은 그대로, 나머지는 전부 당구(종목을 안 주면 당구)", () => {
        expect(crewSportOf("GOLF")).toBe("GOLF");
        expect(crewSportOf("HIKING")).toBe("HIKING");
        for (const v of ["BILLIARDS", "", undefined, null, "MIXED", "golf", "hiking", 3, ["HIKING"], {}]) {
            expect(crewSportOf(v), String(v)).toBe("BILLIARDS");
        }
    });
});

describe("산악회 일정", () => {
    it("종류는 하나뿐이라 카드에 라벨을 붙이지 않는다 — 당구 · 골프 종류의 라벨은 그대로", () => {
        expect(HIKING_ACTIVITY_CATEGORY).toBe("HIKING_TRIP");
        expect(activityCategoryLabelKey(HIKING_ACTIVITY_CATEGORY)).toBeNull();
        expect(activityCategoryLabelKey("REGULAR_BILLIARDS")).toBe("billiardsCategorySelector.regularLabel");
        expect(activityCategoryLabelKey("REGULAR_ROUNDING")).toBe("categorySelector.regularRounding");
    });
});

describe("크루 페이지 설명(crewMeta)", () => {
    it("소개가 없는 산악회를 당구 크루라고 적지 않는다 — 당구 · 골프 크루의 문구는 그대로", () => {
        expect(crewDescription({ name: "새벽 능선", sportCategory: "HIKING" })).toBe("새벽 능선 — 랭큐 산악회. 함께 산에 오르고 산행 일정과 소식을 나눠요.");
        expect(crewDescription({ name: "죽방전설" })).toBe("죽방전설 — 랭큐 당구 크루. 함께 경기하고 전적·랭킹에 도전하세요.");
        expect(crewDescription({ name: "버디찬스", sportCategory: "GOLF" })).toBe("버디찬스 — 랭큐 당구 크루. 함께 경기하고 전적·랭킹에 도전하세요.");
        // 소개가 있으면 종목과 무관하게 소개가 나간다
        expect(crewDescription({ name: "새벽 능선", region: "서울 은평구", shortIntro: "주말 산행", sportCategory: "HIKING" })).toBe("새벽 능선 (서울 은평구) — 주말 산행");
    });
});

// 추천 태그는 고르면 그대로 서버로 간다 — 서버가 거절하는 태그(내기 권유 · 20자 초과)를 권하면 만들기가 3단계에서 막힌다.
describe("산악회 추천 태그(crewMgmt.hikingTags)", () => {
    it("다섯 언어 모두 내기 태그가 없고 서버가 받는 길이 안이다", () => {
        for (const l of ["ko", "en", "vi", "tr", "es"]) {
            const raw = read(`client/src/lib/i18n/${l}.ts`).match(/"crewMgmt\.hikingTags": "(.*)",/)?.[1];
            expect(raw, l).toBeTruthy();
            const tags = raw!.split(",").map((s) => s.trim()).filter(Boolean);
            expect(tags.length, l).toBeGreaterThanOrEqual(3);
            for (const tag of tags) {
                expect(tag.startsWith("#"), `${l} ${tag}`).toBe(true);
                expect(isBettingTag(tag), `${l} ${tag}`).toBe(false);
                expect(tag.length, `${l} ${tag}`).toBeLessThanOrEqual(20);
            }
        }
    });

    it("한국어 태그는 크루 만들기의 서버 필터(screenCrewProfile)를 통과한다 — 등산은 한국어 화면뿐이다", () => {
        const raw = read("client/src/lib/i18n/ko.ts").match(/"crewMgmt\.hikingTags": "(.*)",/)![1];
        const tags = raw.split(",").map((s) => s.trim()).filter(Boolean);
        // 화면은 한 번에 셋까지 고르게 한다 — 어느 셋을 골라도 통과해야 하므로 하나씩 본다
        for (const tag of tags) expect(screenCrewProfile({ name: "주말 산악회", tags: [tag] }).ok, tag).toBe(true);
    });
});
