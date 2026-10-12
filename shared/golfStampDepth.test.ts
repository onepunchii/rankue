import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { STAMP_ALL_OPEN, STAMP_BOOKS } from "./golfStampBooks";
import {
    DEPTH_GOLD_VISITS, bookDepthProgress, depthNext, golfSeasonOf, kstDate, markerTiersDue, nineKey, slotNineKeys, stampDepths, type DepthRound, type SlotDepth,
} from "./golfStampDepth";
import {
    SEASON_TAG_TIERS, SPECIAL_MARKERS, parseSeasonTagKey, parseSpecialKey, seasonTagYears, seasonTagsDue, specialKey, specialMarkersDue, type SpecialRound,
} from "./golfStampExtras";
import { GOLF_DEPTH_FULL_SAMPLE, GOLF_DEPTH_SAMPLE, GOLF_MARKER_TIER_FULL_SAMPLE, GOLF_SPECIAL_SAMPLE, GOLF_STAMP_SAMPLE, GOLF_TAG_SAMPLE } from "./golfStampSample";

/**
 * 도장의 깊이 · 볼마커 등급 · 시즌 태그 · 한정 볼마커(2026-10-12 오너: "골프 마무리 하고 등산 넘어가자").
 * 다시 간 라운드가 수집이 되는 규칙 — 인증 라운드만, 타수는 보지 않는다.
 */
const root = resolve(__dirname, "..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");
/** 한국 시각 낮 12시의 그날 */
const kst = (y: number, m: number, d: number, h = 12) => Date.UTC(y, m - 1, d, h - 9);
const slot = (bookId: string, i = 0) => STAMP_BOOKS.find((b) => b.id === bookId)!.slots[i];
const round = (bookId: string, i: number, at: number, nines?: string[]): DepthRound => ({ at, clubId: slot(bookId, i).clubIds[0], name: slot(bookId, i).ledgerNames[0], nines });

describe("철 · 코스 이름", () => {
    it("철은 한국 날짜로 — 3~5 봄 · 6~8 여름 · 9~11 가을 · 12~2 겨울. 자정 근처도 한국 날짜다", () => {
        expect([1, 2, 3, 5, 6, 8, 9, 11, 12].map((m) => golfSeasonOf(kst(2026, m, 15)))).toEqual(["winter", "winter", "spring", "spring", "summer", "summer", "autumn", "autumn", "winter"]);
        // UTC 로는 2월 28일 15:30 이지만 한국은 3월 1일 00:30 — 봄
        expect(golfSeasonOf(Date.UTC(2026, 1, 28, 15, 30))).toBe("spring");
        expect(kstDate(Date.UTC(2025, 11, 31, 15, 30))).toEqual({ year: 2026, month: 1, day: 1 });
    });

    it("코스 이름의 알맹이 — 띄어쓰기 · 대소문자 · 꼬리를 떼고 방위는 한 글자로", () => {
        expect(nineKey("레이크 IN")).toBe(nineKey("레이크in"));
        expect(nineKey("문화IN_18홀라운드")).toBe(nineKey("문화 IN"));
        expect(nineKey("EAST")).toBe(nineKey("동"));
        expect(nineKey("East Course")).toBe("동");
        expect(nineKey("IN코스")).toBe("in");
        expect(nineKey("")).toBe("");
    });

    it("골프장의 코스 목록 — 같은 코스의 두 표기는 하나로, 이름 있는 코스가 있으면 이름 없는 IN · OUT 은 뺀다", () => {
        // 파주: 원장에 EAST · WEST · 동 · 서 가 다 있다 — 코스는 둘
        expect(slotNineKeys(["EAST", "WEST", "동", "서"])).toHaveLength(2);
        // 원장이 두 줄(회원제 · 대중제)이고 한쪽이 코스 이름 없이 들어온 골프장
        expect(slotNineKeys(["듄스", "레이크 IN", "레이크 OUT", "IN", "OUT"])).toEqual(["듄스", "레이크in", "레이크out"]);
        // 보통의 18홀
        expect(slotNineKeys(["OUT", "IN"])).toEqual(["out", "in"]);
        expect(slotNineKeys(["Hills", "Lake", "Valley", "HILLS", "LAKE", "VALLEY"])).toHaveLength(3);
        expect(slotNineKeys([])).toEqual([]);
    });
});

describe("코스 조각 · 금테 · 사철", () => {
    const three = { [slot("seohae", 0).key]: ["East", "South", "West"] };

    it("코스가 셋 이상인 골프장 — 돈 코스만큼 조각이 차고, 전부 돌면 금테", () => {
        const first = stampDepths([round("seohae", 0, kst(2026, 4, 1), ["East", "South"])], three).get(slot("seohae", 0).key)!;
        expect(first).toMatchObject({ visits: 1, nines: { got: 2, total: 3 }, gold: false, goldAt: null });
        expect(depthNext(first)).toBe("코스 2/3");
        // 같은 두 코스를 다시 돌면 방문만 는다 — 금테가 아니다
        const again = stampDepths([round("seohae", 0, kst(2026, 4, 1), ["East", "South"]), round("seohae", 0, kst(2026, 5, 1), ["SOUTH", "east"])], three).get(slot("seohae", 0).key)!;
        expect(again).toMatchObject({ visits: 2, nines: { got: 2, total: 3 }, gold: false });
        const done = stampDepths([round("seohae", 0, kst(2026, 4, 1), ["East", "South"]), round("seohae", 0, kst(2026, 6, 1), ["West", "East"])], three).get(slot("seohae", 0).key)!;
        expect(done).toMatchObject({ nines: { got: 3, total: 3 }, gold: true, goldAt: kst(2026, 6, 1) });
    });

    it("원장에 없는 코스 이름은 조각으로 치지 않는다 — 없는 코스를 돌았다고 하지 않는다", () => {
        const d = stampDepths([round("seohae", 0, kst(2026, 4, 1), ["North", "아무이름"])], three).get(slot("seohae", 0).key)!;
        expect(d.nines).toEqual({ got: 0, total: 3 });
        expect(d.gold).toBe(false);
    });

    it("18홀 골프장 · 코스 자료가 없는 골프장 — 두 번 다녀오면 금테", () => {
        expect(DEPTH_GOLD_VISITS).toBe(2);
        const key = slot("gyeonggi", 0).key;
        const one = stampDepths([round("gyeonggi", 0, kst(2026, 4, 1), ["OUT", "IN"])], { [key]: ["OUT", "IN"] }).get(key)!;
        expect(one).toMatchObject({ visits: 1, nines: null, gold: false });
        expect(depthNext(one)).toBe("한 번 더 가면 금테");
        const two = stampDepths([round("gyeonggi", 0, kst(2026, 4, 1)), round("gyeonggi", 0, kst(2026, 4, 20))], {}).get(key)!;
        expect(two).toMatchObject({ visits: 2, nines: null, gold: true, goldAt: kst(2026, 4, 20) });
    });

    it("사철 — 네 철에 다 가야 한다. 받은 때는 넷째 철의 라운드", () => {
        const key = slot("gangwon", 0).key;
        const rs = [kst(2026, 4, 1), kst(2026, 7, 1), kst(2026, 10, 1)].map((t) => round("gangwon", 0, t));
        const three4 = stampDepths(rs, {}).get(key)!;
        expect(three4).toMatchObject({ seasons: ["spring", "summer", "autumn"], four: false, gold: true });
        expect(depthNext(three4)).toBe("사철 3/4");
        const four = stampDepths([...rs, round("gangwon", 0, kst(2027, 1, 10))], {}).get(key)!;
        expect(four).toMatchObject({ four: true, fourAt: kst(2027, 1, 10) });
        expect(depthNext(four)).toBeNull();
    });

    it("도장첩 밖의 골프장 · 때를 모르는 라운드는 세지 않는다", () => {
        expect(stampDepths([{ at: kst(2026, 4, 1), clubId: "00000000-0000-0000-0000-000000000000", name: "아무 골프장" }], {}).size).toBe(0);
        expect(stampDepths([{ at: "모름", clubId: slot("seohae").clubIds[0], name: "" }], {}).size).toBe(0);
    });
});

describe("볼마커의 등급", () => {
    const deep = (bookIds: string[], over: Partial<SlotDepth>) => new Map(STAMP_BOOKS.filter((b) => bookIds.includes(b.id)).flatMap((b) => b.slots.map((s, i): [string, SlotDepth] => [
        s.key, { slotKey: s.key, bookId: b.id, visits: 2, nines: null, seasons: [], gold: false, goldAt: null, four: false, fourAt: null, ...over, ...(over.gold ? { goldAt: 1000 + i } : {}), ...(over.four ? { fourAt: 5000 + i } : {}) },
    ])));

    it("그 권의 도장이 전부 금테면 블랙, 전부 사철이면 자개 — 받은 때는 마지막 칸이 그렇게 된 때", () => {
        const n = STAMP_BOOKS.find((b) => b.id === "chungcheong")!.slots.length;
        expect(markerTiersDue(deep(["chungcheong"], { gold: true }))).toEqual([{ tier: "black", key: "chungcheong", earnedAt: 1000 + n - 1 }]);
        const both = markerTiersDue(deep(["chungcheong"], { gold: true, four: true }));
        expect(both.map((d) => d.tier)).toEqual(["black", "pearl"]);
        expect(both[1].earnedAt).toBe(5000 + n - 1);
    });

    it("한 칸이라도 빠지면 등급은 없다. 초대장 권은 등급이 없다", () => {
        const map = deep(["chungcheong"], { gold: true });
        map.delete(STAMP_BOOKS.find((b) => b.id === "chungcheong")!.slots[0].key);
        expect(markerTiersDue(map)).toEqual([]);
        const invite = STAMP_BOOKS.filter((b) => b.kind === "invite").map((b) => b.id);
        expect(markerTiersDue(deep(invite, { gold: true, four: true }))).toEqual([]);
    });

    it("누구나 일곱 권이 전부 금테면 '누구나 전부' 볼마커도 블랙", () => {
        const open = STAMP_BOOKS.filter((b) => b.kind === "open").map((b) => b.id);
        const due = markerTiersDue(deep(open, { gold: true }));
        expect(due.map((d) => d.key).sort()).toEqual([...open, STAMP_ALL_OPEN].sort());
        expect(due.every((d) => d.tier === "black")).toBe(true);
    });

    it("권의 진행 — 금테 · 사철이 몇 칸인가", () => {
        const b = STAMP_BOOKS.find((x) => x.id === "seohae")!;
        const map = deep(["seohae"], { gold: true });
        expect(bookDepthProgress(b.slots.map((s) => s.key), map)).toEqual({ gold: b.slots.length, four: 0, total: b.slots.length });
        expect(bookDepthProgress(b.slots.map((s) => s.key), new Map())).toEqual({ gold: 0, four: 0, total: b.slots.length });
    });
});

describe("시즌 태그", () => {
    const times = (n: number, y = 2026) => Array.from({ length: n }, (_, i) => kst(y, 1 + (i % 12), 1 + Math.floor(i / 12) * 3));

    it("그해의 인증 라운드 수로 가죽이 바뀐다 — 1 · 12 · 24", () => {
        expect(SEASON_TAG_TIERS.map((t) => [t.id, t.at])).toEqual([["brown", 1], ["navy", 12], ["burgundy", 24]]);
        const y = (n: number) => seasonTagYears(times(n))[0];
        expect(y(1)).toMatchObject({ year: 2026, rounds: 1, tier: { id: "brown" }, next: { tier: { id: "navy" }, left: 11 } });
        expect(y(12).tier?.id).toBe("navy");
        expect(y(23).next).toMatchObject({ tier: { id: "burgundy" }, left: 1 });
        expect(y(24)).toMatchObject({ tier: { id: "burgundy" }, next: null });
    });

    it("해는 한국 날짜로 가르고, 올해는 라운드가 없어도 맨 앞에 온다", () => {
        // UTC 로는 2025-12-31 이지만 한국은 2026-01-01
        expect(seasonTagYears([Date.UTC(2025, 11, 31, 16)])[0]).toMatchObject({ year: 2026, rounds: 1 });
        const ys = seasonTagYears(times(3, 2025), 2026);
        expect(ys.map((t) => [t.year, t.rounds, t.tier?.id ?? null])).toEqual([[2026, 0, null], [2025, 3, "brown"]]);
        expect(ys[0].next).toMatchObject({ tier: { id: "brown" }, left: 1 });
    });

    it("받은 때는 그해의 N번째 라운드를 끝낸 때 — 해마다 따로", () => {
        const ts = [...times(12, 2025), ...times(1, 2026)];
        const due = seasonTagsDue(ts);
        expect(due.map((d) => d.key)).toEqual(["2025:brown", "2025:navy", "2026:brown"]);
        expect(due[1].earnedAt).toBe([...times(12, 2025)].sort((a, b) => a - b)[11]);
        expect(parseSeasonTagKey("2025:navy")).toMatchObject({ year: 2025, tier: { id: "navy" } });
        expect(parseSeasonTagKey("navy")).toBeNull();
        expect(parseSeasonTagKey("2025:gold")).toBeNull();
    });
});

describe("한정 볼마커", () => {
    const r = (at: number, over: Partial<SpecialRound> = {}): SpecialRound => ({ at, elite: true, ...over });
    const keys = (rs: SpecialRound[], depths = new Map<string, SlotDepth>(), stamps: any[] = []) => specialMarkersDue(rs, depths, stamps).map((d) => d.key);

    it("판정할 수 있는 것만 연다 — 여덟 개. 생일 · 첫눈 · 바다 · 섬 · 숲 · 구름 · 대회는 없다", () => {
        expect(SPECIAL_MARKERS.map((m) => m.id)).toEqual(["spring", "summer", "autumn", "winter", "three", "newyear", "holeinone", "grand"]);
        expect(SPECIAL_MARKERS.filter((m) => m.hidden).map((m) => m.id)).toEqual(["newyear"]);
        expect(new Set(SPECIAL_MARKERS.map((m) => m.art)).size).toBe(SPECIAL_MARKERS.length);
        const text = SPECIAL_MARKERS.map((m) => `${m.name} ${m.how}`).join(" ");
        // '홀인원'의 원은 돈이 아니다 — 금액 꼴만 본다
        expect(text).not.toMatch(/\d\s*원|만\s*원|내기|술|맥주|상금|경품/);
    });

    it("계절 볼마커 — 그 철에 도장첩의 골프장에서. 해마다 다시 열린다", () => {
        expect(keys([r(kst(2026, 4, 5)), r(kst(2026, 4, 20)), r(kst(2026, 10, 3)), r(kst(2027, 4, 2))])).toEqual(["spring:2026", "autumn:2026", "spring:2027"]);
        // 도장첩 밖의 골프장은 세지 않는다
        expect(keys([r(kst(2026, 4, 5), { elite: false })])).toEqual([]);
        expect(specialKey("spring", 2026)).toBe("spring:2026");
        expect(specialKey("holeinone", 2026)).toBe("holeinone");
        expect(parseSpecialKey("spring:2026")).toMatchObject({ marker: { id: "spring" }, year: 2026 });
        expect(parseSpecialKey("spring")).toBeNull();
        expect(parseSpecialKey("holeinone")).toMatchObject({ marker: { id: "holeinone" }, year: null });
        expect(parseSpecialKey("nope")).toBeNull();
    });

    it("새해 첫 티 — 한국 날짜 1월 1일. 도장첩 밖의 골프장도 된다", () => {
        expect(keys([r(kst(2027, 1, 1, 15), { elite: false })])).toEqual(["newyear"]);
        expect(keys([r(kst(2027, 1, 2, 9), { elite: false })])).toEqual([]);
    });

    it("홀인원 — 타수 1, 파를 아는 홀에서만", () => {
        const strokes = [4, 5, 1, ...Array(15).fill(4)], pars = [4, 4, 3, ...Array(15).fill(4)];
        expect(keys([r(kst(2026, 7, 1), { elite: false, strokes, pars })])).toEqual(["holeinone"]);
        expect(keys([r(kst(2026, 7, 1), { elite: false, strokes, pars: pars.map((p, i) => (i === 2 ? null : p)) })])).toEqual([]);
        expect(keys([r(kst(2026, 7, 1), { elite: false, strokes })])).toEqual([]);
    });

    it("세 코스 — 코스가 셋 이상인 골프장의 금테. 18홀의 금테(두 번 방문)는 아니다", () => {
        const base = { slotKey: "a", bookId: "seohae", visits: 2, seasons: [], gold: true, goldAt: 777, four: false, fourAt: null } as const;
        expect(keys([], new Map([["a", { ...base, nines: { got: 3, total: 3 } }]]))).toEqual(["three"]);
        expect(keys([], new Map([["a", { ...base, nines: null }]]))).toEqual([]);
    });

    it("그랜드슬램 — 도장첩의 골프장을 전부. 하나라도 빠지면 없다", () => {
        const all = STAMP_BOOKS.flatMap((b) => b.slots).map((s, i) => ({ clubId: s.clubIds[0], name: s.ledgerNames[0], firstDate: kst(2024, 1, 1) + i * 86_400_000 }));
        const due = specialMarkersDue([], new Map(), all);
        expect(due).toEqual([{ key: "grand", earnedAt: kst(2024, 1, 1) + (all.length - 1) * 86_400_000 }]);
        expect(specialMarkersDue([], new Map(), all.slice(1))).toEqual([]);
    });
});

describe("예시", () => {
    it("예시 인물의 깊이는 진짜 규칙으로 계산한 것 — 한 번씩만 갔으니 금테는 없고, 코스 셋 이상인 곳은 한 코스가 남았다", () => {
        expect(GOLF_DEPTH_SAMPLE).toHaveLength(GOLF_STAMP_SAMPLE.length);
        expect(GOLF_DEPTH_SAMPLE.every((d) => d.visits === 1 && !d.gold && !d.four)).toBe(true);
        const rings = GOLF_DEPTH_SAMPLE.filter((d) => d.nines);
        expect(rings.length).toBeGreaterThanOrEqual(3);
        expect(rings.every((d) => d.nines!.got === 2 && d.nines!.total >= 3)).toBe(true);
        expect(GOLF_TAG_SAMPLE[0]).toMatchObject({ year: 2026, rounds: GOLF_STAMP_SAMPLE.length, tier: { id: "brown" } });
        expect(GOLF_SPECIAL_SAMPLE).toEqual(["spring:2026", "summer:2026", "autumn:2026"]);
    });

    it("다 모았을 때의 예시 — 볼마커가 세 등급으로 섞여 보인다. 깊이가 그 등급과 맞는다", () => {
        const map = new Map(GOLF_DEPTH_FULL_SAMPLE.map((d) => [d.slotKey, d]));
        for (const b of STAMP_BOOKS.filter((x) => x.kind === "open")) {
            const p = bookDepthProgress(b.slots.map((s) => s.key), map);
            const tier = GOLF_MARKER_TIER_FULL_SAMPLE[b.id] ?? null;
            expect(p.four === p.total, b.id).toBe(tier === "pearl");
            expect(p.gold === p.total, b.id).toBe(tier != null);
        }
        expect(Object.values(GOLF_MARKER_TIER_FULL_SAMPLE).sort()).toEqual(["black", "black", "pearl"]);
    });
});

describe("서버 · 화면", () => {
    it("받은 기록은 도장첩과 같은 표에 — 등급(black · pearl) · 태그(tag) · 한정(special). 판정은 같은 인증 라운드로", () => {
        const repo = read("server/storage/golf.repo.ts");
        const fn = repo.slice(repo.indexOf("async syncStampAwards(memberId: string)"), repo.indexOf("async getStampNineNames()"));
        expect(fn).toContain("const depths = stampDepths(rounds.map(");
        expect(fn).toContain("...markerTiersDue(depths).map((d): StampAwardDue => ({ kind: d.tier, key: d.key, earnedAt: d.earnedAt })),");
        expect(fn).toContain('...seasonTagsDue(rounds.map((r) => r.at)).map((d): StampAwardDue => ({ kind: "tag", key: d.key, earnedAt: d.earnedAt })),');
        expect(fn).toContain('.map((d): StampAwardDue => ({ kind: "special", key: d.key, earnedAt: d.earnedAt })),');
        // 코스 이름을 못 읽어도 받은 기록은 적는다(조각 없이 판정)
        expect(fn).toContain('this.getStampNineNames().catch(');
        // 인증 라운드만 — getGolfPinRounds 가 거른다
        const rounds = repo.slice(repo.indexOf("async getGolfPinRounds(memberId: string)"), repo.indexOf("async getGolfPinPhotoTimes"));
        expect(rounds).toContain("const verified = rows.filter((r) => countsOnSite(r.onSite));");
        expect(rounds).toContain("nines: [s.frontCourseName ?? null, s.backCourseName ?? null],");
    });

    it("읽기 — 본인 것만, 아무것도 적지 않는다", () => {
        const api = read("server/routes/modules/golf.ts");
        expect(api).toContain('router.get("/stamp-depth", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {\n    return sendSuccess(res, await storage.golf.getGolfStampDepth(req.userId!));');
        const repo = read("server/storage/golf.repo.ts");
        const fn = repo.slice(repo.indexOf("async getGolfStampDepth(memberId: string)"), repo.indexOf("async getGolfPinRounds(memberId: string)"));
        expect(fn).not.toMatch(/insert|update\(|delete\(|syncStampAwards/);
    });

    it("화면 — 도장은 깊이를 인증 도장에만 그리고, 방문자는 내 깊이를 부르지 않는다", () => {
        const ink = read("client/src/golf/stamps/InkStamp.tsx");
        expect(ink).toContain('const deep = state === "on" ? depth ?? null : null;');
        const hook = read("client/src/golf/stamps/useStampDepth.ts");
        expect(hook).toContain("enabled: !!member,");
        const book = read("client/src/golf/pages/StampBook.tsx");
        expect(book).toContain("depth={s.stamp ? depth.of(s.slot.key) : null}");
        // 초대장 권에는 등급 칸을 그리지 않는다
        expect(book).toContain("{!invite && (\n                                    <ul className=\"mt-3 flex gap-2\" data-testid=\"stamp-tiers\">");
        const extra = read("client/src/golf/stamps/ExtraParts.tsx");
        expect([...extra.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].every((m) => Number(m[1]) >= 12)).toBe(true);
        expect(extra.replace(/\/\*[\s\S]*?\*\//, "")).not.toMatch(/\b(?:bg|text|border|ring)-(?:white|black)\b/);
    });
});
