import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 홈의 큐 케이스 허브(2026-10-24 오너: "큐 케이스가 더 중요 — 그 안에 등급 · 랭킹 · 월대회 · 대시보드" → 시안 ③ "좋네" → 기본 홈).
 * 예전 '온라인 대전' 배너(OnlineHubBanner)와 큐 케이스 띠(CueCaseEntry)를 이 한 장이 대신한다 — 그 둘이 지키던 것을 그대로 지킨다.
 * 화면 코드를 읽어 지킨다(vitest 가 client/src 에서는 sim·golf 만 읽어 shared 에 둔다). 상태 계산의 시험은 client/src/sim/rank/hubState.test.ts.
 *  - 비로그인에게 예시 숫자를 만들어 보이지 않는다. 회원의 화면(랭킹 · 월대회 · 대시보드 · 멀티방)으로 가는 길은 전부 가입 안내를 거친다.
 *  - 내 순위를 받기 전에는 '아직 안 뒀다'고 그리지 않는다. 배지는 얻은 사람에게만.
 */
const root = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const client = (p: string) => root(`client/src/${p}`);
const code = (s: string) => s.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join("\n");
const LOCALES = ["ko", "en", "vi", "tr", "es"] as const;
const dict = (l: string) => client(`lib/i18n/${l}.ts`);
const valueOf = (l: string, key: string) => dict(l).match(new RegExp(`^  "${key.replace(/\./g, "\\.")}": "(.*)",$`, "m"))?.[1];

const hub = code(client("components/hiq/cueCase/CueCaseHub.tsx"));

describe("홈 큐 케이스 허브", () => {
    it("홈에서 내 실력 바로 다음 — 예전 배너 · 큐 케이스 띠는 없다", () => {
        const home = code(client("pages/hiq/dashboard.tsx"));
        expect(home).toContain('<div className="mt-4" data-tour="bh-case"><CueCaseHub /></div>');
        expect(home.indexOf("<CueCaseHub />")).toBeGreaterThan(home.indexOf("<HomeSkillCard "));
        expect(home).not.toMatch(/OnlineHubBanner|CueCaseEntry|LookalikeProCard|ScoreboardActions/);
        expect(existsSync(resolve(__dirname, "../client/src/components/hiq/dashboard/OnlineHubBanner.tsx"))).toBe(false);
    });

    it("케이스 칸 셋 — 랭킹 · 월대회 · 대시보드, 케이스를 누르면 큐 케이스", () => {
        expect(hub).toContain('onClick={() => go(rankUrl)} trackAs="홈 큐 케이스 랭킹"');
        expect(hub).toContain('onClick={() => go(CUP_PATH)} trackAs="홈 큐 케이스 월대회"');
        expect(hub).toContain('onClick={() => go(DASH_URL)} trackAs="홈 큐 케이스 대시보드"');
        expect(hub).toContain('const DASH_URL = "/online-game?dash=1";');
        expect(hub).toContain("onClick={() => setLocation(cueCasePath())}");
    });

    it("회원의 화면으로 가는 길은 전부 가입 안내를 거친다 — setLocation 은 go · 큐 케이스 · 친구 초대에서만", () => {
        expect(hub).toContain("const go = (to: string) => gate.guard(() => setLocation(to), {");
        expect(hub.match(/setLocation\(/g)).toHaveLength(3);
        expect(hub).toContain('onClick={() => setLocation("/cue-case?invite=1")}');
    });

    it("월대회 칸: 내 경기가 있으면 남은 시간과 점 · 없으면 무엇을 하는 곳인지 — 비로그인에게는 내 경기가 없다", () => {
        expect(hub).toContain("const myCup = member ? cup : null;");
        expect(hub).toContain('const cupSub = !myCup ? t("home.hubCupSub")');
        expect(hub).toContain("dot={!!myCup && !myCup.waiting}");
        for (const l of LOCALES) for (const k of ["home.hubCup", "home.hubCupSub", "home.hubCupWait", "home.hubCupDays", "home.hubCupHours", "home.hubCupMin", "home.hubCupOver"]) expect(valueOf(l, k), `${l} ${k}`).toBeTruthy();
        // 내 경기는 내 순위 응답에 같이 온다(홈에서 요청을 하나 더 하지 않는다)
        expect(client("sim/entry/useOnlineRecord.ts")).toContain("const cp = myRank.data?.cup;");
        expect(root("server/routes/modules/sim.ts")).toContain("return sendSuccess(res, { placement: PLACEMENT_MATCHES, boards, shelf, cup });");
    });

    it("'새로' — 큐 케이스에 새로 들어온 것이나 달 마감 메달을 이 기기에서 아직 못 봤으면(회원만)", () => {
        expect(hub).toContain("const fresh = !!member && ((!!sum?.latest && sum.latest > readCaseSeen()) || isShelfNew(shelf?.latest, readShelfSeen()));");
        expect(hub).toContain('data-testid="home-case-new"');
    });

    it("친구 초대 한 줄은 회원에게만(예전 큐 케이스 띠의 것 그대로 — 같은 이름표)", () => {
        expect(hub).toMatch(/\{member && \(\s*<button type="button" onClick=\{\(\) => setLocation\("\/cue-case\?invite=1"\)\} data-testid="cue-case-entry-invite" data-track-as="홈 친구 초대"/);
    });

    it("비로그인에게 예시 숫자를 만들어 보이지 않는다 — 처음 상태로 시작을 권할 뿐이다", () => {
        expect(hub).not.toContain("GUEST_SAMPLE");
        expect(hub).not.toContain("SampleBadge");
        expect(hub).toContain('const s: HubState = member ? hubStateOf(boards, placement) : { kind: "fresh", canSwap: false };');
        expect(hub).toContain("{member ? counts : t(\"case.entryGuest\")}");
    });

    it("내 순위를 받기 전에는 '아직 안 뒀다'고 그리지 않는다 — 자리만 잡아 둔다", () => {
        expect(hub).toContain("const loading = !!member && !ready;");
        expect(hub).toContain('if (loading || s.kind === "waiting") {');
        const hook = code(client("sim/entry/useOnlineRecord.ts"));
        expect(hook).toContain("ready: myRank.data !== undefined || myRank.isError");
        expect(hook.match(/enabled: !!member/g)).toHaveLength(2);
    });

    it("배지는 얻은 사람에게만 — 배치 중 · 처음이면 실루엣, 누르면 배지 안내", () => {
        expect(hub).toContain('<BadgeTap guide={{ kind: "online", tier: s.tier.id, rating: s.rating }}><TierEmblem tier={s.tier.id} size={54} glow /></BadgeTap>');
        expect(hub).toContain('<BadgeTap guide={{ kind: "online", tier: null }}><TierEmblem tier="iron" size={54} locked /></BadgeTap>');
    });

    it("보던 종목의 순위표로 연다(?g=) · 내 등급을 누르면 통산 탭 — 랭킹 화면이 그 값을 받는다", () => {
        expect(hub).toContain("const rankUrl = game ? `${RANK_URL}&g=${game}` : RANK_URL;");
        expect(hub).toContain('onClick={() => go(s.kind === "ranked" ? `${rankUrl}&s=all` : ROOMS_URL)}');
        const page = code(client("sim/SimulatorPage.tsx"));
        expect(page).toContain('const rankGame = params.get("g") === "4c" ? "4c" as const : params.get("g") === "3c" ? "3c" as const : undefined;');
    });

    it("누른 기록에 숫자가 남지 않게 단추마다 이름표가 있다(방문자 발자국)", () => {
        const buttons = hub.match(/<button /g) ?? [];
        expect(buttons.length).toBeGreaterThanOrEqual(4);
        expect(hub.match(/data-track-as=/g)).toHaveLength(buttons.length);
    });

    it("서버가 내 판에 레이팅을 싣는다(등급은 화면이 shared/sim/rank 로 정한다)", () => {
        const repo = code(root("server/storage/sim.repo.ts"));
        const fn = repo.slice(repo.indexOf("async myMatchRanks("), repo.indexOf("async getShots("));
        expect(fn).toContain("select m.game_type, m.rating, m.matches, m.wins, x.rank, x.total");
        expect(fn).toContain("rating: Number(r.rating ?? 1000),");
    });

    it("그림이 있다 — 랭킹 트로피 · 월대회 · 대시보드 · 마스코트 패치", () => {
        for (const p of ["sim/rank/icon-stats.webp", "sim/rank/trophy.webp", "sim/rank/icon-cup.webp", "billiards/case/mascot-foil.webp"]) {
            expect(existsSync(resolve(__dirname, "../client/public", p)), p).toBe(true);
        }
    });

    it("문구가 다섯 언어에 있고 자리 표시를 지킨다", () => {
        const used = new Set(Array.from(hub.matchAll(/t\("([A-Za-z0-9.]+)"\)/g), (m) => m[1]));
        for (const k of ["home.caseTitle", "home.caseOpen", "home.caseCounts", "home.caseTier", "home.hubShowTitle", "home.hubRankSub", "home.hubDash", "home.hubDashSub", "home.hubJoin", "guestHome.gateHubTitle", "guestHome.gateHubDesc"]) {
            expect(used.has(k), k).toBe(true);
        }
        for (const l of LOCALES) {
            for (const k of used) expect(valueOf(l, k), `${l} ${k}`).toBeTruthy();
            for (const k of ["home.hubShowTitle", "guestHome.gateHubDesc"]) expect(valueOf(l, k), `${l} ${k}`).toContain("{n}");
            for (const p of ["{c}", "{s}", "{b}"]) expect(valueOf(l, "home.caseCounts"), `${l} caseCounts ${p}`).toContain(p);
        }
    });
});

describe("온라인 다마 배지 — 육각 초록 판(실전 다마 메달과 다른 그림)", () => {
    it("내 실력 카드 · 온라인게임 입구가 같은 배지를 쓴다, 숫자는 그림에 없다", () => {
        expect(code(client("components/hiq/dashboard/HomeSkillCard.tsx"))).toContain("<OnlineDamaBadge target={onlineDama} size={18} />");
        expect(code(client("sim/entry/HandicapCard.tsx"))).toContain("<OnlineDamaBadge target={known ? board!.target : null} size={44} />");
        const badge = code(client("sim/entry/OnlineDamaBadge.tsx"));
        expect(badge).toContain('export const ONLINE_DAMA_SRC = "/sim/rank/dama-online.svg";');
        expect(badge).toContain("{has && (");
        expect(badge).toContain('"grayscale(1) opacity(0.4)"');
        const svg = root("client/public/sim/rank/dama-online.svg");
        expect(svg.startsWith("<svg ")).toBe(true);
        expect(svg).not.toMatch(/<text|<image|<script|href=/);
        expect(svg.length).toBeLessThan(4000);
    });
});

/**
 * 기록 페이지의 온라인게임 입구(2026-10-12 — 순서의 4번). 기록 페이지는 실전 기록의 자리다(2026-09-09 오너 결정):
 * 온라인게임 숫자를 넣지 않는다. 모양만 진열장 띠로 바꿨다.
 */
describe("기록 페이지의 온라인게임 입구 띠", () => {
    const card = code(client("components/hiq/history/SimHistoryCard.tsx"));

    it("어두운 띠 + 그림(.rank-hall .hall-banner)", () => {
        expect(card).toContain('className="rank-hall w-full mb-6 block text-left active:opacity-90"');
        expect(card).toContain('<span className="hall-banner ');
        expect(card).toContain('src="/sim/rank/trophy.webp"');
        expect(card).toContain('onClick={() => setLocation("/online-game?dash=1")}');
        expect(client("index.css")).toContain(".rank-hall .hall-banner {");
    });

    it("숫자를 넣지 않는다 — 레이팅 · 순위 · 전적 · 내 등급 배지 모두", () => {
        const drawn = card.slice(card.indexOf("<button"));
        expect(drawn).not.toMatch(/rating|matches|TierEmblem|tierFor|wins|\{[a-z]+\.length\}/i);
        expect(card).not.toMatch(/rank\/me|TierEmblem|tierFor|hubStateOf|useOnlineRecord/);
        expect(card.match(/\{t\("[^"]+"\)\}/g)).toEqual(['{t("sim.history.linkRow")}']);
    });

    it("기록이 하나도 없으면 그리지 않는다(처음 온 사람에게 빈 안내를 늘리지 않는다)", () => {
        expect(card).toContain("if (!hasRecord) return null;");
    });
});
