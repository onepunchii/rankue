import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TRAIL_SPOTS_MAX, pickTrailSpots } from "./trailSpots";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const line: [number, number][] = [[35.1, 129.1], [35.12, 129.12], [35.14, 129.14]];
const row = (id: string, lat: number, lng: number, o: Record<string, unknown> = {}) => ({ contentid: id, title: `곳${id}`, addr1: "부산", mapy: lat, mapx: lng, firstimage: `http://tong.visitkorea.or.kr/cms/${id}.jpg`, firstimage2: "", cpyrhtDivCd: "Type1", ...o });

/** 코스 근처 볼거리(2026-10-21) — 관광공사 관광지 · 사진 */
describe("코스 근처 볼거리 고르기", () => {
    it("사진이 공공누리 1 · 3유형 · 관광공사 사진 서버 · 코스 선 2km 안만 · https", () => {
        const out = pickTrailSpots([[
            row("1", 35.1, 129.1),
            row("2", 35.1, 129.1, { cpyrhtDivCd: "Type4" }),
            row("3", 35.1, 129.1, { firstimage: "" }),
            row("4", 35.1, 129.1, { firstimage: "https://example.com/a.jpg" }),
            row("5", 35.3, 129.1),
        ]], line);
        expect(out.map((x) => x.id)).toEqual(["1"]);
        expect(out[0]).toMatchObject({ image: "https://tong.visitkorea.or.kr/cms/1.jpg", lic: "Type1", dist: 0 });
    });
    it("시작 · 가운데 · 끝 묶음에서 차례로 — 한 끝에 몰리지 않는다 · 같은 곳은 한 번 · 여섯까지", () => {
        const start = ["11", "12", "13", "14", "15", "16"].map((id) => row(id, 35.1, 129.1));
        const end = ["31", "32"].map((id) => row(id, 35.14, 129.14));
        const out = pickTrailSpots([start, [row("11", 35.1, 129.1)], end], line);
        expect(out.map((x) => x.id)).toEqual(["11", "31", "12", "32", "13", "14"]);
        expect(out).toHaveLength(TRAIL_SPOTS_MAX);
    });
    it("파일 · 길 · 화면 · 검색용 화면 — 누르면 카카오맵 길찾기(검색 결과는 저장하지 않는다), 사진은 원본 비율", () => {
        expect(read("server/routes/modules/trails.ts")).toContain("spots: trailSpotsOf(course.id)");
        expect(read("server/prerender.ts")).toContain("renderTrails(req.path, trailCourses(), trailRouteMeta(), trailCourse, trailSpotsOf)");
        const ui = read("client/src/hiking/trails/TrailCoursePage.tsx");
        expect(ui).toContain('data-testid="trail-spots"');
        expect(ui).toContain("h-[104px] w-auto max-w-none");
        expect(ui).not.toContain("object-cover");
        expect(read("server/seo/trails.ts")).toContain("<h2>코스 근처 볼거리</h2>");
        // 받은 파일 — 하루 1,000번을 넘겨 끊긴 코스는 앞서 받은 것을 둔다
        expect(read("server/scripts/fetch-trail-spots.ts")).toContain("if (miss && prev[c.id]) { out[c.id] = prev[c.id]; kept++; continue; }");
        const file = JSON.parse(read("server/assets/trails/near-spots.json")) as { spots: Record<string, unknown[]> };
        expect(Object.values(file.spots).filter((x) => x.length).length).toBeGreaterThan(100);
    });
});

describe("코스 지도의 볼거리 점", () => {
    it("마름모 점 · 이름표는 오른쪽에 들어갈 때만(점에서 멀어진 이름표가 길의 것처럼 보였다) · 점의 뜻에 '코스 근처 볼거리'", () => {
        const map = read("client/src/hiking/components/CourseMap.tsx");
        expect(map).toContain('data-testid="course-map-extra"');
        expect(map).toContain("noFlip: true");
        expect(map).toContain(".filter((l) => !l.noFlip || (l.x - v.x) / unit + l.dx + labelPx(l.text, FS) <= W - 4)");
        expect(read("client/src/hiking/trails/TrailCoursePage.tsx")).toContain('extrasWord="코스 근처 볼거리"');
    });
});
