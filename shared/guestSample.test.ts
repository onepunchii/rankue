import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 랭킹 점수는 서버의 진짜 식(rpDeltaFor)으로 검산한다. game.repo 는 db 를 물고 있다 —
// 시험이 운영 DB 연결을 만들지 않게 db 모듈을 빈 것으로 바꿔 끼운다(순수 함수 하나만 쓴다).
vi.mock("../server/db.js", () => ({ db: {}, pool: {} }));
import { rpDeltaFor } from "../server/storage/game.repo.js";

import { GUEST_SAMPLE, GUEST_SAMPLE_NAME, type GuestSampleGame } from "./guestSample.js";
import { HANDI_MIN_GAMES, HANDI_RECENT_GAMES, handicapFor, nextHandicap } from "./realHandicap.js";
import { rankAmong } from "./proCompare.js";
import { countsOnSite } from "./golfOnSite.js";

/**
 * 비로그인 홈의 예시 인물(2026-10-05 오너: "홈을 비로그인에 다 열고, 가입 안 한 사람에겐 예시로 보여 준다" · "랭킹 1위와 내 수지를 비슷하게").
 * 예시라도 숫자끼리는 맞아야 한다 — 다마(수지)와 에버리지가 기준표와 어긋나면 당구 치는 사람은 한눈에 안다.
 * 그리고 예시는 진짜처럼 보이면 안 된다 — 전 줄 sample 표시, 사람 이름처럼 읽히는 이름 금지.
 */
const B = GUEST_SAMPLE.billiards;
const G = GUEST_SAMPLE.golf;
const TYPES = ["3c", "4c"] as const;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const gamesOf = (type: "3c" | "4c"): GuestSampleGame[] => B.history.filter((g) => g.gameType === type);

describe("예시 표시", () => {
    it("덩어리·회원·기록·랭킹 줄마다 sample: true", () => {
        expect(GUEST_SAMPLE.sample).toBe(true);
        expect(B.sample).toBe(true);
        expect(G.sample).toBe(true);
        expect(B.member.sample).toBe(true);
        expect(G.member.sample).toBe(true);
        for (const g of [...B.history, ...G.history]) expect(g.sample).toBe(true);
        for (const type of TYPES) for (const r of B.rankings[type]) expect(r.sample).toBe(true);
    });

    it("표시용 이름은 '예시'라고 말한다 — 당구·골프가 같은 한 사람", () => {
        expect(GUEST_SAMPLE.name).toBe(GUEST_SAMPLE_NAME);
        expect(GUEST_SAMPLE_NAME).toContain("예시");
        expect(B.name).toBe(GUEST_SAMPLE_NAME);
        expect(G.name).toBe(GUEST_SAMPLE_NAME);
        expect(B.member.name).toBe(GUEST_SAMPLE_NAME);
        expect(G.member.name).toBe(GUEST_SAMPLE_NAME);
        expect(G.member.id).toBe(B.member.id);
    });
});

describe("당구 — 다마(수지)·에버리지·전적이 서로 맞는다", () => {
    it("3쿠션을 치는 중급 동호인", () => {
        expect(B.real.preferred).toBe("3c");
        expect(B.real["3c"].handi).toBeGreaterThanOrEqual(18);
        expect(B.real["3c"].handi).toBeLessThanOrEqual(23);
    });

    for (const type of TYPES) {
        it(`${type}: 핸디는 최근 공식 10경기 평균을 기준표에 넣은 값`, () => {
            const side = B.real[type];
            const games = gamesOf(type);
            // 경기별 에버리지 글자 = 득점 ÷ 이닝, 소수 둘째 자리(서버가 기록에 적는 꼴)
            for (const g of games) expect(g.average).toBe((g.score / g.innings).toFixed(2));
            // 서버 handiBasis 와 같은 식 — 최근 10경기의 경기별 에버리지를 숫자로 읽어 평균
            const recent = games.slice(0, HANDI_RECENT_GAMES).map((g) => parseFloat(g.average));
            const handiAvg = sum(recent) / recent.length;
            expect(side.handiAvg).toBeCloseTo(handiAvg, 10);
            expect(side.handi).toBe(handicapFor(handiAvg, type));
        });

        it(`${type}: 프로필 에버리지는 총 득점 ÷ 총 이닝이고, 그 값으로 봐도 같은 핸디 칸`, () => {
            const side = B.real[type];
            const games = gamesOf(type);
            const avg = sum(games.map((g) => g.score)) / sum(games.map((g) => g.innings));
            expect(side.avg).toBeCloseTo(avg, 10);
            expect(handicapFor(avg, type)).toBe(side.handi);
            expect(B.member[type === "3c" ? "avg3c" : "avg4c"]).toBeCloseTo(avg, 10);
            expect(B.member[type === "3c" ? "handi3c" : "handi4c"]).toBe(side.handi);
        });

        it(`${type}: 경기 수·승률·하이런·다음 핸디가 기록과 맞는다`, () => {
            const side = B.real[type];
            const games = gamesOf(type);
            const wins = games.filter((g) => g.isWinner).length;
            expect(side.ready).toBe(true);
            expect(side.needed).toBe(HANDI_MIN_GAMES);
            expect(side.games).toBe(games.length);
            expect(side.games).toBeGreaterThanOrEqual(HANDI_MIN_GAMES);
            expect(side.winRate).toBeCloseTo(wins / games.length, 10);
            expect(side.highRun).toBe(Math.max(...games.map((g) => g.highRun)));
            // 이긴 판은 목표 점수를 채운 판 — 진 판의 득점이 이긴 판보다 많을 수 없다
            const target = Math.max(...games.map((g) => g.score));
            for (const g of games) expect(g.isWinner).toBe(g.score === target);

            const up = nextHandicap(side.handiAvg!, type);
            expect(up).not.toBeNull();
            expect(side.nextHandi).toEqual({ handi: up!.handi, avg: up!.avg, gap: Math.max(0.001, up!.avg - side.handiAvg!) });
            expect(side.nextHandi!.handi).toBeGreaterThan(side.handi!);
            expect(side.nextHandi!.gap).toBeGreaterThan(0);
        });

        it(`${type}: 랭킹 점수는 서버 식(rpDeltaFor)으로 센 값`, () => {
            const side = B.real[type];
            const games = gamesOf(type);
            const rp = Math.max(0, sum(games.map((g) => rpDeltaFor(type, g.isWinner, side.handi!))));
            expect(B.member[type === "3c" ? "rating3c" : "rating4c"]).toBe(rp);
            expect(rp).toBeGreaterThan(0);
        });
    }

    it("기록은 전부 공식 매칭 경기 — 카드가 세는 조건 그대로", () => {
        for (const g of B.history) {
            expect(g.sportCategory).toBe("BILLIARDS");
            expect(g.gameMode).toBe("match");
            expect(g.isRanked).toBe(true);
            expect(g.innings).toBeGreaterThan(0);
        }
    });

    it("실제 선수 기록은 넣지 않는다 — 닮은 프로·다음 프로·재미 등급은 비운다", () => {
        for (const type of TYPES) {
            expect(B.real[type].pro).toBeNull();
            expect(B.real[type].next).toBeNull();
            expect(B.real[type].tier).toBeNull();
            expect(B.real[type].pos).toBeNull();
        }
    });
});

describe("당구 — 예시 랭킹", () => {
    for (const type of TYPES) {
        const rating = type === "3c" ? "rating3c" : "rating4c";
        const handi = type === "3c" ? "handi3c" : "handi4c";
        const avg = type === "3c" ? "avg3c" : "avg4c";

        it(`${type}: 다섯 줄, 랭킹 점수 내림차순, id·이름이 겹치지 않는다`, () => {
            const rows = B.rankings[type];
            expect(rows).toHaveLength(5);
            for (let i = 1; i < rows.length; i++) expect(rows[i - 1][rating]).toBeGreaterThan(rows[i][rating]);
            // RankingListCard 는 0점인 줄을 감춘다 — 다섯 줄이 다 보이려면 전부 0보다 커야 한다
            for (const r of rows) expect(r[rating]).toBeGreaterThan(0);
            expect(new Set(rows.map((r) => r.id)).size).toBe(5);
            expect(new Set(rows.map((r) => r.name)).size).toBe(5);
        });

        it(`${type}: 1위가 예시 인물이고 '내 실전 기록'과 같은 숫자`, () => {
            const top = B.rankings[type][0];
            const side = B.real[type];
            expect(top.id).toBe(B.member.id);
            expect(top.name).toBe(GUEST_SAMPLE_NAME);
            expect(top[handi]).toBe(side.handi);
            expect(top[rating]).toBe(B.member[rating]);
            expect(top.average).toBe(side.avg!.toFixed(3));
        });

        it(`${type}: 모든 줄의 수지가 그 줄 에버리지와 기준표로 맞는다`, () => {
            for (const r of B.rankings[type]) {
                expect(r.average).toBe(r[avg].toFixed(3));
                // 화면에 보이는 글자(소수 셋째 자리)로 다시 넣어도 같은 칸이어야 한다 — 반올림이 경계를 넘으면 안 된다
                expect(handicapFor(parseFloat(r.average), type)).toBe(r[handi]);
            }
        });

        it(`${type}: 순위·상위 %·같은 핸디 평균은 예시 다섯 명 안에서 센 값`, () => {
            const rows = B.rankings[type];
            const side = B.real[type];
            expect(side.members).toEqual(rankAmong(rows.map((r) => r[avg]).sort((a, b) => b - a), side.avg!));
            // 홈의 getPercentile 식 — 랭킹 점수 순위 ÷ 줄 수
            const i = rows.findIndex((r) => r.id === B.member.id);
            expect(B.percentile[type]).toBe(Math.max(1, Math.round(((i + 1) / rows.length) * 100)));
            const same = rows.filter((r) => r[handi] === side.handi);
            expect(side.peers!.count).toBe(same.length);
            expect(side.peers!.avg).toBeCloseTo(sum(same.map((r) => r[avg])) / same.length, 10);
            expect(side.peers!.highRun).toBeGreaterThan(0);
        });
    }
});

describe("골프 — 핸디캡·평균·베스트·라운드 수가 타수 목록과 맞는다", () => {
    const scores = G.history.map((g) => g.score);

    it("기록은 전부 18홀 공식 라운드", () => {
        expect(scores.length).toBeGreaterThanOrEqual(5);
        for (const g of G.history) {
            expect(g.sportCategory).toBe("GOLF");
            expect(g.gameMode).toBe("match");
            expect(g.gameType).toBe("golf");
            expect(g.isRanked).toBe(true);
            expect(g.innings).toBe(18);
            expect(g.score).toBeGreaterThan(0);
            expect(countsOnSite(g.onSite)).toBe(true);
            expect(g.average).toBe((g.score / 18).toFixed(2));
        }
    });

    it("평균 타수 = 목록의 평균(소수 한 자리) — 큰 숫자와 그래프 아래 숫자가 같다", () => {
        const avg = sum(scores) / scores.length;
        expect(G.member.golfAvgScore).toBeCloseTo(avg, 10);
        expect(G.avgScore).toBe(avg.toFixed(1));
        expect(G.stats.avgScore).toBe(G.avgScore);
        // 홈이 실제로 쓰는 식(useGameStats cumulativeAverage: 총 타수 ÷ 총 홀 × 18)으로도 같은 글자
        expect(((sum(scores) / sum(G.history.map((g) => g.innings))) * 18).toFixed(1)).toBe(G.avgScore);
    });

    it("베스트 = 가장 적은 타수, 라운드 수 = 목록 길이", () => {
        expect(G.stats.bestScore).toBe(Math.min(...scores));
        expect(G.member.golfBestScore).toBe(Math.min(...scores));
        expect(G.stats.totalRounds).toBe(scores.length);
        expect(G.member.totalGolfGames).toBe(scores.length);
    });

    it("핸디캡 = 평균 타수 − 파 72(반올림)", () => {
        expect(G.member.golfHandicap).toBe(Math.round(G.member.golfAvgScore - 72));
        expect(G.member.golfHandicap).toBeGreaterThan(0);
    });

    it("그래프 점은 옛 → 최근 순서의 최근 10개(useGolfStats 와 같은 순서)", () => {
        const expected = G.history.slice(0, 10).reverse().map((g, id) => ({ id, score: g.score }));
        expect(G.recentScores).toEqual(expected);
    });
});

describe("이름 — 실제 사람처럼 보이면 안 된다", () => {
    // 한글 2~4글자뿐인 이름은 성+이름 꼴(김철수·남궁민수)로 읽힌다. 예시 이름은 '예시'라고 말하거나 다섯 글자 이상의 별명이어야 한다.
    const looksLikeRealName = (name: string) => /^[가-힣]{2,4}$/.test(name.trim());
    const names = [GUEST_SAMPLE.name, ...TYPES.flatMap((t) => B.rankings[t].map((r) => r.name))];

    it("성+이름 꼴의 한글 성명이 없다", () => {
        expect(looksLikeRealName("김철수")).toBe(true);
        expect(looksLikeRealName("남궁민수")).toBe(true);
        for (const n of names) expect(looksLikeRealName(n), n).toBe(false);
    });

    it("술·돈·내기 말이 없다", () => {
        for (const n of names) expect(n).not.toMatch(/내기|술|만원|천원|원빵|도박/);
    });
});

/* ── 화면 쪽 규칙 — vitest 가 client/src 에서는 sim·golf 만 읽으므로 소스를 읽어 지킨다(shared/loginRefresh.test.ts 와 같은 방식) ── */
const client = (p: string) => readFileSync(resolve(__dirname, "../client/src", p), "utf8");
const LOCALES = ["ko", "en", "es", "tr", "vi"] as const;
const dictHas = (locale: string, key: string) => client(`lib/i18n/${locale}.ts`).includes(`"${key}":`);
const koValue = (key: string) => new RegExp(`"${key.replace(/\./g, "\\.")}":\\s*"([^"]*)"`).exec(client("lib/i18n/ko.ts"))?.[1];

describe("비로그인 부품(GuestGate) — 문구는 다섯 언어 사전에", () => {
    const src = client("components/hiq/GuestGate.tsx");

    it("부품이 쓰는 키가 ko·en·es·tr·vi 에 전부 있다", () => {
        const keys = Array.from(src.matchAll(/t\("(guest\.[A-Za-z0-9]+)"\)/g), (m) => m[1]);
        expect(new Set(keys)).toEqual(new Set(["guest.sample", "guest.sheetTitle", "guest.sheetDesc", "guest.sheetCta", "guest.sheetClose", "guest.joinStart"]));
        for (const key of keys) for (const l of LOCALES) expect(dictHas(l, key), `${l} ${key}`).toBe(true);
    });

    it("예시 이름의 사전 키가 다섯 언어에 있고, 한국어 값은 예시 자료의 이름과 같다", () => {
        const rows = [B.member, ...B.rankings["3c"], ...B.rankings["4c"]];
        expect(GUEST_SAMPLE.nameKey).toBe(B.member.nameKey);
        expect(G.member.nameKey).toBe(B.member.nameKey);
        for (const r of rows) {
            for (const l of LOCALES) expect(dictHas(l, r.nameKey), `${l} ${r.nameKey}`).toBe(true);
            expect(koValue(r.nameKey)).toBe(r.name);
        }
    });

    it("사실과 다른 가입 문구를 쓰지 않는다 — 전화 가입은 여러 화면이다", () => {
        for (const key of ["guest.sheetTitle", "guest.sheetDesc", "guest.sheetCta", "guest.joinStart"]) {
            expect(koValue(key)).toBeTruthy();
            expect(koValue(key)).not.toMatch(/\d\s*초|바로 가입|즉시/);
        }
    });

    it("골프 테마가 바꿔 끼우는 색 유틸을 쓰지 않는다 — 어두운 쪽은 리터럴 색, 밝은 쪽은 토큰", () => {
        expect(src).not.toMatch(/\b(?:bg|text|border|ring|divide)-(?:white|black)\b/);
        expect(src).not.toMatch(/\bbg-card\b/);
    });

    it("시트에 설명(SheetDescription)이 있고, 가입은 goLogin 으로 보낸다 — 기본 confirm/alert 없음", () => {
        expect(src).toContain("<SheetDescription");
        expect(src).toContain("goLogin(setLocation, opts.from)");
        expect(src).toContain("goLogin(setLocation, from)");
        expect(src).not.toMatch(/\b(?:confirm|alert)\(/);
    });

    it("회원이면 바로 실행한다 — 비로그인이 확인된 때만 시트", () => {
        expect(src).toContain("if (!isGuest) { run(); return; }");
    });
});

describe("useGolfVisible — 골프를 '볼 수 있는가'", () => {
    const src = client("hooks/useGolfAccess.ts");
    const fn = src.slice(src.indexOf("export function useGolfVisible"));

    it("한국어 화면만 — 다른 언어는 회원이든 방문자든 false(가장 먼저 가른다)", () => {
        const ko = fn.indexOf('if (locale !== "ko") return false;');
        expect(ko).toBeGreaterThan(0);
        expect(ko).toBeLessThan(fn.indexOf("if (GOLF_PUBLIC) return true;"));
    });

    // 2026-10-05: 골프가 전면 공개(GOLF_PUBLIC)인 동안 서버는 모든 회원에게 골프를 허용한다 — 확인이 어느 쪽으로 끝나든 '볼 수 있다'라
    // 기다릴 이유가 없다. 기다리면 골프를 저장해 둔 방문자가 새로 열 때마다 당구 화면을 먼저 봤다가 골프로 뒤집힌다.
    it("전면 공개인 동안에는 로그인 확인을 기다리지 않는다 — 공개를 되돌리면 회원의 골프 허용 또는 비로그인 방문자, 확인 중에는 false", () => {
        expect(fn).toContain("useGolfAccess()");
        const open = fn.indexOf("if (GOLF_PUBLIC) return true;");
        const wait = fn.indexOf("if (isLoading) return false;");
        expect(open).toBeGreaterThan(0);
        expect(wait).toBeGreaterThan(open);
        expect(fn.indexOf("return access || isGuest;")).toBeGreaterThan(wait);
    });

    it("서버도 같은 스위치로 판단한다 — 전면 공개면 모든 회원에게 골프를 허용한다(그래서 회원에게는 useGolfAccess 와 같은 값)", () => {
        const server = readFileSync(resolve(__dirname, "../server/lib/golfAccess.ts"), "utf8");
        expect(server).toContain('import { GOLF_PUBLIC } from "../../shared/golfAccess.js";');
        const allowed = server.slice(server.indexOf("export function golfAllowed"));
        expect(allowed.indexOf("if (GOLF_PUBLIC) return true;")).toBeGreaterThan(0);
        expect(allowed.indexOf("if (GOLF_PUBLIC) return true;")).toBeLessThan(allowed.indexOf("if (!member) return false;"));
    });

    it("쓰기의 문(useGolfAccess)은 그대로 — 비로그인에게 열리지 않는다", () => {
        const access = src.slice(src.indexOf("export function useGolfAccess"), src.indexOf("export function useGolfVisible"));
        expect(access).toContain('if (isLoading || locale !== "ko") return false;');
        expect(access).toContain("golfAccess === true");
        expect(access).not.toContain("isGuest");
    });
});
