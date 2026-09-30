import { describe, expect, it } from "vitest";
import type { FootprintStop } from "@shared/golfFootprints";
import { groupByCourse, kstDot } from "./albumGroups";

const stop = (name: string): FootprintStop => ({ clubId: null, name, slug: null, region: null, lat: 37, lng: 127, firstVisitedAt: "2026-09-01T00:00:00Z", lastVisitedAt: "2026-09-01T00:00:00Z", visits: 1, bestScore: null });
const STOPS = [stop("SG아름다운(P)"), stop("H1"), stop("동강시스타 CC")];
const photo = (id: string, courseName: string | null, playedAt: string, createdAt = playedAt, sessionId = `s-${playedAt}`) => ({ id, sessionId, courseName, playedAt, createdAt });

describe("앨범 묶기", () => {
    it("발자국 번호를 붙이고, 가장 최근 발자국이면 latest", () => {
        const g = groupByCourse([photo("a", "동강시스타 CC", "2026-09-28T04:14:25Z")], STOPS);
        expect(g).toHaveLength(1);
        expect(g[0]).toMatchObject({ n: 3, latest: true, name: "동강시스타 CC", days: ["2026.09.28"] });
    });
    it("이름은 공백·대소문자·끝의 CC 를 무시하고 잇는다", () => {
        const g = groupByCourse([photo("a", "동강 시스타", "2026-09-28T04:00:00Z"), photo("b", "h1", "2026-09-24T04:00:00Z")], STOPS);
        expect(g.map((x) => x.n)).toEqual([3, 2]);
    });
    it("도장 없는 골프장은 번호 없이, 최근 라운드 묶음이 먼저, 묶음 안은 찍은 순서", () => {
        const g = groupByCourse([
            photo("old", "H1", "2026-09-24T01:00:00Z", "2026-09-24T02:00:00Z"),
            photo("new2", "처음 가 본 곳", "2026-09-29T01:00:00Z", "2026-09-29T03:00:00Z"),
            photo("new1", "처음 가 본 곳", "2026-09-29T01:00:00Z", "2026-09-29T02:00:00Z"),
        ], STOPS);
        expect(g[0]).toMatchObject({ n: null, latest: false, name: "처음 가 본 곳" });
        expect(g[0].photos.map((p) => p.id)).toEqual(["new1", "new2"]);
        expect(g[1].n).toBe(2);
    });
    it("라운드 날은 한국 날짜(UTC 전날 밤 = 한국 다음 날), 최근 먼저", () => {
        expect(kstDot("2026-09-27T16:30:00Z")).toBe("2026.09.28");
        const g = groupByCourse([photo("a", "H1", "2026-09-24T04:00:00Z"), photo("b", "H1", "2026-10-02T04:00:00Z")], STOPS);
        expect(g[0].days).toEqual(["2026.10.02", "2026.09.24"]);
    });
});
