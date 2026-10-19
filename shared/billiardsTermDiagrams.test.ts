import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TERM_DIAGRAMS, cushionMarks, onRail, type TableDiagram } from "./billiardsTermDiagrams";
import { termBySlug } from "./billiardsTerms";

/**
 * 당구 용어 그림(2026-10-19) — 본문 예시를 옮긴 개념도. 그림이 거짓말을 하지 않게:
 *  · 쿠션에서 들어온 각 = 나간 각(입사각 = 반사각) — 손으로 찍은 점이 어긋나면 여기서 잡힌다
 *  · 쿠션 번호의 개수가 본문이 말하는 개수와 같다(3쿠션 셋 · 뱅크샷은 첫 접촉이 쿠션 · 대회전은 넷 이상)
 */
const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const tables = Object.entries(TERM_DIAGRAMS).filter((e): e is [string, TableDiagram] => e[1].kind === "table");

describe("당구 용어 그림", () => {
    it("그림이 있는 용어는 사전에 있다", () => {
        for (const slug of Object.keys(TERM_DIAGRAMS)) expect(termBySlug(slug), slug).toBeTruthy();
    });
    it("쿠션에서 들어온 각 = 나간 각", () => {
        for (const [slug, d] of tables) {
            for (const path of d.paths) {
                path.points.forEach((p, i) => {
                    if (i === 0 || i === path.points.length - 1 || !onRail(p)) return;
                    const a = path.points[i - 1], b = path.points[i + 1];
                    const v1 = [p[0] - a[0], p[1] - a[1]], v2 = [b[0] - p[0], b[1] - p[1]];
                    const vertical = p[0] <= 0.0005 || p[0] >= 1.9995; // 단쿠션(세로 레일)
                    const n1 = Math.hypot(v1[0], v1[1]), n2 = Math.hypot(v2[0], v2[1]);
                    const u1 = [v1[0] / n1, v1[1] / n1], u2 = [v2[0] / n2, v2[1] / n2];
                    const want = vertical ? [-u1[0], u1[1]] : [u1[0], -u1[1]];
                    expect(Math.abs(u2[0] - want[0]) + Math.abs(u2[1] - want[1]), `${slug} 점 ${i}`).toBeLessThan(0.03);
                });
            }
        }
    });
    it("쿠션 번호가 본문과 맞다", () => {
        const cue = (slug: string) => (TERM_DIAGRAMS[slug] as TableDiagram).paths.find((p) => p.by === "cue")!;
        expect(cushionMarks(cue("3쿠션")).length).toBe(3);
        expect(cushionMarks(cue("뱅크샷")).length).toBe(3);
        expect(onRail(cue("뱅크샷").points[1])).toBe(true); // 첫 접촉이 쿠션
        expect(cushionMarks(cue("대회전")).length).toBeGreaterThanOrEqual(4);
        expect(cushionMarks(cue("4구")).length).toBe(0);
        // 키스는 부딪힌 자리에서 끊겨 그 뒤 쿠션은 세지 않는다
        expect(cushionMarks(cue("키스")).length).toBe(0);
    });
    it("용어 페이지 · 허브(짧은 항목)가 그림을 단다", () => {
        expect(read("client/src/pages/billiards-term.tsx")).toContain("{TERM_DIAGRAMS[t.slug] && <TermDiagram d={TERM_DIAGRAMS[t.slug]} />}");
        expect(read("client/src/pages/billiards-terms.tsx")).toContain("{!own && TERM_DIAGRAMS[t.slug] && <TermDiagram d={TERM_DIAGRAMS[t.slug]} />}");
    });
});
