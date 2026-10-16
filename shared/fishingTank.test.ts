import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { DECOR } from "./fishingDecor";

// 수족관 화면 부품의 약속(2026-10-16) — 순수 규칙은 fishingDecor.test, 여기는 서버 · 화면의 꼴
const read = (p: string) => fs.readFileSync(p, "utf8");

describe("수족관 꾸미기 — 서버", () => {
    const route = read("server/routes/modules/fishing.ts");
    it("받은 기록은 몇 번째 주인을 남기고, 한정은 그 수를 넘지 않는다", () => {
        expect(route).toContain("having coalesce(max(serial), 0) < ${cap}");
        expect(route).toContain('if (e?.code === "23505" && attempt < 4) continue;');
    });
    it("자리는 받은 것만 · 칸에 맞는 종류만", () => {
        expect(route).toContain('if (!own) return sendError(res, 403, "아직 받지 않은 장식이에요");');
        expect(route).toContain('if (!d || d.kind !== SLOT_KIND[slot as keyof typeof SLOT_KIND]) return sendError(res, 400, "그 자리에 놓을 수 없는 장식이에요");');
    });
    it("크루원 수족관은 둘 다 같은 크루일 때만 · 잡은 곳 · 날은 나가지 않는다", () => {
        expect(route).toContain("if (!(await inCrew(req.userId!, crewId)) || !(await inCrew(memberId, crewId))) return sendError(res, 403, \"같은 크루의 수족관만 볼 수 있어요\");");
        // 판정에 쓰는 줄에도 잡은 곳 · 좌표는 없다. 내보내는 것은 어종 · 마릿수 · 낙관 · 장식뿐
        const pick = route.slice(route.indexOf("async function decorCatches"), route.indexOf("/** 조건을 채운 장식을"));
        expect(pick).not.toMatch(/\bplace\b|\blat\b|\blng\b|note/);
        expect(route).toContain('return { mine, name: String(meRow?.name ?? "회원"), fish, seals, layout, placed: resolveLayout(layout, owned), owned: owned.size, items };');
    });
    it("마이그레이션은 더하기만", () => {
        const m = read("migrations/fishing_decor.sql");
        expect(m).toContain("create table if not exists fishing_decor_awards");
        expect(m).toContain("create table if not exists fishing_tanks");
        expect(m.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n")).not.toMatch(/\b(drop|delete|truncate|update)\b/i);
    });
});

describe("수족관 꾸미기 — 화면", () => {
    it("장식 그림은 화면에 놓을 때 · 꾸미기 칸에서 같은 이름으로 쓴다", () => {
        const engine = read("client/src/fishing/tank/engine.ts");
        expect(engine).toContain("loadCut(decorImage(item.id), this.mode, item.gold ? \"gold\" : \"ink\", item.kind === \"bg\")");
        for (const d of DECOR) expect(fs.statSync(`client/public/fishing/decor/${d.id}.webp`).size, d.id).toBeLessThan(110_000);
    });
    it("새 장식은 한 번 크게 · 첫 고운 모래 하나뿐이면 조용히", () => {
        const page = read("client/src/fishing/FishingPage.tsx");
        expect(page).toContain('if (fresh.length && !(fresh.length === 1 && fresh[0].id === "floor-sand")) setRevealDecor({ id: fresh[0].id, more: fresh.length - 1 });');
    });
});
