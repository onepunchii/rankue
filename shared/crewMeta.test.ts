/**
 * 크루 검색 화면(2026-11-04 오너: 소모임 검색 결과처럼 "해당 로고랑 메타제목이랑 내용을 해당 크루에 맞춰서").
 * 제목 = 크루 이름 — 시군구 + 종목(+경기), 설명 = 소개 + 정모 + 회원 수, 썸네일 = 크루 로고. 받은 칸만 쓴다.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { crewDescription, crewKind, crewLogoUrl, crewMeeting, crewPlace, crewTitle } from "./crewMeta";

const read = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");

describe("제목 — 크루 이름 — 시군구 + 종목(+경기)", () => {
    it("자리: 시군구 · 광역시 이름 · 나라 밖은 그대로", () => {
        expect(crewPlace("서울특별시 광진구 구의제1동")).toBe("광진구");
        expect(crewPlace("전라북도 남원시 왕정동")).toBe("남원시");
        expect(crewPlace("경상남도 하동군 하동읍")).toBe("하동군");
        expect(crewPlace("인천광역시")).toBe("인천");
        expect(crewPlace("Santo Domingo")).toBe("Santo Domingo");
        expect(crewPlace("")).toBeNull();
    });
    it("종목 · 경기", () => {
        expect(crewKind({ sportCategory: "BILLIARDS", gameType: "4c" })).toBe("당구 크루(4구)");
        expect(crewKind({ sportCategory: "BILLIARDS", gameType: "3c" })).toBe("당구 크루(3쿠션)");
        expect(crewKind({ sportCategory: "BILLIARDS", gameType: "any" })).toBe("당구 크루");
        expect(crewKind({ sportCategory: "HIKING", gameType: "3c" })).toBe("산악회");
        expect(crewKind({ sportCategory: "FISHING" })).toBe("낚시 크루");
        expect(crewKind({})).toBe("당구 크루");
    });
    it("제목", () => {
        expect(crewTitle({ name: "구의하이큐", region: "서울특별시 광진구 구의제1동", sportCategory: "BILLIARDS", gameType: "any" })).toBe("구의하이큐 — 광진구 당구 크루 | 랭큐");
        expect(crewTitle({ name: "청조당삼오", region: "서울특별시 강남구", sportCategory: "BILLIARDS", gameType: "3c" })).toBe("청조당삼오 — 강남구 당구 크루(3쿠션) | 랭큐");
        expect(crewTitle({ name: "혼산", region: "인천광역시", sportCategory: "HIKING" })).toBe("혼산 — 인천 산악회 | 랭큐");
        expect(crewTitle({ name: "무명" })).toBe("무명 — 당구 크루 | 랭큐");
    });
});

describe("썸네일 — 크루 로고", () => {
    it("로고가 그림 주소면 로고, 아니면 커버, 이모지 · 빈 칸은 그림이 아니다", () => {
        expect(crewLogoUrl({ emblem: "https://x.blob/a.webp", coverImage: "https://x.blob/c.webp" })).toBe("https://x.blob/a.webp");
        expect(crewLogoUrl({ emblem: "🎱", coverImage: "https://x.blob/c.webp" })).toBe("https://x.blob/c.webp");
        expect(crewLogoUrl({ emblem: "", coverImage: "" })).toBeNull();
        expect(crewLogoUrl({ emblem: "javascript:alert(1)" })).toBeNull();
    });
});

describe("설명 — 소개 + 정모 + 회원 수", () => {
    it("정모: 비워 둔 기본 시각(00:00)은 빼고, 둘 다 없으면 없다", () => {
        expect(crewMeeting({ meetingDay: "매주 토요일", meetingTime: "오후 2시" })).toBe("매주 토요일 오후 2시");
        expect(crewMeeting({ meetingDay: "수시", meetingTime: "00:00" })).toBe("수시");
        expect(crewMeeting({ meetingDay: "", meetingTime: "" })).toBeNull();
    });
    it("소개 뒤에 정모 · 회원 수, 155자까지 · 회원 수가 없으면 적지 않는다", () => {
        expect(crewDescription({ name: "구의하이큐", region: "서울특별시 광진구 구의제1동", shortIntro: "다같이 즐기자", meetingDay: "매주 토요일", meetingTime: "오후 2시", memberCount: 4 }))
            .toBe("구의하이큐 (서울특별시 광진구 구의제1동) — 다같이 즐기자 · 정모 매주 토요일 오후 2시 · 회원 4명");
        expect(crewDescription({ name: "혼산", sportCategory: "HIKING", meetingDay: "토요일", meetingTime: "00:00", memberCount: 0 }))
            .toBe("혼산 — 랭큐 산악회. 함께 산에 오르고 산행 일정과 소식을 나눠요 · 정모 토요일");
        expect(crewDescription({ name: "긴", shortIntro: "가".repeat(300) }).length).toBe(155);
    });
});

describe("고정: 검색용 화면 · 화면이 같은 함수, 로고가 썸네일, 명단은 싣지 않는다", () => {
    it("검색용 화면", () => {
        const p = read("server/prerender.ts");
        const f = p.slice(p.indexOf('app.get("/club/:id"'), p.indexOf("// ── 정적 문서 3종"));
        expect(f).toContain("const meta = { ...crew, memberCount } as CrewMetaInput;");
        expect(f).toContain("title: crewTitle(meta),");
        expect(f).toContain("desc: crewDescription(meta),");
        expect(f).toContain("image: logo ? { url: logo, width: 400, height: 400, alt: `${crew.name} 로고` } : fallback ?? undefined,");
        expect(f).toContain('...(logo ? { logo, image: logo } : {}),');
        // 명단(이름)은 싣지 않는다 — 수만
        expect(f).not.toMatch(/members\.map|m\.name|member\.name/);
        expect(f).toContain("const memberCount = members.filter((m) => m?.role !== \"pending\").length;");
    });
    it("화면(useSeo)도 같은 값 · 같은 그림", () => {
        const c = read("client/src/pages/hiq/club-detail.tsx");
        expect(c).toContain("title: crewTitle(seoCrew),");
        expect(c).toContain("description: crewDescription(seoCrew),");
        expect(c).toContain("image: crewLogoUrl(crewData.crew) ?? undefined,");
    });
});
