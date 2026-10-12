import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TIERS } from "./sim/rank";
import { kstMonthRange, type MatchDelta, type MonthlyGame } from "./simMonthly";
import { MEDAL_RANKS, SHELF_FIRST_MONTH, monthAwards, monthlyMedal, monthsToClose, ratingsBefore, shelfCounts, shelfPreview } from "./simShelf";

/**
 * 장식장(2026-10-12 오너: "랭킹을 달로 해야겠지? 그래서 장식장에 보관이 되도록 매월초가 되면 리셋되고 그렇지?" → "추천대로").
 * 달이 끝나면 그 달의 것을 한 번 준다: 이달의 랭킹 1~3등 메달(그 달에 점수를 올린 사람만) · 그 달 5판을 친 사람에게 달이 끝날 때의 등급 배지.
 */
let seq = 0;
/** 그 달 d 일(한국 시각 정오)에 끝난 레이팅 판 — delta 는 방장 기준 */
function game(month: string, day: number, hostId: string, guestId: string, delta: number, gameType: MonthlyGame = "3c"): MatchDelta {
    const [from] = kstMonthRange(month);
    return { id: `m${++seq}`, hostId, guestId, gameType, endedMs: from + (day - 1) * 86_400_000 + 12 * 3_600_000, delta, winner: delta > 0 ? 0 : delta < 0 ? 1 : null };
}
/** 같은 두 사람의 n 판 */
const games = (month: string, hostId: string, guestId: string, deltas: number[], gameType: MonthlyGame = "3c") => deltas.map((d, i) => game(month, i + 1, hostId, guestId, d, gameType));

describe("메달이 되는 등수", () => {
    it("1~3등이고 그 달에 점수를 올렸을 때만 — 사람이 적은 달에 점수를 잃고 3등이 된 사람은 받지 않는다", () => {
        expect(monthlyMedal(1, 47)).toBe(1);
        expect(monthlyMedal(2, 22)).toBe(2);
        expect(monthlyMedal(3, 1)).toBe(3);
        expect(monthlyMedal(3, -34)).toBeNull();   // 2026-10 3쿠션의 실제 3등
        expect(monthlyMedal(1, -12)).toBeNull();   // 2026-09 4구의 실제 1등(혼자 순위에 올랐다)
        expect(monthlyMedal(2, 0)).toBeNull();
        expect(monthlyMedal(4, 60)).toBeNull();
        expect(monthlyMedal(null, 60)).toBeNull();
        expect(MEDAL_RANKS).toEqual([1, 2, 3]);
    });
});

describe("한 달의 마감(monthAwards)", () => {
    // 10월 3쿠션: a 가 b 를 다섯 번 이겼다(+12씩) → a +60 · b −60, c 와 d 는 네 판뿐
    const oct = [...games("2026-10", "a", "b", [12, 12, 12, 12, 12]), ...games("2026-10", "c", "d", [12, 12, 12, 12])];

    it("메달: 점수를 올린 1~3등 · 등급 배지: 그 달 5판을 친 사람 모두에게 달이 끝날 때의 등급", () => {
        const got = monthAwards(oct, "2026-10");
        expect(got.map((a) => `${a.memberId}:${a.kind}:${a.rank ?? a.tier}`)).toEqual(["a:month_rank:1", "a:month_tier:silver", "b:month_tier:iron"]);
        const medal = got[0];
        expect(medal).toMatchObject({ month: "2026-10", gameType: "3c", points: 60, matches: 5, wins: 5, rating: 1060 });
        // b 는 2등이지만 −60 — 메달은 없고 배지는 받는다(940 = 아이언)
        expect(got[2]).toMatchObject({ memberId: "b", rank: null, tier: "iron", points: -60, rating: 940 });
        // 네 판만 친 c · d 는 아무것도 없다
        expect(got.some((a) => a.memberId === "c" || a.memberId === "d")).toBe(false);
    });

    it("달이 끝날 때의 등급은 그때까지의 레이팅이다 — 앞 달의 판은 들어가고 뒷 달의 판은 안 들어간다", () => {
        const all = [
            ...games("2026-09", "a", "x", [12, 12, 12, 12, 12, 12, 12, 12]),   // 9월에 +96 → 1096
            ...oct,                                                             // 10월에 +60 → 1156(골드)
            ...games("2026-11", "a", "x", [12, 12, 12, 12, 12, 12, 12, 12, 12]),   // 11월의 것은 10월 마감에 안 들어간다
        ];
        const a = monthAwards(all, "2026-10").find((x) => x.memberId === "a" && x.kind === "month_tier")!;
        expect(a).toMatchObject({ tier: "gold", rating: 1156, points: 60 });
        expect(ratingsBefore(all, kstMonthRange("2026-10")[1]).get("a|3c")).toBe(1156);
        expect(ratingsBefore(all, kstMonthRange("2026-09")[1]).get("a|3c")).toBe(1096);
    });

    it("두 종목을 다 채웠으면 등급 배지는 더 높은 쪽 하나 — 메달은 종목마다 따로", () => {
        const both = [
            ...games("2026-10", "a", "b", [12, 12, 12, 12, 12], "3c"),                                     // a 3쿠션 1060(실버)
            ...games("2026-10", "a", "c", [12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12], "4c"),   // a 4구 1156(골드)
        ];
        const mine = monthAwards(both, "2026-10").filter((x) => x.memberId === "a");
        expect(mine.filter((x) => x.kind === "month_rank").map((x) => `${x.gameType}#${x.rank}`)).toEqual(["3c#1", "4c#1"]);
        const badges = mine.filter((x) => x.kind === "month_tier");
        expect(badges).toHaveLength(1);
        expect(badges[0]).toMatchObject({ gameType: "4c", tier: "gold", rating: 1156 });
    });

    it("같은 등급이면 3쿠션 쪽 · 같은 점수는 같은 등수(둘 다 메달)", () => {
        const tie = [
            ...games("2026-10", "a", "b", [12, 12, 12, 12, 12], "3c"),
            ...games("2026-10", "a", "c", [12, 12, 12, 12, 12], "4c"),
            ...games("2026-10", "e", "f", [12, 12, 12, 12, 12], "3c"),
        ];
        const got = monthAwards(tie, "2026-10");
        expect(got.find((x) => x.memberId === "a" && x.kind === "month_tier")!.gameType).toBe("3c");
        expect(got.filter((x) => x.kind === "month_rank" && x.gameType === "3c").map((x) => `${x.memberId}#${x.rank}`).sort()).toEqual(["a#1", "e#1"]);
    });

    it("대전이 없던 달 · 틀린 달 표기는 빈 목록", () => {
        expect(monthAwards(oct, "2026-08")).toEqual([]);
        expect(monthAwards(oct, "2026-13")).toEqual([]);
    });
});

describe("지금 마감할 달(monthsToClose)", () => {
    const d = [...games("2026-09", "a", "b", [12]), ...games("2026-10", "a", "b", [12]), ...games("2026-11", "a", "b", [12]), ...games("2026-12", "a", "b", [12])];
    const at = (month: string, day: number) => kstMonthRange(month)[0] + (day - 1) * 86_400_000 + 3 * 3_600_000 + 15 * 60_000;   // 그 날 03:15(정리 작업이 도는 때)

    it("이번 달은 마감하지 않는다 — 1일 새벽에 지난달이 마감된다", () => {
        expect(monthsToClose(d, at("2026-10", 31), [])).toEqual([]);
        expect(monthsToClose(d, at("2026-11", 1), [])).toEqual(["2026-10"]);
    });

    it("이미 마감한 달은 다시 하지 않는다 · 걸렀으면 밀린 달을 옛 달부터 같이", () => {
        expect(monthsToClose(d, at("2026-11", 2), ["2026-10"])).toEqual([]);
        expect(monthsToClose(d, at("2027-01", 5), [])).toEqual(["2026-10", "2026-11", "2026-12"]);
        expect(monthsToClose(d, at("2027-01", 5), ["2026-10"])).toEqual(["2026-11", "2026-12"]);
    });

    it("장식장을 연 달(2026-10)보다 앞의 달은 마감하지 않는다", () => {
        expect(SHELF_FIRST_MONTH).toBe("2026-10");
        expect(monthsToClose(d, at("2026-11", 1), [])).not.toContain("2026-09");
        // 시작 달을 앞당겨 부르면 그 달도 나온다(오너가 9월도 넣자고 하면 상수 하나만 바꾼다)
        expect(monthsToClose(d, at("2026-11", 1), [], "2026-09")).toEqual(["2026-09", "2026-10"]);
    });
});

describe("선반의 개수 · 이번 달 미리 보기", () => {
    it("메달은 등수마다 · 배지는 등급마다 센다", () => {
        const c = shelfCounts([
            { kind: "month_rank", rank: 1, tier: null }, { kind: "month_rank", rank: 1, tier: null }, { kind: "month_rank", rank: 3, tier: null },
            { kind: "month_tier", rank: null, tier: "gold" }, { kind: "month_tier", rank: null, tier: "gold" }, { kind: "month_tier", rank: null, tier: "silver" },
        ]);
        expect(c.medals).toEqual({ 1: 2, 2: 0, 3: 1 });
        expect(c.tiers).toMatchObject({ gold: 2, silver: 1, iron: 0, master: 0 });
        expect(Object.keys(c.tiers)).toEqual(TIERS.map((t) => t.id));
        expect([c.medalTotal, c.tierTotal]).toEqual([3, 3]);
        expect(shelfCounts([])).toMatchObject({ medalTotal: 0, tierTotal: 0 });
    });

    it("이번 달이 지금 끝난다면 — 5판을 채운 종목만 메달 · 배지가 보이고, 못 채운 종목은 판 수만", () => {
        const d = [...games("2026-10", "a", "b", [12, 12, 12, 12, 12], "3c"), ...games("2026-10", "a", "c", [12, 12], "4c")];
        const now = kstMonthRange("2026-10")[0] + 11 * 86_400_000;
        const mine = shelfPreview(d, "2026-10", "a", now);
        expect(mine).toEqual([
            { gameType: "3c", points: 60, matches: 5, wins: 5, rank: 1, total: 2, medal: 1, tier: "silver" },
            { gameType: "4c", points: 24, matches: 2, wins: 2, rank: null, total: 0, medal: null, tier: null },
        ]);
        // 점수를 잃은 2등 — 메달은 없고 배지는 있다
        expect(shelfPreview(d, "2026-10", "b", now)).toEqual([{ gameType: "3c", points: -60, matches: 5, wins: 0, rank: 2, total: 2, medal: null, tier: "iron" }]);
        // 이달에 안 친 사람
        expect(shelfPreview(d, "2026-10", "z", now)).toEqual([]);
    });
});

/** 서버 · 화면이 그 규칙대로 도는가 — 소스를 읽어 지킨다 */
describe("서버: 달마다 한 번만 주고, 준 것은 고치지 않는다", () => {
    const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
    const code = (s: string) => s.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*|--)/.test(l)).join("\n");

    it("마감 줄을 먼저 넣고 들어갔을 때만 준다 — 같은 때 두 번 돌아도 한 번", () => {
        const repo = read("server/storage/simShelf.repo.ts");
        const fn = repo.slice(repo.indexOf("async closeMonths("), repo.indexOf("async summary("));
        expect(fn).toContain("const deltas = await this.deltas(true);");   // 간직한 재료가 아니라 새로 읽는다
        expect(fn).toContain("for (const month of monthsToClose(deltas, nowMs, done)) {");
        const a = fn.indexOf("tx.insert(hiqSimMonthCloses).values({ month, summary }).onConflictDoNothing().returning(");
        const b = fn.indexOf("if (first.length === 0) return false;");
        const c = fn.indexOf("tx.insert(hiqSimAwards)");
        expect(a).toBeGreaterThan(0);
        expect(b).toBeGreaterThan(a);
        expect(c).toBeGreaterThan(b);
    });

    it("쓰는 표는 장식장의 둘뿐이다 — 레이팅 · 대전 · 회원 표는 읽기만 하고, 준 것을 고치거나 지우는 문장이 없다", () => {
        const repo = code(read("server/storage/simShelf.repo.ts"));
        expect([...repo.matchAll(/\.insert\((\w+)\)/g)].map((m) => m[1]).sort()).toEqual(["hiqSimAwards", "hiqSimMonthCloses"]);
        expect(repo).not.toMatch(/\.update\(|\.delete\(|delete from|update hiq_/);
    });

    it("하루 한 번 도는 정리 작업이 마감한다 — 실패해도 다른 청소 결과는 보낸다", () => {
        const cron = read("server/routes/modules/cron.ts");
        const fn = cron.slice(cron.indexOf("async function handleSimCleanup("), cron.indexOf('router.get("/sim-cleanup"'));
        expect(fn).toContain("const shelf = await storage.simShelf.closeMonths(Date.now())");
        expect(fn).toContain('.catch((e: unknown) => { console.error("[shelf close]", e); return null; });');
        // 마감 바로 뒤에 월대회를 연다(2026-10-12) — 메달 · 배지와 같은 자료로 출전자를 정한다
        expect(fn.indexOf("storage.simShelf.closeMonths(Date.now())")).toBeLessThan(fn.indexOf("m.openAndAnnounce(Date.now())"));
        expect(fn).toContain("return sendSuccess(res, { sessions, matches, stalePlaying, notifications, trail, shelf, cups });");
        expect(read("server/storage/index.ts")).toContain("public simShelf = new SimShelfRepository((fresh) => this.simMatch.ratedDeltas(fresh));");
    });

    it("주소: GET /sim/shelf — 로그인 필수, 회원 id 가 틀리거나 없는 장식장이면 404. 탈퇴 · 대전을 안 둔 회원의 이름을 내주지 않는다", () => {
        const route = read("server/routes/modules/sim.ts");
        expect(route).toContain('router.get("/sim/shelf", requireAuth,');
        expect(route).toContain('if (!shelf) return sendError(res, 404, "err.sim.shelfNotFound");');
        const repo = read("server/storage/simShelf.repo.ts");
        expect(repo).toContain("if (!who || isWithdrawnMember(who)) return null;");
        expect(repo).toContain("if (!mine && ratings.length === 0 && rows.length === 0) return null;");
        for (const l of ["ko", "en", "vi", "tr", "es"]) expect(read(`shared/i18n/${l}.ts`), l).toMatch(/^  "err\.sim\.shelfNotFound": ".+",$/m);
    });

    it("표: 더하기만 하는 두 표 — 정의(schema)와 적용 문장(migration)이 같은 이름이다", () => {
        const sql = read("migrations/sim_awards.sql");
        expect(sql).toContain("CREATE TABLE IF NOT EXISTS hiq_sim_awards (");
        expect(sql).toContain("CREATE TABLE IF NOT EXISTS hiq_sim_month_closes (");
        expect(sql).toContain("UNIQUE (member_id, month, kind, game_type)");
        expect(code(sql)).not.toMatch(/\b(ALTER|DROP|DELETE|UPDATE|TRUNCATE)\b/i);
        const schema = read("shared/schema.ts");
        expect(schema).toContain('export const hiqSimAwards = pgTable("hiq_sim_awards", {');
        expect(schema).toContain('export const hiqSimMonthCloses = pgTable("hiq_sim_month_closes", {');
        expect(schema).toContain("uniq: unique().on(t.memberId, t.month, t.kind, t.gameType),");
    });
});

describe("화면: 장식장", () => {
    const client = (p: string) => readFileSync(resolve(__dirname, "../client/src", p), "utf8");

    it("들어가는 길: /online-game?shelf=1 — 랭킹 · 대시보드에서 왔으면 닫을 때 온 곳으로 돌아간다", () => {
        const page = client("sim/SimulatorPage.tsx");
        expect(page).toContain('const shelfView = params.get("shelf") === "1";');
        expect(page).toContain("const openShelf = (memberId?: string) => { shelfFromInside.current = true; navigate(shelfPath(memberId)); };");
        expect(page).toContain("if (shelfFromInside.current) { shelfFromInside.current = false; window.history.back(); } else navigate(ENTRY_PATH, { replace: true });");
        // 다른 사람의 장식장으로 넘어가면 화면을 새로 그린다(고른 것 · 새로 받음 표시가 남지 않게)
        expect(page).toContain('key={shelfMember ?? "me"}');
        expect(page).toContain("initialScope={rankScope} onShelf={openShelf} onCup={openCup} />");
        expect(page).toContain("onShelf={() => openShelf()}");
    });

    it("그림: 장식장 그림이 있고 가볍다", () => {
        const p = resolve(__dirname, "../client/public/sim/rank/icon-cabinet.webp");
        expect(existsSync(p)).toBe(true);
        const b = readFileSync(p);
        expect(b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP").toBe(true);
        expect(b.length).toBeLessThan(20 * 1024);
        expect(client("sim/rank/ShelfLink.tsx")).toContain('export const SHELF_ICON_SRC = "/sim/rank/icon-cabinet.webp";');
    });

    it("문구가 다섯 언어에 있고 자리 표시를 지킨다", () => {
        const need: Record<string, string[]> = {
            "sim.shelf.title": [], "sim.shelf.sub": [], "sim.shelf.loading": [], "sim.shelf.failed": [], "sim.shelf.counts": ["{m}", "{b}"],
            "sim.shelf.nowTitle": [], "sim.shelf.nowLeft": ["{n}"], "sim.shelf.nowWill": [], "sim.shelf.nowIf": [], "sim.shelf.nowNone": [], "sim.shelf.nowHint": ["{n}"], "sim.shelf.toRank": [],
            "sim.shelf.medals": [], "sim.shelf.badges": [], "sim.shelf.cup": [], "sim.shelf.cupSoon": [], "sim.shelf.medalName": ["{r}"], "sim.shelf.times": ["{n}"],
            "sim.shelf.months": [], "sim.shelf.monthsEmpty": [], "sim.shelf.monthsEmptyDesc": ["{month}"], "sim.shelf.rowMedal": ["{game}", "{r}", "{p}"], "sim.shelf.rowBadge": ["{tier}"],
            "sim.shelf.new": [], "sim.shelf.gotIn": [], "sim.shelf.mine": [], "sim.shelf.linkSub": [], "sim.shelf.open": ["{name}"],
            "home.hubShelfSub": [], "home.hubShelfCount": ["{n}"],
        };
        for (const l of ["ko", "en", "vi", "tr", "es"]) {
            const d = client(`lib/i18n/${l}.ts`);
            for (const [k, ph] of Object.entries(need)) {
                const v = d.match(new RegExp(`^  "${k.replace(/\./g, "\\.")}": "(.*)",$`, "m"))?.[1];
                expect(v, `${l} ${k}`).toBeTruthy();
                for (const p of ph) expect(v, `${l} ${k}`).toContain(p);
            }
        }
    });
});
