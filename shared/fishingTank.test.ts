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
        expect(route).toContain('return { mine, name: String(meRow?.name ?? "회원"), fish, seals, layout, placed: resolveLayout(layout, owned), owned: owned.size, items, ...(mine ? { hidden } : {}) };');
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

describe("수조에서 빼기 · 지도 · 팝업(2026-10-18 오너 낚시 UX)", () => {
    it("뺀 어종 목록 다듬기 · 서버는 헤엄치는 물고기에서만 뺀다 · 내가 적은 어종만 뺄 수 있다", async () => {
        const { cleanHiddenSpecies } = await import("./fishingDecor");
        expect(cleanHiddenSpecies(["감성돔", " 감성돔 ", "", 3, "우럭"])).toEqual(["감성돔", "우럭"]);
        expect(cleanHiddenSpecies(null)).toEqual([]);
        const route = fs.readFileSync(new URL("../server/routes/modules/fishing.ts", import.meta.url), "utf8");
        expect(route).toContain("const fish = all.fish.filter((f) => !hidden.includes(f.species));");
        expect(route).toContain('router.post("/tank/hide", requireAuth, gate,');
        expect(route).toContain("select 1 from fishing_catches where member_id = ${req.userId!} and species = ${species} and hidden_at is null limit 1");
    });
    it("한 줄 평 — 나은 반나절 · 발목 잡는 것 하나(특보 > 바람 > 물결) · '나가도 된다'는 말 없음", async () => {
        const { seaVerdict } = await import("./fishingPort");
        expect(seaVerdict({ am: "매우나쁨", pm: "나쁨" }, { wave: [0.1, 0.4], wind: [9.1, 17.5] }, "먼바다 풍랑특보")).toEqual({ head: "오후가 더 나아요 · 나쁨", why: "먼바다 풍랑특보가 걸려 있어요", tone: "bad" });
        expect(seaVerdict({ am: "좋음", pm: "좋음" }, { wave: [0.3, 0.5], wind: [2, 11] }, null)).toMatchObject({ head: "좋음", why: "바람이 세요 — 최대 11.0m/s", tone: "good" });
        expect(seaVerdict(undefined, { wave: null, wind: null }, null).head).toBe("지수가 없어요");
    });
    it("낚시지수 보기는 특보 물감 · 꼬리표 없이 · 좋은 칸이 위에 · 내 위치는 누를 때만", () => {
        const chart = fs.readFileSync(new URL("../client/src/fishing/SeaChart.tsx", import.meta.url), "utf8");
        expect(chart).toContain("{!pixels && SEA_AREAS.map((def) => {");
        expect(chart).toContain("const tagDefs = pixels ? [] : SEA_AREAS.flatMap");
        expect(chart).toContain("const PIXEL_WEIGHT: readonly number[] = [0.32, 0.45, 0.8, 1, 1];");
        const page = fs.readFileSync(new URL("../client/src/fishing/FishingPage.tsx", import.meta.url), "utf8");
        expect(page).toContain('data-testid="fishing-map-locate"');
        expect(page).toContain("getDevicePosition({ prompt: true, highAccuracy: false");
    });
});
