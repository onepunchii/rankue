/**
 * 당구 홈 시안 B(2026-10-24 오너 "화면이 복잡한가 · 시안" → 카드 시안 셋 "좋네 진행") — ?home=b 로만, 기본 홈은 그대로.
 * ① 내 실력(실전 + 온라인 한 카드) ③ 큐 케이스 허브(등급 · 랭킹 · 월대회 · 대시보드) → 당구 게임 → ② 실전 점수판 → 둘러보기 · 랭킹.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");
const home = read("client/src/pages/hiq/dashboard.tsx");
const skill = read("client/src/components/hiq/dashboard/HomeSkillCard.tsx");
const hub = read("client/src/components/hiq/cueCase/CueCaseHub.tsx");
const board = read("client/src/components/hiq/dashboard/ScoreboardHero.tsx");

describe("홈 시안 B", () => {
    it("?home=b 일 때만 — 기본 홈(A)의 마크업이 먼저 그대로 있고, B 는 그 뒤 갈래", () => {
        expect(home).toContain('get("home") === "b"');
        const a = home.indexOf("{!homeB ? (");
        const b = home.indexOf("<HomeSkillCard ");
        expect(a).toBeGreaterThan(0);
        expect(home.indexOf("<RealHandicapCard")).toBeGreaterThan(a);
        expect(home.indexOf("<RealHandicapCard")).toBeLessThan(b);
    });
    it("B 의 순서 — 내 실력 → 큐 케이스 허브 → 당구 게임 → 실전 점수판 → 둘러보기", () => {
        const order = ["<HomeSkillCard ", "<CueCaseHub />", "<OnlineGameCard />", "<ScoreboardHero ", 'title={t("home.secExplore")}'];
        const at = order.map((s) => home.lastIndexOf(s));
        for (let i = 1; i < at.length; i++) expect(at[i], order[i]).toBeGreaterThan(at[i - 1]);
    });
    it("① 배지 모양을 섞지 않는다 — 실전 둥근 메달 · 온라인 방패 · 온라인 다마 육각", () => {
        expect(skill).toContain("<RealMedal game={cur}");
        expect(skill).toContain("<TierEmblem tier={s.tier.id} size={50} glow />");
        expect(skill).toContain("<OnlineDamaBadge target={onlineDama}");
    });
    it("① 비로그인에게 온라인 예시 숫자를 만들지 않는다 · 고른 종목에 대전이 없으면 다른 종목 등급을 끌어오지 않는다", () => {
        expect(skill).toContain("const playedHere = !sample && boards.some((b) => b.gameType === cur && b.matches > 0);");
        expect(skill).toContain("const onlineDama = !sample ? handi?.target ?? null : null;");
    });
    it("③ 큐 케이스 허브 — 랭킹 · 월대회 · 대시보드 세 칸, 회원 화면은 가입 안내로 잇는다", () => {
        for (const id of ["home-case-rank", "home-case-cup", "home-case-dash", "home-case-tier", "home-case-open"]) expect(hub).toContain(`"${id}"`);
        expect(hub).toContain("const go = (to: string) => gate.guard(");
    });
    it("② 실전 점수판 — 실제 점수판 모양(공 색 두 칸), 판의 숫자는 미리 보기, 입구는 홈의 두 함수", () => {
        expect(board).toContain('t("home.boardPreview")');
        expect(home).toContain("<ScoreboardHero onStart={handleStartGameClick} onJoin={handleJoinGameClick} />");
    });
    it("문구는 다섯 언어", () => {
        const keys = ["home.skillTitle", "home.skillReal", "home.skillOnline", "home.skillNote", "home.boardTitle", "home.boardStart", "home.caseTitle", "home.caseCounts", "home.caseTier"];
        for (const l of ["ko", "en", "es", "vi", "tr"]) {
            const f = read(`client/src/lib/i18n/${l}.ts`);
            for (const k of keys) expect(f, `${l} ${k}`).toContain(`"${k}":`);
        }
    });
});
