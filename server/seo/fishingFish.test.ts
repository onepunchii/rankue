import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// page() 는 받은 조각을 JSON 으로, entry() 는 옵션 그대로 — 모양만 본다(seo/fishingSea.test.ts 와 같은 방식)
vi.mock("../prerender.js", () => ({
    page: (p: unknown) => JSON.stringify(p),
    esc: (s: unknown) => String(s ?? "").replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c] as string)),
}));
vi.mock("../sitemap.js", () => ({ entry: (loc: string, opts?: object) => JSON.stringify({ loc, ...opts }) }));

import { FISHING_FISH_RE, fishAsset, fishingFishSitemapParts, renderFishingFish } from "./fishingFish";
import { FISH } from "../../shared/fishingFish";
import { FISH_GUIDE_NAME, FISH_REG_NAMES } from "../../shared/fishingFishInfo";
import { fishBySlug, fishCardInput, fishPageSeo, fishSpotCounts, fishingFishPath, goodFishToday, placeFishId, spotsOfFish } from "../../shared/fishingFishPages";
import type { PublicPlace } from "../../shared/fishingPlaces";

/**
 * 낚시 어종 공개 페이지(2026-10-18). 어종 정보를 지어 쓰지 않는다 — 우리 단계 표 · 오너가 준 도감과 금어기 표 · 낚시터 표의 대상 어종만.
 */
const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");
const json = <T,>(p: string): T => JSON.parse(read(p)) as T;
const html = (r: { html: string } | null) => (r ? (JSON.parse(r.html) as { title: string; body: string; image?: { url: string } }) : null);
const P = (id: string, species: string[], o: Partial<PublicPlace> = {}): PublicPlace => ({ id, name: `낚시터${id}`, kind: "저수지", sido: "경기도", sigungu: "화성시", address: null, lat: 37.2, lng: 126.8, species, fee: null, tel: null, dataDate: null, ...o });

describe("낚시 어종 공개 페이지", () => {
    it("낚시터의 대상 어종은 같은 물고기일 때만 우리 어종으로 잇는다", () => {
        expect(placeFishId("붕어류")).toBe("bungeo");
        expect(placeFishId("조피볼락")).toBe("ureok");
        expect(placeFishId("넙치")).toBe("gwangeo");
        expect(placeFishId("베스")).toBe("bass");
        // 다른 물고기이거나 무엇인지 모르는 이름
        for (const s of ["향어", "떡붕어", "돔류", "돔", "장어류", "민물고기"]) expect(placeFishId(s)).toBeNull();
        const all = [P("1", ["붕어", "잉어"]), P("2", ["붕어류"]), P("3", ["향어"])];
        expect(spotsOfFish(all, "bungeo").map((p) => p.id)).toEqual(["1", "2"]);
        expect(fishSpotCounts(all).get("ingeo")).toBe(1);
        expect(fishBySlug("감성돔".normalize("NFD"))?.id).toBe("gamseongdom");
        expect(fishBySlug("고래")).toBeNull();
    });
    it("오늘 바다에서 좋은 어종 — 지수 그대로, 우리 어종만, 좋음 이상이 많은 순", () => {
        const S = (name: string, fish: Record<string, { am: any; pm: any }>) => ({ name, lat: 34, lng: 127, fish, wave: null, wind: null, wtemp: null, tide: null });
        const map = { day: "2026-10-18", days: ["2026-10-18"], fishes: ["감성돔", "우럭", "기타어종"], spots: [
            S("가", { 감성돔: { am: "좋음", pm: "보통" }, 우럭: { am: "나쁨", pm: null } }),
            S("나", { 감성돔: { am: "보통", pm: "매우좋음" }, 우럭: { am: "좋음", pm: null } }),
            S("다", { 감성돔: { am: "보통", pm: null }, 기타어종: { am: "좋음", pm: null } }),
        ] };
        const g = goodFishToday(map as any);
        expect(g.map((x) => [x.fish.name, x.good, x.rated])).toEqual([["감성돔", 2, 3], ["우럭", 1, 2]]);
        expect(goodFishToday(null)).toEqual([]);
    });
    it("검색용 글(server/assets/fishing/fish-pages.json)은 받은 도감 · 금어기 표와 같다 — 어긋나면 server/scripts/fishing-fish-pages.ts 를 다시 돌린다", () => {
        const index = json<{ key: string; name: string }[]>("client/public/fishing/guide/index.json");
        const regs = json<{ basis: string; rows: { name: string; rule: string }[] }>("client/public/fishing/guide/regs.json");
        const a = fishAsset();
        expect(a.basis).toBe(regs.basis);
        for (const f of FISH) {
            const want = FISH_GUIDE_NAME[f.id] ? index.find((g) => g.name === FISH_GUIDE_NAME[f.id])?.key ?? null : null;
            expect(a.fish[f.id]?.guide?.key ?? null, f.id).toBe(want);
            if (want) expect(a.fish[f.id]!.guide!.intro).toBe(json<{ intro: string }>(`client/public/fishing/guide/g/${want}.json`).intro);
            expect(a.fish[f.id]?.regs.map((r) => r.rule), f.id).toEqual(regs.rows.filter((r) => (FISH_REG_NAMES[f.id] ?? []).includes(r.name)).map((r) => r.rule));
        }
        expect(read("vercel.json")).toContain('"server/assets/**"');
    });
    it("제목은 있는 것만 — 금어기 표가 없는 어종은 금어기를 적지 않고, 낚시터가 없으면 낚시터를 적지 않는다", () => {
        const bass = FISH.find((f) => f.id === "bass")!, gam = FISH.find((f) => f.id === "gamseongdom")!;
        expect(fishPageSeo(bass, 0).title).toBe("배스 낚시 — 3짜 · 4짜 · 런커 기준 | 랭큐 낚시");
        expect(fishPageSeo(gam, 15).title).toBe("감성돔 낚시 — 3짜 · 4짜 · 5짜 기준 · 금어기 · 금지체장 · 감성돔 낚시터 15곳 | 랭큐 낚시");
        expect(fishPageSeo(gam, 15).description).toContain("감성돔을 노리는 낚시터 15곳");
        expect(fishPageSeo(FISH.find((f) => f.id === "bungeo")!, 3).description).toContain("붕어를 노리는");
        expect(fishCardInput(bass, 0)).toEqual({ name: "배스", place: "민물 낚시 · 3짜 · 4짜 · 런커", detail: "", kind: "reservoir", fish: "bass", badge: "어종 한 장" });
    });
    it("검색용 화면 — 허브는 22종, 한 장에는 크기 · 금어기 · 낚시터 · 도감과 출처", async () => {
        expect(FISHING_FISH_RE.test("/fishing/fish")).toBe(true);
        expect(FISHING_FISH_RE.test("/fishing/fish/%EA%B0%90%EC%84%B1%EB%8F%94")).toBe(true);
        expect(FISHING_FISH_RE.test("/fishing/fishes")).toBe(false);
        const places = async () => [P("10", ["감성돔", "볼락"], { kind: "바다" }), P("11", ["붕어"])];
        const hub = html(await renderFishingFish("/fishing/fish", places));
        for (const f of FISH) expect(hub?.body).toContain(`href="${fishingFishPath(f.name)}"`);
        const one = html(await renderFishingFish(fishingFishPath("감성돔"), places));
        expect(one?.body).toContain("<li>4짜 — 40cm부터</li>");
        expect(one?.body).toContain("<h2>금어기 · 금지체장</h2>");
        expect(one?.body).toContain("낚시터10");
        expect(one?.body).not.toContain("낚시터11");
        expect(one?.body).toContain("CC BY-SA 4.0");
        expect(one?.image?.url).toContain("/og/fishing-fish/gamseongdom.png");
        const bass = html(await renderFishingFish(fishingFishPath("배스"), places));
        expect(bass?.body).not.toContain("금어기 · 금지체장</h2>");
        expect(bass?.body).not.toContain("이야기</h2>");
        expect(await renderFishingFish("/fishing/fish/고래", places)).toBeNull();
        expect(await renderFishingFish("/fishing/fish/%E0%A4%A", places)).toBeNull();
    });
    it("길 — 봇 라우트 · 프리렌더 · 앱 라우트 · 사이트맵 · 공개 자료 길", () => {
        expect(read("vercel.json")).toContain("|port/[^/]+|fish(?:/[^/]+)?|");
        expect(read("server/prerender.ts")).toContain("app.get(FISHING_FISH_RE, async (req, res, next) => {");
        const app = read("client/src/App.tsx");
        expect(app).toContain('<Route path="/fishing/fish">');
        expect(app).toContain('<Route path="/fishing/fish/:name">');
        expect(read("server/sitemap.ts")).toContain("...fishingFishSitemapParts(");
        const parts = fishingFishSitemapParts("2026-10-18").map((x) => JSON.parse(x) as { loc: string; image?: string });
        expect(parts.length).toBe(2 + FISH.length); // 허브 · 금어기 달력 · 22종
        expect(parts.slice(2).every((x) => x.image?.includes("/og/fishing-fish/"))).toBe(true);
        const r = read("server/routes/modules/fishing.ts");
        expect(r).toContain('router.get("/market", asyncHandler(');
        expect(r).toContain('router.get("/index-map", asyncHandler(');
        expect(read("server/ogImage.ts")).toContain('app.get("/og/fishing-fish/:id.png"');
        // 없는 주소는 봇에게 404 + noindex(2026-10-18 — 200 껍데기는 '소프트 404'). 표를 못 읽은 경우(낚시터 · 산)는 화면에 맡긴다
        const pre = read("server/prerender.ts");
        expect(pre).toContain('if (!r) return sendGone(res, "없는 어종이에요"');
        expect(pre).toContain('if (!r) return sendGone(res, "없는 바다 · 항구예요"');
        expect(pre).toContain('if (!r) return all.length ? sendGone(res, "없는 낚시터예요"');
        expect(pre).toMatch(/if \(!r\) return all\.length && .*sendGone\(res, "없는 산이에요"/);
        // 앱의 없는 주소 화면은 그린 뒤 noindex(떠나면 되돌린다)
        const nf = read("client/src/pages/not-found.tsx");
        expect(nf).toContain('meta?.setAttribute("content", "noindex, follow");');
        expect(nf).toContain('if (meta && prevRobots != null) meta.setAttribute("content", prevRobots);');
        // 바다 어종은 오늘의 낚시지수 지도(앱과 같은 그림)를 같이 그린다 — 그 어종의 단계로
        const page = read("client/src/fishing/spots/FishPages.tsx");
        expect(page).toContain('data-testid="fish-index-map"');
        expect(page).toContain("step: bestOf(x.fish[f.name])");
    });
});
