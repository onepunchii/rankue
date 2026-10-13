import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CREW_WISH_LABEL, CREW_WISH_LIMIT, CREW_WISH_MIN, HIKING_WISH_LABEL, HIKING_WISH_MAX, crewWishAside, crewWishChip, orderWishes, pickCrewWishes } from "./hikingWish";

const read = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("가고 싶은 산", () => {
    it("홈의 순서 — 아직 안 오른 산이 먼저(담은 순서 그대로), 다녀온 산은 뒤로", () => {
        expect(orderWishes(["a", "b", "c", "d"], new Set(["b", "d"]))).toEqual(["a", "c", "b", "d"]);
        expect(orderWishes(["a"], new Set())).toEqual(["a"]);
        expect(orderWishes([], new Set(["a"]))).toEqual([]);
    });
    it("글 — 재촉하지 않고, 술 · 돈 · 내기 말이 없다", () => {
        const all = Object.values(HIKING_WISH_LABEL).join(" ");
        expect(all).not.toMatch(/빨리|서두|술|막걸리|원\b|내기|상금/);
        expect(HIKING_WISH_LABEL.full).toContain(String(HIKING_WISH_MAX));
    });
});

describe("고정: 가고 싶은 산의 저장과 문", () => {
    it("표에는 회원 · 산 · 담은 때뿐이다(위치 · 계획 날짜 없음), 더하기만 한다", () => {
        const sql = code(read("migrations/hiking_wishes.sql").replace(/^--.*$/gm, ""));
        expect(sql).toContain("create table if not exists hiking_wishes");
        expect(sql).toContain("primary key (member_id, mountain_id)");
        expect(sql).not.toMatch(/\blat\b|\blng\b|latitude|longitude|plan|date\b/i);
        expect(sql).not.toMatch(/drop |alter table .* drop/i);
    });
    it("읽기 · 담기 · 빼기 모두 등산을 쓸 수 있는 회원만, 남의 것을 건드릴 값(회원 id)을 요청에서 받지 않는다", () => {
        const route = code(read("server/routes/modules/hikingWishes.ts"));
        // 길은 넷(내 것 읽기 · 담기 · 빼기 · 산악회의 줄) — 문 없는 길이 없다
        expect(route.match(/router\.(get|put|post|patch|delete)\(/g)?.length).toBe(4);
        expect(route.match(/\.\.\.requireHikingAccess/g)?.length).toBe(4);
        expect(route).not.toMatch(/req\.(body|query)\.memberId|req\.params\.memberId/);
        const store = code(read("server/storage/hikingWishes.ts"));
        expect(store.match(/member_id = \$\{memberId\}::uuid/g)?.length).toBeGreaterThanOrEqual(4);
        // 계정을 지우면 담아 둔 것도 지운다
        expect(read("server/routes/modules/member.ts")).toContain("removeAllWishes(req.userId!)");
    });
    it("화면 — 방문자는 가입 안내로, 등산이 안 열린 회원에게는 단추를 그리지 않는다", () => {
        const ui = code(read("client/src/hiking/wish/WishParts.tsx"));
        expect(ui).toContain("if (!member) { goLogin(setLocation); return; }");
        expect(ui).toContain("if (member && !w.mine) return null;");
        expect(ui).toContain('data-track-as="hiking-wish"');
    });
});

describe("우리 산악회가 가고 싶은 산", () => {
    it("두 사람 이상이 담아야 오른다 — 한 사람만 담은 산은 그 사람의 것이다", () => {
        expect(CREW_WISH_MIN).toBe(2);
        expect(CREW_WISH_LIMIT).toBe(12);
    });
    it("딱지 · 제목 옆 한 줄 — 사람 수만 적는다", () => {
        expect(crewWishChip(2)).toBe("2명이 담았어요");
        expect(crewWishChip(14)).toBe("14명이 담았어요");
        expect(crewWishChip(3.9)).toBe("3명이 담았어요");
        expect(crewWishChip(-1)).toBe("0명이 담았어요");
        expect(crewWishChip(Number.NaN)).toBe("0명이 담았어요");
        expect(crewWishAside()).toBe("2명 이상이 담은 산");
        expect(crewWishAside(3)).toBe("3명 이상이 담은 산");
        expect(crewWishAside(0)).toBe("2명 이상이 담은 산");
        expect(crewWishAside(Number.NaN)).toBe("2명 이상이 담은 산");
    });
    it("줄에 놓을 것 — 사람 수가 모자란 산은 빼고, 많이 담은 산부터(같으면 산의 id 순), 열두 곳까지", () => {
        const list = [{ mountainId: "c", count: 2 }, { mountainId: "a", count: 2 }, { mountainId: "z", count: 5 }, { mountainId: "solo", count: 1 }, { mountainId: "none", count: 0 }];
        expect(pickCrewWishes(list).map((m) => m.mountainId)).toEqual(["z", "a", "c"]);
        expect(pickCrewWishes(list, 3).map((m) => m.mountainId)).toEqual(["z"]);
        expect(pickCrewWishes([])).toEqual([]);
        // 받은 것을 고치지 않는다
        expect(list[0].mountainId).toBe("c");
        const many = Array.from({ length: 30 }, (_, i) => ({ mountainId: `m${String(i).padStart(2, "0")}`, count: 2 + (i % 3) }));
        const picked = pickCrewWishes(many);
        expect(picked).toHaveLength(CREW_WISH_LIMIT);
        expect(picked.every((m, i) => i === 0 || picked[i - 1].count >= m.count)).toBe(true);
        expect(picked[0]).toEqual({ mountainId: "m02", count: 4 });
    });
    it("글 — 재촉하지 않고, 술 · 돈 · 내기 · 순위 말이 없다", () => {
        const all = [...Object.values(CREW_WISH_LABEL), crewWishChip(3), crewWishAside()].join(" ");
        expect(all).not.toMatch(/빨리|서두|술|막걸리|원\b|내기|상금|순위|랭킹|1등|야간/);
    });
});

describe("고정: 산악회의 줄 — 회원만, 사람 수만", () => {
    const route = code(read("server/routes/modules/hikingWishes.ts"));
    const fn = route.slice(route.indexOf('router.get("/crews/:id/wishes"'));
    const store = code(read("server/storage/hikingWishes.ts"));
    const q = store.slice(store.indexOf("export async function crewWishes"));

    it("라우트 — 등산을 쓸 수 있는 회원만, 그 산악회의 회원인지부터 묻고(아니면 403) 그 뒤에 읽는다", () => {
        expect(fn).toContain('router.get("/crews/:id/wishes", ...requireHikingAccess,');
        const gate = fn.indexOf("if (!(await isCrewMember(crewId, req.userId!))) return sendError(res, 403, CREW_WISH_LABEL.membersOnly");
        const readAt = fn.indexOf("crewWishes(crewId, CREW_WISH_MIN)");
        expect(gate).toBeGreaterThan(0);
        expect(readAt).toBeGreaterThan(gate);
        // 주소의 id 는 모양부터 본다(회원 확인 · 읽기보다 먼저) — 회원은 로그인한 본인이지 요청이 준 값이 아니다
        const shape = fn.indexOf("if (!CREW_ID.test(crewId)) return sendError(res, 404");
        expect(shape).toBeGreaterThan(0);
        expect(shape).toBeLessThan(gate);
        expect(fn).not.toMatch(/req\.(body|query)/);
        // 사람마다 다른 답 — 공개 캐시에 싣지 않는다
        expect(fn).toContain('res.set("Cache-Control", "no-store")');
        expect(fn).not.toContain("public,");
        expect(CREW_WISH_LABEL.membersOnly).toMatch(/회원만/);
    });
    it("회원 확인 — 그 산악회 · 그 회원 · 가입 대기가 아닌 줄", () => {
        const m = store.slice(store.indexOf("export async function isCrewMember"), store.indexOf("export async function crewWishes"));
        expect(m).toContain("from hiq_crew_members");
        expect(m).toContain("crew_id = ${crewId}::uuid and member_id = ${memberId}::uuid and role <> 'pending'");
    });
    it("저장 — 서로 다른 회원을 세고, 가입 대기는 빼고, 기준에 못 미치는 산은 안 준다. 산악회(등산 크루)만", () => {
        expect(q).toContain("select w.mountain_id, count(distinct w.member_id)::int as n");
        expect(q).toContain("join hiq_crew_members cm on cm.member_id = w.member_id and cm.crew_id = ${crewId}::uuid and cm.role <> 'pending'");
        expect(q).toContain("join hiq_crews c on c.id = cm.crew_id and c.sport_category = 'HIKING'");
        expect(q).toContain("group by w.mountain_id");
        expect(q).toContain("having count(distinct w.member_id) >= ${min}");
        expect(q).toContain("order by count(distinct w.member_id) desc, w.mountain_id");
        expect(q).toContain("limit ${CREW_WISH_LIMIT}");
        // 표가 아직 없으면 빈 값
        expect(q).toContain("if (missingTable(e)) return [];");
    });
    it("누가 담았는지는 어디에도 없다 — 저장이 돌려주는 것도, 응답도 산과 사람 수뿐", () => {
        expect(q).toContain("return r.map((x) => ({ mountainId: x.mountain_id, count: Number(x.n) }));");
        expect(q).not.toMatch(/member_id as|name as|nickname|array_agg|string_agg|json_agg/);
        expect(fn).toContain("[{ mountainId: x.mountainId, count: x.count, name: m.name, slug: m.slug, heightM: m.heightM, region: m.region, kfs100: m.lists.includes(\"kfs100\") }]");
        // 저장의 줄을 통째로 펼쳐 싣지 않는다(칸이 늘어도 새지 않게)
        expect(fn).not.toMatch(/\.\.\.x\b/);
        expect(fn).not.toMatch(/memberId|member_id|memberIds|nickname|members\s*:/);
        expect(fn).toContain("mountains: pickCrewWishes(list)");
    });
    it("화면 — 받는 동안 · 못 받았을 때 · 한 곳도 없을 때는 아무것도 그리지 않는다. 산악회 회원에게만 놓는다", () => {
        const ui = code(read("client/src/hiking/crew/CrewWishes.tsx"));
        expect(ui).toContain("if (!mine || isLoading || isError || list.length === 0) return null;");
        // 회원이 아니라서 받은 403 을 다시 묻지 않는다
        expect(ui).toContain("retry: false");
        expect(ui).toContain('data-testid="hk-crew-wishes" data-count={list.length} data-track-as="hiking-crew-wishes"');
        expect(ui).toContain("{crewWishChip(m.count)}");
        expect(ui).toContain("href={hikingMountainPath(m.slug)}");
        expect(ui).toContain("key={m.mountainId}");
        expect(ui).not.toMatch(/nickname|memberId|avatar/);
        const tab = read("client/src/components/hiq/tabs/CrewHomeTab.tsx");
        expect(tab).toContain('const CrewWishes = lazy(() => import("@/hiking/crew/CrewWishes")');
        expect(tab).toContain("{isHiking && isMember && <Suspense fallback={null}><CrewWishes crewId={crew.id} /></Suspense>}");
        // '함께 오른 산' 바로 다음에 놓인다
        expect(tab.indexOf("<CrewWishes crewId")).toBeGreaterThan(tab.indexOf("<CrewSummits crewId"));
        expect(tab.slice(tab.indexOf("<CrewSummits crewId"), tab.indexOf("<CrewWishes crewId"))).not.toContain("<CrewSection");
    });
});

describe("고정: 산악회의 목표 — 함께 오른 100대 명산", () => {
    it("산이 한 곳이라도 있으면(명산이 0곳이어도) 목표 줄이 놓이고, 빈 진열장은 그대로다", () => {
        const ui = code(read("client/src/hiking/crew/CrewSummits.tsx"));
        expect(ui).toContain("const kfs = list.filter((m) => m.kfs100).length;");
        expect(ui).toContain('data-testid="hk-crew-goal" data-got={kfs}');
        expect(ui).toContain('const GOAL_LABEL = "함께 오른 100대 명산";');
        expect(ui).toContain("/ {KFS100_TOTAL}");
        expect(ui).toContain('href={hikingListPath("kfs100")}');
        expect(ui).toContain("100대 명산 수첩 보기");
        expect(ui).toContain('bg-[#FFFFFF1F]" role="progressbar"');
        expect(ui).toContain('rounded-full bg-[#F28C6A]"');
        // 목표 줄은 산이 있는 쪽 가지에만 — 숫자 세 칸 아래, 진열장 위. kfs > 0 같은 조건으로 가리지 않는다
        const empty = ui.indexOf("list.length === 0 ? (");
        const stats = ui.indexOf('data-testid="hk-crew-summits-stats"');
        const goal = ui.indexOf('data-testid="hk-crew-goal"');
        expect(empty).toBeGreaterThan(0);
        expect(stats).toBeGreaterThan(empty);
        expect(goal).toBeGreaterThan(stats);
        expect(ui.indexOf("[...list].reverse().map(")).toBeGreaterThan(goal);
        expect(ui.slice(stats, goal)).not.toMatch(/kfs\s*>\s*0\s*&&/);
    });
});
