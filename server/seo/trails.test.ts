import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("../prerender.js", () => ({
    page: (p: { title: string; body: string }) => `<title>${p.title}</title>${p.body}`,
    esc: (s: unknown) => String(s ?? "").replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c] as string)),
    hubNav: () => "",
}));
vi.mock("../sitemap.js", () => ({ entry: (loc: string, opts?: object) => JSON.stringify({ loc, ...opts }) }));

import { TRAILS_RE, renderTrails, trailsSitemapParts } from "./trails";
import type { TrailCourseDetail, TrailRouteMeta } from "../../shared/koreaTrails";

const asset = JSON.parse(readFileSync(resolve(__dirname, "../assets/trails/korea-trails.json"), "utf8")) as { made: string; routes: TrailRouteMeta[]; courses: TrailCourseDetail[] };
const find = (route: string, key: string) => {
    const list = asset.courses.filter((c) => c.route === route);
    const i = list.findIndex((c) => c.key === key);
    return i < 0 ? null : { course: list[i], prev: list[i - 1] ?? null, next: list[i + 1] ?? null };
};

/** 코리아둘레길 검색용 화면(2026-10-21) — 허브 · 길 넷 · 코스 */
describe("코리아둘레길 — 검색용 화면", () => {
    it("주소 — 허브 · 길 · 코스만(모르는 길 · 없는 코스는 그리지 않는다)", () => {
        for (const p of ["/hiking/trails", "/hiking/trails/haeparang", "/hiking/trails/dmz/3-1"]) expect(TRAILS_RE.test(p), p).toBe(true);
        expect(TRAILS_RE.test("/hiking/trail")).toBe(false);
        expect(renderTrails("/hiking/trails/haeparang/999", asset.courses, asset.routes, find)).toBeNull();
        expect(renderTrails("/hiking/trails/nowhere", asset.courses, asset.routes, find)).toBeNull();
    });
    it("허브 · 길 · 코스가 그려진다 — 코스 링크 · 두루누비 출처", () => {
        const hub = renderTrails("/hiking/trails", asset.courses, asset.routes, find)!;
        expect(hub.tag).toBe("trails:hub");
        expect(hub.html).toContain('href="/hiking/trails/haeparang/1"');
        expect(hub.html).toContain("두루누비(한국관광공사)");
        expect(renderTrails("/hiking/trails/namparang", asset.courses, asset.routes, find)!.tag).toBe("trails:route");
        const one = renderTrails("/hiking/trails/haeparang/1", asset.courses, asset.routes, find)!;
        expect(one.tag).toBe("trails:course");
        expect(one.html).toContain("<title>해파랑길 1코스 — 17km");
        expect(one.html).toContain('href="/hiking/trails/haeparang/2"');
    });
    it("사이트맵 — 허브 · 길 넷 · 코스 170", () => {
        expect(trailsSitemapParts(asset.courses, asset.made).length).toBe(1 + 4 + asset.courses.length);
    });
});
