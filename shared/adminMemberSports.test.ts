import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { caseByKind, catchSize, golfAwardGroups, hikingAwardGroups, limitedCount, sportHasData, type AdminMemberSports } from "./adminMemberSports";
import { CUES, CHALKS } from "./cueCase";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const blank = (): AdminMemberSports => ({
    billiards: { caseItems: [], hero: null, invites: { joined: 0, canceled: 0, invitedBy: null }, online: [] },
    golf: { awards: {} },
    hiking: { verified: 0, unverified: 0, voided: 0, mountains: 0, trips: 0, reached: 0, km: 0, photos: 0, hiddenPhotos: 0, marks: 0, awards: {}, crews: 0, lastAt: null },
    fishing: { catches: 0, species: 0, fish: 0, photos: 0, public: 0, hidden: 0, appeals: 0, rankVoid: 0, onTrips: 0, gear: 0, decor: 0, crews: 0, lastDay: null, recent: [] },
    grants: {},
});

describe("회원 상세 · 종목 칸", () => {
    it("큐 케이스를 종류별로 · 한정 큐를 센다 · 모르는 물건은 따로", () => {
        const lt = CUES.find((c) => c.group === "limited")!;
        const ids = [CUES[0].id, lt.id, CHALKS[0].id, "gone-item"];
        expect(caseByKind(ids)).toEqual({ cue: 2, chalk: 1, glove: 0, pennant: 0, shaft: 0, ball: 0, other: 1 });
        expect(limitedCount(ids)).toBe(1);
    });

    it("골프 · 등산 받은 것을 묶는다", () => {
        expect(golfAwardGroups({ book: 2, all: 1, trophy: 3, pin: 4, black: 1, pearl: 1, tag: 2, special: 1 })).toEqual({ books: 3, trophies: 3, pins: 4, markers: 5 });
        expect(hikingAwardGroups({ patch: 1, pin: 2 })).toEqual({ patches: 1, grands: 0, pins: 2, grades: 0 });
    });

    it("기록이 없는 종목은 접는다 — 증정만 있어도 연다 · 온라인은 판이 있어야", () => {
        const s = blank();
        expect(sportHasData(s)).toEqual({ billiards: false, golf: false, hiking: false, fishing: false });
        s.billiards.online = [{ gameType: "3c", rating: 1000, matches: 0, wins: 0 }];
        s.grants.golf = { active: 0, revoked: 1 };
        s.fishing.gear = 1;
        expect(sportHasData(s)).toEqual({ billiards: false, golf: true, hiking: false, fishing: true });
    });

    it("조과 크기 — 있는 것만", () => {
        expect(catchSize({ lengthCm: 38, count: 1, weightKg: null })).toBe("38cm");
        expect(catchSize({ lengthCm: 38.5, count: 3, weightKg: 1.2 })).toBe("38.5cm · 1.2kg · 3마리");
        expect(catchSize({ lengthCm: null, count: 1, weightKg: null })).toBe("1마리");
    });

    it("좌표는 싣지 않는다 — 질의가 lat · lng 를 고르지 않는다", () => {
        const src = read("server/storage/adminMemberSports.ts").replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
        expect(src).not.toMatch(/\blat\b|\blng\b|latitude|longitude/);
    });

    it("관리자 길로만 — 회원 상세 시트가 연다", () => {
        expect(read("server/routes/modules/admin.ts")).toMatch(/router\.get\("\/members\/:id\/sports", checkSuperAdmin,/);
        expect(read("client/src/pages/admin/MemberDetailSheet.tsx")).toContain("<MemberSportsSection key={m.id} memberId={m.id} />");
    });
});
