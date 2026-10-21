import { describe, expect, it, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";

/** 앱 안 기록 표시(2026-10-21 오너: "다시보기 하고 나가면 초대 만들기 화면이 나오던가 이런 중복 페이지가 많이 보이는데") */
describe("앱 안 기록 표시(lib/inAppHistory)", () => {
    let mod: typeof import("../lib/inAppHistory");
    beforeAll(async () => {
        const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://www.rankue.co.kr/dashboard" });
        (globalThis as unknown as { window: unknown }).window = dom.window;
        mod = await import("../lib/inAppHistory");
        mod.installInAppHistory();
    });
    it("첫 칸(링크 · 알림으로 바로 들어온 화면)은 앱 안이 아니다 → 밀어 넣은 칸은 앱 안 → 바꿔 끼워도 이어진다 · 원래 state 는 남긴다", () => {
        const h = (globalThis as unknown as { window: Window }).window.history;
        expect(mod.cameInApp()).toBe(false);
        h.pushState({ rkTank: 1 }, "", "/online-game?dash=1");
        expect(mod.cameInApp()).toBe(true);
        expect((h.state as Record<string, unknown>).rkTank).toBe(1);
        h.replaceState(null, "", "/online-game?match=x");
        expect(mod.cameInApp()).toBe(true);
    });
});

describe("온라인게임 — 닫기 · 나가기는 온 곳으로", () => {
    const sp = readFileSync(resolve(__dirname, "./SimulatorPage.tsx"), "utf8");
    it("대전 나가기 · 목록 닫기 · 다시보기 나가기가 backOr(앱 안이면 한 칸 뒤로)", () => {
        expect(sp).toContain("const backOr = useCallback((fallback: string) => { if (cameInApp()) window.history.back(); else navigate(fallback, { replace: true }); }, [navigate]);");
        expect(sp).toContain("if (isMatch) { startedMatchRef.current = null; backOr(ENTRY_PATH); }");
        expect(sp).not.toContain('if (isMatch) navigate("/online-game?lobby=1", { replace: true });');
        expect(sp).toContain('<WatchPage matchId={watchId} onExit={() => backOr("/online-game?rooms=1")} />');
        expect(sp).not.toContain("onClose={() => navigate(ENTRY_PATH, { replace: true })}");
        expect(read("./watch/WatchPage.tsx")).not.toContain('navigate("/online-game?rooms=1")}');
    });
    it("다시보기 위에서는 게임 중이 아니다(뒤로가기가 나가기 확인을 열지 않는다) · 돌아오면 결과 창이 다시 뜬다", () => {
        expect(sp).toContain('const inGame = sim.phase !== "setup" && !watchId;');
        expect(sp).toContain('const endOpen = sim.phase === "finished" && !endDismissed && !exitOpen && !watchId;');
        expect(sp).toContain("desc={isMatch && !finished ? t(\"sim.match.leaveDesc\") : undefined}");
    });
    it("대기실에서 시작된 대전은 로비 칸을 바꿔 끼운다 · 로비 제목은 보이는 것에 맞춘다", () => {
        expect(sp).toContain("onStarted={openStartedMatch}");
        expect(read("./match/MatchLobby.tsx")).toContain('waiting ? t("sim.match.myRoomTitle")');
    });
});
const read = (p: string) => readFileSync(resolve(__dirname, p), "utf8");
