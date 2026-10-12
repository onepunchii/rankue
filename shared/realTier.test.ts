import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { HANDICAP_MAP_3C, HANDICAP_MAP_4C } from "./realHandicap";
import { REAL_TIERS, REAL_TIER_IDS, bestRealTier, handiChangeKind, realHandiSteps, realTierFor, realTierRank } from "./realTier";

/**
 * 실전(오프라인 점수판) 등급 — 한 가지 식(2026-10-12 오너: "오프라인 점수판에도 해당 배찌및 등급을 적극 검토해줘" → "추천대로").
 * 실전 등급 = 그 종목의 내 다마. 화면마다 식이 달라 같은 사람이 다른 등급으로 나오던 것을 막는다.
 */
describe("실전 등급 구간", () => {
    it("3쿠션: 12~17 브론즈 / 18 실버 / 20~22 골드 / 23·24 플래티넘 / 25~28 다이아 / 30 이상 마스터(오너 결정 — 구간의 시작 다마는 그대로)", () => {
        // 2026-10-12 다마 표가 16칸(12~40)으로 늘었다 — 새로 생긴 칸은 그 사이의 등급에 들어간다
        const got = Object.fromEntries(realHandiSteps("3c").map((h) => [h, realTierFor(h, "3c")!.id]));
        expect(got).toEqual({
            12: "bronze", 15: "bronze", 17: "bronze", 18: "silver", 20: "gold", 21: "gold", 22: "gold", 23: "platinum", 24: "platinum",
            25: "diamond", 27: "diamond", 28: "diamond", 30: "master", 32: "master", 35: "master", 40: "master",
        });
    });

    it("4구: 3~10 브론즈 / 12·15 실버 / 20·25 골드 / 30 플래티넘 / 40 다이아 / 50 마스터(예전 구간 그대로)", () => {
        const got = Object.fromEntries(realHandiSteps("4c").map((h) => [h, realTierFor(h, "4c")!.id]));
        expect(got).toEqual({ 3: "bronze", 5: "bronze", 8: "bronze", 10: "bronze", 12: "silver", 15: "silver", 20: "gold", 25: "gold", 30: "platinum", 40: "diamond", 50: "master" });
    });

    it("다마 표의 맨 위가 마스터다 — 예전에는 3쿠션 최고 30 으로 다이아(35) · 마스터(45)에 닿을 수 없었다", () => {
        // 4구 마스터(500)는 에버리지 2.5, 3쿠션 마스터(30점)는 0.869 부터다(예전 표는 4구 1.5 · 3쿠션 1.0)
        expect(HANDICAP_MAP_4C.find((x) => x.handi === 50)!.avg).toBe(2.5);
        expect(HANDICAP_MAP_3C.find((x) => x.handi === 30)!.avg).toBe(0.869);
        expect(realTierFor(Math.max(...HANDICAP_MAP_3C.map((s) => s.handi)), "3c")!.id).toBe("master");
        expect(realTierFor(Math.max(...HANDICAP_MAP_4C.map((s) => s.handi)), "4c")!.id).toBe("master");
        // 여섯 등급이 두 종목 모두에서 실제로 나온다(나올 수 없는 등급이 없다)
        for (const g of ["3c", "4c"] as const) {
            expect(new Set(realHandiSteps(g).map((h) => realTierFor(h, g)!.id))).toEqual(new Set(REAL_TIER_IDS));
        }
    });

    it("구간은 오름차순이고 등급 이름은 온라인 대전과 같은 말을 쓴다(앞에 '실전'을 붙여 부른다)", () => {
        for (const g of ["3c", "4c"] as const) {
            const mins = REAL_TIERS[g].map((t) => t.min);
            expect([...mins].sort((a, b) => a - b)).toEqual(mins);
            expect(REAL_TIERS[g].map((t) => t.id)).toEqual(REAL_TIER_IDS);
            for (const t of REAL_TIERS[g]) expect(t.nameKey).toBe(`sim.rank.tier.${t.id}`);
        }
        // 아이언은 온라인 대전에만 있다
        expect(REAL_TIER_IDS).not.toContain("iron");
    });

    it("다마가 없으면 등급도 없다 — 예전처럼 브론즈로 치지 않는다", () => {
        for (const bad of [null, undefined, 0, -3, Number.NaN]) expect(realTierFor(bad as number | null, "3c")).toBeNull();
        expect(bestRealTier(null)).toBeNull();
        expect(bestRealTier({})).toBeNull();
        expect(bestRealTier({ handi3c: null, handi4c: 0 })).toBeNull();
    });
});

describe("한 사람을 한 줄로 보여 줄 때 — 두 종목 가운데 높은 쪽 하나", () => {
    it("높은 등급 쪽 · 같으면 3쿠션", () => {
        expect(bestRealTier({ handi3c: 18, handi4c: 50 })).toMatchObject({ game: "4c", handi: 50, tier: { id: "master" } });
        expect(bestRealTier({ handi3c: 25, handi4c: 20 })).toMatchObject({ game: "3c", handi: 25, tier: { id: "diamond" } });
        expect(bestRealTier({ handi3c: 20, handi4c: 20 })).toMatchObject({ game: "3c", tier: { id: "gold" } });
        // 3쿠션만 치는 사람 — 예전에는 4구 다마(없음)로 매겨 브론즈였다
        expect(bestRealTier({ handi3c: 23, handi4c: null })).toMatchObject({ game: "3c", tier: { id: "platinum" } });
    });

    it("등급의 높낮이", () => {
        expect(REAL_TIER_IDS.map(realTierRank)).toEqual([0, 1, 2, 3, 4, 5]);
    });
});

describe("다마가 바뀌었나(경기 끝의 '다마가 올랐어요')", () => {
    it("처음 생김 · 오름 · 내림 · 그대로", () => {
        expect(handiChangeKind(0, 18)).toBe("first");
        expect(handiChangeKind(null, 12)).toBe("first");
        expect(handiChangeKind(20, 23)).toBe("up");
        expect(handiChangeKind(23, 20)).toBe("down");
        expect(handiChangeKind(20, 20)).toBe("same");
        expect(handiChangeKind(20, 0)).toBe("same");
    });
});

/**
 * 화면들이 그 한 가지 식을 쓰는가 — 소스를 읽어 지킨다(vitest 가 client/src 에서는 sim·golf 만 읽어 shared 에 둔다).
 */
describe("화면: 실전 등급은 어디서나 같은 식 · 다마 메달", () => {
    const root = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
    const client = (p: string) => root(`client/src/${p}`);
    const code = (s: string) => s.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join("\n");

    it("공용 함수(getTier · getMemberTier)는 구간 숫자를 따로 적지 않는다", () => {
        const utils = code(client("lib/hiqUtils.ts"));
        const billiards = utils.slice(utils.indexOf("const t = realTierFor(handi"));
        expect(billiards).not.toMatch(/handi >= \d+/);
        expect(utils).toContain('const t = realTierFor(handi, is3c ? "3c" : "4c");');
        expect(utils).toContain("const pick = bestRealTier(m);");
    });

    it("친구 · 최근 상대 · 검색 · 크루는 4구 다마만 보지 않는다 — 두 종목 가운데 높은 쪽", () => {
        for (const f of ["components/hiq/rivals/FriendList.tsx", "components/hiq/rivals/RecentOpponents.tsx", "components/hiq/rivals/SearchUserDialog.tsx", "components/hiq/CrewMemberList.tsx"]) {
            const src = code(client(f));
            expect(src, f).not.toMatch(/getTier\(Number\([a-z.]*handi4c/i);
            expect(src, f).toContain("getMemberTier(");
            expect(src, f).toContain("<RealTierChip member={");
        }
    });

    it("기록 페이지도 같은 식 — 누적 에버리지로 따로 매기지 않는다", () => {
        const hook = code(client("hooks/useGameStats.ts"));
        expect(hook).not.toMatch(/avg >= \d/);
        expect(hook).toContain("const realTier = currentSport === \"GOLF\" ? null : realTierFor(realHandi, realGame);");
        const card = client("components/hiq/history/StatsOverviewCard.tsx");
        expect(card).toContain("<RealMedal game={realTier.game} handi={realTier.handi} size={52} />");
    });

    it("홈: 점수판 카드의 내 다마와 '내 실전 기록'이 메달을 그린다 — 공식 5판 전에는 빈 메달", () => {
        const quick = client("components/hiq/dashboard/QuickActions.tsx");
        expect(quick).toContain("<RealMedal game={type} handi={ready ? s!.handi : null} size={54} />");
        const card = client("components/hiq/dashboard/RealHandicapCard.tsx");
        expect(card).toContain("<RealMedal game={cur} handi={sideReady ? side.handi : null} size={56} />");
        expect(card).toContain("{medalRow}");
        const medal = code(client("components/hiq/RealMedal.tsx"));
        // 다마가 없으면 빈 메달(흐린 그림 · 숫자 없음)
        expect(medal).toContain('"grayscale(1) opacity(0.42)"');
        expect(medal).toContain("{tier && (");
    });

    it("경기 결과: 올랐거나 처음 생겼을 때만 크게 — 내려간 것은 작은 한 줄", () => {
        const page = client("pages/hiq/game/result.tsx");
        expect(page).toContain('if (kind === "up" || kind === "first") {');
        expect(page).toContain('data-testid="handi-promo"');
        const down = page.slice(page.indexOf('if (kind === "down") {'), page.indexOf("return null;\n                })()}"));
        expect(down).toContain('data-testid="handi-adjusted"');
        expect(down).not.toContain("hall-promo");
        // 예전의 "핸디캡 상승!"(내려가도 그렇게 적었다)과 서버의 한국어 문장은 쓰지 않는다
        expect(code(page)).not.toContain('t("gameResult.handicapUp")');
        expect(code(page)).not.toContain("{handicapUpdate.message}");
        // 근거는 서버가 숫자로 준다
        expect(root("server/storage/game.repo.ts")).toContain("games: basis.games,");
    });

    it("그림: 여섯 장 · webp · 가볍다(한 장 40KB, 합쳐 150KB)", () => {
        let total = 0;
        for (const id of REAL_TIER_IDS) {
            const p = resolve(__dirname, `../client/public/real/medal-${id}.webp`);
            expect(existsSync(p), id).toBe(true);
            const b = readFileSync(p);
            expect(b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP", id).toBe(true);
            const n = statSync(p).size;
            total += n;
            expect(n, id).toBeLessThan(40 * 1024);
        }
        expect(total).toBeLessThan(150 * 1024);
    });

    it("문구가 다섯 언어에 있고 자리 표시를 지킨다", () => {
        const need: Record<string, string[]> = {
            "real.medalAria": ["{tier}", "{game}", "{n}"], "real.medalEmptyAria": ["{game}"], "real.tierOf": ["{tier}"], "real.tierNone": [],
            "real.nextHandiGap": ["{n}", "{gap}"], "real.handiUp": [], "real.handiFirst": [], "real.handiChanged": [], "real.handiBasis": ["{n}", "{avg}"],
        };
        for (const l of ["ko", "en", "vi", "tr", "es"]) {
            const d = client(`lib/i18n/${l}.ts`);
            for (const [k, ph] of Object.entries(need)) {
                const v = d.match(new RegExp(`^  "${k.replace(/\./g, "\\.")}": "(.*)",$`, "m"))?.[1];
                expect(v, `${l} ${k}`).toBeTruthy();
                for (const p of ph) expect(v, `${l} ${k}`).toContain(p);
            }
        }
    });
});
