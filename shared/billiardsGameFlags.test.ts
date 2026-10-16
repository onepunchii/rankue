import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { gameFlags, pairDayKey, type FlagPlayer } from "./billiardsGameFlags";

const p = (o: Partial<FlagPlayer>): FlagPlayer => ({ id: "a", name: "가", score: 10, highRun: 2, avg: null, ...o });

describe("실전 경기 이상 표시(2026-10-16)", () => {
    it("3쿠션 한 이닝 10점 이상 · 4구 40점 이상", () => {
        expect(gameFlags({ gameType: "3c", ranked: false, totalInnings: 1, players: [p({ name: "S", highRun: 30, score: 30 })] }).map((f) => f.id)).toContain("highRun");
        expect(gameFlags({ gameType: "4c", ranked: false, totalInnings: 20, players: [p({ highRun: 26, score: 150 })] }).map((f) => f.id)).not.toContain("highRun");
        expect(gameFlags({ gameType: "4c", ranked: false, totalInnings: 20, players: [p({ highRun: 45, score: 150 })] })[0].text).toBe("4구 한 이닝 45점 — 가");
    });
    it("이닝당 득점 · 평소의 몇 배는 10이닝 넘게 친 판만", () => {
        expect(gameFlags({ gameType: "3c", ranked: true, totalInnings: 5, players: [p({ score: 20 })] }).map((f) => f.id)).not.toContain("pace");
        expect(gameFlags({ gameType: "3c", ranked: true, totalInnings: 12, players: [p({ score: 25 })] }).map((f) => f.id)).toContain("pace");
        expect(gameFlags({ gameType: "4c", ranked: true, totalInnings: 20, players: [p({ score: 160, avg: 3 })] }).map((f) => f.id)).toContain("overAvg");
        expect(gameFlags({ gameType: "4c", ranked: true, totalInnings: 20, players: [p({ score: 160, avg: 7 })] }).map((f) => f.id)).not.toContain("overAvg");
    });
    it("80이닝 넘는 판 · 공식전 모두 0점 · 같은 둘이 하루 공식전 4판 넘게", () => {
        expect(gameFlags({ gameType: "3c", ranked: false, totalInnings: 90, players: [p({ score: 20 })] }).map((f) => f.id)).toContain("longGame");
        expect(gameFlags({ gameType: "4c", ranked: true, totalInnings: 3, players: [p({ score: 0 }), p({ score: 0 })] }).map((f) => f.id)).toContain("zero");
        expect(gameFlags({ gameType: "4c", ranked: true, totalInnings: 12, players: [p({}), p({})] }, 5).map((f) => f.id)).toContain("samePair");
        expect(gameFlags({ gameType: "4c", ranked: true, totalInnings: 12, players: [p({}), p({})] }, 4).map((f) => f.id)).not.toContain("samePair");
    });
    it("같은 두 회원 열쇠는 순서와 상관없다 · 게스트가 끼면 없다", () => {
        expect(pairDayKey("2026-10-16", ["b", "a", null])).toBe(pairDayKey("2026-10-16", ["a", "b"]));
        expect(pairDayKey("2026-10-16", ["a", null])).toBeNull();
    });
    it("어드민 길은 가드 뒤 · 날짜는 DB 가 글자로(9시간 함정)", () => {
        const r = fs.readFileSync("server/routes/modules/adminBilliards.ts", "utf8");
        expect(r).toContain("router.use(checkSuperAdmin);");
        expect(r).toContain(`to_char(g.played_at + interval '9 hours', 'YYYY-MM-DD') as kst_day`);
        expect(r).toContain("and g.played_at >= (${since}::timestamptz at time zone 'UTC')");
    });
});
