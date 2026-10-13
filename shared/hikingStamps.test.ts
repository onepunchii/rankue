import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { HIKING_FEATURES, hikingFeatureSize, hikingFeaturesInMonth, hikingFeaturesOf } from "./hikingFeatures";
import { HIKING_GRADES, hikingGrade, hikingGradeArt, hikingGradesDue, summitHeightSum } from "./hikingGrade";
import { HIKING_GROUPS, HIKING_REGIONS, HIKING_TRAITS, hikingGroup, inHikingGroup } from "./hikingMountains";
import { HIKING_GRANDS, HIKING_PINS, hikingAwardsDue, hikingBookStates, hikingBooks, hikingSeasonOf, judgeSummit, kstDay, mountainStamps, summitHint, type StampMountain, type Summit, summitReach, summitRewards, SUMMIT_RADIUS_M } from "./hikingStamps";

const mt = (id: string, over: Partial<StampMountain> = {}): StampMountain => ({ id, slug: id, name: id, heightM: 800, region: "gangwon", tier: 1, lists: ["kfs100"], traits: [], ...over });
const at = (d: string) => Date.parse(`${d}T03:00:00Z`);
const ok = (mountainId: string, d: string): Summit => ({ mountainId, at: at(d), verified: true });

describe("산행 등급", () => {
    it("여덟 등급 — 들머리에서 하늘금까지, 문턱은 늘어나기만 한다", () => {
        expect(HIKING_GRADES.map((g) => g.name)).toEqual(["들머리", "숲길", "계곡", "능선", "암릉", "정상", "운해", "하늘금"]);
        expect(HIKING_GRADES.map((g) => g.min)).toEqual([0, 1, 3, 7, 15, 30, 60, 100]);
        expect(new Set(HIKING_GRADES.map((g) => g.id)).size).toBe(HIKING_GRADES.length);
    });
    it("인증한 산의 수로 정한다 — 문턱에 닿는 순간 오른다", () => {
        expect(hikingGrade(0).grade.id).toBe("trailhead");
        expect(hikingGrade(1).grade.id).toBe("forest");
        expect(hikingGrade(2).grade.id).toBe("forest");
        expect(hikingGrade(3).grade.id).toBe("valley");
        expect(hikingGrade(29).grade.id).toBe("rock");
        expect(hikingGrade(30).grade.id).toBe("summit");
        expect(hikingGrade(100).grade.id).toBe("skyline");
        expect(hikingGrade(540).grade.id).toBe("skyline");
    });
    it("다음 등급까지 남은 산과 온 만큼", () => {
        const s = hikingGrade(9);
        expect(s.grade.id).toBe("ridge");
        expect(s.next?.id).toBe("rock");
        expect(s.left).toBe(6);
        expect(s.ratio).toBeCloseTo(2 / 8);
        const top = hikingGrade(100);
        expect(top.next).toBeNull();
        expect(top.left).toBe(0);
        expect(top.ratio).toBe(1);
    });
    it("이상한 값은 들머리다", () => {
        expect(hikingGrade(-3).grade.id).toBe("trailhead");
        expect(hikingGrade(Number.NaN).count).toBe(0);
        expect(hikingGrade(2.9).count).toBe(2);
    });
    it("오른 등급과 그때 — 들머리는 받는 것이 아니다", () => {
        const times = [10, 20, 30, 40, 50, 60, 70];
        expect(hikingGradesDue(times)).toEqual([{ id: "forest", earnedAt: 10 }, { id: "valley", earnedAt: 30 }, { id: "ridge", earnedAt: 70 }]);
        expect(hikingGradesDue([])).toEqual([]);
    });
    it("정상 높이의 합 — 같은 산은 한 번, 높이를 모르는 산은 뺀다", () => {
        const h = new Map<string, number | null>([["a", 1708], ["b", 1947], ["c", null]]);
        expect(summitHeightSum(["a", "b", "a", "c", "x"], (id) => h.get(id))).toBe(3655);
    });
    it("등급 이름에 당구 · 골프의 말이 섞이지 않는다", () => {
        expect(JSON.stringify(HIKING_GRADES)).not.toMatch(/메달|방패|다마|볼마커|브론즈|실버|골드|플래티넘|다이아|마스터/);
    });
});

describe("철 따라 묶은 산", () => {
    it("네 묶음 — 명단은 산의 id 이고 겹치지 않는다", () => {
        expect(HIKING_FEATURES.map((f) => f.id)).toEqual(["azalea", "maple", "reeds", "snow"]);
        for (const f of HIKING_FEATURES) {
            expect(hikingFeatureSize(f.id)).toBeGreaterThan(5);
            expect(f.note).toMatch(/소개 글에 .+ 나오는 산림청 100대 명산/);
        }
    });
    it("한 산이 여러 묶음에 든다", () => {
        // 화왕산 — 억새 · 철쭉 · 눈꽃
        expect([...hikingFeaturesOf("Q5952091")].sort()).toEqual(["azalea", "reeds", "snow"]);
        expect(hikingFeaturesOf("없는산")).toEqual([]);
    });
    it("달로 고른다 — 10월은 단풍 · 억새, 7월은 없다", () => {
        expect(hikingFeaturesInMonth(10).map((f) => f.id)).toEqual(["maple", "reeds"]);
        expect(hikingFeaturesInMonth(1).map((f) => f.id)).toEqual(["snow"]);
        expect(hikingFeaturesInMonth(5).map((f) => f.id)).toEqual(["azalea"]);
        expect(hikingFeaturesInMonth(7)).toEqual([]);
    });
    it("산의 묶음(/hiking/lists/<id>)에 특성으로 들어간다 — 목록의 설명은 어떻게 뽑았는지를 적는다", () => {
        for (const f of HIKING_FEATURES) {
            const g = hikingGroup(f.id)!;
            expect(g.kind).toBe("trait");
            expect(g.note).toBe(f.note);
            expect(HIKING_TRAITS.find((t) => t.id === f.id)?.how).toBe(f.season);
            expect(inHikingGroup(g, { lists: ["kfs100"], traits: [f.id] })).toBe(true);
            expect(inHikingGroup(g, { lists: ["kfs100"], traits: [] })).toBe(false);
        }
        expect(new Set(HIKING_GROUPS.map((g) => g.id)).size).toBe(HIKING_GROUPS.length);
    });
});

describe("도장첩 · 받는 것", () => {
    const mountains: StampMountain[] = [
        mt("a", { heightM: 1708, lists: ["kfs100", "nationalparks"], traits: ["over1500", "over1000", "snow"] }),
        mt("b", { heightM: 900, traits: ["reeds"] }),
        mt("c", { region: "capital", heightM: 600 }),
        mt("low", { region: "capital", heightM: 296, lists: [], traits: ["under500"] }),
        mt("p", { region: "capital", lists: ["kfs100plus"] }),
        mt("z", { tier: 3, lists: [] }),
    ];
    it("권역 · 특성 · 철로 묶는다 — 칸이 없는 권은 만들지 않고, 명산만 칸이 된다", () => {
        const books = hikingBooks(mountains);
        expect(books.map((b) => b.id)).toEqual(["kfs-capital", "kfs-gangwon", "plus-capital", "nationalparks", "over1500", "under500", "reeds", "snow"]);
        // 낮은 산도 한 권 — 해발 500m 아래의 명산(2026-10-13)
        expect(books.find((b) => b.id === "under500")).toMatchObject({ kind: "theme", name: "가볍게 오르는 산", note: "해발 500m 아래의 명산 1곳" });
        expect(books.find((b) => b.id === "under500")!.slots.map((m) => m.id)).toEqual(["low"]);
        expect(books.find((b) => b.id === "kfs-gangwon")!.slots.map((m) => m.id)).toEqual(["a", "b"]);
        expect(books.find((b) => b.id === "reeds")!.kind).toBe("season");
        expect(books.every((b) => b.slots.every((m) => m.tier === 1))).toBe(true);
        expect(new Set(books.map((b) => b.art)).size).toBe(books.length);
    });
    it("인증한 산만 칸이 찬다 — 적어 둔 기록은 흐린 도장", () => {
        const stamps = mountainStamps([{ mountainId: "a", at: at("2026-10-01"), verified: false }, ok("b", "2026-10-02")]);
        const st = hikingBookStates(hikingBooks(mountains), stamps).find((x) => x.book.id === "kfs-gangwon")!;
        expect(st.got).toBe(1);
        expect(st.done).toBe(false);
        expect(st.slots.find((x) => x.m.id === "a")!.record).not.toBeNull();
        expect(st.slots.find((x) => x.m.id === "a")!.stamp).toBeNull();
    });
    it("도장을 얻은 때는 첫 인증의 때 — 먼저 적어 둔 기록의 날이 아니다", () => {
        const [s] = mountainStamps([{ mountainId: "a", at: at("2026-09-01"), verified: false }, ok("a", "2026-10-05"), ok("a", "2026-12-20")]);
        expect(s.verified).toBe(true);
        expect(kstDay(s.firstAt)).toBe("2026-10-05");
        expect(s.count).toBe(2);
        expect(s.seasons).toEqual(["autumn", "winter"]);
    });
    it("받는 것 — 와펜(권 완성) · 등급 · 핀이 그 조건을 채운 때에", () => {
        const due = hikingAwardsDue(mountains, [ok("a", "2026-10-01"), ok("b", "2026-10-08"), ok("c", "2026-10-15")]);
        const keys = due.map((d) => `${d.kind}:${d.key}`);
        expect(keys).toContain("patch:kfs-gangwon");
        expect(keys).toContain("patch:kfs-capital");
        expect(keys).toContain("grand:kfs-all");
        expect(keys).toContain("patch:snow");
        expect(keys).toContain("grade:forest");
        expect(keys).toContain("grade:valley");
        expect(keys).not.toContain("grade:ridge");
        expect(keys).toContain("pin:first");
        expect(keys).toContain("pin:over1000");
        expect(keys).not.toContain("patch:plus-capital");
        expect(kstDay(due.find((d) => d.kind === "grade" && d.key === "valley")!.earnedAt)).toBe("2026-10-15");
        expect(kstDay(due.find((d) => d.key === "kfs-gangwon")!.earnedAt)).toBe("2026-10-08");
        // 받은 순서
        expect(due.map((d) => d.earnedAt)).toEqual([...due.map((d) => d.earnedAt)].sort((x, y) => x - y));
    });
    it("인증이 없으면 받는 것이 없다", () => {
        expect(hikingAwardsDue(mountains, [{ mountainId: "a", at: at("2026-10-01"), verified: false }])).toEqual([]);
    });
    it("사철 핀 — 네 철에 인증한 산행이 다 있을 때", () => {
        const three = [ok("a", "2026-04-10"), ok("a", "2026-07-10"), ok("a", "2026-10-10")];
        expect(hikingAwardsDue(mountains, three).some((d) => d.key === "seasons")).toBe(false);
        expect(hikingAwardsDue(mountains, [...three, ok("b", "2027-01-10")]).some((d) => d.key === "seasons")).toBe(true);
        expect(hikingSeasonOf(at("2026-12-01"))).toBe("winter");
        expect(hikingSeasonOf(Date.parse("2026-02-28T16:00:00Z"))).toBe("spring"); // 한국은 3월 1일 새벽
    });
    it("빨리 · 밤 · 악천후로 받는 것은 없다", () => {
        expect(JSON.stringify([HIKING_PINS, HIKING_GRANDS, HIKING_GRADES])).not.toMatch(/빨리|최단|야간|밤 산행|새벽|일출 전|우중|폭우|폭설|태풍/);
    });
});

describe("정상 인증", () => {
    it("정상에서 150m 안이고 위치가 또렷할 때만", () => {
        expect(judgeSummit(80, 20)).toEqual({ verified: true, bucket: "<150m", reason: "ok" });
        expect(judgeSummit(150, null).verified).toBe(true);
        expect(judgeSummit(151, 10)).toMatchObject({ verified: false, bucket: "150-500m", reason: "far" });
        expect(judgeSummit(50, 400)).toMatchObject({ verified: false, reason: "coarse" });
        expect(judgeSummit(null, 10)).toMatchObject({ verified: false, reason: "no-fix" });
        expect(judgeSummit(3000, 10).bucket).toBe(">2km");
    });
    it("안 될 때의 한 줄", () => {
        expect(summitHint("far", "150-500m")).toMatch(/가까워요/);
        expect(summitHint("coarse", "coarse")).toMatch(/흐려요/);
        expect(summitHint("no-summit", "no-fix")).toMatch(/정상의 자리/);
    });
});

describe("그림 — 이름을 건 것은 다 있다", () => {
    const ART = resolve(__dirname, "../client/public/hiking/art");
    const has = (f: string) => existsSync(resolve(ART, f));
    it("등급 휘장 여덟 · 핀 여덟", () => {
        for (const g of HIKING_GRADES) expect(has(`${hikingGradeArt(g.id)}.webp`), g.id).toBe(true);
        for (const p of HIKING_PINS) expect(has(`${p.art}.webp`), p.art).toBe(true);
    });
    it("도장첩 와펜 — 권역(100대 명산 · 플러스) · 특성 · 철 · 완등", () => {
        const arts = [...HIKING_REGIONS.flatMap((r) => [`kfs-${r.id}`, `plus-${r.id}`]), "nationalparks", "over1500", "highest50", "island", "provincialparks", "under500", ...HIKING_FEATURES.map((f) => f.id), ...HIKING_GRANDS.map((g) => g.art)];
        for (const a of arts) expect(has(`patch-${a}.webp`), a).toBe(true);
    });
    it("산 와펜 — 100대 명산 백 장, 철 묶음의 산은 다 그림이 있다", () => {
        const files = new Set(readdirSync(resolve(ART, "mt")).filter((f) => f.endsWith(".webp")).map((f) => f.replace(/\.webp$/, "")));
        expect(files.size).toBe(100);
        const src = readFileSync(resolve(__dirname, "hikingFeatures.ts"), "utf8");
        const ids = Array.from(src.matchAll(/"(Q\d+)"/g)).map((m) => m[1]);
        expect(ids.length).toBeGreaterThan(50);
        for (const id of ids) expect(files.has(id), id).toBe(true);
    });
    it("목록 · 특성 묶음의 표지", () => {
        for (const g of HIKING_GROUPS) expect(has(`cover-list-${g.id}.webp`), g.id).toBe(true);
    });
});

describe("도장 카드 — 정상까지 · 받는 것(2026-10-13)", () => {
    const summit = { lat: 38.1191, lng: 128.4654 };
    it("정상까지의 직선 거리 — 반경 안이면 지금 인증할 수 있다고 말한다", () => {
        const at = summitReach({ lat: 38.1192, lng: 128.4655 }, summit)!;
        expect(at.ready).toBe(true); expect(at.m).toBeLessThan(SUMMIT_RADIUS_M); expect(at.text).toContain("지금 인증할 수 있어요");
        const near = summitReach({ lat: 38.1162, lng: 128.4654 }, summit)!;          // 320m 남쪽
        expect(near.ready).toBe(false); expect(near.text).toMatch(/^정상까지 직선 3[0-9]0m · 150m 안에서 인증돼요$/);
        expect(summitReach({ lat: 38.0742, lng: 128.4654 }, summit)!.text).toMatch(/^정상까지 직선 5\.0km/);
        expect(summitReach({ lat: 35.3, lng: 127.7 }, summit)!.text).toMatch(/^정상까지 직선 3\d\dkm/);
    });
    it("자리를 모르거나 터무니없이 멀면 줄을 그리지 않는다", () => {
        expect(summitReach(null, summit)).toBeNull();
        expect(summitReach({ lat: 38, lng: 128 }, { lat: null, lng: null })).toBeNull();
        expect(summitReach({ lat: 35.68, lng: 139.76 }, summit)).toBeNull();          // 도쿄
    });
    it("받는 것 — 도장은 늘, 와펜 · 도장첩 · 등급은 해당할 때만. 이미 인증한 산은 등급을 말하지 않는다", () => {
        expect(summitRewards({ patch: true, books: 6, gradeLeft: 1, nextGrade: "숲길", done: false })).toEqual(["정상 도장", "산 와펜", "도장첩 6권에 한 칸", "등급 \'숲길\'"]);
        expect(summitRewards({ patch: false, books: 0, gradeLeft: 4, nextGrade: "능선", done: false })).toEqual(["정상 도장", "다음 등급까지 4곳"]);
        expect(summitRewards({ patch: true, books: 5, gradeLeft: 3, nextGrade: "능선", done: true })).toEqual(["정상 도장", "산 와펜", "도장첩 5권에 한 칸"]);
        expect(summitRewards({ patch: false, books: 1, gradeLeft: 0, nextGrade: null, done: false })).toEqual(["정상 도장", "도장첩 1권에 한 칸"]);
    });
    it("고정: 카드는 위치를 묻지 않고 받을 수 있을 때만 거리를 보이고, 그 값을 어디에도 보내지 않는다", () => {
        const page = readFileSync(resolve(__dirname, "..", "client/src/hiking/pages/MountainPage.tsx"), "utf8");
        expect(page).toContain("const reach = summitReach(loc.here, d);");
        expect(page).toContain('data-testid="mountain-stamp-reach"');
        expect(page).toContain('data-testid="mountain-stamp-ask"');
        // 가고 싶은 산은 카드의 머리띠 안으로 — 아래의 큰 단추는 없다
        expect(page).toContain("<WishButton key={`wish:${d.id}`} slug={d.slug} mountainId={d.id} compact />");
        expect(page.match(/<WishButton /g)?.length).toBe(1);
    });
});
