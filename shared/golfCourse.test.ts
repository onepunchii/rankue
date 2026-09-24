import { describe, expect, it } from "vitest";
import { courseDescription, courseTitle, courseWhere, type CourseSeoFacts } from "./golfCourse.js";

const c = (o: Partial<CourseSeoFacts>): CourseSeoFacts => ({ name: "OKCC", region: "전라", city: "완주군", kind: "대중제", holes: 9, ...o });
const fees = (nonMember: number) => ({ rows: [{ day: "주중", nonMember, member: null, family: null }], extra: null });

describe("courseWhere — 묶음 region 대신 실제 도", () => {
    it("시군 → 도(묶음 안 같은 이름은 region 이 가른다)", () => {
        expect(courseWhere("전라", "완주군")).toBe("전북 완주");
        expect(courseWhere("경상", "경주시")).toBe("경북 경주");
        expect(courseWhere("경상", "고성군")).toBe("경남 고성");
        expect(courseWhere("강원", "고성군")).toBe("강원 고성");
        expect(courseWhere("경기", "광주시")).toBe("경기 광주");
        expect(courseWhere("경상", "군위군")).toBe("대구 군위");
    });
    it("광역시는 한 번만, 모르는 시군·시군 없음은 묶음 이름('·수도권' 뗌)", () => {
        expect(courseWhere("경기", "인천시")).toBe("인천");
        expect(courseWhere("전라", "광주시")).toBe("광주");
        expect(courseWhere("제주", "제주시")).toBe("제주");
        expect(courseWhere("제주", "서귀포시")).toBe("제주 서귀포");
        expect(courseWhere("경기", "가평군")).toBe("경기 가평");
        expect(courseWhere("경상", null)).toBe("경상");
        expect(courseWhere("경기", null)).toBe("경기");
    });
});

describe("courseTitle", () => {
    it("시세가 있으면 회원권 시세가 먼저(옛 이름은 괄호)", () => {
        expect(courseTitle(c({ name: "레이크사이드CC", region: "경기", city: "용인시", kind: "회원제+대중제", topPrice: 108000 })))
            .toBe("레이크사이드CC 회원권 시세·부킹·조인·그린피 | 랭큐 골프");
        expect(courseTitle(c({ name: "로제비앙GC", region: "경기", city: "광주시", topPrice: 5000, aliases: ["큐로CC"] })))
            .toBe("로제비앙GC(큐로CC) 회원권 시세·부킹·조인·그린피 | 랭큐 골프");
    });
    it("시세가 없으면 그린피가 먼저 — 옛 이름이 없으면 괄호에 시군, 이름에 시군이 있으면 생략", () => {
        expect(courseTitle(c({ name: "360도CC", region: "경기", city: "여주시" }))).toBe("360도CC(여주) 그린피·부킹·조인 | 랭큐 골프");
        expect(courseTitle(c({ name: "로제비앙GC", region: "경기", city: "광주시", aliases: ["큐로CC"] }))).toBe("로제비앙GC(큐로CC) 그린피·부킹·조인 | 랭큐 골프");
        expect(courseTitle(c({ name: "용인CC", region: "경기", city: "용인시" }))).toBe("용인CC 그린피·부킹·조인 | 랭큐 골프");
    });
});

describe("courseDescription — 이름으로 시작, 강한 숫자 먼저", () => {
    it("시세 → 그린피 → 도·시군·홀·운영형태 → 특징", () => {
        expect(courseDescription(c({
            name: "레이크사이드CC", region: "경기", city: "용인시", kind: "회원제+대중제", holes: 54,
            topPrice: 108000, fees: fees(230000), grass: ["한국잔디"], play: ["3인가능"],
        }))).toBe("레이크사이드CC 회원권 시세 10억 8,000만원 · 주중 비회원 그린피 23만원 — 경기 용인 54홀 회원제+대중제 골프장. 한국잔디 · 3인 플레이.");
    });
    it("대표 그린피만 있으면 '부터'", () => {
        expect(courseDescription(c({ name: "경주CC", region: "경상", city: "경주시", holes: 27, feeFrom: 130000 })))
            .toBe("경주CC 그린피 13만원부터 — 경북 경주 27홀 대중제 골프장.");
    });
    it("요금이 없어도 이름·도·시군이 들어간 한 문장 — 권유 문구 없이", () => {
        expect(courseDescription(c({}))).toBe("OKCC 그린피·부킹·조인 — 전북 완주 9홀 대중제 골프장.");
        expect(courseDescription(c({ listingCount: 2 }))).toBe("OKCC 그린피·부킹·조인 — 전북 완주 9홀 대중제 골프장. 지금 올라온 티타임 2건.");
    });
    it("덧붙임(글 수·특징)은 100자를 넘기지 않는다", () => {
        const d = courseDescription(c({
            name: "한양컨트리클럽", region: "경기", city: "고양시", kind: "회원제+대중제", holes: 45, topPrice: 39000, fees: fees(220000),
            grass: ["한국잔디", "벤트그라스"], play: ["3인가능", "2인가능", "노캐디"], listingCount: 3,
        }));
        expect(d.length).toBeLessThanOrEqual(100);
        expect(d).toContain("지금 올라온 티타임 3건.");
    });
});
