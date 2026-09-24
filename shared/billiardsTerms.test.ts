import { describe, it, expect } from "vitest";
import { BILLIARDS_TERMS, TERM_CATEGORIES, termBySlug } from "./billiardsTerms.js";
import { TERM_MIN_CHARS, hasOwnPage, isIndexableTerm, termBodyChars, termPath, termDescription, termHref, termJsonLd } from "./billiardsTermsMeta.js";

// 용어 사전은 손으로 쓰는 글이라, 깨지기 쉬운 것(슬러그 중복·끊긴 관련 링크·얇은 페이지)을 여기서 막는다.
describe("당구 용어 사전 본문", () => {
    it("슬러그가 겹치지 않고 NFC 이며 주소에 쓸 수 없는 문자가 없다", () => {
        const seen = new Set<string>();
        for (const t of BILLIARDS_TERMS) {
            expect(t.slug).toBe(t.slug.normalize("NFC"));
            expect(t.slug).not.toMatch(/[\s/#?%]/);
            expect(seen.has(t.slug)).toBe(false);
            seen.add(t.slug);
        }
    });

    it("관련 용어는 모두 사전 안에 있고 자기 자신을 가리키지 않는다", () => {
        const broken: string[] = [];
        for (const t of BILLIARDS_TERMS) {
            for (const r of t.related ?? []) if (!termBySlug(r) || r === t.slug) broken.push(`${t.slug} → ${r}`);
        }
        expect(broken).toEqual([]);
    });

    it(`자기 페이지가 있는 용어는 본문이 ${TERM_MIN_CHARS}자 이상이다(얇은 페이지는 색인하지 않는다)`, () => {
        const thin = BILLIARDS_TERMS.filter((t) => hasOwnPage(t) && !isIndexableTerm(t)).map((t) => `${t.slug}: ${termBodyChars(t)}`);
        expect(thin).toEqual([]);
    });

    it("자기 페이지 30개 안팎, 짧은 항목 20개 안팎", () => {
        const pages = BILLIARDS_TERMS.filter(hasOwnPage).length;
        expect(pages).toBeGreaterThanOrEqual(28);
        expect(BILLIARDS_TERMS.length - pages).toBeGreaterThanOrEqual(18);
    });

    it("모든 분류에 용어가 있고, 모든 용어는 알려진 분류에 속한다", () => {
        const ids = new Set(TERM_CATEGORIES.map((c) => c.id));
        for (const t of BILLIARDS_TERMS) expect(ids.has(t.category)).toBe(true);
        for (const c of TERM_CATEGORIES) expect(BILLIARDS_TERMS.some((t) => t.category === c.id)).toBe(true);
    });

    it("앱 링크는 사이트 안 경로다", () => {
        for (const t of BILLIARDS_TERMS) for (const l of t.links ?? []) expect(l.href.startsWith("/")).toBe(true);
    });

    it("NFD 로 들어온 슬러그도 같은 용어를 찾는다", () => {
        expect(termBySlug("에버리지".normalize("NFD"))?.slug).toBe("에버리지");
    });

    it("주소는 퍼센트 인코딩된 모양이 정본이다", () => {
        expect(termPath("에버리지")).toBe(`/billiards/terms/${encodeURIComponent("에버리지")}`);
        expect(termPath("3쿠션")).toMatch(/^\/billiards\/terms\/3%/);
    });

    it("설명문은 한 줄 정의로 시작해 검색 결과에서 잘려도 뜻이 남는다", () => {
        const t = termBySlug("에버리지")!;
        expect(termDescription(t).startsWith("에버리지(애버리지·평균) 뜻: 총득점을")).toBe(true);
    });

    it("짧은 항목은 자기 주소 대신 허브 앵커로 연결된다(301 대상 주소를 안에서 링크하지 않는다)", () => {
        for (const t of BILLIARDS_TERMS) {
            if (hasOwnPage(t)) expect(termHref(t)).toBe(termPath(t.slug));
            else expect(termHref(t)).toBe(`/billiards/terms#${encodeURIComponent(t.slug)}`);
        }
    });

    it("DefinedTerm 에는 CreativeWork 전용 속성(inLanguage)을 달지 않는다", () => {
        const ld = termJsonLd(termBySlug("하이런")!) as { "@graph": Record<string, unknown>[] };
        const dt = ld["@graph"].find((n) => n["@type"] === "DefinedTerm")!;
        expect(dt).toBeTruthy();
        expect("inLanguage" in dt).toBe(false);
        expect(dt.url).toBe(`https://www.rankue.co.kr${termPath("하이런")}`);
    });
});
