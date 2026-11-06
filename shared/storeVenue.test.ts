/**
 * 테이블 QR — 이 매장에서 친 경기(2026-11-06 사장님 도구 ①). 소속(가입 매장)은 그대로, '어디서 쳤나'만 더한다.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { VENUE_MAX_MS, tableCountOf, tableFromSearch, tableQrPath, venueBody, venueFromBody, venueRead, venueRecord } from "./storeVenue";

const read = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
const NOW = Date.parse("2026-11-06T20:00:00+09:00");

describe("이 기기의 '지금 여기서 친다'", () => {
    it("적고 읽기 — 6시간 · 꼴 · 미래", () => {
        const raw = venueRecord({ slug: "c01184", name: "한솔대대전용", table: 3 }, NOW);
        expect(venueRead(raw, NOW + 3600_000)).toEqual({ slug: "c01184", name: "한솔대대전용", table: 3 });
        expect(venueRead(raw, NOW + VENUE_MAX_MS + 1)).toBeNull();
        expect(venueRead(raw, NOW - 1)).toBeNull();
        expect(venueRead(JSON.stringify({ slug: "../x", table: 3, at: NOW }), NOW)).toBeNull();
        expect(venueRead(JSON.stringify({ slug: "c1", table: 0, at: NOW }), NOW)).toBeNull();
        expect(venueRead(JSON.stringify({ slug: "c1", table: 61, at: NOW }), NOW)).toBeNull();
    });
    it("QR 주소는 앱이 받는 /store/ 길에 ?table= · 주소에서 테이블 읽기", () => {
        expect(tableQrPath("c01184", 3)).toBe("/store/c01184?table=3");
        expect(tableFromSearch("?table=3")).toBe(3);
        expect(tableFromSearch("table=12&x=1")).toBe(12);
        for (const q of ["", "?table=0", "?table=61", "?table=3a", "?table=-1", "?table=007"]) expect(tableFromSearch(q)).toBeNull();
        // 이 길은 아이폰 · 안드로이드 앱이 이미 받는다
        expect(read("client/public/.well-known/apple-app-site-association")).toContain('{ "/": "/store/*" }');
        expect(read("android/app/src/main/AndroidManifest.xml")).toContain('android:pathPrefix="/store/"');
    });
    it("경기 시작 요청에 싣고 · 서버가 다시 거른다", () => {
        expect(venueBody(null)).toEqual({});
        expect(venueBody({ slug: "c1", name: "x", table: 2 })).toEqual({ venue: { slug: "c1", table: 2 } });
        expect(venueFromBody({ slug: "c1", table: "2" })).toEqual({ slug: "c1", table: 2 });
        expect(venueFromBody({ slug: "c 1", table: 2 })).toBeNull();
        expect(venueFromBody({ slug: "c1", table: 99 })).toBeNull();
        expect(venueFromBody("x")).toBeNull();
    });
    it("뽑을 테이블 수 — 대대 + 중대, 없으면 6", () => {
        expect(tableCountOf(6, 2)).toBe(8);
        expect(tableCountOf(0, 0)).toBe(6);
        expect(tableCountOf(null, undefined)).toBe(6);
        expect(tableCountOf(100, 0)).toBe(60);
    });
});

describe("고정 — 서버 · 화면", () => {
    it("경기 시작: 인증 매장만, 소속은 그대로", () => {
        const g = read("server/routes/modules/game.ts");
        expect(g).toContain("const venue = await resolveVenue(req.body?.venue);");
        expect(g).toContain("storeId: member.storeId,\n        ...(venue ? { venueStoreId: venue.storeId, tableNo: venue.table } : {}),");
        expect(g).toContain("if (!v || isSystemStore(v.slug)) return null;");
        expect(g).toContain("return st?.ownerId ? { storeId: st.id, table: v.table } : null;");
        expect(read("migrations/hiq_games_venue.sql")).toContain("add column if not exists venue_store_id uuid references hiq_stores(id)");
    });
    it("이달의 에버 왕은 랭킹전만(정본 에버리지)", () => {
        const s = read("server/storage/storeVenue.ts");
        expect(s).toContain("and h.game_mode = 'match' and h.is_ranked");
        expect(s).toContain("having count(*) >= ${VENUE_KING_MIN_GAMES}");
    });
    it("화면: QR 랜딩 · 경기 만들기 칩 · 요청 · 사장님 카드 · QR 뽑기 · 매장 페이지", () => {
        const land = read("client/src/pages/store-detail.tsx");
        expect(land).toContain("rememberVenue({ slug: store.slug, name: store.name, table });");
        expect(land).toContain("if (!authLoading && member) setLocation(SCOREBOARD_START_PATH, { replace: true });");
        expect(land).toContain('data-testid="table-qr-guest"');
        expect(read("client/src/hooks/useGameCreation.ts")).toContain("...(tournamentMatch ? {} : venueBody(currentVenue())),");
        expect(read("client/src/components/hiq/dashboard/GameCreationModal.tsx")).toContain('data-testid="game-venue-chip"');
        const dash = read("client/src/pages/partner/dashboard.tsx");
        expect(dash).toContain('queryKey: ["/api/hiq/partner/venue-stats"]');
        expect(dash).toContain('data-testid="partner-table-qr-open"');
        expect(read("client/src/App.tsx")).toContain('<Route path="/partner/table-qr" component={PartnerTableQr} />');
        expect(read("client/src/pages/store-listing.tsx")).toContain('data-testid="listing-venue"');
        expect(read("server/routes/modules/listings.ts")).toContain("return sendSuccess(res, { ...pub, crews, honor, owner, venue });");
    });
});
