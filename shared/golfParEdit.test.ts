import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
    checkNinePars, isKnownPars, isExpectedParsShape, pageCoursesFromNines, compareCodePoints, parseParsText,
    cleanNineName, nineNameKey, cleanWebsite, cleanPhone, checkKoreaCoords, parseLatLngText,
    missingFields, logoOrigin, isUnusualNineSum, type CourseDataFacts,
} from "./golfParEdit.js";
import { resolvePars } from "./golfMatch.js";

const P36 = [4, 4, 3, 5, 4, 3, 4, 5, 4];

describe("checkNinePars — 저장할 9홀 파", () => {
    it("9칸 전부 3~6 정수면 통과하고 합을 준다", () => {
        expect(checkNinePars(P36)).toEqual({ ok: true, pars: P36, sum: 36, unusual: false });
        const six = [6, 4, 3, 5, 4, 3, 4, 5, 3];
        expect(checkNinePars(six)).toMatchObject({ ok: true, sum: 37, unusual: false });
    });
    it("합이 34~37 밖이면 통과하되 unusual 로 표시한다(서버는 force 로만 받는다)", () => {
        expect(checkNinePars([3, 3, 3, 3, 3, 3, 3, 3, 3])).toMatchObject({ ok: true, sum: 27, unusual: true });
        expect(checkNinePars([5, 4, 4, 5, 4, 4, 4, 4, 4])).toMatchObject({ ok: true, sum: 38, unusual: true });
        expect(isUnusualNineSum(33)).toBe(true);
        expect(isUnusualNineSum(34)).toBe(false);
        expect(isUnusualNineSum(37)).toBe(false);
    });
    it("모양이 틀리면 막는다 — 칸 수·범위·정수·문자열", () => {
        for (const bad of [[], P36.slice(0, 8), [...P36, 4], null, "443543454", { 0: 4 }]) {
            expect(checkNinePars(bad).ok, JSON.stringify(bad)).toBe(false);
        }
        expect(checkNinePars([4, 4, 2, 5, 4, 3, 4, 5, 4])).toEqual({ ok: false, error: "3번 홀 파가 잘못됐습니다(3~6)" });
        expect(checkNinePars([4, 4, 3, 7, 4, 3, 4, 5, 4]).ok).toBe(false);
        expect(checkNinePars([4, 4, 3, 4.5, 4, 3, 4, 5, 4]).ok).toBe(false);
        expect(checkNinePars(["4", 4, 3, 5, 4, 3, 4, 5, 4]).ok).toBe(false);
    });
    it("저장 값은 받은 배열의 사본이다", () => {
        const input = [...P36];
        const r = checkNinePars(input);
        if (!r.ok) throw new Error("expected ok");
        input[0] = 5;
        expect(r.pars[0]).toBe(4);
    });
});

describe("isKnownPars — 경기 화면(resolvePars)과 같은 판정", () => {
    const cases: unknown[] = [
        P36, [], [4, 4, 3], [0, 4, 3, 5, 4, 3, 4, 5, 4], [4, 4, 3, 5, 4, 3, 4, 5, 7], ["4", 4, 3, 5, 4, 3, 4, 5, 4],
        [4, 4, 3, 5, 4, 3, 4, 5, 4.5], null, "x", [...P36, ...P36],
    ];
    it("9칸짜리는 resolvePars 가 아는 파로 보는 것과 정확히 같다 — 저장했는데 경기 화면이 '파 미확인'이면 안 된다", () => {
        for (const c of cases) {
            const front = resolvePars(c, c).known.slice(0, 9).every(Boolean);
            const back = resolvePars(c, c).known.slice(9).every(Boolean);
            // 18칸은 앞·뒤를 나눠 쓰므로 둘 다 알아야 '아는 파'
            expect(isKnownPars(c), JSON.stringify(c)).toBe(front && back);
        }
    });
    it("checkNinePars 를 통과한 값은 언제나 경기 화면이 아는 파다", () => {
        for (const p of [P36, [3, 3, 3, 3, 3, 3, 3, 3, 3], [6, 6, 6, 6, 6, 6, 6, 6, 6]]) {
            const r = checkNinePars(p);
            expect(r.ok).toBe(true);
            if (r.ok) expect(resolvePars(r.pars, r.pars).known.every(Boolean)).toBe(true);
        }
    });
});

describe("isExpectedParsShape — 고치기 전 값", () => {
    it("빈 배열·9칸·DB 에 있을 법한 원시값 배열은 받는다", () => {
        expect(isExpectedParsShape([])).toBe(true);
        expect(isExpectedParsShape(P36)).toBe(true);
        expect(isExpectedParsShape(["4", null, 3])).toBe(true);
    });
    it("배열이 아니거나 너무 길거나 객체가 섞이면 안 받는다", () => {
        expect(isExpectedParsShape(null)).toBe(false);
        expect(isExpectedParsShape("[]")).toBe(false);
        expect(isExpectedParsShape(new Array(19).fill(4))).toBe(false);
        expect(isExpectedParsShape([{ a: 1 }])).toBe(false);
    });
});

describe("pageCoursesFromNines — 적재 스크립트와 같은 식", () => {
    /** 적재 스크립트(golf-course-pages.ts buildPages)의 식을 그대로 옮긴 대조용 — 'order by name' 은 코드 포인트 순 */
    function loaderRule(rows: { name: string; pars: unknown }[]) {
        const sorted = [...rows].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
        const list: { name: string; par: number; holes: number }[] = [];
        for (const r of sorted) {
            const pars: number[] = Array.isArray(r.pars) ? (r.pars as unknown[]).map(Number).filter((n: number) => n > 0) : [];
            if (!pars.length) continue;
            list.push({ name: r.name, par: pars.reduce((a, b) => a + b, 0), holes: pars.length });
        }
        return list.length ? list : null;
    }

    it("파 있는 코스만, 이름순, { name, par: 합, holes: 칸 수 }", () => {
        const rows = [
            { name: "올드 OUT", pars: P36 },
            { name: "듄스 OUT", pars: [4, 4, 3, 5, 4, 3, 4, 5, 5] },
            { name: "올드 IN", pars: [] },
            { name: "듄스 IN", pars: P36 },
        ];
        expect(pageCoursesFromNines(rows)).toEqual([
            { name: "듄스 IN", par: 36, holes: 9 },
            { name: "듄스 OUT", par: 37, holes: 9 },
            { name: "올드 OUT", par: 36, holes: 9 },
        ]);
    });
    it("한 코스도 파가 없으면 null(적재 스크립트가 넣는 JSON null)", () => {
        expect(pageCoursesFromNines([])).toBeNull();
        expect(pageCoursesFromNines([{ name: "동", pars: [] }, { name: "서", pars: null }])).toBeNull();
    });
    it("0·문자·빈칸은 버리고 남은 칸만 센다 — 적재 스크립트의 map(Number).filter(n > 0) 그대로", () => {
        expect(pageCoursesFromNines([{ name: "A", pars: [4, 0, "5", null, "x", 3] }])).toEqual([{ name: "A", par: 12, holes: 3 }]);
    });
    it("이름순은 운영 DB(C.UTF-8) 순서 — IN 이 OUT 앞, 대문자가 소문자 앞, 한글은 유니코드 순", () => {
        const names = ["west", "East", "서", "남", "동", "OUT", "IN", "레이크 B", "레이크 A"];
        const rows = names.map((name) => ({ name, pars: P36 }));
        expect(pageCoursesFromNines(rows)!.map((c) => c.name)).toEqual(["East", "IN", "OUT", "west", "남", "동", "레이크 A", "레이크 B", "서"]);
    });
    it("여러 모양을 섞어도 대조용 식과 결과가 같다", () => {
        const pool: unknown[] = [P36, [], [5, 5], [4, 0, 4], null, "443", [3, 3, 3, 3, 3, 3, 3, 3, 3], ["4", "4"]];
        const names = ["B", "a", "A", "가", "나 IN", "나 OUT", "Z", "b"];
        for (let seed = 0; seed < 40; seed++) {
            const rows = names.map((name, i) => ({ name, pars: pool[(i * 7 + seed * 3) % pool.length] }));
            expect(pageCoursesFromNines(rows)).toEqual(loaderRule(rows));
        }
    });
    it("적재 스크립트의 식이 바뀌면 여기서 알린다 — 그땐 pageCoursesFromNines 도 같이 고칠 것", () => {
        const src = readFileSync(new URL("../server/scripts/golf-course-pages.ts", import.meta.url), "utf8");
        expect(src).toContain("select club_id, name, pars from rankue_golf_courses order by name");
        expect(src).toContain("r.pars.map(Number).filter((n: number) => n > 0)");
        expect(src).toContain("if (!pars.length) continue;");
        expect(src).toContain("{ name: r.name, par: pars.reduce((a, b) => a + b, 0), holes: pars.length }");
        expect(src).toContain("courses: clubId ? coursesByClub.get(clubId) ?? null : null");
    });
    it("compareCodePoints 는 UTF-16 이 아니라 코드 포인트로 잰다(보조 평면 글자)", () => {
        // U+FF5E(～) 는 UTF-16 으로는 서로게이트(0xD83D…)보다 크지만 코드 포인트로는 작다
        expect(compareCodePoints("～", "😀")).toBeLessThan(0);
        expect(compareCodePoints("a", "ab")).toBeLessThan(0);
        expect(compareCodePoints("동", "동")).toBe(0);
    });
});

describe("parseParsText — 스코어카드 붙여넣기", () => {
    it("띄어쓰기·쉼표·한 덩어리를 받는다", () => {
        expect(parseParsText("4 4 3 5 4 3 4 5 4")).toEqual(P36);
        expect(parseParsText("4,4,3,5,4,3,4,5,4")).toEqual(P36);
        expect(parseParsText(" 443543454 ")).toEqual(P36);
        expect(parseParsText("Par\t4\t4\t3\t5\t4\t3\t4\t5\t4")).toEqual(P36);
    });
    it("합계가 붙었거나 칸이 모자라거나 범위 밖이면 null", () => {
        expect(parseParsText("4 4 3 5 4 3 4 5 4 36")).toBeNull();
        expect(parseParsText("4 4 3 5 4 3 4 5")).toBeNull();
        expect(parseParsText("4 4 3 5 4 3 4 5 9")).toBeNull();
        expect(parseParsText("4434")).toBeNull();
        expect(parseParsText("")).toBeNull();
    });
});

describe("코스 이름", () => {
    it("공백을 하나로, 앞뒤를 떼고, 20자까지", () => {
        expect(cleanNineName("  문화   OUT ")).toEqual({ ok: true, name: "문화 OUT" });
        expect(cleanNineName("가".repeat(20)).ok).toBe(true);
        expect(cleanNineName("가".repeat(21)).ok).toBe(false);
        expect(cleanNineName("   ").ok).toBe(false);
        expect(cleanNineName(null).ok).toBe(false);
        expect(cleanNineName("동<script>").ok).toBe(false);
    });
    it("같은 이름 열쇠 — 띄어쓰기·대소문자만 다르면 같은 코스", () => {
        expect(nineNameKey("문화 OUT")).toBe(nineNameKey("문화out"));
        expect(nineNameKey("문화 OUT")).not.toBe(nineNameKey("문화 IN"));
    });
});

describe("홈페이지·전화", () => {
    it("홈페이지는 http(s) 주소만, 빈 값은 지우기", () => {
        expect(cleanWebsite("https://www.lakeside.kr")).toEqual({ ok: true, value: "https://www.lakeside.kr" });
        expect(cleanWebsite(" http://www.hwasancc.com/ ")).toEqual({ ok: true, value: "http://www.hwasancc.com/" });
        expect(cleanWebsite("")).toEqual({ ok: true, value: null });
        expect(cleanWebsite(null)).toEqual({ ok: true, value: null });
        for (const bad of ["ansung.hanlimgolf.co.kr", "javascript:alert(1)", "ftp://x.co.kr", "https://localhost", "https://a b.com", "https://user:pw@x.co.kr", 3, "https://" + "a".repeat(300) + ".com"]) {
            expect(cleanWebsite(bad).ok, String(bad)).toBe(false);
        }
    });
    it("전화는 숫자와 - 만, 숫자 8~12자리", () => {
        for (const ok of ["031-334-2111", "1588-1234", "02-123-4567", "0507-1234-5678", "0313342111"]) {
            expect(cleanPhone(ok), ok).toEqual({ ok: true, value: ok });
        }
        expect(cleanPhone(" 031-538-7000")).toEqual({ ok: true, value: "031-538-7000" });
        expect(cleanPhone("")).toEqual({ ok: true, value: null });
        for (const bad of ["031 334 2111", "031--334-2111", "-031-334", "031-334-2111-", "1234-567", "+82-31-334-2111", "0313342111123", 313342111]) {
            expect(cleanPhone(bad).ok, String(bad)).toBe(false);
        }
    });
});

describe("좌표", () => {
    it("한국 안(위 33~39, 경 124~132)만, 소수 7자리로", () => {
        expect(checkKoreaCoords(37.2761234567, 127.4301)).toEqual({ ok: true, lat: 37.2761235, lng: 127.4301 });
        expect(checkKoreaCoords(33.2, 126.5).ok).toBe(true);
        expect(checkKoreaCoords(127.43, 37.27).ok).toBe(false); // 뒤바뀜
        expect(checkKoreaCoords(40, 127).ok).toBe(false);
        expect(checkKoreaCoords(37, 133).ok).toBe(false);
        expect(checkKoreaCoords("37.1", "127.1").ok).toBe(false);
        expect(checkKoreaCoords(NaN, 127).ok).toBe(false);
    });
    it("지도에서 복사한 '위도, 경도' 를 읽는다", () => {
        expect(parseLatLngText("37.27612, 127.43011")).toEqual({ lat: 37.27612, lng: 127.43011 });
        expect(parseLatLngText("37.27612 127.43011")).toEqual({ lat: 37.27612, lng: 127.43011 });
        expect(parseLatLngText("37.27612,127.43011")).toEqual({ lat: 37.27612, lng: 127.43011 });
        expect(parseLatLngText("37.27612")).toBeNull();
        expect(parseLatLngText("abc, def")).toBeNull();
    });
});

describe("빈칸 판정", () => {
    const full: CourseDataFacts = {
        logo: "/img/golf-logos/347.png", website: "https://x.co.kr", phone: "031-123-4567",
        clubId: "c1", clubLat: 37.1, clubLng: 127.1, hasFees: true, nines: 4, ninesWithPars: 4,
    };
    it("다 있으면 빈칸이 없다", () => expect(missingFields(full)).toEqual([]));
    it("파 미확인 코스가 하나라도 있으면 '파 미확인', 코스 줄이 아예 없으면 '코스 없음' — 둘은 겹치지 않는다", () => {
        expect(missingFields({ ...full, ninesWithPars: 3 })).toEqual(["pars"]);
        expect(missingFields({ ...full, ninesWithPars: 0 })).toEqual(["pars"]);
        expect(missingFields({ ...full, nines: 0, ninesWithPars: 0 })).toEqual(["nines"]);
    });
    it("공백뿐인 값은 빈칸이다", () => {
        expect(missingFields({ ...full, logo: " ", website: "", phone: null })).toEqual(["logo", "website", "phone"]);
    });
    it("원장 연결이 없으면 '원장 연결'만 — 파·좌표는 넣을 데가 없어 따로 세지 않는다", () => {
        expect(missingFields({ ...full, clubId: null, clubLat: null, clubLng: null, nines: 0, ninesWithPars: 0 })).toEqual(["club"]);
    });
    it("원장 좌표가 없으면 '좌표', 요금이 없으면 '요금'", () => {
        expect(missingFields({ ...full, clubLng: null, hasFees: false })).toEqual(["coords", "fees"]);
    });
});

describe("로고 출처", () => {
    it("파일 이름으로 공식 홈페이지 로고·더블이글 자료를 가른다", () => {
        expect(logoOrigin("/img/golf-logos/g-815f3bc50e.png")).toBe("official");
        expect(logoOrigin("/img/golf-logos/g-86242f9536-light.png")).toBe("official");
        expect(logoOrigin("/img/golf-logos/347.png")).toBe("dbegl");
        expect(logoOrigin("https://cdn.example.com/logo.png")).toBe("other");
        expect(logoOrigin(null)).toBeNull();
        expect(logoOrigin("")).toBeNull();
    });
});
