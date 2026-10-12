import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { STAMP_ALL_OPEN, STAMP_BOOKS, STAMP_OPEN_TOTAL } from "./golfStampBooks";
import {
    CREW_STAMP_FULL, CREW_STAMP_MIN, crewBookStates, crewFlagLook, crewFlagName, crewFlagsDue, crewStampIsElite, crewStampSummary, crewStampsFrom,
    type CrewRoundRow, type CrewStamp, type CrewStampMember,
} from "./golfCrewStamps";

/**
 * 크루 도장깨기(2026-10-12 오너: "크루끼리 도장깨기 하러 가듯" → "골프 마무리 하고 등산 넘어가자").
 * 같은 라운드에서 크루원 둘 이상이 현장 인증한 골프장이 크루 도장이다 — 혼자서는 크루의 수를 올릴 수 없고, 가입 전의 라운드는 세지 않는다.
 */
const root = resolve(__dirname, "..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");
const day = (d: number) => Date.UTC(2026, 3, 1 + d, 3);
const slot = (bookId: string, i = 0) => STAMP_BOOKS.find((b) => b.id === bookId)!.slots[i];
const members = (ids: string[], joined = day(0)): CrewStampMember[] => ids.map((memberId) => ({ memberId, joinedAt: joined }));
const rows = (sessionId: string, who: string[], at: number, bookId = "seohae", i = 0): CrewRoundRow[] => who.map((memberId) => ({ sessionId, memberId, at, clubId: slot(bookId, i).clubIds[0], name: slot(bookId, i).ledgerNames[0] }));

describe("크루 도장", () => {
    it("둘 이상이 같은 라운드를 끝내야 찍힌다 — 혼자서는 안 된다", () => {
        expect([CREW_STAMP_MIN, CREW_STAMP_FULL]).toEqual([2, 4]);
        expect(crewStampsFrom(rows("s1", ["a"], day(3)), members(["a", "b"]))).toEqual([]);
        const [st] = crewStampsFrom(rows("s1", ["a", "b"], day(3)), members(["a", "b"]));
        expect(st).toMatchObject({ clubId: slot("seohae").clubIds[0], firstAt: day(3), rounds: 1, full: false, fullAt: null, most: 2 });
    });

    it("따로 친 라운드 둘은 크루 도장이 아니다 — 같은 경기여야 한다", () => {
        expect(crewStampsFrom([...rows("s1", ["a"], day(3)), ...rows("s2", ["b"], day(3))], members(["a", "b"]))).toEqual([]);
    });

    it("크루에 들어온 뒤의 라운드만 센다 — 가입 전에 깬 것을 들고 오지 못한다", () => {
        const ms: CrewStampMember[] = [{ memberId: "a", joinedAt: day(0) }, { memberId: "b", joinedAt: day(10) }];
        expect(crewStampsFrom(rows("s1", ["a", "b"], day(3)), ms)).toEqual([]);
        expect(crewStampsFrom(rows("s2", ["a", "b"], day(11)), ms)).toHaveLength(1);
        // 크루원이 아닌 사람은 세지 않는다
        expect(crewStampsFrom(rows("s3", ["a", "남"], day(12)), ms)).toEqual([]);
    });

    it("넷이 한 조를 채우면 풀조(금테) — 그때가 남는다. 다시 가면 라운드 수만 는다", () => {
        const all = members(["a", "b", "c", "d"]);
        const out = crewStampsFrom([...rows("s1", ["a", "b"], day(3)), ...rows("s2", ["a", "b", "c", "d"], day(9)), ...rows("s3", ["c", "d"], day(12))], all);
        expect(out).toHaveLength(1);
        expect(out[0]).toMatchObject({ firstAt: day(3), rounds: 3, full: true, fullAt: day(9), most: 4 });
    });

    it("골프장마다 하나 — 얻은 순서. 도장첩 밖의 골프장도 크루 도장은 찍힌다(깃발에는 안 센다)", () => {
        const out = crewStampsFrom([
            ...rows("s1", ["a", "b"], day(5), "gangwon", 0), ...rows("s2", ["a", "b"], day(2), "seohae", 0),
            { sessionId: "s3", memberId: "a", at: day(7), clubId: "99999999-9999-4999-8999-999999999999", name: "동네 골프장" },
            { sessionId: "s3", memberId: "b", at: day(7), clubId: "99999999-9999-4999-8999-999999999999", name: "동네 골프장" },
        ], members(["a", "b"]));
        expect(out.map((s) => s.firstAt)).toEqual([day(2), day(5), day(7)]);
        expect(out.map(crewStampIsElite)).toEqual([true, true, false]);
        expect(crewStampSummary(out)).toEqual({ total: 3, elite: 2, full: 0, books: 0 });
    });
});

describe("깃발", () => {
    const stampsOf = (bookIds: string[], over: Partial<CrewStamp> = {}): CrewStamp[] => STAMP_BOOKS.filter((b) => bookIds.includes(b.id)).flatMap((b) => b.slots).map((s, i) => ({
        clubKey: s.clubIds[0], clubId: s.clubIds[0], name: s.ledgerNames[0], firstAt: day(i), rounds: 1, full: false, fullAt: null, most: 2, ...over, ...(over.full ? { fullAt: day(100 + i) } : {}),
    }));

    it("한 권을 다 채우면 깃발 — 받은 때는 마지막 칸을 채운 때. 한 칸이 비면 없다", () => {
        const all = stampsOf(["chungcheong"]);
        expect(crewFlagsDue(all)).toEqual([{ kind: "flag", key: "chungcheong", earnedAt: day(all.length - 1) }]);
        expect(crewFlagsDue(all.slice(1))).toEqual([]);
        expect(crewBookStates(all).find((s) => s.book.id === "chungcheong")!.done).toBe(true);
    });

    it("그 권이 전부 풀조면 풀조 깃발을 하나 더 — 초대장 권에는 풀조 깃발이 없다", () => {
        const full = crewFlagsDue(stampsOf(["chungcheong"], { full: true }));
        expect(full.map((f) => `${f.kind}:${f.key}`)).toEqual(["flag:chungcheong", "full:chungcheong"]);
        const invite = STAMP_BOOKS.find((b) => b.kind === "invite")!.id;
        expect(crewFlagsDue(stampsOf([invite], { full: true })).map((f) => `${f.kind}:${f.key}`)).toEqual([`flag:${invite}`]);
    });

    it("누구나 일곱 권을 전부 채우면 '누구나 전부' 깃발", () => {
        const open = STAMP_BOOKS.filter((b) => b.kind === "open").map((b) => b.id);
        const due = crewFlagsDue(stampsOf(open));
        expect(due.filter((f) => f.kind === "flag").map((f) => f.key).sort()).toEqual([...open, STAMP_ALL_OPEN].sort());
    });

    it("색과 이름 — 1호(순번 1)는 진홍, 풀조는 남색, 초대장은 보라, 누구나 전부는 금, 나머지는 초록", () => {
        const invite = STAMP_BOOKS.find((b) => b.kind === "invite")!.id;
        expect(crewFlagLook("flag", "gangwon", 2)).toBe("green");
        expect(crewFlagLook("flag", "gangwon", 1)).toBe("crimson");
        expect(crewFlagLook("full", "gangwon", 1)).toBe("navy");
        expect(crewFlagLook("flag", invite, 3)).toBe("purple");
        expect(crewFlagLook("flag", STAMP_ALL_OPEN, 2)).toBe("gold");
        expect(crewFlagName("flag", "gangwon", STAMP_OPEN_TOTAL)).toBe("강원 깃발");
        expect(crewFlagName("full", "gangwon", STAMP_OPEN_TOTAL)).toBe("강원 풀조 깃발");
        expect(crewFlagName("flag", STAMP_ALL_OPEN, STAMP_OPEN_TOTAL)).toBe(`누구나 ${STAMP_OPEN_TOTAL} 깃발`);
    });
});

describe("서버 · 화면", () => {
    it("적는 곳 — 라운드를 끝낼 때(기록이 바뀌는 길). 인증 라운드만, 승인 대기는 크루원이 아니다. 준 것은 거두지 않는다", () => {
        const repo = read("server/storage/golf.repo.ts");
        expect(repo).toContain('await syncCrewStampsForMember(userId).catch((e) => console.error("[golf] syncCrewStamps", e));');
        const store = read("server/storage/golfCrewStamps.ts");
        expect(store).toContain('if (!crew || crew.sport !== "GOLF") return none;');
        expect(store).toContain('ne(hiqCrewMembers.role, "pending")');
        expect(store).toContain("rows.filter((r) => countsOnSite(r.onSite))");
        expect(store).toContain("on conflict (crew_id, club_key) do nothing returning id");
        // 있는 도장은 라운드 수 · 인원 · 풀조만 올린다 — 처음 찍은 때는 고치지 않는다
        const upd = store.slice(store.indexOf("update golf_crew_stamps set"), store.indexOf("where crew_id = ${crewId}::uuid and club_key"));
        expect(upd).toContain("rounds = greatest(rounds,");
        expect(upd).not.toContain("first_at");
        expect(store).not.toMatch(/delete from golf_crew_stamp/);
        // 표가 없어도 라운드 끝내기를 막지 않는다
        expect(store.match(/if \(missingTable\(e\)\) return/g)?.length).toBeGreaterThanOrEqual(3);
    });

    it("표는 더하기만 — 크루가 지워지면 같이 지워진다", () => {
        const sql = read("migrations/golf_crew_stamps.sql").split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
        expect(sql.match(/create table if not exists/g)).toHaveLength(2);
        expect(sql.match(/references hiq_crews\(id\) on delete cascade/g)).toHaveLength(2);
        expect(sql).not.toMatch(/alter table|drop /i);
        const schema = read("shared/schema.ts");
        expect(schema).toContain('export const golfCrewStamps = pgTable("golf_crew_stamps", {');
        expect(schema).toContain('export const golfCrewStampAwards = pgTable("golf_crew_stamp_awards", {');
    });

    it("읽기 — 누구에게나 열려 있고 사람 이름을 싣지 않는다. 골프장 페이지는 깬 크루를 같이 준다", () => {
        const api = read("server/routes/modules/crew.ts");
        expect(api).toContain('router.get("/:id/golf-stamps", asyncHandler(async (req: any, res: any) => {');
        const store = read("server/storage/golfCrewStamps.ts");
        const list = store.slice(store.indexOf("export async function listCrewStamps"), store.indexOf("async function insertFlag"));
        expect(list).not.toMatch(/memberId|member_id|hiqMembers/);
        expect(read("server/routes/modules/golfCourses.ts")).toContain("crews: await crewsAtClub(p.clubId ? [p.clubId] : []).catch(");
    });

    it("화면 — 골프 크루의 홈에만 놓이고, 크루 도장첩은 탭 별칭보다 위에 있다. 깃발 그림 다섯 장이 다 있다", () => {
        const home = read("client/src/components/hiq/tabs/CrewHomeTab.tsx");
        expect(home).toContain("{isGolf && <CrewStampEntry crewId={crew.id} crew={{ name: crew.name, emblem: crew.emblem }} />}");
        const app = read("client/src/App.tsx");
        expect(app.indexOf('<Route path="/crew/:id/stamps"')).toBeGreaterThan(0);
        expect(app.indexOf('<Route path="/crew/:id/stamps"')).toBeLessThan(app.indexOf('<Route path="/crew/:id/:tab?"'));
        for (const c of ["green", "crimson", "navy", "purple", "gold"]) expect(existsSync(resolve(root, `client/public/golf/stamp-art/flag-${c}.webp`)), c).toBe(true);
        for (const f of ["client/src/golf/stamps/CrewStampParts.tsx", "client/src/golf/pages/CrewStamps.tsx"]) {
            const src = read(f);
            expect([...src.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].every((m) => Number(m[1]) >= 12), f).toBe(true);
            expect(src.replace(/\/\*[\s\S]*?\*\//, ""), f).not.toMatch(/\b(?:bg|text|border|ring)-(?:white|black)\b/);
            // 돈 · 내기 · 순위 이야기가 없다
            expect(src, f).not.toMatch(/상금|경품|내기|순위/);
        }
    });
});
