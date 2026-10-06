// 스토어 스크린샷 1.3 — 당구 다섯 장(01~05). 로컬 Vite(5177) + 가짜 응답(capture3-lib.mts).
//   npx tsx store/screenshots/capture3-billiards.mts            전부
//   ONLY=02 npx tsx store/screenshots/capture3-billiards.mts    한 장만
// 숫자는 shared/guestSample 의 예시 인물(경기 목록에서 서버와 같은 식으로 낸 값)을 그대로 쓴다 — 지어낸 조합이 아니다.
import { GUEST_SAMPLE } from "../../shared/guestSample.ts";
import { createSession, DEFAULT_3C_RULES } from "../../shared/sim/rules/index.ts";
import { TABLES, DEFAULT_CUE, ENGINE_VERSION, paramsHash } from "../../shared/sim/index.ts";
import { chromium, openShot, capture, report, ME, ME_ID, PASS, BASE, dayAgo, type Handler } from "./capture3-lib.mts";

const ONLY = (process.env.ONLY || "").split(",").filter(Boolean);
const want = (n: string) => ONLY.length === 0 || ONLY.includes(n);

/* ── 예시 인물을 '나'로 — 예시 표시(sample·nameKey)는 떼고, 내 줄의 id·이름만 바꾼다 ── */
const SAMPLE_ME = "guest-sample-1";
const plain = <T extends Record<string, any>>(o: T) => { const { sample: _s, nameKey: _k, ...rest } = o; return rest; };
const asMe = (row: Record<string, any>) => (row.id === SAMPLE_ME ? { ...plain(row), id: ME_ID, name: ME.name, nickname: ME.name } : plain(row));
const B = GUEST_SAMPLE.billiards;
const meRow = asMe(B.member as any);
const me = { ...ME, ...meRow, average: (B.member as any).average };
const rankings = { "3c": B.rankings["3c"].map((r) => asMe(r as any)), "4c": B.rankings["4c"].map((r) => asMe(r as any)) };
const OPPONENTS = ["빈쿠션연습생", "옆돌리기수련생", "대회전한바퀴", "뒤돌리기단골"];
// 경기 목록 — 예시 자료에는 id·날짜·상대·장소가 없다. 3쿠션과 4구를 날짜순으로 섞어 최근 것부터.
const history = (() => {
    const g3 = B.history.filter((g) => g.gameType === "3c"), g4 = B.history.filter((g) => g.gameType === "4c");
    const mixed: any[] = [];
    for (let i = 0; i < Math.max(g3.length, g4.length); i++) { if (g3[i]) mixed.push(g3[i]); if (i % 2 === 1 && g4[(i - 1) / 2]) mixed.push(g4[(i - 1) / 2]); }
    for (const g of g4) if (!mixed.includes(g)) mixed.push(g);
    return mixed.map((g, i) => {
        const opp = OPPONENTS[i % OPPONENTS.length];
        const target = g.gameType === "3c" ? 20 : 20;
        return {
            ...plain(g), id: `00000000-0000-4000-8000-${String(1000 + i).padStart(12, "0")}`, memberId: ME_ID,
            createdAt: dayAgo(i * 2 + 1, 19 + (i % 3)), playedAt: dayAgo(i * 2 + 1, 19 + (i % 3)),
            opponentName: opp, opponentScore: g.isWinner ? target - 2 - (i % 5) : target, targetScore: target,
            locationName: null, subType: null, playTime: 1500 + i * 97,
        };
    });
})();

// 프로와 비교(오너 10/7: "당구 홈 프로와 비교 화면") — 닮은 프로·등급·회원 분포는 운영의 **공개** 비교 API 를 읽기만 해서 진짜 값으로 채운다
// (비로그인 홈이 쓰는 것과 같은 주소, GET, 쿠키 없음). 선수 사진은 싣지 않는다: 사진 주소(/api/hiq/pba/photo)가 가짜 응답으로 가서 이니셜 동그라미가 남는다.
const PROD = "https://www.rankue.co.kr";
const avg3c = Number(B.real["3c"].avg ?? 0.55);
const twin: any = await fetch(`${PROD}/api/hiq/compare/avg?avg=${avg3c.toFixed(2)}`).then((r) => r.json()).then((j) => j.data ?? j).catch(() => null);
const real3c = twin?.pros?.[0]
    ? { ...B.real["3c"], pro: twin.pros[0], next: twin.pros[1] ?? null, tier: twin.tier ?? null, pos: twin.pos ?? null, members: twin.members ?? B.real["3c"].members }
    : B.real["3c"];
console.log("닮은 프로(공개 API):", twin?.pros?.[0] ? `${twin.pros[0].nameKo} ${twin.pros[0].league} ${twin.pros[0].average}` : "못 받음 — 회원끼리 비교로 그려진다");

const billiardsBase: Handler = ({ path, url }) => {
    if (path === "/api/hiq/history") return history;
    if (path === "/api/hiq/rankings") return rankings[(url.searchParams.get("type") === "4c" ? "4c" : "3c")];
    if (path === "/api/hiq/compare/real") return { ...B.real, "3c": real3c, "4c": B.real["4c"] };
    if (path === "/api/hiq/game/ongoing/mine") return null;
    return PASS;
};

const browser = await chromium.launch();

/* ── 02 당구 홈 ───────────────────────────────────────────────── */
if (want("02")) {
    const shot = await openShot(browser, { sport: "BILLIARDS", me, handler: billiardsBase });
    await shot.page.goto(`${BASE}/dashboard`, { waitUntil: "load" });
    await shot.page.waitForTimeout(3500);
    await capture(shot, "02-home");
    report(shot, "02-home");
    await shot.ctx.close();
}

/* ── 01 점수판 — 가로로 찍는다(세로 뷰포트에서는 화면을 90도 돌려 그려 글자가 눕는다) ─────────────── */
if (want("01")) {
    const GAME = "00000000-0000-4000-8000-00000000a001";
    const game = {
        id: GAME, status: "playing", gameType: "3c", gameMode: "match", isRanked: true, sportCategory: "BILLIARDS", storeId: null, tableNumber: null,
        player1Id: ME_ID, player1Name: ME.name, player2Id: null, player2Name: "빈쿠션연습생", player3Id: null, player3Name: null, player4Id: null, player4Name: null,
        player1Target: 20, player2Target: 18, player3Target: 0, player4Target: 0,
        // 이닝 합계 11 + 치는 중 2점 = 13. 둘 다 12이닝을 마쳤고 13이닝째 내 차례다.
        player1Score: 13, player2Score: 11, player3Score: 0, player4Score: 0,
        player1Innings: [1, 0, 2, 0, 1, 3, 0, 1, 0, 2, 0, 1], player2Innings: [0, 1, 0, 2, 1, 0, 0, 3, 1, 0, 2, 1], player3Innings: null, player4Innings: null,
        player1HighRun: 3, player2HighRun: 3, totalInnings: 13, ruleFinishType: "none", finishTargetCount: 0, winnerId: null,
        createdAt: new Date(Date.now() - 23 * 60_000 - 41_000).toISOString(), startedAt: new Date(Date.now() - 23 * 60_000 - 41_000).toISOString(), updatedAt: new Date().toISOString(),
    };
    const shot = await openShot(browser, { sport: "BILLIARDS", me, handler: ({ path, method }) => {
        if (path === `/api/hiq/game/${GAME}` && method === "GET") return game;
        return billiardsBase({ path, method } as any);
    } });
    await shot.page.setViewportSize({ width: 956, height: 440 });
    await shot.page.clock.install();
    await shot.page.goto(`${BASE}/game/${GAME}`, { waitUntil: "load" });
    await shot.page.waitForTimeout(3000);
    // '진행 시간'은 화면에 들어온 뒤로 1초씩 센다 — 23분 41초 뒤의 모습으로
    await shot.page.clock.runFor(23 * 60_000 + 38_000);
    await shot.page.waitForTimeout(400);
    await capture(shot, "01-scoreboard");
    report(shot, "01-scoreboard");
    await shot.ctx.close();
}

/* ── 03 온라인게임 — 게임 중(혼자 치기, 3쿠션 대대). ?cfg= 로 설정 창 없이 바로 시작 ─────────────── */
if (want("03")) {
    const cfg = Buffer.from(JSON.stringify({ gameType: "3c", target: 20, tableId: "DAEDAE", record: false })).toString("base64url");
    const shot = await openShot(browser, { sport: "BILLIARDS", me, handler: billiardsBase, storage: { "rankue.sim.view": "player" } });
    await shot.page.goto(`${BASE}/online-game?cfg=${cfg}`, { waitUntil: "load" });
    await shot.page.waitForTimeout(6000);
    await capture(shot, "03-online-game");
    report(shot, "03-online-game");
    await shot.ctx.close();
}

/* ── 03b 온라인 대전 — 게임 중(오너 10/7: "온라인게임 화면 게임 중"). 대전 행을 가짜로 세운다: 12:9, 내 차례 ─────────── */
if (want("03b")) {
    const MATCH = "00000000-0000-4000-8000-00000000b001";
    const OPP = "00000000-0000-4000-8000-00000000b002";
    const base = createSession({ rules: DEFAULT_3C_RULES, finishType: "none", inningCap: 0, players: [{ id: ME_ID, target: 20, cueBallId: "white" }, { id: OPP, target: 18, cueBallId: "yellow" }] });
    const state = { ...base, turn: 0, shotCount: 41, players: [
        { ...base.players[0], score: 12, innings: 15, highRun: 4, currentRun: 1 },
        { ...base.players[1], score: 9, innings: 14, highRun: 3, currentRun: 0 },
    ] };
    const R = TABLES.DAEDAE.ball.R;
    const ball = (id: string, x: number, y: number) => ({ id, r: [x, y, R], v: [0, 0, 0], w: [0, 0, 0], state: "stationary" });
    // 수구에서 당구대 길이 방향으로 겨누게 놓는다 — 비스듬히 겨누면 3D 시점이 당구대 밖(흰 바탕)을 비춘다
    // (자동 조준은 가까운 적구를 겨눈다 — 빨간 공을 수구 바로 위쪽에 둔다)
    const balls = [ball("white", 0.71, 0.62), ball("red", 0.71, 1.78), ball("yellow", 1.10, 2.28)];
    const started = new Date(Date.now() - 17 * 60_000).toISOString();
    const match = {
        id: MATCH, code: "", status: "playing", gameType: "3c", tableId: "DAEDAE", cushionModel: "han2005", condition: 1, aimAssist: true, fullPreview: false,
        isPublic: true, hasPassword: false, handicap: true, title: null, hostOnline: true, rules: DEFAULT_3C_RULES, finishType: "none", inningCap: 0,
        hostName: ME.name, guestName: "빈쿠션연습생", hostTarget: 20, guestTarget: 18, hostCountry: "KR", guestCountry: "KR",
        myIndex: 0, turn: 0, shots: 41, version: 42, state, balls, winnerIndex: null, endReason: null,
        engineVersion: ENGINE_VERSION, paramsHash: paramsHash({ table: TABLES.DAEDAE, cue: DEFAULT_CUE, cushionModel: "han2005", condition: 1 } as any),
        createdAt: started, startedAt: started, lastShotAt: new Date(Date.now() - 9_000).toISOString(), finishedAt: null,
        turnSeenAt: new Date(Date.now() - 6_000).toISOString(), serverNow: new Date().toISOString(),
        opponentAim: null, chatSeq: 0, opponentAway: false, watchers: 2, timeouts: [0, 0], claimableAt: new Date(Date.now() + 47 * 3_600_000).toISOString(), rematch: null,
    };
    const shot = await openShot(browser, { sport: "BILLIARDS", me, storage: { "rankue.sim.view": "player" }, handler: ({ path, method, url }) => {
        if (path === `/api/hiq/sim/matches/${MATCH}` && method === "GET") return { ...match, serverNow: new Date().toISOString() };
        if (path === `/api/hiq/sim/matches/${MATCH}/shots`) return [];
        if (path === `/api/hiq/sim/matches/${MATCH}/chats`) return [];
        if (path === "/api/hiq/sim/matches" && method === "GET") return [match];
        return billiardsBase({ path, method, url } as any);
    } });
    await shot.page.goto(`${BASE}/online-game?match=${MATCH}`, { waitUntil: "load" });
    await shot.page.waitForTimeout(7000);
    await capture(shot, "03-online-match");
    report(shot, "03-online-match");
    await shot.ctx.close();
}

/* ── 04 경기 기록 ───────────────────────────────────────────── */
if (want("04")) {
    const shot = await openShot(browser, { sport: "BILLIARDS", me, handler: billiardsBase });
    await shot.page.goto(`${BASE}/history`, { waitUntil: "load" });
    await shot.page.waitForTimeout(6000);
    await capture(shot, "04-history");
    report(shot, "04-history");
    await shot.ctx.close();
}

await browser.close();
