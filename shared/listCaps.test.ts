import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { COURSE_LIST_MAX } from "./golfParEdit";

/**
 * 목록이 '전부인 것처럼' 보이는데 사실은 잘려 있던 곳들(2026-10-07 오너: "200 이상 더 안 내려감 — 200 리밋 걸려 있나?" → "다른 것도 그런
 * 현상 있나 봐 주고"). 전수 점검에서 찾은 것 중 고친 네 곳을 고정한다 — 상한을 다시 줄이거나 안내를 떼면 여기서 걸린다.
 *
 * 원칙: (가) 화면이 limit 를 키워 다시 받는 목록은 서버 상한이 전체 줄 수보다 커야 한다.
 *       (나) 서버가 N건만 주는 목록은 화면이 'N건까지'라고 밝히거나, 놓치면 안 되는 줄(처리 대기)을 먼저 준다.
 */
const root = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const code = (src: string) => src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join("\n");

describe("(가) limit 를 키워 다시 받는 목록", () => {
    it("어드민 골프장 데이터 — 서버 상한이 골프장 페이지 수(490)보다 넉넉하다", () => {
        expect(COURSE_LIST_MAX).toBeGreaterThanOrEqual(1000);
        const route = code(root("server/routes/modules/adminGolf/courses.ts"));
        expect(route).toContain("const limit = Math.min(COURSE_LIST_MAX, Math.max(1, Math.floor(Number(req.query.limit)) || 50));");
        expect(route).not.toMatch(/Math\.min\(200,/);
        // 화면은 50씩 키워 처음부터 다시 받는다 — 그래서 상한이 곧 '내려갈 수 있는 끝'이다
        const view = code(root("client/src/pages/admin/golf/GolfCoursesView.tsx"));
        expect(view).toContain("<button onClick={() => setLimit((n) => n + PAGE)} disabled={list.isFetching}");
    });
});

describe("(나) 서버가 N건만 주는 목록", () => {
    it("골프 허브 '지금 올라온 글' — 화면이 limit 를 안 보내니 기본값이 곧 끝이다. 넘는 만큼은 '외 N건'으로 밝힌다", () => {
        const route = code(root("server/routes/modules/golfCourses.ts"));
        expect(route).toContain("const HUB_LISTINGS_MAX = 300;");
        expect(route).toContain("const limit = Math.min(HUB_LISTINGS_MAX, Math.max(1, Number(req.query.limit) || HUB_LISTINGS_MAX));");
        expect(route).not.toContain("Number(req.query.limit) || 60");
        const api = code(root("client/src/golf/lib/courseApi.ts"));
        const hook = api.slice(api.indexOf("export function useHubListings("), api.indexOf("export function useCourseDetail("));
        expect(hook).not.toContain("limit");
        const hub = code(root("client/src/golf/pages/GolfCourseHub.tsx"));
        expect(hub).toContain("{hubRows.length <= listingLimit && listingCount > hubRows.length && (");
        expect(hub).toContain("외 {(listingCount - hubRows.length).toLocaleString()}건이 더 있어요");
    });

    it("어드민 회원 경기 기록 — 서버 상한(100판)만큼 받고, 꽉 찼으면 '최근 100판까지'라고 밝힌다", () => {
        const dlg = code(root("client/src/pages/admin/MemberGamesDialog.tsx"));
        expect(dlg).toContain("const GAMES_LIMIT = 100;");
        expect(dlg.match(/games\?limit=\$\{GAMES_LIMIT\}/g)).toHaveLength(2);
        expect(dlg).toContain("{games.length >= GAMES_LIMIT && <span");
        const admin = code(root("server/routes/modules/admin.ts"));
        const h = admin.slice(admin.indexOf('router.get("/members/:id/games"'), admin.indexOf('router.get("/members/:id/golf"'));
        expect(h).toContain("const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));");
    });

    it("어드민 매장 클레임·신규 매장 등록 — 100건만 주지만 '대기' 건을 먼저 준다(쌓여도 처리할 것이 밀려 빠지지 않는다)", () => {
        const admin = root("server/routes/modules/admin.ts");
        expect(admin).toContain(".orderBy(dsql`CASE WHEN ${storeListingClaims.status} = 'pending' THEN 0 ELSE 1 END`, desc(storeListingClaims.createdAt)).limit(100);");
        expect(admin).toContain(".orderBy(dsql`CASE WHEN ${storeRegistrations.status} = 'pending' THEN 0 ELSE 1 END`, desc(storeRegistrations.createdAt))");
        expect(code(admin)).not.toContain(".orderBy(desc(storeListingClaims.createdAt)).limit(100)");
    });
});
