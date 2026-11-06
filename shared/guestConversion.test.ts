/**
 * 비회원 → 가입 전환(2026-11-06) — 카카오 취소 복귀 · 화면마다 바닥 가입 줄 · 가입하고 팔로우 · PBA 관심 선수 알림 · 가입하고 바로 점수판.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
    FOLLOW_AFTER_LOGIN_MAX_MS, SCOREBOARD_START_PATH, STORE_GUEST_BAR, TERMS_GUEST_BAR,
    followIntentMatches, followIntentRead, followIntentRecord, followLoginAsk, followedAfterLogin, playerGuestBar,
} from "./guestConversion";
import { newPbaWins, pbaPlayerUrl, pbaRankChange, pbaSeasonText, PBA_RANK_KEYS, PBA_WIN_KEYS } from "./pbaFollowAlert";
import { LOGIN_SCREEN_PATH, sheetLoginPath } from "./promoFunnel";

const read = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
const NOW = Date.parse("2026-11-06T12:00:00+09:00");

describe("카카오에서 취소하면 보던 화면의 가입 팝업으로", () => {
    it("보던 화면에 ?login=1 — 질의 · 조각이 있어도", () => {
        expect(sheetLoginPath("/hiking/mountains/계룡산")).toBe("/hiking/mountains/계룡산?login=1");
        expect(sheetLoginPath("/golf/course/x?d=2026-11-07")).toBe("/golf/course/x?d=2026-11-07&login=1");
        expect(sheetLoginPath("/pba-player/M1#sec")).toBe("/pba-player/M1?login=1#sec");
        expect(sheetLoginPath("/stores/C1?login=1")).toBe("/stores/C1?login=1");
    });
    it("로그인 화면 · 바깥 주소 · 없음은 null(부르는 쪽이 예시 홈 위의 팝업으로)", () => {
        for (const v of ["/", "/hiq", "/register", "/auth/kakao", "//evil.com/x", "https://x", null, ""]) expect(sheetLoginPath(v)).toBeNull();
    });
    it("로그인 화면 식은 팝업(LoginSheet)의 것과 같다 · 콜백이 이 길을 쓴다", () => {
        const sheet = read("client/src/components/hiq/LoginSheet.tsx");
        expect(/const LOGIN_SCREEN = \/(.+)\/;/.exec(sheet)?.[1]).toBe(LOGIN_SCREEN_PATH.source);
        expect(read("client/src/pages/hiq/kakao-callback.tsx")).toContain('return sheetLoginPath(back) ?? loginPagePath("/dashboard");');
    });
});

describe("가입하고 팔로우", () => {
    it("적고 읽기 — 30분 · 꼴 · 미래", () => {
        const raw = followIntentRecord({ kind: "pba", key: "M0022424", category: null, name: "이선영" }, NOW);
        expect(followIntentRead(raw, NOW + 60_000)).toEqual({ kind: "pba", key: "M0022424", category: null, name: "이선영" });
        expect(followIntentRead(raw, NOW + FOLLOW_AFTER_LOGIN_MAX_MS + 1)).toBeNull();
        expect(followIntentRead(raw, NOW - 1)).toBeNull();
        expect(followIntentRead('{"kind":"x","key":"a","at":1}', NOW)).toBeNull();
        expect(followIntentRead(JSON.stringify({ kind: "pba", key: "../x", at: NOW }), NOW)).toBeNull();
        expect(followIntentRead("깨진", NOW)).toBeNull();
    });
    it("이 화면의 선수인가 — UMB 는 부문까지", () => {
        const umb = { kind: "umb" as const, key: "123", category: "players", name: "" };
        expect(followIntentMatches(umb, "umb", "123", "players")).toBe(true);
        expect(followIntentMatches(umb, "umb", "123", "ladies")).toBe(false);
        expect(followIntentMatches({ ...umb, kind: "pba", category: null }, "pba", "123")).toBe(true);
        expect(followIntentMatches(null, "pba", "123")).toBe(false);
    });
    it("문구 — 무엇을 하려다 가입하는지 · '선수를'", () => {
        expect(followLoginAsk("pba", "이선영")).toEqual({ title: "이선영 선수 팔로우하기", desc: "가입하면 바로 팔로우돼요. 시즌 순위가 바뀌거나 우승하면 알려 드려요." });
        expect(followedAfterLogin("umb", "조명우")).toBe("조명우 선수를 팔로우했어요 — 세계랭킹이 바뀌면 알려 드려요");
        expect(followedAfterLogin("pba", "")).toBe("이 선수를 팔로우했어요 — 순위가 바뀌거나 우승하면 알려 드려요");
        expect(playerGuestBar("pba", "김가영")).toEqual({ title: "김가영 선수 소식 받기", sub: "순위가 바뀌거나 우승하면 알려 드려요", label: "팔로우" });
    });
});

describe("PBA 관심 선수 알림", () => {
    it("순위가 바뀌었나", () => {
        expect(pbaRankChange(5, 3)).toEqual({ kind: "up", d: 2 });
        expect(pbaRankChange(3, 7)).toEqual({ kind: "down", d: 4 });
        expect(pbaRankChange(4, 1)).toEqual({ kind: "no1", d: 3 });
        expect(pbaRankChange(null, 12)).toEqual({ kind: "entry", d: 0 });
        expect(pbaRankChange(1, 1)).toBeNull();
        expect(pbaRankChange(5, null)).toBeNull();
        expect(pbaSeasonText(2025)).toBe("2025-26");
        expect(pbaSeasonText(2099)).toBe("2099-00");
        expect(pbaPlayerUrl("M1")).toBe("/pba-player/M1");
    });
    it("새 우승 — 진행 중이던 대회에 우승자가 생겼고 팔로우된 선수만, 처음 보는 대회(백필)는 아니다", () => {
        const before = new Map<string, string | null>([["T1", null], ["T2", "M9"], ["T3", null]]);
        const after = [{ id: "T1", winnerMemCode: "M1" }, { id: "T2", winnerMemCode: "M9" }, { id: "T3", winnerMemCode: "M2" }, { id: "T4", winnerMemCode: "M1" }];
        expect(newPbaWins(before, after, new Set(["M1", "M9"]))).toEqual([{ id: "T1", memCode: "M1" }]);
    });
    it("문구 키는 서버 언어 다섯 곳에 다 있다", () => {
        const keys = [...Object.values(PBA_RANK_KEYS).flatMap((k) => [k.title, k.body]), PBA_WIN_KEYS.title, PBA_WIN_KEYS.body];
        for (const lang of ["ko", "en", "es", "vi", "tr"]) {
            const f = read(`shared/i18n/${lang}.ts`);
            for (const k of keys) expect(f, `${lang} ${k}`).toContain(`"${k}":`);
        }
    });
    it("크론이 덮어쓰기 전에 찍고, 뒤에 견준다 · 실패해도 동기화는 끝난다", () => {
        const c = read("server/routes/modules/cron.ts");
        const sync = c.slice(c.indexOf("async function handlePbaSync"), c.indexOf('router.get("/pba-sync"'));
        expect(sync.indexOf("await followedPbaRanks(season)")).toBeLessThan(sync.indexOf("await syncPba()"));
        expect(sync.indexOf("await syncPba()")).toBeLessThan(sync.indexOf("await notifyPbaRankChanges(before, season)"));
        const tours = c.slice(c.indexOf("async function handlePbaTournaments"), c.indexOf('router.get("/pba-tournaments"'));
        expect(tours.indexOf("await pbaWinnerSnapshot(seasons)")).toBeLessThan(tours.indexOf("await runPbaTournamentsCron()"));
        expect(tours).toContain(".catch((e) =>");
        const svc = read("server/services/pbaFollowAlerts.ts");
        expect(svc).toContain('type: "PLAYER_RANK", pref: "players"');
    });
});

describe("화면마다 바닥 가입 줄", () => {
    it("줄 — 비회원 · 한국어만, 설치 팝업을 비키게 하는 표식, 탭 위에 뜨는 자리", () => {
        const bar = read("client/src/components/hiq/GuestCtaBar.tsx");
        expect(bar).toContain('if (isLoading || member || locale !== "ko") return null;');
        expect(bar).toContain("data-page-cta={id}");
        const css = read("client/src/index.css");
        expect(css).toContain("html[data-bottom-nav] .rk-guest-cta {");
        // 설치 팝업은 data-page-cta 가 보이면 스스로 뜨지 않는다
        expect(read("client/src/components/hiq/AppInstallSheet.tsx")).toContain('document.querySelectorAll<HTMLElement>("[data-page-cta]")');
    });
    it("선수(PBA · UMB) · 매장 · 용어 화면에 있다", () => {
        expect(read("client/src/pages/hiq/pba-player.tsx")).toContain('<GuestCtaBar id="pba-player" copy={playerGuestBar("pba", name)}');
        expect(read("client/src/pages/hiq/world-player.tsx")).toContain('<GuestCtaBar id="umb-player" copy={playerGuestBar("umb", nameMain ?? "")}');
        const store = read("client/src/pages/store-listing.tsx");
        expect(store).toContain('<GuestCtaBar id="store" copy={STORE_GUEST_BAR} onClick={() => askScoreboardSignup(setLocation)}');
        expect(store).toContain("{s && !isClosedListing(s) && !(s.claimed && joinStoreFor(s.code)) && (");
        for (const f of ["client/src/pages/billiards-term.tsx", "client/src/pages/billiards-terms.tsx"]) expect(read(f)).toContain('<GuestCtaBar id="terms" copy={TERMS_GUEST_BAR}');
        expect(STORE_GUEST_BAR.label).toBe("점수판 쓰기");
        expect(TERMS_GUEST_BAR.label).toBe("점수판 쓰기");
    });
    it("방문자의 팔로우는 적어 두고 가입 팝업 · 가입하면 그 화면에서 팔로우", () => {
        const pba = read("client/src/pages/hiq/pba-player.tsx");
        expect(pba).toContain('followAfterLogin({ kind: "pba", key: memCode, category: null, name:');
        expect(pba).toContain('useFollowAfterLogin("pba", memCode || null, null, !!p, () => {');
        const umb = read("client/src/components/hiq/umb/UmbPlayerSheet.tsx");
        expect(umb).toContain('followAfterLogin({ kind: "umb", key: playerUmbId, category, name:');
        expect(umb).toContain('useFollowAfterLogin("umb", playerUmbId, category, !!data, () => {');
    });
    it("가입하고 바로 점수판 — 홈이 ?start=match 를 읽는다(종목 창이 먼저)", () => {
        expect(SCOREBOARD_START_PATH).toBe("/dashboard?start=match");
        const home = read("client/src/pages/hiq/dashboard.tsx");
        expect(home).toContain('const mode = params.get("start");');
        expect(home).toContain('if (!m.primarySport && m.golfAccess === true && locale === "ko") return;');
        expect(home).toContain('if (m.primarySport && m.primarySport !== "BILLIARDS") return;');
        // 종목 창의 조건과 같다
        expect(read("client/src/components/hiq/sport/PrimarySport.tsx")).toContain('const need = !!m && !m.primarySport && m.golfAccess === true && locale === "ko"');
    });
});

describe("어드민 '가입 창을 연 사람'", () => {
    it("가입 창만 센다(도움말 열기는 빼고)", () => {
        const v = read("server/routes/modules/adminVisitors.ts");
        expect(v).not.toContain("bool_or(name = 'open') as opened");
        expect(v.match(/bool_or\(name = 'open' and meta->>'l' = '가입 창'\) as opened/g)).toHaveLength(2);
    });
});
