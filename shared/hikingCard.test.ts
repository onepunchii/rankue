import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { HIKING_CARD_VERSION, HUB_HIKING_REGIONS, hikingMountainCardUrl } from "./ogCards";
import { HIKING_REGIONS } from "./hikingMountains";

const root = resolve(__dirname, "..");
const read = (f: string) => readFileSync(resolve(root, f), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// 2026-10-13 오너: "등산 사이트맵 잘 만들어졌어? … 사이트맵 이미지랑 등등 잘 됐지? 등산인이 들어와서 우와 훅 할 정도로"
// 산 화면 3,700여 곳이 권역 공용 그림 한 장을 달고 나갔고, 사이트맵에는 그림도 고친 날도 없었다 — 골프장처럼 산마다 카드 한 장.
describe("산 카드 — 주소는 한 곳에서, 그림은 우리 표에 있는 산만", () => {
    it("주소 — 한글 슬러그는 인코딩하고 판 번호를 붙인다(그림을 바꾸면 번호를 올린다)", () => {
        expect(hikingMountainCardUrl("https://x.test", "설악산")).toBe(`https://x.test/og/hiking-mountain/${encodeURIComponent("설악산")}.png?v=${HIKING_CARD_VERSION}`);
        expect(hikingMountainCardUrl("https://x.test", "백운산-포천")).toContain(encodeURIComponent("백운산-포천"));
    });
    it("라우트 — /og 아래(robots 가 /api 를 막는다) · 없는 산은 404(아무 글자나 그려 주지 않는다) · 하루 캐시", () => {
        const og = read("server/ogImage.ts");
        const at = og.indexOf('app.get("/og/hiking-mountain/:slug.png"');
        expect(at).toBeGreaterThan(0);
        const fn = og.slice(at, og.indexOf("});\n", at));
        expect(fn).toContain('const slug = String(req.params.slug ?? "").normalize("NFC");');
        expect(fn).toContain("const m = await mountainBySlug(slug);");
        expect(fn).toContain('if (!m) return res.status(404).type("text/plain").send("not found");');
        expect(fn).toContain("renderHikingMountainCardPng(hikingMountainCardInput(m))");
        expect(fn).toContain("s-maxage=86400");
        // 요청에서 받는 것은 슬러그뿐이다 — 이름 · 높이를 주소로 받아 그리지 않는다
        expect(fn).not.toMatch(/req\.query/);
        expect(read("vercel.json")).toContain('"src": "/og/(.*)"');
    });
    it("그림 — 엔진은 지연 로드(정적 import 로 /api 전체가 죽은 사고) · 파일 이름은 아는 권역 여덟 가운데서만 · 지도 · 윤곽선은 싣지 않는다", () => {
        const svc = read("server/services/hikingMountainCard.ts");
        expect(svc).toContain('import { engines, fonts, CARD_SIZE } from "./playerCard.js";');
        expect(code(svc)).not.toMatch(/from "satori"|from "@resvg\/resvg-js"/);
        expect(svc).toContain('const r = region && REGIONS.includes(region) ? region : "gangwon";');
        expect(code(svc)).not.toMatch(/koreaMapData|KOREA_MAP_PATHS|latLngToOutline/);
        // 권역의 목록은 등산의 권역과 같다
        const listed = /const REGIONS = \[(.*?)\];/.exec(svc)![1].replace(/["\s]/g, "").split(",");
        expect(listed).toEqual(HIKING_REGIONS.map((r) => r.id));
        expect(listed).toEqual([...HUB_HIKING_REGIONS]);
    });
    it("자산 — 권역마다 표지와 와펜이 있다(vercel.json 이 server/assets 를 함수에 싣는다) · 한 장이 무겁지 않다", () => {
        expect(read("vercel.json")).toContain('"server/assets/**"');
        for (const r of HIKING_REGIONS) for (const kind of ["cover", "patch"]) {
            const f = resolve(root, `server/assets/hiking/${kind}-${r.id}.png`);
            expect(existsSync(f), `${kind}-${r.id}`).toBe(true);
            // 표지는 색을 줄인 판화다 — 원본 그대로 실으면 카드 한 장이 1MB 를 넘는다
            expect(statSync(f).size, `${kind}-${r.id}`).toBeLessThan(320 * 1024);
        }
    });
});

describe("검색용 화면 · 사이트맵 · 화면이 같은 카드를 쓴다", () => {
    const seo = read("server/seo/hiking.ts");
    it("산 화면의 미리보기 그림은 그 산의 카드 — 세 곳이 같은 주소", () => {
        expect(seo).toContain("const card = { url: hikingMountainCardUrl(ORIGIN, d.slug), width: HUB_CARD_SIZE, height: HUB_CARD_SIZE, alt: `${d.name} — 랭큐 등산` };");
        expect(read("client/src/hiking/pages/MountainPage.tsx")).toContain("image: hikingMountainCardUrl(ORIGIN, d.slug), jsonLd };");
        expect(seo).toContain("lastmod: days.get(m.id) ?? null, image: hikingMountainCardUrl(ORIGIN, m.slug),");
    });
    it("사이트맵 — 주소마다 그림, 산은 고친 날까지. 고친 날은 목록 응답에 싣지 않는다(3,800줄이 그만큼 무거워진다)", () => {
        expect(seo).toContain("const page = (path: string, opts: { changefreq: string; priority: string; lastmod?: string | null }) => entry(`${ORIGIN}${path}`, { ...opts, image: hubImage(path) });");
        expect(seo).toContain("export function hikingSitemapParts(all: readonly MountainSummary[], days: ReadonlyMap<string, string> = new Map()): string[] {");
        const store = read("server/storage/hiking.ts");
        expect(store).toContain("to_char(updated_at, 'YYYY-MM-DD') as updated_day");
        expect(store).toContain("export async function mountainUpdatedDays(): Promise<ReadonlyMap<string, string>> {");
        const summary = store.slice(store.indexOf("const toSummary"), store.indexOf("const TTL_MS"));
        expect(summary).not.toMatch(/updated/);
        expect(read("server/sitemap.ts")).toContain("return hikingSitemapParts(all, await mountainUpdatedDays().catch(() => new Map<string, string>()));");
    });
});
