/**
 * 당구 홈(2026-10-24 오너 "화면이 복잡한가" → 시안 B · 카드 셋 "좋네 진행" → "B 로 기본").
 * ① 내 실력(실전 + 온라인 한 카드) ③ 큐 케이스 허브(등급 · 랭킹 · 월대회 · 대시보드) → 당구 게임 → ② 실전 점수판 → 둘러보기 · 랭킹.
 * 근거: 방문 기록 14일(운영진 제외 72명) — 홈 다음 1위 행선지가 온라인게임인데 입구가 화면 2.1장 아래였고, 홈 탭 1위는 안내 닫기였다.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");
const home = read("client/src/pages/hiq/dashboard.tsx");
const skill = read("client/src/components/hiq/dashboard/HomeSkillCard.tsx");
const board = read("client/src/components/hiq/dashboard/ScoreboardHero.tsx");

describe("당구 홈", () => {
    it("갈래 없이 한 모양 — 시안 주소(?home=b)는 걷었다", () => {
        expect(home).not.toContain('get("home") === "b"');
        expect(home).not.toContain("homeB");
    });
    it("순서 — 내 실력 → 큐 케이스 허브 → 당구 게임 → 실전 점수판 → 둘러보기", () => {
        const order = ["<HomeSkillCard ", "<CueCaseHub />", "<OnlineGameCard />", "<ScoreboardHero ", 'title={t("home.secExplore")}'];
        const at = order.map((s) => home.indexOf(s));
        for (let i = 0; i < at.length; i++) expect(at[i], order[i]).toBeGreaterThan(0);
        for (let i = 1; i < at.length; i++) expect(at[i], order[i]).toBeGreaterThan(at[i - 1]);
    });
    it("첫 안내는 세 단계 — 내 실력 · 큐 케이스 · 실전 점수판(다른 창이 떠 있으면 기다린다 — CoachTour)", () => {
        const tour = home.slice(home.indexOf('<CoachTour id="billiards-home"'), home.indexOf("]} />", home.indexOf('<CoachTour id="billiards-home"')));
        expect(tour.match(/target: "/g)).toHaveLength(3);
        for (const t of ["bh-record", "bh-case", "bh-board"]) expect(home).toContain(`data-tour="${t}"`);
        expect(read("client/src/components/hiq/CoachTour.tsx")).toContain('document.querySelector("[role=dialog]:not([data-testid=coach-tour]), [role=alertdialog]")');
    });
    it("온라인게임에서 돌아오면 당구 게임 구역으로(?sec=game → #home-game)", () => {
        expect(home).toContain('<section id="home-game"');
        expect(home).toContain('document.getElementById("home-game")');
    });
    it("① 배지 모양을 섞지 않는다 — 실전 둥근 메달 · 온라인 방패 · 온라인 다마 육각", () => {
        expect(skill).toContain("<RealMedal game={cur}");
        expect(skill).toContain("<TierEmblem tier={s.tier.id} size={50} glow />");
        expect(skill).toContain("<OnlineDamaBadge target={onlineDama}");
    });
    it("① 실전 칸에 RP · 상위 % 를 두지 않는다(오너 '60RP 랑 상위 빼 줘' 10/24) — 경기 기록으로 가는 길은 그대로", () => {
        expect(skill).not.toContain("home-skill-rp-guide");
        expect(skill).not.toContain("real.stripTop");
        expect(skill).not.toMatch(/>RP</);
        expect(skill).not.toContain("getPercentile");
        // 홈도 그 숫자를 만들지 않는다(3쿠션 랭킹을 따로 부르던 것 · RP 안내 창까지 걷었다)
        expect(home).toContain('<HomeSkillCard onStartMatch={() => handleStartGameClick("match")} history={history as any} sample={sample} />');
        expect(home).not.toContain("getPercentile");
        expect(home).not.toContain("RPGuideModal");
        expect(home).not.toContain('queryKey: ["/api/hiq/rankings", "3c"]');
        expect(skill).toContain('const openHistory = sample ? undefined : () => setLocation("/history");');
    });
    it("① 닮은 프로는 실전 · 온라인 각각, 아래 프로 실력 사다리에 두 자리(오너 '각각 · 그래프가 누락' 10/24) — 3쿠션만", () => {
        const pros = skill.slice(skill.indexOf('{cur === "3c" && ('), skill.indexOf('data-testid="home-skill-table"'));
        expect(pros).toContain('testId="home-skill-pro-real"');
        expect(pros).toContain('testId="home-skill-pro-online"');
        expect(pros).toContain("<ProLadder real={realSpot} online={onlineSpot} />");
        // 실전 기준은 실전 기록(/compare/real)의 프로 · 자리, 온라인 기준은 온라인 기록(/sim/lookalike)의 프로 · 자리 — 섞지 않는다
        expect(skill).toContain("ready ? side?.pro ?? null : null;");
        expect(skill).toContain("ready ? spotOf(side?.tier, side?.pos) : null;");
        expect(skill).toContain("const onlinePro = lk?.ready ? lk.pro : null;");
        expect(skill).toContain("const onlineSpot = lk?.ready ? spotOf(lk.tier, lk.pos) : null;");
        // 예시는 예시 인물의 에버로 공개 API 를 그때 부른다(예시 자료에 실제 선수를 넣지 않는다) — 회원은 부르지 않는다
        expect(skill).toContain("enabled: !!sample && sampleAvg3c != null,");
        // 사다리: 다섯 칸 이름 · 실전 깃발은 위 · 온라인 깃발은 아래(붙어 있어도 겹치지 않게)
        const ladder = skill.slice(skill.indexOf("function ProLadder("));
        expect(ladder).toContain("{real && flag(real, t(\"home.colReal\"), REAL_INK, false)}");
        expect(ladder).toContain("{online && flag(online, t(\"home.colOnline\"), \"#121722\", true)}");
        expect(ladder).toContain("const name = t(`lookalike.tierShort${i}`);");
        // 프로 칸이 생겨 표는 실전 | 온라인 두 열
        expect(skill).toContain('<div className="grid grid-cols-3 bg-surface-3/60');
        expect(skill).not.toContain("grid-cols-4");
    });
    it("② 실전 점수판 — 실제 점수판 모양, 판의 숫자는 미리 보기, 입구는 홈의 두 함수", () => {
        expect(board).toContain('t("home.boardPreview")');
        expect(home).toContain("<ScoreboardHero onStart={handleStartGameClick} onJoin={handleJoinGameClick} />");
    });
    it("당구 게임 — 혼자 치기 · 같이 치기 두 카드를 띄우고, 같이 치기의 방 만들기 단추는 그림 위 하나(오너 '중복 아닌가' 10/24)", () => {
        const game = read("client/src/components/hiq/dashboard/OnlineGameCard.tsx");
        const jsx = game.slice(game.indexOf("    return (\n"));
        expect(jsx).toContain('<div className="space-y-3">');
        // 방 만들기는 하나 — 그림 위 알약. 예전 '멀티방' 알약 · 아래 줄 '방 만들기'는 없다
        expect(jsx.match(/together\("\/online-game\?lobby=1&public=1"\)/g)).toHaveLength(1);
        expect(jsx.match(/t\("sim\.entry\.roomCreate"\)/g)).toHaveLength(1);
        expect(jsx).toContain('data-testid="home-room-create"');
        // 그림(멀티방 목록)과 방 만들기는 형제 단추 — 단추 안에 단추를 두지 않는다
        const art = jsx.slice(jsx.indexOf('onClick={() => together("/online-game?rooms=1")}'), jsx.indexOf('data-testid="home-room-create"'));
        expect(art).toContain("</motion.button>");
        // 아래 줄은 할 말이 있을 때만(비로그인 · 빈 목록 · 넘친 방)
        expect(jsx).toContain("{(gate.isGuest || (shown.length === 0 && !myRoom) || list.length > MAX_ROWS) && (");
    });
    it("문구는 다섯 언어", () => {
        const keys = ["home.skillTitle", "home.skillReal", "home.skillOnline", "home.skillNote", "home.boardTitle", "home.boardStart", "home.caseTitle", "home.caseCounts", "home.caseTier", "tour.bh.caseTitle", "tour.bh.caseBody", "home.skillProReal", "home.skillProOnline", "home.proNeedReal", "home.proNeedOnline", "home.proSoon", "home.proLadder"];
        for (const l of ["ko", "en", "es", "vi", "tr"]) {
            const f = read(`client/src/lib/i18n/${l}.ts`);
            for (const k of keys) expect(f, `${l} ${k}`).toContain(`"${k}":`);
            expect(f, `${l} tour.bh.gameTitle 걷음`).not.toContain('"tour.bh.gameTitle":');
        }
    });
});
