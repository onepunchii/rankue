import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GUIDE_LABEL, cleanGuide, cleanGuideText, guideHoldReason, guideHoles, guideSentences, hasGuide } from "./golfCourseGuide";

/**
 * 골프장 코스 가이드(2026-10-12 오너: "…우리 누락된 거 정보랑 골프장 부가 정보 가지고 온 거 넣으면 좋지 않아?").
 * 받은 글을 그대로 싣지 않는다 — 믿을 만한 골프장만, 문장마다 걸러서. 그 규칙과, 화면 · 검색용 화면이 같은 값을 쓰는지를 본다.
 */
const root = resolve(__dirname, "..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");
const raw = (over: Record<string, unknown> = {}) => ({
    confidence: "high",
    overview: "경기도 여주시에 있는 18홀 대중제 골프장입니다. 구릉형 코스입니다.",
    courses: [{ name: "OUT", holes: 9, description: "전장이 긴 편입니다." }, { name: "IN", holes: 9, description: "17번홀은 파3입니다." }],
    layoutNotes: "그린은 벤트그라스입니다. 그린스피드는 2.8m 수준으로 소개됩니다.",
    signatureHoles: [{ hole: "17번홀 파3", description: "그린 좌우에 해저드가 있습니다." }],
    facilities: "클럽하우스에 레스토랑이 있습니다.", access: "흥천이포IC에서 차로 5분 이내입니다.",
    tips: ["17번 파3는 안전한 방향을 정하고 공략하는 편이 좋습니다."],
    faq: [{ q: "몇 홀인가요?", a: "18홀입니다." }],
    notes: "내부 메모 — 화면에 내지 말 것", sources: [{ url: "https://example.com/a", title: "공식" }, { url: "javascript:alert(1)", title: "나쁜 주소" }],
    ...over,
});

describe("문장 거르기", () => {
    it("문장으로 나눈다 — 소수점(2.8m) 안에서는 나누지 않는다", () => {
        expect(guideSentences("그린스피드는 2.8m 수준입니다. 바람이 붑니다.")).toEqual(["그린스피드는 2.8m 수준입니다.", "바람이 붑니다."]);
        expect(guideSentences("  한 문장뿐입니다.  ")).toEqual(["한 문장뿐입니다."]);
    });

    it("우리 자료를 가리키는 말 · 남의 플랫폼 · 요금 · 전화번호 · 평점 · 술 · 내기가 든 문장은 뺀다", () => {
        const keep = "구릉형 코스로 경사가 완만합니다.";
        for (const bad of [
            "데이터베이스상 63홀입니다.", "앱 DB에는 18홀로 되어 있습니다.",
            "김캐디는 이 골프장을 퍼블릭으로 표기합니다.", "공식 홈페이지에서 카카오골프 예약 페이지로 연결됩니다.", "골프 블로그 한 곳은 차로 40분이라고 소개합니다.", "골프존 앱에서 예약합니다.",
            "주중 그린피는 15만원입니다.", "카트비는 팀당 기준으로 안내합니다.", "대표 전화는 031-123-4567입니다.",
            "골퍼 후기 평점이 높습니다.", "클럽하우스에 와인바가 있습니다.", "제주맥주 하우스가 있습니다.", "개장 행사 때 스킨스 경기가 열렸습니다.",
        ]) {
            expect(cleanGuideText(`${keep} ${bad}`), bad).toBe(keep);
        }
    });

    it("비슷하게 생겼지만 다른 말은 남긴다 — 차별점 · 소주고개로 · 거리를 내기 어렵다 · 골프존카운티 · 티업 시간", () => {
        for (const ok of [
            "운영 측은 김치 전문회사가 운영하는 식당을 차별점으로 소개합니다.",
            "강원특별자치도 춘천시 남면 소주고개로에 있는 18홀 골프장입니다.",
            "티샷으로 거리를 내기 어렵다는 라운드 후기가 있습니다.",
            "골프존카운티가 운영하는 18홀 대중제 코스입니다.",
            "배정받은 티업 시간에 라운드하는 방식입니다.",
            "레이크 1번은 파4 원앙홀로 소개됩니다.",
        ]) expect(cleanGuideText(ok), ok).toBe(ok);
    });

    it("아무것도 알려 주지 않는 문장 · 글쓴이의 메모 같은 문장도 뺀다. 남는 것이 없으면 null", () => {
        expect(cleanGuideText("1992년에 개장했습니다. 설계자는 확인한 자료에 나오지 않습니다.")).toBe("1992년에 개장했습니다.");
        expect(cleanGuideText("페어웨이 폭에 대한 평가는 엇갈리므로 단정하지 않았습니다.")).toBeNull();
        expect(cleanGuideText("연습장과 숙박시설은 확인하지 못했습니다.")).toBeNull();
        expect(cleanGuideText(null)).toBeNull();
        expect(cleanGuideText("")).toBeNull();
    });
});

describe("골프장 한 곳의 가이드", () => {
    it("걸러서 담는다 — 내부 메모는 받지 않고, 출처는 http 주소만", () => {
        const g = cleanGuide(raw(), "2026-10-12")!;
        expect(g).toMatchObject({ v: 1, at: "2026-10-12", confidence: "high" });
        expect(g.courses).toEqual([{ name: "OUT", holes: 9, desc: "전장이 긴 편입니다." }, { name: "IN", holes: 9, desc: "17번홀은 파3입니다." }]);
        expect(g.signature).toHaveLength(1);
        expect(g.sources).toEqual([{ url: "https://example.com/a", title: "공식" }]);
        expect(JSON.stringify(g)).not.toContain("내부 메모");
        expect(Object.keys(g)).not.toContain("notes");
        expect(hasGuide(g)).toBe(true);
    });

    it("요금을 묻는 문답은 통째로 뺀다. 답이 다 걸러진 문답 · 설명이 다 걸러진 대표 홀도", () => {
        const g = cleanGuide(raw({
            faq: [{ q: "그린피는 얼마인가요?", a: "예약 시 확인하세요." }, { q: "예약은 어디서 하나요?", a: "공식 홈페이지에서 합니다." }, { q: "잔디는?", a: "데이터베이스상 한국잔디입니다." }, { q: "몇 홀인가요?", a: "18홀입니다." }],
            signatureHoles: [{ hole: "3번홀", description: "확인하지 못했습니다." }, { hole: "17번홀 파3", description: "해저드가 있습니다." }],
        }), "2026-10-12")!;
        expect(g.faq).toEqual([{ q: "몇 홀인가요?", a: "18홀입니다." }]);
        expect(g.signature.map((h) => h.hole)).toEqual(["17번홀 파3"]);
    });

    it("확신이 낮은 곳 · 개요가 남지 않는 곳은 싣지 않는다", () => {
        expect(cleanGuide(raw({ confidence: "low" }), "2026-10-12")).toBeNull();
        expect(cleanGuide(raw({ confidence: undefined }), "2026-10-12")).toBeNull();
        expect(cleanGuide(raw({ overview: "데이터베이스상 18홀입니다." }), "2026-10-12")).toBeNull();
        expect(cleanGuide(null, "2026-10-12")).toBeNull();
        expect(hasGuide(null)).toBe(false);
        expect(hasGuide({ v: 2, overview: "x" })).toBe(false);
        expect(hasGuide({ v: 1, overview: "" })).toBe(false);
    });

    it("우리 자료의 홀 수와 다르면 싣지 않는다 — 둘 중 하나가 틀린 것이다. 가이드의 홀 수를 모르면 견주지 않는다", () => {
        expect(guideHoles(raw())).toBe(18);
        expect(guideHoldReason(raw(), 18)).toBeNull();
        expect(guideHoldReason(raw(), 36)).toBe("홀 수가 다름(가이드 18 · 우리 36)");
        expect(guideHoldReason(raw({ confidence: "low" }), 18)).toBe("확신 낮음");
        expect(guideHoles(raw({ courses: [{ name: "A" }] }))).toBeNull();
        expect(guideHoldReason(raw({ courses: [{ name: "A" }] }), 27)).toBeNull();
        expect(guideHoldReason(raw(), null)).toBeNull();
    });
});

describe("화면 · 검색용 화면 · 저장", () => {
    it("화면과 검색용 화면이 같은 구역 이름을 쓴다", () => {
        const screen = read("client/src/golf/components/course/detail/CourseGuide.tsx");
        const pre = read("server/prerender.ts");
        for (const k of ["section", "courses", "layout", "signature", "facilities", "access", "tips", "faq", "note"] as const) {
            expect(screen, k).toContain(`GUIDE_LABEL.${k}`);
            expect(pre, k).toContain(`L.${k}`);
        }
        expect(GUIDE_LABEL.note).not.toMatch(/블로그/);
        // 화면: 리터럴 색만 · 12px 아래 글자 없음
        expect(screen.replace(/\/\*[\s\S]*?\*\//, "")).not.toMatch(/\b(?:bg|text|border|ring)-(?:white|black)\b/);
        expect([...screen.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].every((m) => Number(m[1]) >= 12)).toBe(true);
    });

    it("가이드 구역은 코스(파 표) 다음, 소개 앞 — 구역 줄에도 '가이드'가 있다", () => {
        const page = read("client/src/golf/pages/GolfCoursePage.tsx");
        const a = page.indexOf('ids.includes("course") &&'), b = page.indexOf('ids.includes("guide") && hasGuide(d.guide)'), c = page.indexOf('ids.includes("about") &&');
        expect(a).toBeGreaterThan(0); expect(b).toBeGreaterThan(a); expect(c).toBeGreaterThan(b);
        expect(page).toContain("key={`guide:${d.slug}`}");
        expect(read("client/src/golf/components/course/detail/SectionNav.tsx")).toContain('guide: "가이드"');
    });

    it("검색용 화면 — 문답은 그 골프장의 구조화 자료(FAQPage)로도 나간다. 가이드가 없으면 구역도 자료도 없다", () => {
        const pre = read("server/prerender.ts");
        expect(pre).toContain('...(guide?.faq.length ? [{ "@type": "FAQPage"');
        expect(pre).toContain('const guideHtml = guide ? courseGuideHtml(p.name, guide) : "";');
        expect(pre).toContain("${courseHtml}${guideHtml}${introHtml}");
    });

    it("가이드는 한 곳씩 따로 읽는다 — 목록이 다 같이 쓰는 골프장 요약에는 싣지 않는다(490곳을 합치면 800KB)", () => {
        const api = read("server/routes/modules/golfCourses.ts");
        const summary = api.slice(api.indexOf("q(sql`select slug, name, region, city, address"), api.indexOf("from golf_course_pages where slug <> ''"));
        expect(summary.length).toBeGreaterThan(50);
        expect(summary).not.toMatch(/\bguide\b/);
        expect(api).toContain("guide: await getCourseGuide(p.slug).catch(");
        const store = read("server/storage/golfCourseGuide.ts");
        expect(store).toContain("select guide from golf_course_pages where slug = ${slug}");
        expect(store).toContain("if (missingColumn(e)) return null;");
        expect(store).toContain("return hasGuide(g) ? g : null;");
    });

    it("가이드 적재 스크립트 — 규칙은 shared 것만 쓰고 guide 칸만 쓴다. --apply 가 없으면 세기만", () => {
        const s = read("server/scripts/golf-course-guides.ts");
        expect(s).toContain('from "../../shared/golfCourseGuide"');
        expect(s).toContain("guideHoldReason(v, p.holes)");
        expect(s).toContain("cleanGuide(v, today)");
        expect(s).toContain('const apply = args.includes("--apply");');
        expect(s).toContain("if (!apply) { wrote++; continue; }");
        expect([...s.matchAll(/update golf_course_pages set ([^\n]+)/g)].map((m) => m[1].trim())).toEqual(["guide = $2::jsonb, updated_at = now()"]);
        expect(s).not.toMatch(/delete from|set guide = null/);
    });

    it("다시 적재해도 남는다 — 적재 스크립트는 이 칸을 건드리지 않는다. 칸은 더하기만", () => {
        expect(read("server/scripts/golf-course-pages.ts")).not.toMatch(/\bguide\b/);
        const sql = read("migrations/golf_course_guide.sql").split("\n").filter((l) => !l.startsWith("--")).join("\n");
        expect(sql.trim()).toBe("alter table golf_course_pages add column if not exists guide jsonb;");
        expect(read("shared/schema.ts")).toContain('guide: jsonb("guide"),');
    });
});
