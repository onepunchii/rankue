import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 코치마크(2026-10-14) — 화면의 실제 단추를 비추며 짚어 주는 첫 안내. 종목마다 톤이 다르고, 화면마다 한 번이다.
const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

describe("코치마크", () => {
    const tour = read("client/src/components/hiq/CoachTour.tsx");
    it("한 번만 — 끝내거나 건너뛰면 기억하고, 설정에서 다시 볼 수 있다", () => {
        expect(tour).toContain("const KEY = (id: string) => `rankue_tour_${id}`;");
        expect(tour).toContain("export function resetTours(): void {");
        const settings = read("client/src/pages/hiq/settings.tsx");
        expect(settings).toContain("resetTours(); toast({ title: t(\"tour.resetDone\") });");
        // 다른 창(가입 · 설치 팝업 · 확인창)이 떠 있으면 기다린다 · 기기의 '뒤로'는 투어를 닫는다
        expect(tour).toContain("isLoginSheetOpen() || !!document.querySelector(\"[role=dialog]:not([data-testid=coach-tour]), [role=alertdialog]\")");
        expect(tour).toContain("useBackToClose(open, () => finish(\"건너뜀\"));");
        // 시작 · 건너뜀 · 끝을 방문자 발자국에
        expect(tour).toContain("trailOpen(`도움말 시작 · ${id}`)");
    });
    it("종목마다 톤 — 골프 야디지북 · 당구 공 네 개 · 등산 리본 · 낚시 낙관", () => {
        for (const tone of ["golf", "billiards", "hiking", "fishing"]) expect(tour).toContain(`${tone}: { card:`);
        expect(tour).toContain("HOLE {i + 1}/{n}");
        expect(tour).toContain('const balls = ["#FFFFFF", "#F5C518", "#D7263D", "#D7263D"];');
        expect(tour).toContain("{i + 1} / {n} 구간");
    });
    it("네 화면 — 당구 점수판(상자 안 · 첫 점수 전) · 골프 라운드 방(1번 홀) · 등산 산행 시작 전 · 낚시 홈", () => {
        const board = read("client/src/pages/hiq/game/[id].tsx");
        expect(board).toContain('<CoachTour id="billiards-scoreboard" tone="billiards" inside={boardRef} when={!spectating && !canUndo && view.innings === 1 && game.status !== "finished"}');
        for (const [f, tag] of [["client/src/components/hiq/game/PlayerCard.tsx", "bb-card"], ["client/src/components/hiq/game/PlayerCard.tsx", "bb-inning"], ["client/src/components/hiq/game/ScoreboardBottomBar.tsx", "bb-undo"], ["client/src/components/hiq/game/ScoreboardBottomBar.tsx", "bb-exit"]]) expect(read(f), tag).toContain(`data-tour="${tag}"`);
        const golf = read("client/src/golf/pages/GamePage.tsx");
        expect(golf).toContain('<CoachTour id="golf-round" tone="golf" when={session.status === "playing" && currentHole === 0}');
        for (const tag of ["golf-onsite", "golf-score", "golf-next", "golf-exit"]) expect(golf, tag).toContain(`data-tour="${tag}"`);
        const trail = read("client/src/hiking/pages/TrailPage.tsx");
        expect(trail).toContain('<CoachTour id="hiking-trail" tone="hiking" when={!active && !done && !!course}');
        for (const tag of ["hk-ribbon", "hk-map", "hk-start", "hk-screen"]) expect(trail, tag).toContain(`data-tour="${tag}"`);
        const fish = read("client/src/fishing/FishingPage.tsx");
        expect(fish).toContain('<CoachTour id="fishing-home" tone="fishing"');
        for (const tag of ["fs-fish", "fs-map", "fs-add"]) expect(fish, tag).toContain(`data-tour="${tag}"`);
    });
    it("홈 세 곳 · 크루 두 곳(2026-10-15) — 홈은 세 단계까지, 크루는 그 종목의 톤", () => {
        const homes: [string, string, string[]][] = [
            ["client/src/golf/pages/Dashboard.tsx", '<CoachTour id="golf-home" tone="golf"', ["gh-play", "gh-stamps", "gh-courses"]],
            ["client/src/hiking/pages/HikingHome.tsx", '<CoachTour id="hiking-home" tone="hiking" when={!s.isLoading}', ["hh-find", "hh-grade", "hh-map"]],
            ["client/src/pages/hiq/dashboard.tsx", '<CoachTour id="billiards-home" tone="billiards"', ["bh-record", "bh-board", "bh-game"]],
            ["client/src/pages/hiq/club.tsx", '<CoachTour id="crew-list" tone={tourToneOf(sport)}', ["cl-mine", "cl-search", "cl-create"]],
            ["client/src/pages/hiq/club-detail.tsx", '<CoachTour id="crew-detail" tone={tourToneOf(crew.sportCategory)}', ["cd-tabs", "cd-chat", "cd-menu"]],
        ];
        for (const [f, call, tags] of homes) {
            const src = read(f);
            expect(src, f).toContain(call);
            for (const tag of tags) expect(src, `${f} ${tag}`).toMatch(new RegExp(`data-tour=(\\{[^}]*)?"${tag}"`));
        }
        const keys = ["recordTitle", "recordBody", "boardTitle", "boardBody", "gameTitle", "gameBody"].map((k) => `tour.bh.${k}`)
            .concat(["mineTitle", "mineBody", "searchTitle", "searchBody", "createTitle", "createBody"].map((k) => `tour.cl.${k}`))
            .concat(["tabsTitle", "tabsBody", "chatTitle", "chatBody", "menuTitle", "menuAdminBody", "menuMemberBody"].map((k) => `tour.cd.${k}`));
        for (const l of ["ko", "en", "vi", "tr", "es"]) {
            const f = read(`client/src/lib/i18n/${l}.ts`);
            for (const k of keys) expect(f, `${l} ${k}`).toContain(`"${k}":`);
        }
        expect(tour).toContain('sport === "GOLF" ? "golf" : sport === "HIKING" ? "hiking" : sport === "FISHING" ? "fishing" : "billiards"');
    });
    it("온라인게임 조작부 — 당점 · 큐 각 · 세기 · 샷을 짚고, 설명 시트로 이어진다(2026-10-15)", () => {
        const page = read("client/src/sim/SimulatorPage.tsx");
        expect(page).toContain('<CoachTour id="sim-controls" tone="billiards" when={!pathView && sim.phase === "aim"} replay={coachReplay} steps={controlSteps} />');
        for (const tag of ["sim-spin", "sim-elev", "sim-power", "sim-shot"]) expect(page, tag).toContain(`"${tag}"`);
        expect(page).toContain("onHelp={() => { setSpinSheet((x) => ({ ...x, open: false })); setGuideOpen(true); }}");
        expect(page).toContain('<ControlsGuide open={guideOpen} onOpenChange={setGuideOpen} />');
        expect(page).not.toContain("CoachHint");
        expect(read("client/src/sim/components/ToolRail.tsx")).toContain("data-tour={item.tour}");
        expect(read("client/src/sim/components/PowerRail.tsx")).toContain("data-tour={tour}");
        expect(read("client/src/sim/components/ShotButton.tsx")).toContain("data-tour={tour}");
        const keys = ["tour.sim.spinTitle", "tour.sim.spinBody", "tour.sim.elevTitle", "tour.sim.elevBody", "tour.sim.powerTitle", "tour.sim.powerBody", "tour.sim.shotTitle", "tour.sim.shotBody",
            "sim.guide.open", "sim.guide.title", "sim.guide.spinTitle", "sim.guide.spinBody", "sim.guide.elevTitle", "sim.guide.elevBody", "sim.guide.powerTitle", "sim.guide.powerBody"];
        for (const l of ["ko", "en", "vi", "tr", "es"]) {
            const f = read(`client/src/lib/i18n/${l}.ts`);
            for (const k of keys) expect(f, `${l} ${k}`).toContain(`"${k}":`);
        }
    });
    it("문구는 다섯 언어(당구 점수판 · 설정은 모든 언어 화면) — 단추 이름은 실제 이름과 같게", () => {
        const keys = ["tour.skip", "tour.next", "tour.done", "tour.resetTitle", "tour.resetDesc", "tour.resetAction", "tour.resetDone",
            "tour.bb.cardTitle", "tour.bb.cardBody", "tour.bb.inningTitle", "tour.bb.inningBody", "tour.bb.undoTitle", "tour.bb.undoBody", "tour.bb.exitTitle", "tour.bb.exitBody"];
        for (const l of ["ko", "en", "vi", "tr", "es"]) {
            const f = read(`client/src/lib/i18n/${l}.ts`);
            for (const k of keys) expect(f, `${l} ${k}`).toContain(`"${k}":`);
            const label = (k: string) => (f.match(new RegExp(`"${k.replace(".", "\\.")}": "([^"]+)"`)) ?? [])[1];
            const inning = (f.match(/"tour\.bb\.inningBody": "([^"]+)"/) ?? [])[1] ?? "", exit = (f.match(/"tour\.bb\.exitBody": "([^"]+)"/) ?? [])[1] ?? "";
            expect(inning, `${l} 이닝 단추 이름`).toContain(label("playerCard.endInning")!);
            expect(exit, `${l} 종료 단추 이름`).toContain(label("scoreboardBottomBar.exit")!);
        }
    });
});
