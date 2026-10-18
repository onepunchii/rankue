import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { trendDomain } from "../client/src/components/hiq/charts/RankTrendChart";

/**
 * UMB 대회 이름(레전드) 읽기 · 순위 추이 범위(2026-10-18 디자이너 리뷰 — 조명우 선수 페이지, 주 62명).
 *  · 해석기가 레전드 줄을 x < 60 으로 고정해 잡아 쪽 크기가 바뀐 PDF(남자 23/2026 x=94 · 여자는 처음부터 x=63)의 대회 이름을 못 읽었다
 *    → 선수 화면 '포인트 구성'에 "대회 G"처럼 떴다. 표 머리줄의 첫 대회 칸 x 의 절반 안쪽으로 본다(실제 PDF 넷으로 13개씩 확인).
 *  · 이미 들어온 회차는 크론이 PDF 를 다시 읽어 이름만 채운다(랭킹 행은 그대로).
 *  · 1위 ↔ 2위만 오간 선수의 추이가 판 꼭대기와 바닥을 오가는 벽처럼 그려졌다 → 순위는 적어도 10칸.
 */
const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

describe("UMB 대회 이름 · 순위 추이", () => {
    it("레전드 줄은 고정 x 가 아니라 표 머리줄 기준으로 찾는다", () => {
        const s = read("server/services/umbService.ts");
        expect(s).not.toContain("items[0].x < 60");
        expect(s).toContain("const legendMaxX = cols.length ? Math.min(...cols.map(c => c.x)) / 2 : 160;");
    });
    it("크론이 이름이 빈 최근 회차를 다시 읽어 이름만 채운다", () => {
        const sync = read("server/services/umbSync.ts");
        expect(sync).toContain("storage.umb.editionsMissingEvents(");
        expect(sync).toContain("storage.umb.fillEditionEvents(");
        const repo = read("server/storage/umb.repo.ts");
        // 이름만 지우고 다시 넣는다 — 랭킹 행(umb_rankings)은 건드리지 않는다
        const fill = repo.slice(repo.indexOf("async fillEditionEvents"), repo.indexOf("// 최신·직전 회차"));
        expect(fill).toContain("tx.delete(umbEvents)");
        expect(fill).not.toContain("tx.delete(umbRankings)");
    });
    it("순위 추이는 적어도 10칸, 1위 위로는 없다", () => {
        expect(trendDomain([1, 2, 1, 1], true)).toEqual([1, 10]);
        expect(trendDomain([120, 180], true)).toEqual([116, 184]);
        expect(trendDomain([], true)).toEqual(["dataMin", "dataMax"]);
        const pts = trendDomain([466, 470], false) as [number, number];
        expect(pts[1] - pts[0]).toBeGreaterThanOrEqual(46);
    });
    it("대회 이력 표는 이름을 윗줄 전체 폭에 — 연도 칸과 한 줄에 두지 않는다", () => {
        const s = read("client/src/components/hiq/umb/UmbPlayerSheet.tsx");
        expect(s).toContain("const gridCols = `repeat(${eh.years.length}, minmax(0,1fr))`;");
        expect(s).not.toContain("minmax(0,1fr) repeat(${eh.years.length}, 58px)");
    });
});
