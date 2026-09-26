import { describe, it, expect } from "vitest";
import {
    crewToSettingsForm, crewSettingsPatch, capacityOptions, isValidCapacity,
    formatMeetingDays, parseMeetingDays, isClockTime, crewImageSrc, crewRowStatus,
    memberActions, filterSortMembers, type DayLabels,
} from "./crewManage";

const KO_DAYS: DayLabels = {
    MON: { short: "월", long: "월요일" }, TUE: { short: "화", long: "화요일" }, WED: { short: "수", long: "수요일" },
    THU: { short: "목", long: "목요일" }, FRI: { short: "금", long: "금요일" }, SAT: { short: "토", long: "토요일" },
    SUN: { short: "일", long: "일요일" },
};

// 설정을 열기만 해도 '저장'이 켜지던 버그 — DB 의 null 과 폼의 '' 를 다르게 봤다.
describe("crewSettingsPatch", () => {
    const crew = {
        id: "c1", name: "서초당구", shortIntro: null, description: null, maxMembers: null, emblem: null, coverImage: null,
        meetingDay: null, meetingTime: null, joinType: "auto", gameType: "any", tags: ["#즐겜", "#내기환영"],
        region: "서울 서초구", baseListingCode: null, baseStoreId: null,
    };

    it("열자마자 비교하면 바뀐 칸이 없다(null ↔ '', 무제한 정원, 내기 태그 거른 값)", () => {
        expect(crewSettingsPatch(crewToSettingsForm(crew), crew)).toEqual({});
    });

    it("무제한 크루는 폼에서 0(무제한) — 예전처럼 50 으로 바뀌지 않는다", () => {
        expect(crewToSettingsForm(crew).maxMembers).toBe(0);
        expect(crewToSettingsForm({ ...crew, maxMembers: 0 }).maxMembers).toBe(0);
    });

    it("바뀐 칸만 보낸다 — 빈 칸은 null, 무제한은 null", () => {
        const form = { ...crewToSettingsForm({ ...crew, maxMembers: 30 }), shortIntro: "  주말 크루 ", maxMembers: 0 };
        expect(crewSettingsPatch(form, { ...crew, maxMembers: 30 })).toEqual({ shortIntro: "주말 크루", maxMembers: null });
        const cleared = { ...crewToSettingsForm({ ...crew, shortIntro: "old" }), shortIntro: "" };
        expect(crewSettingsPatch(cleared, { ...crew, shortIntro: "old" })).toEqual({ shortIntro: null });
    });

    it("베이스캠프는 한 쌍으로 보낸다", () => {
        const form = { ...crewToSettingsForm(crew), baseStoreId: "s1" };
        expect(crewSettingsPatch(form, crew)).toEqual({ baseListingCode: null, baseStoreId: "s1" });
    });

    it("태그를 바꾸면 거른 목록을 보낸다", () => {
        const form = { ...crewToSettingsForm(crew), tags: ["#즐겜", "#금연"] };
        expect(crewSettingsPatch(form, crew)).toEqual({ tags: ["#즐겜", "#금연"] });
    });
});

describe("정원 선택지", () => {
    it("현재 인원보다 작은 프리셋은 꺼지고, 무제한은 늘 고를 수 있다", () => {
        const opts = capacityOptions(35);
        expect(opts.filter((o) => o.disabled).map((o) => o.value)).toEqual([10, 20, 30]);
        expect(opts.at(-1)).toEqual({ value: 0, disabled: false });
    });
    it("직접 입력은 정수·현재 인원 이상·1000 이하", () => {
        expect(isValidCapacity(40, 35)).toBe(true);
        expect(isValidCapacity(34, 35)).toBe(false);
        expect(isValidCapacity(1001, 1)).toBe(false);
        expect(isValidCapacity(12.5, 1)).toBe(false);
        expect(isValidCapacity(0, 0)).toBe(false);
    });
});

describe("정모 요일", () => {
    it("칩 → 글: 하나면 긴 이름, 여럿이면 짧은 이름을 요일 순서로", () => {
        expect(formatMeetingDays(["SAT"], KO_DAYS)).toBe("토요일");
        expect(formatMeetingDays(["SUN", "SAT"], KO_DAYS)).toBe("토·일");
        expect(formatMeetingDays([], KO_DAYS)).toBe("");
    });
    it("글 → 칩: 요일 이름·코드만 풀고, 옛 자유 글은 null", () => {
        expect(parseMeetingDays("토·일", KO_DAYS)).toEqual(["SAT", "SUN"]);
        expect(parseMeetingDays("토요일", KO_DAYS)).toEqual(["SAT"]);
        expect(parseMeetingDays("SAT, mon", KO_DAYS)).toEqual(["MON", "SAT"]);
        expect(parseMeetingDays("", KO_DAYS)).toEqual([]);
        expect(parseMeetingDays(null, KO_DAYS)).toEqual([]);
        expect(parseMeetingDays("매주 토요일", KO_DAYS)).toBeNull();
    });
    it("시간은 HH:MM 만", () => {
        expect(isClockTime("14:00")).toBe(true);
        expect(isClockTime("9:00")).toBe(false);
        expect(isClockTime("오후 2시")).toBe(false);
        expect(isClockTime(null)).toBe(false);
    });
});

describe("목록 줄", () => {
    it("엠블럼이 이모지면 이미지로 쓰지 않는다", () => {
        expect(crewImageSrc("🎱")).toBeNull();
        expect(crewImageSrc("https://x/y.webp")).toBe("https://x/y.webp");
        expect(crewImageSrc(null)).toBeNull();
    });
    it("인원 — 정원이 있으면 n/max, 무제한이면 n, 꽉 차면 full", () => {
        expect(crewRowStatus({ memberCount: 12, maxMembers: 20 })).toMatchObject({ countLabel: "12/20", full: false });
        expect(crewRowStatus({ memberCount: 20, maxMembers: 20 })).toMatchObject({ full: true });
        expect(crewRowStatus({ memberCount: 7, maxMembers: null })).toMatchObject({ countLabel: "7", full: false, max: null });
        expect(crewRowStatus({ memberCount: 19, maxMembers: 20 }).nearlyFull).toBe(true);
    });
});

// 서버 규칙(crew.ts approve·kick·role·transfer)과 같은가
describe("memberActions", () => {
    it("크루장: 멤버에게 임명·넘기기·내보내기, 운영진에게 해제·넘기기·내보내기", () => {
        expect(memberActions("leader", "member", false)).toMatchObject({ appointManager: true, demoteManager: false, transfer: true, kick: true });
        expect(memberActions("leader", "manage", false)).toMatchObject({ appointManager: false, demoteManager: true, transfer: true, kick: true });
    });
    it("운영진: 일반 멤버만 내보내기, 권한·넘기기는 없다", () => {
        expect(memberActions("manage", "member", false)).toMatchObject({ kick: true, transfer: false, appointManager: false });
        expect(memberActions("manage", "manage", false)).toMatchObject({ kick: false, transfer: false, demoteManager: false });
    });
    it("대기자는 크루장·운영진 모두 승인·거절만", () => {
        expect(memberActions("manage", "pending", false)).toMatchObject({ approve: true, reject: true, kick: false, transfer: false });
        expect(memberActions("leader", "pending", false)).toMatchObject({ approve: true, reject: true, transfer: false });
    });
    it("자기 자신·크루장 대상·일반 멤버는 아무것도 없다", () => {
        const none = { approve: false, reject: false, appointManager: false, demoteManager: false, transfer: false, kick: false };
        expect(memberActions("leader", "member", true)).toEqual(none);
        expect(memberActions("manage", "leader", false)).toEqual(none);
        expect(memberActions("member", "member", false)).toEqual(none);
        expect(memberActions(undefined, "member", false)).toEqual(none);
    });
});

describe("filterSortMembers", () => {
    const list = [
        { member: { nickname: "다현" }, role: "member", joinedAt: "2026-03-01" },
        { member: { nickname: "가람" }, role: "manage", joinedAt: "2026-05-01" },
        { member: { nickname: "나리" }, role: "leader", joinedAt: "2026-01-01" },
        { member: { nickname: null, name: "라온" }, role: "member", joinedAt: "2026-02-01" },
    ];
    const names = (l: typeof list) => l.map((m) => m.member.nickname || m.member.name);

    it("역할순: 크루장 → 운영진 → 먼저 가입한 멤버", () => {
        expect(names(filterSortMembers(list, "", "role"))).toEqual(["나리", "가람", "라온", "다현"]);
    });
    it("이름순·최근 가입순", () => {
        expect(names(filterSortMembers(list, "", "name"))).toEqual(["가람", "나리", "다현", "라온"]);
        expect(names(filterSortMembers(list, "", "joined"))).toEqual(["가람", "다현", "라온", "나리"]);
    });
    it("이름 검색은 닉네임이 없으면 이름으로, 원본은 그대로", () => {
        expect(names(filterSortMembers(list, " 라 ", "role"))).toEqual(["라온"]);
        expect(names(list)).toEqual(["다현", "가람", "나리", "라온"]);
    });
});
