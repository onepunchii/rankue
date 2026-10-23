/**
 * 실전 점수판 넷(2026-10-23 오너: "다크 모드, 초구 정하기, 이닝별 득점표, 오프라인 보관") — 화면 · 훅 · 서버 연결 소스 검사.
 * 규칙 자체는 shared/scoreboardOrder.test · shared/scoreboardStash.test 가 본다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const src = (p: string) => readFileSync(resolve(__dirname, "../client/src", p), "utf8");
const root = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const hook = src("hooks/useGameScore.ts");
const page = src("pages/hiq/game/[id].tsx");
const card = src("components/hiq/game/PlayerCard.tsx");
const bar = src("components/hiq/game/ScoreboardBottomBar.tsx");
const sheet = src("components/hiq/game/InningHistoryModal.tsx");
const css = src("index.css");
/** 점수판 상자 안 — LandscapeGuard 가 감싼 부분 */
const box = page.slice(page.indexOf("<LandscapeGuard"), page.indexOf("</LandscapeGuard>"));

describe("기기 보관(오프라인)", () => {
    it("바뀐 즉시(디바운스 전에) 기기에 적는다 — 앱이 꺼지는 것은 400ms 를 기다려 주지 않는다", () => {
        const eff = hook.slice(hook.indexOf("latestStateRef.current = gameState;"), hook.indexOf("}, [gameState]);"));
        expect(eff.indexOf("persistStash()")).toBeGreaterThan(0);
        expect(eff.indexOf("persistStash()")).toBeLessThan(eff.indexOf("setTimeout("));
    });
    it("저장은 보내기 전에 지문을 기억하고, 서버가 받았다고 답하면 ackedSeq 를 올린다", () => {
        const fn = hook.slice(hook.indexOf("const updateScoreMutation = useMutation({"), hook.indexOf("const requestSave = () => {"));
        expect(fn.indexOf("withKnown(stashRef.current.known, stateFingerprint(s))")).toBeGreaterThan(0);
        expect(fn.indexOf("withKnown(")).toBeLessThan(fn.indexOf("await apiRequest(`/api/hiq/game/${id}/score`"));
        expect(fn).toContain("return { seq };");
        expect(fn).toContain("stashRef.current.ackedSeq = Math.max(stashRef.current.ackedSeq, data?.seq ?? 0);");
        expect(fn).toContain("setUnsaved(true)");
    });
    it("열 때 — 회원 확인을 기다린 뒤, 호스트면 pickRestore 로 되살릴지 정한다. 끝난 경기 · 버린 경기 · 사라진 경기는 지운다", () => {
        expect(hook).toContain("if (authLoading) return;");
        expect(hook).toContain("const back = pickRestore(stash, game as any, now);");
        expect(hook).toContain('if (game.status === "finished") { clearStash(boardStorage(), id); return; }');
        expect(hook).toContain("if (error && isGameGone(error)) clearStash(boardStorage(), id);");
        expect((hook.match(/clearStash\(boardStorage\(\), id\);/g) ?? []).length).toBeGreaterThanOrEqual(4);
    });
    it("화면 — 보내지 못한 점수가 있으면 '진행 시간' 자리에 '기기에 보관 중', 되살렸으면 상자 안에 알림", () => {
        expect(page).toContain("unsaved={unsaved}");
        expect(bar).toContain('data-testid="board-unsaved"');
        expect(box).toContain('data-testid="board-restored"');
    });
});

describe("초구 정하기", () => {
    it("저장 — 점수 저장에 breakPlayer, 서버는 1~4 만, 스키마 칸 · 마이그레이션(더하기만)", () => {
        expect(hook).toContain("breakPlayer: s.breaker,");
        expect(root("server/routes/modules/game.ts")).toContain("if (Number.isInteger(bp) && bp >= 1 && bp <= 4) updateData.breakPlayer = bp;");
        expect(root("shared/schema.ts")).toContain('breakPlayer: integer("break_player"),');
        expect(existsSync(resolve(__dirname, "../migrations/hiq_games_break_player.sql"))).toBe(true);
        const sql = root("migrations/hiq_games_break_player.sql");
        expect(sql).toContain("alter table hiq_games add column if not exists break_player integer;");
        expect(sql).not.toMatch(/drop\s+(table|column)\s+(?!break_player)/i);
    });
    it("차례 · 이닝은 초구부터 — 이닝은 배열에서 끌어내고, 새로고침도 초구를 본다", () => {
        expect(hook).toContain("next.innings = inningOf([next.p1Innings, next.p2Innings, next.p3Innings, next.p4Innings], prev.breaker ?? 1, nextTurn);");
        expect(hook).toContain("const derivedTurn = turnFromArrays(inningArrays, breaker, activeCount);");
        expect(hook).not.toContain("if (nextTurn === 1 && prev.currentTurn !== 1)");
    });
    it("경기 모드(카드로 차례를 넘김)도 새 이닝이면 이닝 번호를 이름과 한 번에 부른다", () => {
        expect(hook).toContain("const newInning = playerIndex === (gameState.breaker ?? 1);");
        expect(hook).toContain('if (newInning) speak(`${t("tts.inningPrefix")}${gameState.innings + 1}${t("tts.inningSuffix")}${call ? `, ${call}` : ""}`);');
    });
    it("화면 — 공 색은 치는 순서(초구 = 흰 공), 아무도 안 쳤을 때만 '초구로'", () => {
        expect(page).toContain("const theme = themeOf(playerId);");
        expect(page).toContain('breakState={totalPlayers > 1 ? (breaker === playerId ? "is" : canChooseBreak ? "choose" : undefined) : undefined}');
        expect(page).not.toContain("THEMES[");
        expect(card).toContain('data-testid="board-break-choose"');
        expect(card).toContain("onClick={(e) => { e.stopPropagation(); onChooseBreak(); }}");
        // 머리줄은 끌기 손잡이(dnd-kit) — 마우스 센서가 지연 없이 끌기를 시작해 클릭을 삼켰다(하니스에서 겪음). 누르기 시작을 올려 보내지 않는다
        for (const ev of ["onPointerDown", "onMouseDown", "onTouchStart"]) expect(card).toContain(`${ev}={(e) => e.stopPropagation()}`);
        expect(hook).toContain("const canChooseBreak = !!game && !spectating && totalPlayers > 1 && canChooseBreaker(gameState, totalPlayers);");
    });
    it("결과 공유 카드도 초구가 흰 공", () => {
        const result = src("pages/hiq/game/result.tsx");
        expect(result).toContain("const breaker = breakerOf(game.breakPlayer, totalPlayers);");
        for (const n of [1, 2, 3, 4]) expect(result).toContain(`ball: ballOf(${n}),`);
        expect(src("components/hiq/game/ShareResultCard.tsx")).toContain("BALLS[p.ball ?? i]");
    });
});

describe("이닝별 득점표", () => {
    it("점수판 상자 안에 그린다(body 창은 세로 점수판 밑에 깔린다) — 이닝 공 · 관전 줄의 이닝을 누르면 열린다", () => {
        expect(box).toContain("<InningHistoryModal");
        expect(sheet).toContain('className="absolute inset-0 z-[60]');
        expect(sheet).toContain('role="dialog"');
        expect(sheet).not.toContain("@/components/ui/dialog");
        expect(page).toContain("onInnings={() => setInningsOpen(true)}");
        expect(bar).toContain("onClick={onInnings}");
        expect((page.match(/setInningsOpen\(true\)/g) ?? []).length).toBe(2);
    });
    it("줄은 치는 순서, 칸은 이닝 — 지금 치는 칸 · 합계 · 에버 · 하이런, 열면 마지막 이닝 쪽으로 민다", () => {
        expect(page).toContain("const inningRows: InningRow[] = playOrder(breaker, Math.max(1, totalPlayers)).map((slot) => {");
        expect(page).toContain("avg: getAvg(score, slot, target),");
        expect(sheet).toContain("el.scrollLeft = el.scrollWidth;");
        expect(sheet).toContain('isLive && "ring-2 ring-brand font-bold text-ink-1"');
    });
});

describe("다크 모드", () => {
    it("기기마다 기억하고(처음엔 밝게), 점수판 · 바깥 상자에 어두운 토큰을 준다", () => {
        expect(page).toContain('const BOARD_THEME_KEY = "rankue.board.theme";');
        expect(page).toContain('<LandscapeGuard className={dark ? "sim-dark" : ""}>');
        expect(page).toContain('className={`rk-board ${dark ? "sim-dark board-dark" : ""} h-full bg-surface-0 text-ink-1');
        expect(bar).toContain('data-testid="board-theme"');
        expect(css).toContain(".rk-board.board-dark {");
        expect(css).toContain("--brand: 100 221 23;");
    });
    it("카드 · 하단 바에 박힌 밝은 색이 남지 않았다 — 토큰으로만", () => {
        for (const [name, f] of [["PlayerCard", card], ["ScoreboardBottomBar", bar], ["InningHistoryModal", sheet]] as const) {
            expect(f, name).not.toMatch(/\bbg-white\b/);
            expect(f, name).not.toMatch(/text-black\/|bg-black\/\[|border-black\//);
            expect(f, name).not.toContain("text-[rgba(0,0,0,0.87)]");
        }
        expect(card).toContain("export function playerThemeColor(theme: string, dark = false): string {");
    });
});

describe("연속 득점 칩(2026-10-23 오너: '투명도 버튼보다 다른 디자인으로')", () => {
    it("꽉 찬 칩이 숫자 밑에 — 반투명 · 숫자에 겹치던 -20px 은 없다", () => {
        expect(card).toContain('className="mt-3 inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-brand text-brand-fg');
        expect(card).not.toContain("bg-brand/15 border border-brand/25");
        expect(card).not.toContain("mt-[-20px]");
    });
});

describe("문구 — 다섯 언어", () => {
    const keys = ["playerCard.breakShot", "playerCard.makeBreak", "tts.breakShot", "scoreboardBottomBar.darkMode", "scoreboardBottomBar.lightMode",
        "scoreboardBottomBar.keptOnDevice", "gameScoreboard.restored", "inningHistoryModal.total", "inningHistoryModal.liveHint"];
    it("새 키가 다섯 사전에 한 번씩", () => {
        for (const l of ["ko", "en", "es", "vi", "tr"]) {
            const f = src(`lib/i18n/${l}.ts`);
            for (const k of keys) expect((f.match(new RegExp(`"${k.replace(/\./g, "\\.")}":`, "g")) ?? []).length, `${l} ${k}`).toBe(1);
        }
    });
});
