import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { CASE_ITEMS, CHALKS, CUES, GLOVES, PENNANTS, SOON, caseImage, cueHow, type CaseLocale } from "./cueCase";
import { deficitFromInnings, deficitFromShots, evaluateCase, kstMonthKey, seasonOf, type CaseInput, type OnlineGame, type RealGame } from "./cueCaseRules";

// 큐 케이스(2026-10-16) — 당구의 수집. 기획 docs/01-plan/features/billiards-cue-case.md
const root = resolve(__dirname, "..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");
const LOCALES: CaseLocale[] = ["ko", "en", "es", "vi", "tr"];

describe("목록", () => {
    it("기획서의 수 — 큐 77(실전 20 · 온라인 24 · 공통 19 · 양쪽 7 · 크루 6 · 2단계 1) · 초크 16 · 장갑 16 · 페넌트 8", () => {
        const by = (g: string) => CUES.filter((c) => c.group === g).length;
        expect([CUES.length, by("real"), by("online"), by("common"), by("both"), by("crew"), by("stage2")]).toEqual([77, 20, 24, 19, 7, 6, 1]);
        expect([CHALKS.length, GLOVES.length, PENNANTS.length]).toEqual([16, 16, 8]);
    });
    it("id 는 겹치지 않는다 — 실전과 온라인에 같은 이름(50판 · 하이런 · 역전)이 있어 칸마다 머리말이 다르다", () => {
        const ids = CASE_ITEMS.map((x) => x.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(CUES.filter((c) => c.group === "online").every((c) => c.id.startsWith("cue-on-") && c.online)).toBe(true);
        expect(CUES.filter((c) => c.group === "crew").every((c) => c.id.startsWith("cue-crew-"))).toBe(true);
    });
    it("그림이 다 있고 가볍다(webp · 장당 40KB 아래 · 합쳐 2MB 아래)", () => {
        let total = 0;
        for (const x of CASE_ITEMS) {
            const p = resolve(root, "client/public", caseImage(x).slice(1));
            expect(existsSync(p), x.id).toBe(true);
            const b = readFileSync(p);
            expect(b.subarray(8, 12).toString("ascii"), x.id).toBe("WEBP");
            expect(b.length, x.id).toBeLessThan(40 * 1024);
            total += statSync(p).size;
        }
        expect(total).toBeLessThan(2 * 1024 * 1024);
    });
    it("이름 · 받는 법이 다섯 언어에 있다 — 숨은 큐는 받기 전에 조건을 감춘다", () => {
        for (const x of CASE_ITEMS) for (const l of LOCALES) {
            expect(x.name[l].trim(), `${x.id} ${l}`).not.toBe("");
            expect(cueHow(x, l, true).trim(), `${x.id} ${l}`).not.toBe("");
        }
        const hidden = CUES.filter((c) => c.hidden);
        expect(hidden.map((c) => c.id).sort()).toEqual(["cue-anniversary", "cue-dawn", "cue-jjajang", "cue-triple-three"]);
        for (const h of hidden) expect(cueHow(h, "ko")).toBe("받는 순간 조건이 공개돼요");
        expect(cueHow(CUES.find((c) => c.id === "cue-run-10")!, "ko")).toBe("실전 공식 경기 하이런 3쿠션 10 · 4구 20");
    });
    it("아직 열지 않은 것 — 다마 이력이 필요한 셋 · 사군자 · 크루 · 원정 · 페넌트", () => {
        expect(SOON.size).toBe(3 + 4 + 6 + 1 + 1 + 1 + 8);
        for (const id of SOON) expect(CASE_ITEMS.some((x) => x.id === id), id).toBe(true);
    });
});

const T0 = Date.UTC(2026, 9, 1, 3); // 2026-10-01 12:00 한국
const H = 3_600_000;
const realGame = (i: number, o: Partial<RealGame> = {}): RealGame => ({
    id: `r${i}`, at: T0 + i * H, startedAt: T0 + i * H - 40 * 60_000, gameType: "4c", won: i % 2 === 0, opps: ["p1"], highRun: 3, target: 20,
    innings: [2, 0, 3], oppScore: 10, maxDeficit: 0, ...o,
});
const onlineGame = (i: number, o: Partial<OnlineGame> = {}): OnlineGame => ({
    id: `o${i}`, at: T0 + i * H, opp: "q1", oppCountry: "KR", gameType: "3c", won: true, lost: false, natural: true,
    highRun: 2, innings: 10, target: 10, ratingAfter: 1000 + i * 10, matchesAfter: i, rematch: false, maxDeficit: 0, banks: [], fiveCushionAt: null, ...o,
});
const base = (o: Partial<CaseInput> = {}): CaseInput => ({ nowMs: T0 + 1000 * H, joinedAt: T0 - 30 * 24 * H, country: "KR", cups: [], monthTops: [], cupEntries: [], realTier: null, online: [], real: [], ...o });

describe("판정", () => {
    it("첫 공식 경기 = 첫 큐 · 첫 사람(단청 큐 · 궁궐 초크) · 가입하면 첫 장갑", () => {
        const s = evaluateCase(base({ real: [realGame(1)] }));
        expect(s["cue-first"]).toMatchObject({ done: true, at: T0 + H });
        expect(s["cue-dancheong"].done && s["chalk-palace"].done).toBe(true);
        expect(s["glove-first"].at).toBe(T0 - 30 * 24 * H);
        expect(s["cue-games-50"]).toMatchObject({ done: false, bars: [{ side: "real", have: 1, need: 50 }] });
    });
    it("장갑 12칸 — 실전 4판이면 그 달 장갑(네 번째 판이 끝난 때), 온라인은 한 판에 한 칸", () => {
        const s = evaluateCase(base({ real: [1, 2, 3, 4].map((i) => realGame(i)) }));
        expect(s["glove-m10"]).toMatchObject({ done: true, at: T0 + 4 * H });
        const o = evaluateCase(base({ online: Array.from({ length: 11 }, (_, i) => onlineGame(i + 1)) }));
        expect(o["glove-m10"].done).toBe(false);
        expect(o["cue-autumn"].done).toBe(false);
        const o2 = evaluateCase(base({ online: Array.from({ length: 11 }, (_, i) => onlineGame(i + 1)), real: [realGame(20)] }));
        expect(o2["glove-m10"].done && o2["cue-autumn"].done).toBe(true);
    });
    it("온라인 등급 — 배치(3판) 뒤의 레이팅이 처음 닿은 때. 내려가도 받은 때는 그대로", () => {
        const s = evaluateCase(base({ online: [onlineGame(1, { ratingAfter: 1200, matchesAfter: 2 }), onlineGame(2, { ratingAfter: 1160, matchesAfter: 3 }), onlineGame(3, { ratingAfter: 900, matchesAfter: 4 })] }));
        expect(s["cue-on-tier-iron"].at).toBe(T0 + 2 * H);
        expect(s["cue-on-tier-gold"].at).toBe(T0 + 2 * H);
        expect(s["cue-on-tier-platinum"].done).toBe(false);
    });
    it("연승 — 진 판은 끊고, 기권 · 시간 초과로 이긴 판은 세지도 끊지도 않는다", () => {
        const games = [1, 2, 3, 4].map((i) => onlineGame(i)).concat([onlineGame(5, { natural: false }), onlineGame(6)]);
        expect(evaluateCase(base({ online: games }))["cue-on-streak"].at).toBe(T0 + 6 * H);
        const broken = [1, 2, 3, 4].map((i) => onlineGame(i)).concat([onlineGame(5, { won: false, lost: true }), onlineGame(6)]);
        expect(evaluateCase(base({ online: broken }))["cue-on-streak"]).toMatchObject({ done: false, bars: [{ have: 4, need: 5 }] });
    });
    it("하이런 — 온라인은 목표 · 이닝 제한으로 끝난 3쿠션 판만, 실전 4구는 두 배", () => {
        expect(evaluateCase(base({ online: [onlineGame(1, { highRun: 6, natural: false })] }))["cue-on-run-5"].done).toBe(false);
        expect(evaluateCase(base({ online: [onlineGame(1, { highRun: 6 })] }))["cue-on-run-5"].done).toBe(true);
        expect(evaluateCase(base({ real: [realGame(1, { highRun: 9 })] }))["cue-run-5"].done).toBe(false);
        expect(evaluateCase(base({ real: [realGame(1, { highRun: 10 })] }))["cue-run-5"].done).toBe(true);
        expect(evaluateCase(base({ real: [realGame(1, { gameType: "3c", highRun: 5 })] }))["cue-run-5"].done).toBe(true);
    });
    it("같은 상대 100판(실전 1판 = 온라인 3판) · 세계 원정 · 맞수", () => {
        const s = evaluateCase(base({ real: Array.from({ length: 33 }, (_, i) => realGame(i + 1)), online: [onlineGame(40, { opp: "p1", country: undefined } as never)] }));
        expect(s["chalk-gold"].done).toBe(true); // 33 × 3 + 1 = 100
        expect(evaluateCase(base({ online: [onlineGame(1, { oppCountry: "VN" })] }))["chalk-world"].done).toBe(true);
        expect(evaluateCase(base({ country: null, online: [onlineGame(1, { oppCountry: "VN" })] }))["chalk-world"].done).toBe(false);
        const rem = Array.from({ length: 10 }, (_, i) => onlineGame(i + 1, { rematch: true }));
        expect(evaluateCase(base({ online: rem }))["cue-on-rival"].done).toBe(true);
    });
    it("양쪽 큐는 막대 둘(실전 · 온라인)", () => {
        const s = evaluateCase(base({ real: [realGame(2)], online: [] }));
        expect(s["cue-saekdong"]).toMatchObject({ done: false, bars: [{ side: "real", have: 1 }, { side: "online", have: 0 }] });
        expect(evaluateCase(base({ real: [realGame(2)], online: [onlineGame(3)] }))["cue-saekdong"].at).toBe(T0 + 3 * H);
    });
    it("숨은 큐 — 새벽 2~5시에 끝낸 실전 · 12시 반을 넘긴 실전 · 3이닝 안의 3쿠션 승", () => {
        const dawn = Date.UTC(2026, 9, 2, 18, 30); // 10/3 03:30 한국
        expect(evaluateCase(base({ real: [realGame(1, { at: dawn, startedAt: dawn - H })] }))["cue-dawn"].done).toBe(true);
        expect(evaluateCase(base({ real: [realGame(1, { at: T0 + 40 * 60_000, startedAt: T0 - 10 * 60_000 })] }))["cue-jjajang"].done).toBe(true); // 11:50 → 12:40
        expect(evaluateCase(base({ online: [onlineGame(1, { innings: 3, target: 5 })] }))["cue-triple-three"].done).toBe(true);
        expect(evaluateCase(base({ online: [onlineGame(1, { innings: 3, target: 4 })] }))["cue-triple-three"].done).toBe(false);
    });
    it("열지 않은 것은 '곧' — 기록이 있어도 받지 않는다", () => {
        const s = evaluateCase(base({ real: Array.from({ length: 5 }, (_, i) => realGame(i + 1)) }));
        for (const id of SOON) expect(s[id], id).toMatchObject({ done: false, soon: true });
    });
    it("역전 — 목표 대비 진행률로 잰다(상대가 먼저 절반 넘게 앞섰다가 내가 이김)", () => {
        expect(deficitFromInnings([0, 0, 10], [6, 0, 0], 10, 10, false)).toBeCloseTo(0.6);
        expect(deficitFromShots([{ me: false, points: 6 }, { me: true, points: 10 }], 10, 10)).toBeCloseTo(0.6);
        expect(deficitFromInnings([5, 5], [2, 2], 10, 10, true)).toBe(0);
    });
    it("한국 시계 — 달 · 철(겨울은 12월이 든 해)", () => {
        expect(kstMonthKey(Date.UTC(2026, 8, 30, 15, 30))).toBe("2026-10");
        expect(seasonOf(Date.UTC(2027, 0, 10))).toEqual({ season: "winter", key: "2026-winter" });
        expect(seasonOf(Date.UTC(2026, 2, 1))).toEqual({ season: "spring", key: "2026-spring" });
    });
});

describe("연결", () => {
    it("받은 기록은 더하기만 — 표 둘, 배포 전에 돌리는 SQL", () => {
        const sql = read("migrations/cue_case.sql");
        expect(sql).toContain("create table if not exists hiq_cue_case_awards");
        expect(sql).toContain("constraint hiq_cue_case_awards_member_item_unique unique (member_id, item_id)");
        expect(sql).toContain("create table if not exists hiq_cue_case_prefs");
        const repo = read("server/storage/cueCase.repo.ts");
        expect(repo).toContain(".onConflictDoNothing()");
        expect(repo).not.toMatch(/\.update\(hiqCueCaseAwards\)|delete\(hiqCueCaseAwards\)/);
        // 온라인은 이달의 랭킹 · 장식장과 같은 목록(레이팅 반영 대전)
        expect(read("server/storage/index.ts")).toContain("public cueCase = new CueCaseRepository(() => this.simMatch.ratedDeltas());");
    });
    it("주소 — /cue-case, 옛 장식장(/online-game?shelf=1)은 메달 · 배지 칸으로 돌려보낸다", () => {
        expect(read("client/src/App.tsx")).toContain('<Route path="/cue-case" component={CueCaseRoute} />');
        expect(read("client/src/sim/SimulatorPage.tsx")).toContain("useEffect(() => { if (shelfView) navigate(shelfPath(shelfMember), { replace: true }); }, [shelfView, shelfMember, navigate]);");
        expect(read("client/src/sim/rank/shelfApi.ts")).toContain('"/cue-case?sec=medals"');
        expect(read("server/routes/index.ts")).toContain('router.use("/", cueCaseRouter);');
        const page = read("client/src/pages/hiq/cue-case.tsx");
        expect(page).toContain("<ShelfPage embedded memberId={memberId}");
        expect(page).toContain('aria-label={t("common.back")}');
        expect(read("client/src/pages/hiq/dashboard.tsx")).toContain("<CueCaseEntry />");
    });
    it("문구가 다섯 언어에 있고 자리 표시를 지킨다", () => {
        const need: Record<string, string[]> = { "case.ownerTitle": ["{name}"], "case.people": ["{n}"], "case.peopleNext": ["{n}"], "case.holders": ["{n}"], "case.monthGlove": ["{m}"], "case.monthCells": ["{n}", "{m}"], "case.got": ["{date}"], "case.newCount": ["{n}"], "case.newMore": ["{n}"], "case.entryCounts": ["{c}", "{k}", "{g}"] };
        const page = read("client/src/pages/hiq/cue-case.tsx") + read("client/src/components/hiq/cueCase/CueCaseEntry.tsx");
        const used = [...new Set([...page.matchAll(/t\(["`](case\.[a-zA-Z.]+)["`]\)/g)].map((m) => m[1]))];
        expect(used.length).toBeGreaterThan(40);
        for (const l of LOCALES) {
            const f = read(`client/src/lib/i18n/${l}.ts`);
            for (const k of used) expect(f, `${l} ${k}`).toContain(`"${k}":`);
            for (const g of ["real", "online", "common", "both", "crew", "stage2"]) expect(f, `${l} group ${g}`).toContain(`"case.group.${g}":`);
            for (const s of ["cue", "chalk", "glove", "medals"]) expect(f, `${l} sec ${s}`).toContain(`"case.sec.${s}":`);
            for (const [k, ph] of Object.entries(need)) {
                const v = (f.match(new RegExp(`"${k.replace(/\./g, "\\.")}": "([^"]+)"`)) ?? [])[1] ?? "";
                for (const p of ph) expect(v, `${l} ${k} ${p}`).toContain(p);
            }
        }
    });
});
