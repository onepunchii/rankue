/**
 * 골프 첫 화면 /golf(2026-10-26 오너 "골프도 수정") — 앱 라우트가 없어 사람에겐 404, 봇에겐 당구 셸(제목 '당구 점수판 랭큐', canonical 홈)이었고
 * 사이트맵에도 없었다. 낚시 첫 화면(server/seo/fishingHome.test)과 같은 네 곳: 봇 경로 · 검색용 화면 · 화면 라우트 · 사이트맵(+ 화면 제목).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GOLF_HOME_PATH, golfHomeSeo } from "./golfGuide";
import { sportForPath } from "./sportRoute";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

describe("골프 첫 화면 /golf", () => {
    it("제목은 사실만 · 숫자 없이(화면과 서버가 같은 글)", () => {
        const seo = golfHomeSeo();
        expect(GOLF_HOME_PATH).toBe("/golf");
        expect(seo.title).toBe("랭큐 골프 — 수수료 없는 골프 조인 · 부킹 · 전국 골프장 날씨 · 코스");
        expect(seo.title + seo.description).not.toMatch(/추천|초보|최고|\d/);
    });
    it("봇 경로 · 검색용 화면 — /golf 를 잡고, 첫 화면부터 그린다", () => {
        expect(read("vercel.json")).toContain("|golf|golf/course/[^/]+|golf/(?:courses|booking|join|urgent)(?:/[^/]+){0,2}|");
        const pre = read("server/prerender.ts");
        expect(pre).toContain("const GOLF_PAGE_RE = /^\\/golf(?:\\/(?:course|courses|booking|join|urgent|find)(?:\\/.*)?)?\\/?$/;");
        const at = pre.indexOf("export async function renderGolfPath(");
        expect(pre.slice(at, at + 400)).toContain("if (path === GOLF_HOME_PATH) return renderGolfHome(golfView(await loadGolfCourseSummary()));");
        const home = pre.slice(pre.indexOf("function renderGolfHome("), at);
        expect(home).toContain("canonical: `${ORIGIN}${GOLF_HOME_PATH}`");
        expect(home).toContain('tag: "golf:home"');
    });
    it("화면 — 앱 라우트가 생겼고(골프를 볼 수 없으면 홈으로), 주소가 골프라 종목도 골프, 홈 탭이 켜진다", () => {
        const app = read("client/src/App.tsx");
        expect(app).toContain('<Route path="/golf" component={GolfHomeRoute} />');
        expect(app).toContain('return visible ? <FramedDashboard /> : <Redirect to="/dashboard" replace />;');
        expect(sportForPath("/golf")).toBe("GOLF");
        expect(read("client/src/components/hiq/HiqNavigation.tsx")).toContain('(isGolf && tab.id === "home" && location === "/golf")');
        // 제목은 /golf 에서만 — /dashboard 의 골프 홈은 건드리지 않는다
        expect(read("client/src/golf/pages/Dashboard.tsx")).toContain("useSeo(location === GOLF_HOME_PATH ? {");
    });
    it("사이트맵 — 골프 허브 사이트맵 맨 앞(DB 가 죽어도 싣는다)", () => {
        const sm = read("server/sitemap.ts");
        expect(sm).toContain('const parts: string[] = [entry(`${ORIGIN}/golf`, { changefreq: "daily", priority: "0.9" }), ...golfGuideSitemapParts()');
    });
});
