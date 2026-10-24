/**
 * 큐 케이스 상대 · 공(2026-10-24 오너: "상대(큐의 윗대) 색도 커스텀 · 조건을 달성하면" → "당구는 1단계부터").
 * 목록 shared/cueCase(SHAFTS · BALLS) · 모양 shared/cueStyles · 그림 shared/cueStyleArt · 렌더러 client/src/sim/render/cueLook.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BALLS, CASE_ITEMS, SHAFTS, WORN_NONE, caseImage, cueHow, isSecret, wornOf } from "./cueCase";
import { evaluateCase, type CaseInput, type OnlineGame } from "./cueCaseRules";
import { BALL_STYLES, DEFAULT_BALL, DEFAULT_SHAFT, RAINBOW_DOTS, SHAFT_STYLES, ballMaterialOf, ballStyle, shaftStyle } from "./cueStyles";

const root = resolve(__dirname, "..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

const T0 = Date.UTC(2026, 9, 1, 3);
const H = 3_600_000;
const onlineGame = (i: number, o: Partial<OnlineGame> = {}): OnlineGame => ({
    id: `o${i}`, at: T0 + i * H, opp: "q1", oppCountry: "KR", gameType: "3c", won: true, lost: false, natural: true,
    highRun: 2, innings: 10, target: 10, ratingAfter: 1000 + i * 10, matchesAfter: i, rematch: false, maxDeficit: 0, banks: [], fiveCushionAt: null, ...o,
});
const base = (o: Partial<CaseInput> = {}): CaseInput => ({ nowMs: T0 + 1000 * H, joinedAt: T0 - 30 * 24 * H, country: "KR", cups: [], monthTops: [], cupEntries: [], realTier: null, online: [], real: [], ...o });

describe("목록과 모양", () => {
    it("상대 10 · 공 14 — 모두 모양이 있고, 모양만 있는 id 도 없다", () => {
        expect(SHAFTS).toHaveLength(10);
        expect(BALLS).toHaveLength(14);
        expect(SHAFTS.every((x) => x.kind === "shaft" && x.img === x.id && SHAFT_STYLES[x.id])).toBe(true);
        expect(BALLS.every((x) => x.kind === "ball" && x.img === x.id && BALL_STYLES[x.id])).toBe(true);
        expect(Object.keys(SHAFT_STYLES).sort()).toEqual(SHAFTS.map((x) => x.id).sort());
        expect(Object.keys(BALL_STYLES).sort()).toEqual(BALLS.map((x) => x.id).sort());
        expect(new Set(CASE_ITEMS.map((x) => x.id)).size).toBe(CASE_ITEMS.length);
    });
    it("조건(2026-10-24 오너) — 흑단 상대 · 파란 점만 온라인 핸디전 50판, 나머지는 조건 미공개", () => {
        for (const x of [...SHAFTS, ...BALLS]) {
            expect(x.online, x.id).toBe(true);
            if (x.id === "shaft-ebony" || x.id === "ball-dot-blue") expect(x.rule, x.id).toEqual({ k: "onGames", n: 50 });
            else expect(isSecret(x), x.id).toBe(true);
        }
    });
    it("모르는 id 는 기본(메이플 · 빨간 점)", () => {
        expect(shaftStyle(null)).toBe(DEFAULT_SHAFT);
        expect(shaftStyle("shaft-nope")).toBe(DEFAULT_SHAFT);
        expect(ballStyle(undefined)).toBe(DEFAULT_BALL);
        expect(ballStyle("ball-nope")).toBe(DEFAULT_BALL);
    });
    it("공은 흰 공 · 노란 공 바탕을 지킨다 — 모양에 바탕색 칸이 없고, 무지개 점에 노랑 · 주황이 없다, 크롬도 금속성은 조금만", () => {
        for (const st of Object.values(BALL_STYLES)) expect(Object.keys(st).sort()).toEqual(["dot", "finish", "shape"]);
        for (const c of RAINBOW_DOTS) {
            const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
            // 노랑 · 주황 = 빨강 · 초록이 둘 다 높고 파랑이 낮은 색
            expect(r > 180 && g > 120 && b < 100, c).toBe(false);
        }
        expect(ballMaterialOf("chrome").metalness).toBeLessThanOrEqual(0.2);
    });
});

describe("그림", () => {
    it("상대 · 공은 그림 파일 대신 SVG(data: 주소) — 가볍고, 큐 케이스 홈 크기(1000×80 · 정사각)", () => {
        for (const x of SHAFTS) {
            const u = caseImage(x);
            expect(u.startsWith("data:image/svg+xml"), x.id).toBe(true);
            expect(u.length, x.id).toBeLessThan(12_000);
            expect(decodeURIComponent(u)).toContain('viewBox="0 0 1000 80"');
        }
        for (const x of BALLS) {
            const u = caseImage(x);
            expect(u.startsWith("data:image/svg+xml"), x.id).toBe(true);
            expect(u.length, x.id).toBeLessThan(12_000);
            expect(decodeURIComponent(u)).toContain('viewBox="0 0 200 200"');
        }
        // 큐 · 초크는 그대로 webp
        expect(caseImage({ kind: "cue", img: "first" })).toBe("/billiards/case/cue/first.webp");
    });
    it("조건 글은 규칙에서 — '큐'라는 말이 끼지 않는다", () => {
        for (const x of [...SHAFTS, ...BALLS]) {
            const how = cueHow(x, "ko");
            expect(how.length, x.id).toBeGreaterThan(3);
            expect(how, x.id).not.toContain("큐를");
        }
        expect(cueHow(SHAFTS.find((x) => x.id === "shaft-carbon")!, "ko")).toBe("조건 미공개");
        expect(cueHow(BALLS.find((x) => x.id === "ball-aurora")!, "en")).toBe("Condition not revealed yet");
        // 등급 조건 글은 물건 이름이 아니라 등급 이름으로(조건이 등급이 되면 쓰는 길)
        expect(cueHow({ ...SHAFTS[0], rule: { k: "onTier", tier: "silver" } }, "ko")).toBe("온라인 실버 등급에 처음 오르기");
    });
});

describe("판정 — 목록을 다 돌아서 지난 기록도 쳐 준다", () => {
    it("핸디전 50판이면 흑단 상대 · 파란 점(50번째 판의 때), 미공개는 판수가 많아도 안 들어오고 막대도 없다", () => {
        const s49 = evaluateCase(base({ online: Array.from({ length: 49 }, (_, i) => onlineGame(i + 1)) }));
        expect(s49["shaft-ebony"]).toMatchObject({ done: false, bars: [{ side: "online", have: 49, need: 50 }] });
        const s50 = evaluateCase(base({ online: Array.from({ length: 50 }, (_, i) => onlineGame(i + 1)) }));
        expect(s50["shaft-ebony"]).toMatchObject({ done: true, at: T0 + 50 * H });
        expect(s50["ball-dot-blue"]).toMatchObject({ done: true, at: T0 + 50 * H });
        const many = evaluateCase(base({ online: Array.from({ length: 400 }, (_, i) => onlineGame(i + 1, { highRun: 20 })) }));
        expect(many["shaft-white"]).toEqual({ done: false, at: null, bars: [] });
        expect(many["ball-crown"].done).toBe(false);
    });
});

describe("입은 것(wornOf) — 대표 큐와 같은 규칙", () => {
    const owned = ["ball-dot-blue", "shaft-ebony", "shaft-white", "cue-first"];
    it("안 골랐으면 그 종류에서 가장 최근에 받은 것", () => {
        expect(wornOf("shaft", null, owned)).toBe("shaft-ebony");
        expect(wornOf("ball", null, owned)).toBe("ball-dot-blue");
        expect(wornOf("ball", null, ["cue-first"])).toBeNull();
    });
    it("고른 것(받은 것 · 같은 종류일 때만), 'none' 이면 기본", () => {
        expect(wornOf("shaft", "shaft-white", owned)).toBe("shaft-white");
        expect(wornOf("shaft", "shaft-carbon", owned)).toBe("shaft-ebony");
        expect(wornOf("shaft", "ball-dot-blue", owned)).toBe("shaft-ebony");
        expect(wornOf("shaft", WORN_NONE, owned)).toBeNull();
    });
});

describe("연결", () => {
    it("저장 — 더하기만 하는 열 둘, 고르기는 받은 것만 · 'none' 은 상대 · 공만", () => {
        const sqlFile = read("migrations/cue_case_worn.sql");
        expect(sqlFile).toContain("alter table hiq_cue_case_prefs add column if not exists hero_shaft text;");
        expect(sqlFile).toContain("alter table hiq_cue_case_prefs add column if not exists hero_ball text;");
        expect(sqlFile).not.toMatch(/\bdrop\b|\bdelete\s+from\b|\bupdate\b/i);
        const repo = read("server/storage/cueCase.repo.ts");
        expect(repo).toContain('if (kind !== "shaft" && kind !== "ball") return false;');
        expect(repo).toContain('if (!x || (x.kind !== "cue" && x.kind !== "shaft" && x.kind !== "ball")) return false;');
        expect(repo).toContain('const heroShaft = wornOf("shaft", prefs.heroShaft, ownedLatest);');
    });
    it("대전 — 서버가 두 사람의 것을 주고(parseMatch 가 읽는다), 상대는 겨누는 사람의 것 · 공은 각자 수구에", () => {
        const repo = read("server/storage/simMatch.repo.ts");
        expect(repo).toContain('hostShaft: wornSql(sql`${hiqSimMatches.hostId}`, "shaft"),');
        expect(repo).toContain('guestBall: wornSql(sql`${hiqSimMatches.guestId}`, "ball"),');
        const route = read("server/routes/modules/simMatch.ts");
        expect(route).toContain('shafts: [wornIdOf(m.hostShaft, "shaft"), m.guestId ? wornIdOf(m.guestShaft, "shaft") : null] as const,');
        expect(route).toContain('ballSkins: [wornIdOf(m.hostBall, "ball"), m.guestId ? wornIdOf(m.guestBall, "ball") : null] as const,');
        const api = read("client/src/sim/matchApi.ts");
        expect(api).toContain('shafts: wornPair(raw.shafts, "shaft"),');
        expect(api).toContain('ballSkins: wornPair(raw.ballSkins, "ball"),');
        const page = read("client/src/sim/SimulatorPage.tsx");
        expect(page).toContain("shaft: opp ? v.oppShaft : v.myShaft,");
        expect(page).toContain("ballSkins: v.ballSkins,");
        expect(page).toContain('myCueBall === "yellow" ? { yellow: myBallSkin, white: oppBallSkin } : { white: myBallSkin, yellow: oppBallSkin }');
        const watch = read("client/src/sim/watch/WatchPage.tsx");
        expect(watch).toContain("shaft: wornRef.current.shaft } : undefined,");
        expect(watch).toContain("ballSkins: wornRef.current.ballSkins,");
    });
    it("렌더러 — 3D 는 상대 질감 · 꾸민 공 재질, 2D 는 상대 색 · 공 가운데 표시. 빨간 공은 꾸미지 않는다", () => {
        const three = read("client/src/sim/render/ThreeRenderer.ts");
        expect(three).toContain("this.applyShaft(cue.shaft ?? null);");
        expect(three).toContain('const id = e.colour === "red" ? null : skins?.[e.colour] ?? null;');
        expect(three).toContain("this.clearSkinMats();");
        const two = read("client/src/sim/render/Canvas2DRenderer.ts");
        expect(two).toContain("cueSkin(cue.skin), shaftStyle(cue.shaft));");
        expect(two).toContain('const skinId = colour === "red" ? null : frame.ballSkins?.[colour] ?? null;');
        expect(existsSync(resolve(root, "client/src/sim/render/cueLook.ts"))).toBe(true);
    });
    it("큐 케이스 — 상대 · 공 칸, 지금 대전에 쓰는 것 · 기본으로 쓰기 · 대전에 쓰기", () => {
        const api = read("client/src/components/hiq/cueCase/cueCaseApi.ts");
        expect(api).toContain('export const CASE_SECTIONS: readonly CaseSection[] = ["cue", "shaft", "ball", "chalk", "glove", "medals"];');
        const page = read("client/src/pages/hiq/cue-case.tsx");
        expect(page).toContain('data-testid={`cue-case-worn-${kind}`}');
        expect(page).toContain('data-testid="cue-case-wear"');
        expect(page).toContain("mutationFn: () => saveWornNone(kind),");
        for (const l of ["ko", "en", "es", "vi", "tr"]) {
            const f = read(`client/src/lib/i18n/${l}.ts`);
            for (const k of ["case.sec.shaft", "case.sec.ball", "case.count.shaft", "case.count.ball", "case.shaftDesc", "case.ballDesc", "case.wornNow", "case.wear", "case.wearing", "case.wearNone", "case.wornAuto", "case.wornDefault.shaft", "case.wornDefault.ball", "case.serialMine.shaft", "case.serialFirst.ball"]) {
                expect(f, `${l} ${k}`).toContain(`"${k}":`);
            }
        }
    });
});
