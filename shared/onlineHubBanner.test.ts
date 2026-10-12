import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 홈 '당구 게임' 구역 맨 위의 온라인 대전 배너(2026-10-12 오너: "당구 홈에 혼자 치기 카드 위에 배너 카드를 만들어서 우리가 방금 작업한
 * 대회 및 진열장 대시보드 랭킹 들어가게 만들면 어때?" → 검토 뒤 "응 순서대로 진행하자").
 *
 * 화면 코드를 읽어 지킨다(vitest 가 client/src 에서는 sim·golf 만 읽어 shared 에 둔다). 상태 계산의 시험은 client/src/sim/rank/hubState.test.ts.
 *  - 자리: 혼자 치기 카드 위.
 *  - 없는 것을 있는 것처럼 보이지 않는다 — 입구는 지금 둘(랭킹 · 대시보드). 장식장 · 월대회는 만들어지면 더한다.
 *  - 비로그인에게 예시 숫자를 만들어 보이지 않는다. 회원의 화면으로 가는 길은 전부 가입 안내를 거친다.
 *  - 같은 숫자를 한 화면에 두 번 적지 않는다 — '내 온라인 실력' 카드의 전적 · 랭킹 칸은 뺐다.
 */
const root = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const client = (p: string) => root(`client/src/${p}`);
const code = (s: string) => s.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join("\n");
const LOCALES = ["ko", "en", "vi", "tr", "es"] as const;
const dict = (l: string) => client(`lib/i18n/${l}.ts`);
const valueOf = (l: string, key: string) => dict(l).match(new RegExp(`^  "${key.replace(/\./g, "\\.")}": "(.*)",$`, "m"))?.[1];

const banner = code(client("components/hiq/dashboard/OnlineHubBanner.tsx"));

describe("홈 온라인 대전 배너", () => {
    it("혼자 치기 카드 바로 위에 있다(#home-game)", () => {
        const home = code(client("pages/hiq/dashboard.tsx"));
        const sec = home.slice(home.indexOf('<section id="home-game"'));
        const a = sec.indexOf("<OnlineHubBanner />");
        const b = sec.indexOf("<OnlineGameCard />");
        const c = sec.indexOf("<LookalikeProCard />");
        expect(a).toBeGreaterThan(0);
        expect(a).toBeLessThan(b);
        expect(b).toBeLessThan(c);
    });

    it("입구는 둘 — 랭킹 · 대시보드. 아직 없는 장식장 · 월대회 칸은 그리지 않는다", () => {
        expect(banner.match(/<Tile /g)).toHaveLength(2);
        expect(banner).toContain('const RANK_URL = "/online-game?rank=1";');
        expect(banner).toContain('const DASH_URL = "/online-game?dash=1";');
        expect(banner).not.toMatch(/cabinet|tournament|trophies/i);
    });

    it("회원의 화면으로 가는 길은 전부 가입 안내를 거친다 — setLocation 은 go 안에서만 부른다", () => {
        expect(banner.match(/setLocation\(/g)).toHaveLength(1);
        expect(banner).toContain("const go = (to: string) => gate.guard(() => setLocation(to), {");
        expect(banner).toContain("from: to,");
    });

    it("비로그인에게 예시 숫자를 만들어 보이지 않는다 — 일곱 등급을 보여 줄 뿐이다", () => {
        expect(banner).not.toContain("GUEST_SAMPLE");
        expect(banner).not.toContain("SampleBadge");
        // 회원이 아니면 판을 읽지 않고 '처음' 상태로 그린다
        expect(banner).toContain('const s: HubState = member ? hubStateOf(boards, placement, pick) : { kind: "fresh", canSwap: false };');
        expect(banner).toContain("{TIERS.map((tier, i) => (");
    });

    it("내 순위를 받기 전에는 '아직 안 뒀다'고 그리지 않는다 — 자리만 잡아 둔다", () => {
        expect(banner).toContain("const loading = !!member && !ready;");
        expect(banner).toContain('if (loading || s.kind === "waiting") {');
        const hook = code(client("sim/entry/useOnlineRecord.ts"));
        expect(hook).toContain("ready: myRank.data !== undefined || myRank.isError");
        // 내 것 요청은 회원일 때만(비로그인 홈에 401 을 쌓지 않는다)
        expect(hook.match(/enabled: !!member/g)).toHaveLength(2);
    });

    it("배지는 얻은 사람에게만 — 배치 중 · 기다리는 중에는 실루엣", () => {
        const placing = banner.slice(banner.indexOf('} else if (s.kind === "placing") {'), banner.indexOf("} else {\n        hero = ("));
        expect(placing).toContain('<TierEmblem tier="iron" size={96} locked />');
        expect(placing).not.toContain("glow");
        // 등급이 있을 때만 그 등급의 그림과 후광
        expect(banner).toContain("<TierEmblem tier={s.tier.id} size={96} glow />");
    });

    it("보던 종목의 순위표로 연다(?g=) — 랭킹 화면이 그 값을 받는다", () => {
        expect(banner).toContain("const rankUrl = game ? `${RANK_URL}&g=${game}` : RANK_URL;");
        expect(banner).not.toContain("go(RANK_URL)");
        const page = code(client("sim/SimulatorPage.tsx"));
        expect(page).toContain('const rankGame = params.get("g") === "4c" ? "4c" as const : params.get("g") === "3c" ? "3c" as const : undefined;');
        expect(page).toContain("initial={rankGame ? { gameType: rankGame } : undefined}");
    });

    it("누른 기록에 숫자가 남지 않게 단추마다 이름표가 있다(방문자 발자국)", () => {
        // 단추 다섯(등급 · 배치 중 · 시작 · 종목 바꾸기 · 입구 칸) 모두 data-track-as 를 단다 — 없으면 단추 글자(레이팅 · 전적)가 그대로 적힌다
        const buttons = banner.match(/<button /g) ?? [];
        expect(buttons).toHaveLength(5);
        expect(banner.match(/data-track-as=/g)).toHaveLength(buttons.length);
    });

    it("서버가 내 판에 레이팅을 싣는다(등급은 화면이 shared/sim/rank 로 정한다)", () => {
        const repo = code(root("server/storage/sim.repo.ts"));
        const fn = repo.slice(repo.indexOf("async myMatchRanks("), repo.indexOf("async getShots("));
        expect(fn).toContain("select m.game_type, m.rating, m.matches, m.wins, x.rank, x.total");
        expect(fn).toContain("rating: Number(r.rating ?? 1000),");
    });

    it("그림 · 스타일이 있다", () => {
        expect(banner).toContain('export const HUB_DASH_ICON_SRC = "/sim/rank/icon-stats.webp";');
        expect(existsSync(resolve(__dirname, "../client/public/sim/rank/icon-stats.webp"))).toBe(true);
        const css = client("index.css");
        expect(css).toContain(".rank-hall .hall-banner {");
        // 배너는 .rank-hall 아래에 그린다(색 변수 · 떠 있는 배지)
        expect(banner).toContain('<section className="rank-hall"');
    });

    it("문구가 다섯 언어에 있고 {n} 자리를 지킨다", () => {
        const used = new Set(Array.from(banner.matchAll(/t\("([A-Za-z0-9.]+)"\)/g), (m) => m[1]));
        for (const k of ["home.hubLabel", "home.hubAria", "home.hubShowTitle", "home.hubPlacingHint", "home.hubRankSub", "home.hubDash", "home.hubDashSub", "home.hubSwap", "home.hubJoin", "guestHome.gateHubTitle", "guestHome.gateHubDesc"]) {
            expect(used.has(k), k).toBe(true);
        }
        for (const l of LOCALES) {
            for (const k of used) expect(valueOf(l, k), `${l} ${k}`).toBeTruthy();
            for (const k of ["home.hubShowTitle", "home.hubPlacingHint", "guestHome.gateHubDesc"]) expect(valueOf(l, k), `${l} ${k}`).toContain("{n}");
        }
    });
});

describe("'내 온라인 실력' 카드 — 전적 · 랭킹은 배너로 옮겼다", () => {
    const card = code(client("components/hiq/dashboard/LookalikeProCard.tsx"));

    it("기록 띠(전적 · 랭킹)를 그리지 않는다", () => {
        expect(card).not.toContain("RecordStrip");
        expect(card).not.toContain("home.stripMatchRecord");
        expect(card).not.toContain('"sim.rank.title"');
        expect(card).not.toContain("/online-game?rank=1");
    });

    it("내 다마수 한 줄은 남는다", () => {
        expect(card).toContain('data-testid="online-handi"');
        expect(card).toContain('t("sim.entry.handicapTitle")');
        expect(card).toContain("queryKey: HANDICAP_QUERY_KEY");
    });

    it("쓰지 않게 된 문구는 사전에서 뺐다", () => {
        for (const l of LOCALES) {
            expect(dict(l)).not.toContain('"home.stripMatchRecord"');
            expect(dict(l)).not.toContain('"home.rankOf"');
        }
    });
});

/**
 * 기록 페이지의 온라인게임 입구(2026-10-12 — 순서의 4번). 기록 페이지는 실전 기록의 자리다(2026-09-09 오너 결정):
 * 온라인게임 숫자를 넣지 않는다. 모양만 진열장 띠로 바꿨다.
 */
describe("기록 페이지의 온라인게임 입구 띠", () => {
    const card = code(client("components/hiq/history/SimHistoryCard.tsx"));

    it("어두운 띠 + 그림 — 홈 배너와 같은 판(.rank-hall .hall-banner)", () => {
        expect(card).toContain('className="rank-hall w-full mb-6 block text-left active:opacity-90"');
        expect(card).toContain('<span className="hall-banner ');
        expect(card).toContain('src="/sim/rank/trophy.webp"');
        expect(card).toContain('onClick={() => setLocation("/online-game?dash=1")}');
    });

    it("숫자를 넣지 않는다 — 레이팅 · 순위 · 전적 · 내 등급 배지 모두", () => {
        // 기록이 있는지 보려고 목록을 받기는 한다(있다/없다만) — 그리는 부분에는 그 값이 하나도 없다
        const drawn = card.slice(card.indexOf("<button"));
        expect(drawn).not.toMatch(/rating|matches|TierEmblem|tierFor|wins|\{[a-z]+\.length\}/i);
        expect(card).not.toMatch(/rank\/me|TierEmblem|tierFor|hubStateOf|useOnlineRecord/);
        // 그리는 글자는 제목 하나
        expect(card.match(/\{t\("[^"]+"\)\}/g)).toEqual(['{t("sim.history.linkRow")}']);
    });

    it("기록이 하나도 없으면 그리지 않는다(처음 온 사람에게 빈 안내를 늘리지 않는다)", () => {
        expect(card).toContain("if (!hasRecord) return null;");
    });
});
