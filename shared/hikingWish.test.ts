import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { HIKING_WISH_LABEL, HIKING_WISH_MAX, orderWishes } from "./hikingWish";

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
        expect(route.match(/\.\.\.requireHikingAccess/g)?.length).toBe(3);
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
