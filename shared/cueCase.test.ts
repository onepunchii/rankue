import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { CASE_ITEMS, CHALKS, CUES, GLOVES, PENNANTS, SOON, caseImage, cueHow, difficulty, type CaseLocale } from "./cueCase";
import { deficitFromInnings, deficitFromShots, evaluateCase, kstMonthKey, seasonOf, type CaseInput, type OnlineGame, type RealGame } from "./cueCaseRules";

// 큐 케이스(2026-10-16) — 당구의 수집. 기획 docs/01-plan/features/billiards-cue-case.md
const root = resolve(__dirname, "..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");
const LOCALES: CaseLocale[] = ["ko", "en", "es", "vi", "tr"];

describe("목록", () => {
    it("기획서의 수 — 큐 77(실전 20 · 온라인 24 · 공통 19 · 양쪽 7 · 크루 6 · 2단계 1) + 한정판 5 · 초크 16 · 장갑 16 · 페넌트 8", () => {
        const by = (g: string) => CUES.filter((c) => c.group === g).length;
        expect([CUES.length, by("real"), by("online"), by("common"), by("both"), by("crew"), by("stage2"), by("limited")]).toEqual([82, 20, 24, 19, 7, 6, 1, 5]);
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
    it("큐 케이스 그림(아이콘) — 들어가는 길 셋(홈 배너 칸 · 랭킹/대시보드 줄 · 큐 케이스 머리)이 같은 그림, 가볍다", () => {
        const p = resolve(root, "client/public/billiards/case/icon-case.webp");
        const b = readFileSync(p);
        expect(b.subarray(8, 12).toString("ascii")).toBe("WEBP");
        expect(b.length).toBeLessThan(20 * 1024);
        expect(read("client/src/sim/rank/ShelfLink.tsx")).toContain('export const CASE_ICON_SRC = "/billiards/case/icon-case.webp";');
        expect(read("client/src/components/hiq/dashboard/OnlineHubBanner.tsx")).toContain("<Tile icon={CASE_ICON_SRC} title={t(\"home.hubShelf\")}");
        expect(read("client/src/components/hiq/cueCase/CueCaseEntry.tsx")).toContain('const CASE_ICON = "/billiards/case/icon-case.webp";');
    });
    it("큐마다 제 이름(2026-10-16 오너: \"첫큐 50큐 뭐가 무슨 큐인지 모르겠어\") — 조건 이름이 아니라 무늬 이름, 겹치지 않는다", () => {
        const ko = CUES.map((c) => c.name.ko);
        expect(new Set(ko).size).toBe(ko.length);
        expect(ko.filter((n) => /판 큐$|^하이런|^온라인 하이런|^대전 \d|^뱅크샷 \d|^\d+승$|^온라인 첫 승$|^첫 큐$/.test(n))).toEqual([]);
        expect(CUES.find((c) => c.id === "cue-first")!.name.ko).toBe("민무늬 메이플");
        expect(CUES.find((c) => c.id === "cue-traveller")!.name.ko).toBe("나침반");
    });
    it("한정판(2026-10-16 오너: \"따로 새로 · 모두 99자루\") — 다섯 자루 · 99 · ★5 · 저장소가 마지막 번호 뒤로는 적지 않는다", () => {
        const lt = CUES.filter((c) => c.group === "limited");
        expect(lt.map((c) => c.id)).toEqual(["cue-lt-double-master", "cue-lt-thousand", "cue-lt-triple-cup", "cue-lt-legend-run", "cue-lt-five-nations"]);
        for (const c of lt) { expect(c.limit).toBe(99); expect(difficulty(c)).toBe(5); expect(SOON.has(c.id)).toBe(false); }
        expect(read("server/storage/cueCase.repo.ts")).toContain("having coalesce(max(serial), 0) < ${cap}");
    });
    it("난이도 별 1~5 — 모든 것에 있고, 같은 갈래에서는 어려울수록 많다", () => {
        for (const x of CASE_ITEMS) expect([1, 2, 3, 4, 5], x.id).toContain(difficulty(x));
        const s = (id: string) => difficulty(CASE_ITEMS.find((x) => x.id === id)!);
        expect([s("cue-first"), s("cue-games-300"), s("cue-games-1000")]).toEqual([1, 3, 5]);
        expect(s("cue-on-tier-master")).toBeGreaterThan(s("cue-on-tier-silver"));
        expect(s("chalk-stonewall")).toBe(5);
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
    it("아직 열지 않은 것 — 끝내기 · 사군자 · 크루 · 원정 · 페넌트(다마 넘김 · 오름은 경기 끝에 바로 적는다)", () => {
        expect(SOON.size).toBe(1 + 4 + 6 + 1 + 1 + 1 + 8);
        expect(SOON.has("cue-dama-up") || SOON.has("cue-over-target")).toBe(false);
        const route = read("server/routes/modules/game.ts");
        expect(route).toContain('if (oldHandi > 0 && newHandi > oldHandi) await storage.cueCase.awardNow(pid, "cue-dama-up", at);');
        expect(route).toContain('if (game.winnerId === pid && oldHandi > 0 && onScale && target > oldHandi) await storage.cueCase.awardNow(pid, "cue-over-target", at);');
        expect(route).toContain('} catch (e) { console.error("[CueCase] 경기 끝 기록:", e); }');
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
    it("한정판 판정 — 삼관왕은 우승 세 번째 때, 다섯 나라는 내 나라 말고 다섯 번째 나라를 만난 때", () => {
        const cups = [1, 2, 3].map((i) => ({ rank: 1, at: T0 + i * H }));
        expect(evaluateCase(base({ cups: cups.slice(0, 2) }))["cue-lt-triple-cup"]).toMatchObject({ done: false, bars: [{ have: 2, need: 3 }] });
        expect(evaluateCase(base({ cups }))["cue-lt-triple-cup"].at).toBe(T0 + 3 * H);
        const nations = ["KR", "VN", "TR", "ES", "US", "JP"].map((c, i) => onlineGame(i + 1, { oppCountry: c, opp: `p${i}` }));
        expect(evaluateCase(base({ online: nations.slice(0, 5) }))["cue-lt-five-nations"].done).toBe(false); // KR 는 내 나라
        expect(evaluateCase(base({ online: nations }))["cue-lt-five-nations"].at).toBe(T0 + 6 * H);
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
        expect(repo).toContain("on conflict (member_id, item_id) do nothing");
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
    it("게임 큐대(2026-10-16 오너: \"이거 다 좋네\") — 대표 큐가 손잡이에, 상대가 겨눌 땐 상대 큐, 세기 막대 · 대전 시작 · 끝 · 공유 카드", () => {
        expect(read("client/src/sim/render/Renderer.ts")).toContain("readonly skin?: string | null;");
        const page = read("client/src/sim/SimulatorPage.tsx");
        expect(page).toContain("skin: opp ? v.oppSkin : v.mySkin,");
        expect(page).toContain("const mySkin = cueSkinUrl(sim.match ? sim.match.cues[sim.match.myIndex] : caseSummary.data?.hero);");
        expect(page).toContain('tour="sim-power" skin={mySkin} />');
        expect(page).toContain("cues={sim.match.cues}");
        expect(page).toContain("cueSkin: cueSkin(mySkin),");
        expect(read("client/src/sim/render/Canvas2DRenderer.ts")).toContain("ctx.drawImage(skin, 0, -buttW / 2, len * 0.45, buttW);");
        expect(read("client/src/sim/render/ThreeRenderer.ts")).toContain("this.applyCueSkin(cue.skin);");
        expect(read("client/src/sim/components/PowerRail.tsx")).toContain('preserveAspectRatio="none" transform="translate(6 98) rotate(-90)"');
        expect(read("client/src/sim/match/MatchIntro.tsx")).toContain('data-testid="intro-cues"');
        expect(read("client/src/sim/match/MatchEndRapport.tsx")).toContain('data-testid="match-end-cues"');
        // 서버: 대전 정보에 두 사람의 대표 큐 — 큐 케이스와 같은 규칙(고른 큐, 없으면 가장 최근에 받은 큐)
        const repo = read("server/storage/simMatch.repo.ts");
        expect(repo).toContain("hostCue: heroCueSql(sql`${hiqSimMatches.hostId}`),");
        expect(repo).toContain("order by a.earned_at desc, a.item_id limit 1");
        expect(read("server/storage/cueCase.repo.ts")).toContain(".sort((a, b) => ((items[b.id].at ?? 0) - (items[a.id].at ?? 0)) || (a.id < b.id ? -1 : 1));");
        expect(read("server/routes/modules/simMatch.ts")).toContain("cues: [cueIdOf(m.hostCue), m.guestId ? cueIdOf(m.guestCue) : null] as const,");
        expect(read("client/src/sim/matchApi.ts")).toContain("cues: Array.isArray(raw.cues) ? [cueOrNull(raw.cues[0]), cueOrNull(raw.cues[1])] : [null, null],");
    });
    it("크루 큐 랙(기획 6.2) — 당구 크루 홈에 크루원의 대표 큐, 승인 대기는 빼고 당구 크루만", () => {
        const repo = read("server/storage/cueCase.repo.ts");
        expect(repo).toContain(`if (!crew || crew.sport_category !== "BILLIARDS") return null;`);
        expect(repo).toContain("where cm.crew_id = ${crewId} and cm.role <> 'pending'");
        expect(read("server/routes/modules/cueCase.ts")).toContain('router.get("/cue-case/crew/:crewId", requireAuth');
        expect(read("client/src/components/hiq/tabs/CrewHomeTab.tsx")).toContain("{!isGolf && !ownWorld && <CrewCueRack crewId={crew.id} />}");
        expect(read("client/src/sim/match/MatchIntro.tsx")).toContain('data-testid="intro-cues"');
    });
    it("카드로 공유 — 내 큐 케이스만, 샷 카드와 같은 길(shareBlob)로 내보낸다", () => {
        const page = read("client/src/pages/hiq/cue-case.tsx");
        expect(page).toContain('{d?.member.mine && (');
        expect(page).toContain('data-testid="cue-case-share"');
        expect(page).toContain("const out = await shareBlob(blob,");
        const share = read("client/src/sim/share/useShare.ts");
        expect(share).toContain("return shareBlob(blob, { title: meta.title, text, filename, url, copied }, deps);");
        const card = read("client/src/components/hiq/cueCase/caseCard.ts");
        expect(card).toContain("export const CASE_CARD_W = 1080;");
        expect(card).toContain("const ih = Math.min(sh - 8, (sw - 40) * 80 / 1000), iw = ih * 1000 / 80;");
    });
    it("코치마크(2026-10-16 오너: \"큐케이스도 코치마크 · 세부도\") — 내 케이스에서만, 전체 한 번 + 초크 · 장갑 · 메달 칸", () => {
        const page = read("client/src/pages/hiq/cue-case.tsx");
        expect(page).toContain('{d?.member.mine && sec === "cue" && <CoachTour id="cue-case" tone="billiards" when={!reveal} steps={[');
        for (const id of ["cue-case-chalk", "cue-case-glove", "cue-case-medals"]) expect(page).toContain(`<CoachTour id="${id}" tone="billiards"`);
        expect(page).toContain('tour={i === 0 ? "cc-row" : undefined}');
        for (const tag of ["cc-plate", "cc-hero", "cc-month", "cc-secs", "cc-groups", "cc-share", "cc-people", "cc-tiles", "cc-real-medal", "cc-online-shelf"]) expect(page, tag).toMatch(new RegExp(`data-tour=(\\{[^}]*)?"${tag}"`));
        // 잠긴 큐도 팝업에선 원래 무늬(숨은 큐만 모양) · 난이도 별 · 가진 사람 수
        expect(page).toContain('className={view.done || !item.hidden ? "cc-own" : "cc-secret"}');
        expect(page).toContain('data-testid="cue-case-difficulty"');
        const keys = ["plate", "hero", "month", "secs", "groups", "row", "share", "people", "chalk", "glove", "realMedal", "onlineShelf"].flatMap((k) => [`tour.cc.${k}Title`, `tour.cc.${k}Body`]);
        for (const l of LOCALES) { const f = read(`client/src/lib/i18n/${l}.ts`); for (const k of keys) expect(f, `${l} ${k}`).toContain(`"${k}":`); }
    });
    it("넘버링(2026-10-16 오너: \"총 몇 명이 가지고 넘버링처럼\") — 받은 순서의 번호, 한 번 정하면 그대로", () => {
        const mig = read("migrations/cue_case_serial.sql");
        expect(mig).toContain("alter table hiq_cue_case_awards add column if not exists serial integer;");
        expect(mig).toContain("create unique index if not exists hiq_cue_case_awards_item_serial_unique on hiq_cue_case_awards (item_id, serial);");
        const repo = read("server/storage/cueCase.repo.ts");
        expect(repo).toContain("coalesce(max(serial), 0) + 1 from hiq_cue_case_awards where item_id = ${itemId}");
        expect(repo).toContain('if (code === "23505" && attempt < 4) continue;');
        expect(repo).toContain("::timestamptz at time zone 'UTC')");
        expect(repo).not.toMatch(/update hiq_cue_case_awards|set serial/);
        const page = read("client/src/pages/hiq/cue-case.tsx");
        expect(page).toContain('data-testid="cue-case-owner-plate"');
        expect(page).toContain('data-testid="cue-case-row-serial"');
        expect(read("client/src/components/hiq/cueCase/cueCaseApi.ts")).toContain('export const serialText = (n: number): string => `No.${n < 1000 ? String(n).padStart(3, "0") : String(n)}`;');
    });
    it("획득 · 미획득(2026-10-16 오너가 고른 A + C) — 받은 자리는 금테에 불, 아직은 점선 빈 홈 + 자물쇠, 칸마다 모은 큐가 위", () => {
        const page = read("client/src/pages/hiq/cue-case.tsx");
        expect(page).toContain('<span className={cn("cc-slot block", view.done ? "cc-lit" : "cc-empty")}>');
        expect(page).toContain('const got = list.filter((c) => it(c.id).done), yet = list.filter((c) => !it(c.id).done);');
        expect(page).toContain('data-testid="cue-case-owned-head"');
        const css = read("client/src/index.css");
        expect(css).toContain(".cue-case .cc-slot.cc-lit,");
        expect(css).toContain("outline: 1.5px dashed rgba(160, 180, 210, 0.24);");
    });
    it("문구가 다섯 언어에 있고 자리 표시를 지킨다", () => {
        const need: Record<string, string[]> = { "case.ownerTitle": ["{name}"], "case.people": ["{n}"], "case.peopleNext": ["{n}"], "case.holders": ["{n}"], "case.monthGlove": ["{m}"], "case.monthCells": ["{n}", "{m}"], "case.got": ["{date}"], "case.newCount": ["{n}"], "case.newMore": ["{n}"], "case.entryCounts": ["{c}", "{k}", "{g}"], "case.rackOwned": ["{n}", "{m}"], "case.rackCount": ["{n}"], "case.rackMore": ["{n}"], "case.serialMine": ["{n}"], "case.serialNext": ["{no}"], "case.rowHolders": ["{n}"], "case.limitedLeft": ["{n}", "{m}"], "case.limitedTaken": ["{n}", "{m}"], "case.ownedSec": ["{n}"], "case.lockedSec": ["{n}"] };
        const page = read("client/src/pages/hiq/cue-case.tsx") + read("client/src/components/hiq/cueCase/CueCaseEntry.tsx") + read("client/src/components/hiq/cueCase/CrewCueRack.tsx");
        const used = [...new Set([...page.matchAll(/t\(["`](case\.[a-zA-Z.]+)["`]\)/g)].map((m) => m[1]))];
        expect(used.length).toBeGreaterThan(40);
        for (const l of LOCALES) {
            const f = read(`client/src/lib/i18n/${l}.ts`);
            for (const k of used) expect(f, `${l} ${k}`).toContain(`"${k}":`);
            for (const g of ["real", "online", "common", "both", "crew", "stage2", "limited"]) expect(f, `${l} group ${g}`).toContain(`"case.group.${g}":`);
            for (const s of ["cue", "chalk", "glove", "medals"]) expect(f, `${l} sec ${s}`).toContain(`"case.sec.${s}":`);
            for (const [k, ph] of Object.entries(need)) {
                const v = (f.match(new RegExp(`"${k.replace(/\./g, "\\.")}": "([^"]+)"`)) ?? [])[1] ?? "";
                for (const p of ph) expect(v, `${l} ${k} ${p}`).toContain(p);
            }
        }
    });
});
