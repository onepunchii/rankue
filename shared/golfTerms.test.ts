import { describe, it, expect } from "vitest";
import { GOLF_TERMS, GOLF_TERMS_INTRO, GOLF_TERM_CATEGORIES, golfTermBySlug, golfTermsInCategory } from "./golfTerms";
import {
    GOLF_TERMS_PATH, GOLF_TERMS_TITLE, GOLF_TERM_MIN_CHARS, GOLF_TERM_SECTIONS, golfTermAnchorPath, golfTermBodyChars, golfTermDescription, golfTermHref,
    golfTermJsonLd, golfTermPath, golfTermTitle, golfTermsDesc, golfTermsJsonLd, hasGolfTermPage, isIndexableGolfTerm,
} from "./golfTermsMeta";
import { teePart } from "./golfCourse";
import { roundBrief } from "./golfRoundBrief";
import { isFindKey } from "./golfFind";
import { PACK_PATH } from "./golfPack";
import type { WxHour } from "./golfWeather";

// 골프 용어 사전 — 글은 화면과 검색엔진용 화면이 같이 쓴다. 꼴(주소·연결)과, 글이 코드의 실제 규칙과 어긋나지 않는지를 붙든다.
const pages = GOLF_TERMS.filter(hasGolfTermPage);
const allText = (t: (typeof GOLF_TERMS)[number]) => [t.short, ...GOLF_TERM_SECTIONS.map((s) => t.page?.[s.key] ?? "")].join(" ");
/** 2020년 이후 이모지(Emoji 13+) — 안드로이드 10·iOS 13 에 없다 */
const tooNew = (cp: number) => [[0x1f6d6, 0x1f6d7], [0x1f6dc, 0x1f6df], [0x1f6fb, 0x1f6fc], [0x1f7f0, 0x1f7f0], [0x1f90c, 0x1f90c], [0x1f972, 0x1f972],
    [0x1f977, 0x1f979], [0x1f9cb, 0x1f9cc], [0x1fa74, 0x1fa77], [0x1fa7b, 0x1fa7c], [0x1fa83, 0x1fa8f], [0x1fa96, 0x1faff]].some(([a, b]) => cp >= a && cp <= b);

describe("용어 목록", () => {
    it("슬러그·용어가 겹치지 않고, 슬러그는 띄어쓰기·가운뎃점 없는 NFC", () => {
        expect(new Set(GOLF_TERMS.map((t) => t.slug)).size).toBe(GOLF_TERMS.length);
        expect(new Set(GOLF_TERMS.map((t) => t.term)).size).toBe(GOLF_TERMS.length);
        for (const t of GOLF_TERMS) {
            expect(t.slug, t.slug).toBe(t.slug.normalize("NFC"));
            expect(t.slug, t.slug).toMatch(/^[가-힣A-Za-z0-9]+$/);
            expect(golfTermBySlug(t.slug)).toBe(t);
        }
        expect(golfTermBySlug("버디".normalize("NFD"))?.term).toBe("버디"); // 맥에서 온 풀어쓴 한글도 찾는다
        expect(golfTermBySlug("없는말")).toBeUndefined();
    });
    it("갈래 여섯 — 빈 갈래가 없고, 모든 용어가 어느 갈래에 든다", () => {
        expect(GOLF_TERM_CATEGORIES).toHaveLength(6);
        let n = 0;
        for (const c of GOLF_TERM_CATEGORIES) { const ts = golfTermsInCategory(c.id); expect(ts.length, c.label).toBeGreaterThanOrEqual(4); n += ts.length; }
        expect(n).toBe(GOLF_TERMS.length);
        expect(GOLF_TERMS.length).toBeGreaterThanOrEqual(60);
    });
    it("한 줄 정의 — 너무 짧지도 길지도 않고 마침표로 끝난다", () => {
        for (const t of GOLF_TERMS) {
            expect(t.short.length, t.term).toBeGreaterThanOrEqual(12);
            expect(t.short.length, t.term).toBeLessThanOrEqual(90);
            expect(t.short, t.term).toMatch(/[.다]$/);
        }
    });
    it("같이 보는 말·링크가 살아 있다 — 없는 슬러그·자기 자신·없는 주소를 가리키지 않는다", () => {
        for (const t of GOLF_TERMS) {
            for (const r of t.related ?? []) { expect(golfTermBySlug(r), `${t.term} → ${r}`).toBeTruthy(); expect(r).not.toBe(t.slug); }
            for (const l of t.links ?? []) {
                const find = /^\/golf\/find\/([^/]+)$/.exec(l.href);
                if (find) expect(isFindKey(find[1]), l.href).toBe(true);
                else expect(["/golf/join", "/golf/booking", "/golf/urgent", "/golf/courses", PACK_PATH], l.href).toContain(l.href);
            }
        }
    });
    it("이모지 — 용어마다 하나, 2019년 이전 것만(양파 🧅 가 그 선이다)", () => {
        expect(golfTermBySlug("양파")!.emoji).toBe("🧅");
        for (const t of GOLF_TERMS) {
            expect(t.emoji, t.term).not.toBe("");
            for (const ch of t.emoji) { const cp = ch.codePointAt(0)!; if (cp !== 0xfe0f) expect(tooNew(cp), `${t.term} ${cp.toString(16)}`).toBe(false); }
        }
        for (const c of GOLF_TERM_CATEGORIES) for (const ch of c.emoji) { const cp = ch.codePointAt(0)!; if (cp !== 0xfe0f) expect(tooNew(cp), c.label).toBe(false); }
    });
});

describe("자세한 풀이(자기 페이지)", () => {
    it("열여섯 개 — 뜻·쓰임·예시·헷갈리는 점이 다 있고 색인 기준(300자)을 넘는다", () => {
        expect(pages.length).toBe(16);
        for (const t of pages) {
            for (const k of ["meaning", "usage", "example", "confusion"] as const) expect(t.page![k].length, `${t.term}.${k}`).toBeGreaterThan(40);
            expect(golfTermBodyChars(t), t.term).toBeGreaterThanOrEqual(GOLF_TERM_MIN_CHARS);
            expect(isIndexableGolfTerm(t)).toBe(true);
            expect(t.page!.meaning.startsWith(t.term.split(" ")[0]) || t.page!.meaning.includes(t.term), t.term).toBe(true);
        }
        for (const s of ["버디", "이글", "보기", "양파", "핸디캡", "라베", "멀리건", "컨시드", "OB", "조인"]) expect(hasGolfTermPage(golfTermBySlug(s)!), s).toBe(true);
    });
    it("금액을 적지 않고, 내기를 다루지 않는다", () => {
        for (const t of GOLF_TERMS) {
            expect(allText(t), t.term).not.toMatch(/\d[\d,]*\s*(원|만원|만 원)/);
            expect(allText(t), t.term).not.toMatch(/내기|판돈|도박|배판/);
        }
    });
    it("구질은 오른손잡이 기준이라고 적는다", () => {
        for (const s of ["슬라이스", "훅", "페이드드로", "생크"]) expect(golfTermBySlug(s)!.short, s).toContain("오른손잡이 기준");
    });
    it("타수 예시가 맞다 — 기준 타수와의 차이", () => {
        expect(golfTermBySlug("버디")!.short).toContain("파4 홀을 세 번");
        expect(golfTermBySlug("보기")!.short).toContain("파4 홀을 다섯 번");
        expect(golfTermBySlug("양파")!.short).toContain("파4 홀에서 여덟 타");
        expect(golfTermBySlug("이글")!.short).toContain("파5 홀을 세 번");
        expect(golfTermBySlug("알바트로스")!.short).toContain("파5 홀을 두 번");
        expect(golfTermBySlug("언더파오버파")!.short).toContain("70타는 2언더파, 80타는 8오버파");
        expect(golfTermBySlug("싱글")!.short).toContain("81타 이하"); // 72 + 9
    });
});

describe("랭큐 기능 설명은 실제 코드 그대로", () => {
    it("1부·2부·3부 — 오전 11시 전 / 오후 3시 전 / 그 뒤(teePart)", () => {
        const text = golfTermBySlug("1부2부3부")!.page!.inApp!;
        expect(text).toContain("오전 11시 전을 1부, 오후 3시 전을 2부, 그 뒤를 3부");
        const at = (h: number, m: number) => teePart(new Date(Date.UTC(2026, 9, 6, h - 9, m)).toISOString());
        expect([at(10, 59), at(11, 0), at(14, 59), at(15, 0)]).toEqual([1, 2, 2, 3]);
    });
    it("라베 날씨 — 바람이 약하고 10~27°(roundBrief)", () => {
        expect(golfTermBySlug("라베")!.page!.inApp).toContain("기온이 10~27°인 라운드는 '라베 날씨'");
        const h = (hr: number, tmp: number, wsd: number): WxHour => ({ t: `20261006${String(hr).padStart(2, "0")}`, tmp, pop: 0, kind: "clear", wsd, pcp: null });
        const day = (tmp: number, wsd: number) => Array.from({ length: 17 }, (_, i) => h(i + 5, tmp, wsd));
        const verdict = (tmp: number, wsd: number) => roundBrief(day(tmp, wsd), 12, { rise: "06:30", set: "18:08" })!.verdict;
        expect([verdict(11, 2), verdict(27, 4)]).toEqual(["라베 날씨", "라베 날씨"]);
        expect(verdict(28, 2)).not.toBe("라베 날씨");
        expect(verdict(18, 5)).not.toBe("라베 날씨");
    });
    it("조인 — 승인제·수수료 없음(shared/golfGuide 와 같은 말)", () => {
        const text = golfTermBySlug("조인")!.page!.inApp!;
        for (const w of ["로그인한 누구나", "올린 사람이 보고 승인", "수수료도 없고", "현장에서 나눠"]) expect(text).toContain(w);
    });
});

describe("주소·제목·설명·구조화 데이터", () => {
    it("자기 페이지가 있으면 그 주소, 없으면 허브 앵커", () => {
        expect(golfTermPath("버디")).toBe(`/golf/terms/${encodeURIComponent("버디")}`);
        expect(golfTermHref(golfTermBySlug("버디")!)).toBe(golfTermPath("버디"));
        expect(golfTermHref(golfTermBySlug("파")!)).toBe(golfTermAnchorPath("파"));
        expect(golfTermAnchorPath("파")).toBe(`${GOLF_TERMS_PATH}#${encodeURIComponent("파")}`);
    });
    it("제목에 찾는 말(골프 용어 · ○○ 뜻)이 있고, 설명은 160자 안", () => {
        expect(GOLF_TERMS_TITLE).toContain("골프 용어 사전");
        expect(golfTermTitle("양파")).toBe("양파 뜻 — 골프 용어 사전 | 랭큐 골프");
        expect(golfTermsDesc(GOLF_TERMS.length, pages.length).length).toBeLessThanOrEqual(160);
        expect(GOLF_TERMS_INTRO.length).toBeGreaterThan(40);
        for (const t of GOLF_TERMS) { const d = golfTermDescription(t); expect(d.length, t.term).toBeLessThanOrEqual(155); expect(d.startsWith(t.term)).toBe(true); }
        expect(golfTermDescription(golfTermBySlug("컨시드")!)).toContain("컨시드(오케이 · OK · 기브):");
    });
    it("허브 — DefinedTermSet 에 전부, 용어 — DefinedTerm 하나와 경로", () => {
        const hub: any = golfTermsJsonLd(GOLF_TERMS);
        expect(hub["@graph"][0]["@type"]).toBe("DefinedTermSet");
        expect(hub["@graph"][0].hasDefinedTerm).toHaveLength(GOLF_TERMS.length);
        expect(hub["@graph"][0].hasDefinedTerm.find((x: any) => x.name === "파").url).toBe(`https://www.rankue.co.kr${golfTermAnchorPath("파")}`);
        const one: any = golfTermJsonLd(golfTermBySlug("버디")!);
        expect(one["@graph"][0]).toMatchObject({ "@type": "DefinedTerm", name: "버디", alternateName: ["Birdie"] });
        expect(one["@graph"][1].itemListElement.at(-1).item).toBe(`https://www.rankue.co.kr${golfTermPath("버디")}`);
    });
});
