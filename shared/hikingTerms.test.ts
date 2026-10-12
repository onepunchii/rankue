import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
    HIKING_CHECKLIST, HIKING_CHECKLIST_SEO, HIKING_TERMS, HIKING_TERMS_SEO, HIKING_TERM_GROUPS, checklistSeasonOf, hikingTerm, hikingTermPath, hikingTermSeo,
} from "./hikingTerms";

const root = (f: string) => resolve(__dirname, "..", f);
const ALL_TEXT = JSON.stringify([HIKING_TERMS, HIKING_CHECKLIST]);

describe("등산 용어 사전", () => {
    it("말마다 주소가 하나 — 로마자 id, 겹치지 않는다", () => {
        expect(HIKING_TERMS.length).toBeGreaterThanOrEqual(36);
        expect(new Set(HIKING_TERMS.map((t) => t.id)).size).toBe(HIKING_TERMS.length);
        expect(new Set(HIKING_TERMS.map((t) => t.term)).size).toBe(HIKING_TERMS.length);
        for (const t of HIKING_TERMS) {
            expect(t.id, t.term).toMatch(/^[a-z0-9]+$/);
            expect(hikingTermPath(t.id)).toBe(`/hiking/terms/${t.id}`);
            expect(HIKING_TERM_GROUPS.some((g) => g.id === t.group), t.term).toBe(true);
        }
    });
    it("뜻은 한 줄, 설명은 두세 문장 — 마침표로 끝난다", () => {
        for (const t of HIKING_TERMS) {
            expect(t.short.length, t.term).toBeLessThanOrEqual(40);
            expect(t.short.endsWith("."), t.term).toBe(true);
            expect(t.body.length, t.term).toBeGreaterThan(50);
            expect(t.body.length, t.term).toBeLessThan(260);
            expect(/[.다요]$/.test(t.body), t.term).toBe(true);
        }
    });
    it("'함께 보면 좋은 말'은 사전에 있는 말만, 자기 자신은 아니다", () => {
        for (const t of HIKING_TERMS) for (const id of t.see ?? []) {
            expect(hikingTerm(id), `${t.term} → ${id}`).toBeTruthy();
            expect(id).not.toBe(t.id);
        }
        expect(hikingTerm("없는말")).toBeUndefined();
    });
    it("묶음마다 말이 있다", () => {
        for (const g of HIKING_TERM_GROUPS) expect(HIKING_TERMS.filter((t) => t.group === g.id).length, g.name).toBeGreaterThanOrEqual(6);
    });
    it("싣지 않는 것 — 술 · 돈 · 상표 · 빨리/밤 산행을 부추기는 말", () => {
        expect(ALL_TEXT).not.toMatch(/막걸리|소주|맥주|하산주|술(?![가-힣])|음주/);
        expect(ALL_TEXT).not.toMatch(/\d[\d,]*\s*원(?![가-힣])|입장료|주차비|가격/);
        expect(ALL_TEXT).not.toMatch(/고어텍스|노스페이스|블랙야크|K2|코오롱|네파|아크테릭스|밀레/i);
        expect(ALL_TEXT).not.toMatch(/야간 산행|일출 산행|최단 시간|기록 단축|빨리 오르/);
    });
    it("검색 제목과 설명", () => {
        expect(HIKING_TERMS_SEO.title).toContain("등산 용어 사전");
        expect(HIKING_TERMS_SEO.desc).toContain(String(HIKING_TERMS.length));
        const seo = hikingTermSeo(hikingTerm("deulmeori")!);
        expect(seo.title).toBe("들머리 뜻 — 등산 용어 | 랭큐 등산");
        expect(seo.desc.length).toBeLessThanOrEqual(150);
        expect(seo.desc).toContain("산행을 시작하는 곳");
    });
});

describe("등산 준비물", () => {
    it("묶음 여섯 — 언제나 · 있으면 편한 것 · 사철", () => {
        expect(HIKING_CHECKLIST.map((g) => g.id)).toEqual(["basic", "more", "spring", "summer", "autumn", "winter"]);
        const ids = HIKING_CHECKLIST.flatMap((g) => g.items.map((i) => i.id));
        expect(new Set(ids).size).toBe(ids.length);
        for (const g of HIKING_CHECKLIST) for (const it of g.items) { expect(it.name.length, it.id).toBeGreaterThan(0); expect(it.why.length, it.id).toBeGreaterThan(8); }
    });
    it("달 → 철", () => {
        expect(checklistSeasonOf(10)).toBe("autumn");
        expect(checklistSeasonOf(1)).toBe("winter");
        expect(checklistSeasonOf(12)).toBe("winter");
        expect(checklistSeasonOf(4)).toBe("spring");
        expect(checklistSeasonOf(7)).toBe("summer");
        expect(HIKING_CHECKLIST_SEO.path).toBe("/hiking/checklist");
    });
});

describe("새 공개 주소의 네 곳 · 표지", () => {
    const read = (f: string) => readFileSync(root(f), "utf8");
    it("검색용 화면 · 사이트맵 · 화면 라우트 · 봇 경로", () => {
        const seo = read("server/seo/hiking.ts");
        expect(seo).toContain("if (p === HIKING_TERMS_PATH) return terms();");
        expect(seo).toContain("if (p === HIKING_CHECKLIST_PATH) return checklist();");
        expect(seo).toContain("...HIKING_TERMS.map((t) => entry(`${ORIGIN}${hikingTermPath(t.id)}`");
        const app = read("client/src/App.tsx");
        for (const p of ["/hiking/terms", "/hiking/terms/:id", "/hiking/checklist"]) expect(app, p).toContain(`<Route path="${p}"`);
        expect(read("vercel.json")).toContain("|/terms(?:/[^/]+)?|/checklist)?)/?");
    });
    it("표지 그림 두 장", () => {
        for (const n of ["cover-terms", "cover-checklist"]) expect(existsSync(root(`client/public/hiking/art/${n}.webp`)), n).toBe(true);
    });
    it("준비물의 표시는 기기에만 — 서버로 보내지 않는다", () => {
        const page = read("client/src/hiking/pages/ChecklistPage.tsx");
        expect(page).toContain("localStorage.setItem(KEY");
        expect(page).not.toMatch(/apiRequest|useMutation|fetch\(/);
    });
});
