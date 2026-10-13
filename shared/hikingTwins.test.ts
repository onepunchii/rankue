import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { HIKING_TWINS, isTwinFrom, twinGuideSource, twinSlug } from "./hikingTwins";

const root = resolve(__dirname, "..");
const read = (f: string) => readFileSync(resolve(root, f), "utf8");

// 2026-10-13: 글만 있고 자리(시군구 · 좌표)가 없는 산 화면이 76곳이었다 — 그 가운데 28곳은 같은 산이 자리 · 코스를 가진 채 따로 실려 있었다
// ("객산"은 글만, "객산-하남"은 코스만). 글을 자리 있는 줄로 옮기고 자리 없는 줄은 싣지 않는다.
describe("두 줄로 실린 산을 하나로", () => {
    it("목록 — 한 줄은 한 번만, 지울 줄과 남는 줄이 겹치지 않는다(사슬이 없다)", () => {
        expect(HIKING_TWINS.length).toBe(28);
        const from = HIKING_TWINS.map((t) => t.from), into = HIKING_TWINS.map((t) => t.into);
        expect(new Set(from).size).toBe(from.length);
        expect(new Set(into).size).toBe(into.length);
        expect(from.filter((id) => into.includes(id))).toEqual([]);
        const fromSlugs = HIKING_TWINS.map((t) => t.fromSlug), intoSlugs = HIKING_TWINS.map((t) => t.intoSlug);
        expect(new Set(fromSlugs).size).toBe(fromSlugs.length);
        expect(fromSlugs.filter((s) => intoSlugs.includes(s))).toEqual([]);
        // 두 줄은 같은 이름의 산이다 — 주소의 이름 부분(뒤의 '-2' · '-하남'을 뗀 것)이 같다
        const stem = (s: string) => s.split("-")[0];
        for (const t of HIKING_TWINS) expect(stem(t.fromSlug), t.fromSlug).toBe(stem(t.intoSlug));
    });
    it("뺀 것 — 높이가 10m 넘게 다른 쌍과 이름만 같은 다른 산은 넣지 않는다", () => {
        const names = HIKING_TWINS.map((t) => t.fromSlug.split("-")[0]);
        for (const n of ["구룡산", "금오산", "남산", "비음산", "승달산", "월아산", "입암산", "산방산"]) expect(names, n).not.toContain(n);
    });
    it("옛 주소 → 남은 산의 주소 · 그 밖의 주소는 그대로", () => {
        expect(twinSlug("객산")).toBe("객산-하남");
        expect(twinSlug("귀때기청봉-2")).toBe("귀때기청봉");
        expect(twinSlug("객산-하남")).toBe("객산-하남");
        expect(twinSlug("설악산")).toBe("설악산");
        expect(isTwinFrom("Q16179588")).toBe(true);
        expect(isTwinFrom("Q27308409")).toBe(false);
        expect(twinGuideSource("Q27308409")).toBe("Q16179588");
        expect(twinGuideSource("Q16179588")).toBeNull();
    });
    it("서버 — 산 찾기 두 곳이 옛 주소를 남은 산으로 잇는다(답의 slug 가 진짜 주소)", () => {
        const store = read("server/storage/hiking.ts");
        expect(store).toContain('import { twinSlug } from "../../shared/hikingTwins.js";');
        expect(store).toContain("return cache?.bySlug.get(slug) ?? cache?.bySlug.get(twinSlug(slug)) ?? null;");
        expect(store).toContain("if (!m && twinSlug(slug) !== slug) [m] = await read(twinSlug(slug));");
    });
    it("화면 — 옛 주소로 들어오면 주소 줄을 남은 산의 것으로 바꿔 끼운다(replace)", () => {
        expect(read("client/src/hiking/pages/MountainPage.tsx")).toContain("useEffect(() => { if (d && slug && d.slug !== slug) setLocation(hikingMountainPath(d.slug), { replace: true }); }, [d, slug, setLocation]);");
    });
    it("적재 — 다시 실어도 지운 줄이 되살아나지 않고 글은 남는 줄에 붙는다", () => {
        const imp = read("server/scripts/hiking-import.ts");
        expect(imp).toContain("let mountains = master.filter((m) => (m.tier === 1 || m.tier === 2 || withCourse.has(m.id)) && !isTwinFrom(m.id));");
        expect(imp).toContain('const raw = guideOf.get(m.id) ?? guideOf.get(twinGuideSource(m.id) ?? "");');
    });
    it("정리 스크립트 — 글이 있는 줄은 덮어쓰지 않고, 무엇이든 걸린 줄은 지우지 않는다", () => {
        const fold = read("server/scripts/hiking-fold-twins.ts");
        expect(fold).toContain("where id = $2 and guide is null");
        expect(fold).toContain("delete from hiking_mountains where id = $1 and sido is null");
        expect(fold).toContain('const REF_TABLES = ["hiking_courses", "hiking_pois", "hiking_course_links", "hiking_summits", "hiking_wishes", "hiking_photos", "hiking_trips"];');
        expect(fold).toContain("if (n > 0) { held++;");
    });
});
