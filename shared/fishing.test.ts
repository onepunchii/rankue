import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FISHING_PUBLIC, FISHING_SPECIES, FISHING_SPOTS, fishingSidoShort, cleanCatch, fishingDayLabel, fishingDex, fishingKstDay, fishingSpotName, fishingSummary, type FishingCatch } from "./fishing";

const TODAY = "2026-10-14";
const ok = (over: Record<string, unknown> = {}) => cleanCatch({ day: "2026-10-12", place: " 여수  국동항 ", spot: "boat", species: "갈치", count: "12", lengthCm: "92.46", note: " 물때 8물 ", ...over }, TODAY);
const row = (over: Partial<FishingCatch>): FishingCatch => ({ id: "x", day: "2026-10-12", place: "여수 국동항", spot: "boat", species: "갈치", lengthCm: null, count: 1, weightKg: null, ji: null, released: false, photoUrl: null, thumbUrl: null, note: null, createdAt: "2026-10-12T00:00:00.000Z", ...over });

describe("낚시는 아직 닫혀 있다", () => {
    it("전면 공개 스위치는 꺼져 있고, 문은 역할(슈퍼관리자)로만 연다 — 번호 · 이메일로 가르지 않는다", () => {
        expect(FISHING_PUBLIC).toBe(false);
        const lib = readFileSync(resolve(__dirname, "../server/lib/fishingAccess.ts"), "utf8");
        expect(lib).toContain("isSuperAdminRole(role)");
        expect(lib).not.toMatch(/010|@/);
        // 길마다 문지기를 거친다
        const routes = readFileSync(resolve(__dirname, "../server/routes/modules/fishing.ts"), "utf8");
        expect(routes.match(/requireAuth, gate,/g)).toHaveLength(14);
        // 정출판은 그 크루에 든 사람만 — 목록 · 만들기 · 한 판 · 조과 붙이기 넷 다 크루를 확인한다
        expect(routes.match(/await inCrew\(req\.userId!/g)).toHaveLength(4);
        // 조과에 붙는 사진은 이 회원이 우리 저장소에 올린 것만
        expect(routes).toContain("isOwnFishingPhotoUrl(v.photoUrl, req.userId!, FISHING_PHOTO_CATEGORY)");
    });
});

describe("조과 한 줄 다듬기", () => {
    it("앞뒤 공백을 걷고, 길이는 소수 한 자리로", () => {
        const c = ok();
        expect(c).toEqual({ ok: true, value: { day: "2026-10-12", place: "여수 국동항", spot: "boat", species: "갈치", lengthCm: 92.5, count: 12, weightKg: null, ji: null, released: false, photoUrl: null, thumbUrl: null, note: "물때 8물", tideSea: null } });
        // 물때를 세는 바다는 두 값만 받는다
        expect([ok({ tideSea: "south" }), ok({ tideSea: "east" })].map((r) => (r.ok ? r.value.tideSea : "x"))).toEqual(["south", null]);
        expect(ok({ weightKg: "1.234", ji: "4", released: true })).toMatchObject({ ok: true, value: { weightKg: 1.23, ji: 4, released: true } });
        for (const bad of [{ weightKg: 0 }, { weightKg: 301 }, { ji: 0 }, { ji: 11 }]) expect(ok(bad).ok, JSON.stringify(bad)).toBe(false);
    });
    it("길이 · 갈래 · 한마디는 비워도 된다", () => {
        expect(ok({ lengthCm: "", spot: "space", note: "" })).toMatchObject({ ok: true, value: { lengthCm: null, spot: null, note: null } });
        expect(ok({ count: undefined })).toMatchObject({ ok: true, value: { count: 1 } });
    });
    it("받지 않는 것 — 앞날 · 틀린 날짜 · 빈 곳 · 빈 어종 · 터무니없는 수", () => {
        for (const bad of [{ day: "2026-10-15" }, { day: "2026-13-40" }, { day: "어제" }, { day: "1999-12-31" }, { place: "" }, { place: "a" }, { species: " " }, { count: 0 }, { count: 1000 }, { lengthCm: 0 }, { lengthCm: 401 }]) {
            expect(ok(bad).ok, JSON.stringify(bad)).toBe(false);
        }
        expect(cleanCatch(null, TODAY).ok).toBe(false);
    });
    it("오늘 것은 적을 수 있다 — 한국 날짜로", () => {
        expect(ok({ day: TODAY }).ok).toBe(true);
        expect(fishingKstDay(Date.parse("2026-10-13T15:00:00Z"))).toBe("2026-10-14");
    });
});

describe("한눈에 · 도감", () => {
    const list = [
        row({ id: "1", day: "2026-10-12", species: "갈치", count: 12, lengthCm: 92.5 }),
        row({ id: "2", day: "2026-10-12", species: "고등어", count: 5 }),
        row({ id: "3", day: "2026-09-01", place: "예당저수지", spot: "lake", species: "붕어", count: 3, lengthCm: 31 }),
        row({ id: "4", day: "2026-08-15", place: "예당저수지", species: "붕어", count: 1, lengthCm: 36.5 }),
    ];
    it("출조는 날 수로 · 마릿수는 더하고 · 최대어는 길이를 잰 것 가운데", () => {
        expect(fishingSummary(list)).toEqual({ trips: 3, fish: 21, species: 3, places: 2, biggest: { species: "갈치", lengthCm: 92.5, day: "2026-10-12", place: "여수 국동항" } });
        expect(fishingSummary([])).toEqual({ trips: 0, fish: 0, species: 0, places: 0, biggest: null });
        expect(fishingSummary([row({ lengthCm: null })]).biggest).toBeNull();
    });
    it("도감 — 어종별 마릿수 · 가장 큰 길이 · 처음 만난 날, 많이 잡은 순", () => {
        expect(fishingDex(list)).toEqual([
            { species: "갈치", count: 12, best: 92.5, first: "2026-10-12" },
            { species: "고등어", count: 5, best: null, first: "2026-10-12" },
            { species: "붕어", count: 4, best: 36.5, first: "2026-08-15" },
        ]);
    });
    it("날짜 — 올해가 아니면 해를 적는다", () => {
        expect(fishingDayLabel("2026-10-12", TODAY)).toBe("10월 12일");
        expect(fishingDayLabel("2025-05-11", TODAY)).toBe("2025년 5월 11일");
    });
    it("시도 이름을 짧게", () => {
        expect(["충청북도", "경기도", "인천광역시", "강원특별자치도", "전남광주통합특별시", "세종특별자치시", null].map(fishingSidoShort)).toEqual(["충북", "경기", "인천", "강원", "전남 · 광주", "세종", ""]);
    });
    it("갈래 · 어종 칩은 겹치지 않는다", () => {
        expect(new Set(FISHING_SPOTS.map((s) => s.id)).size).toBe(FISHING_SPOTS.length);
        expect(new Set(FISHING_SPECIES).size).toBe(FISHING_SPECIES.length);
        expect(fishingSpotName("rock")).toBe("갯바위");
        expect(fishingSpotName("nope")).toBe("");
    });
});
