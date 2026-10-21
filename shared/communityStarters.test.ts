import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ko } from "../client/src/lib/i18n/ko";
import en from "../client/src/lib/i18n/en";
import es from "../client/src/lib/i18n/es";
import tr from "../client/src/lib/i18n/tr";
import vi from "../client/src/lib/i18n/vi";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

/** 커뮤니티 이야기 거리(2026-10-21) — 글이 적은 동안(여섯 개 미만) 게시판마다 쓸 거리 셋. 가짜 글이 아니라 글쓰기의 첫 문장 */
describe("커뮤니티 이야기 거리", () => {
    it("게시판 넷 × 셋, 다섯 언어 모두 있다", () => {
        for (const dict of [ko, en, es, tr, vi] as Record<string, string>[]) {
            for (const b of ["ask", "brag", "store", "lesson"]) for (const i of [0, 1, 2]) expect(dict[`community.starter.${b}.${i}`]).toBeTruthy();
            expect(dict["community.starterTitle"]).toBeTruthy();
        }
    });
    it("글이 쌓이면 사라지고, 비로그인은 글쓰기 창 대신 로그인", () => {
        const page = read("client/src/pages/hiq/community.tsx");
        expect(page).toContain("{!isLoading && !langOnly && posts.length < 6 && (");
        expect(page).toContain("if (!me) { goLogin(setLocation); return; }");
        expect(read("client/src/components/hiq/community/WritePostDialog.tsx")).toContain("else if (!content.trim()) setContent(starter);");
    });
});
