/**
 * 매장 대회(2026-11-06 사장님 도구 ②) — 크루 대회의 표 · 대진 엔진을 그대로, store_id 로.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanStoreCup, feeText, storeCupLine, storeCupPath } from "./storeCup";

const read = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
const NOW = Date.parse("2026-11-06T20:00:00+09:00");

describe("사장님이 보낸 대회 거르기", () => {
    const ok = { title: " 11월 3쿠션 대회 ", gameType: "3c", maxPlayers: 16, bestOf: 3, startAt: "2026-11-20T19:00:00+09:00", recruitEnd: "2026-11-18T23:00:00+09:00", entryFee: "10000", prize: "우승 큐 케이스", description: "핸디 70%" };
    it("맞는 꼴", () => {
        const r = cleanStoreCup(ok, NOW);
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.value.title).toBe("11월 3쿠션 대회");
            expect(r.value.entryFee).toBe(10000);
            expect(r.value.maxPlayers).toBe(16);
        }
    });
    it("틀린 꼴은 까닭과 함께", () => {
        expect(cleanStoreCup({ ...ok, title: " " }, NOW)).toEqual({ ok: false, error: "title" });
        expect(cleanStoreCup({ ...ok, gameType: "pocket" }, NOW)).toEqual({ ok: false, error: "gameType" });
        expect(cleanStoreCup({ ...ok, maxPlayers: 32 }, NOW)).toEqual({ ok: false, error: "maxPlayers" });
        expect(cleanStoreCup({ ...ok, bestOf: 5 }, NOW)).toEqual({ ok: false, error: "bestOf" });
        expect(cleanStoreCup({ ...ok, entryFee: -1 }, NOW)).toEqual({ ok: false, error: "entryFee" });
        expect(cleanStoreCup({ ...ok, recruitEnd: "2026-11-01T00:00:00+09:00" }, NOW)).toEqual({ ok: false, error: "dates" });
        expect(cleanStoreCup({ ...ok, startAt: "2026-11-17T00:00:00+09:00" }, NOW)).toEqual({ ok: false, error: "dates" });
    });
    it("한 줄 · 참가비 · 주소", () => {
        expect(storeCupLine({ gameType: "3c", maxPlayers: 16, bestOf: 3, entryFee: 10000 })).toBe("3쿠션 · 16강 · 3판 2선승 · 참가비 1만원");
        expect(storeCupLine({ gameType: "4c", maxPlayers: 8, bestOf: 1 })).toBe("4구 · 8강 · 단판");
        expect(feeText(15000)).toBe("1만 5천원");
        expect(feeText(3000)).toBe("3천원");
        expect(feeText(12345)).toBe("12,345원");
        expect(feeText(0)).toBe("없음");
        expect(storeCupPath("abc")).toBe("/store-cup/abc");
    });
});

describe("고정 — 크루 대회 엔진을 매장 대회에", () => {
    it("표: crew_id 또는 store_id · 참가비 칸 · 받음 체크", () => {
        const m = read("migrations/store_cups.sql");
        expect(m).toContain("alter table hiq_crew_tournaments alter column crew_id drop not null;");
        expect(m).toContain("add column if not exists fee_paid boolean not null default false");
        const s = read("shared/schema.ts");
        expect(s).toContain('storeId: uuid("store_id").references(() => hiqStores.id, { onDelete: \'cascade\' }),');
    });
    it("대진 경기의 자리: 매장 대회는 크루를 보지 않는다", () => {
        const r = read("server/storage/tournament.repo.ts");
        expect(r).toContain("if (tournament.crewId) {");
        expect(r).toContain("} else if (!tournament.storeId) {");
        expect(r).toContain("async listByStore(storeId: string)");
    });
    it("손님 길 · 사장님 길 · 화면", () => {
        const pub = read("server/routes/modules/storeCups.ts");
        expect(pub).toContain("if (!d || !d.tournament.storeId || d.tournament.status === \"canceled\") return null;");
        expect(pub).toContain("participants: d.participants.map(({ feePaid: _fee, ...p }: any) => p),");
        expect(read("server/routes/index.ts")).toContain('router.use("/store-cups", storeCupsRouter);');
        const partner = read("server/routes/modules/partner.ts");
        expect(partner).toContain("return d && d.tournament.storeId === storeId ? d : null;");
        expect(partner).toContain('router.post("/cups/:id/draw", requirePartner');
        expect(partner).toContain("storeId: store.id, crewId: null, creatorId: owner.id,");
        expect(read("client/src/App.tsx")).toContain('<Route path="/store-cup/:id" component={FramedStoreCup} />');
        expect(read("client/src/pages/partner/dashboard.tsx")).toContain("<StoreCupsTab />");
        expect(read("client/src/pages/store-listing.tsx")).toContain('data-testid="listing-cups"');
        expect(read("client/src/pages/store-cup.tsx")).toContain("tournamentMatch={playMatch}");
    });
});
