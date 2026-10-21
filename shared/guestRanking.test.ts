import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

/** 비로그인 랭킹(2026-10-21) — 로그인 카드 밑에 글 링크 세 줄 대신, 로그인 없이 볼 수 있는 것을 그 자리에서 */
describe("비로그인 랭킹 미리 보기", () => {
    it("세계 · PBA 상위 셋 · 전국 당구장 지도 — 공개 API 만, 못 받으면 그 카드는 안 그린다", () => {
        expect(read("client/src/pages/hiq/ranking.tsx")).toContain("<GuestRankingPreview />");
        const c = read("client/src/components/hiq/GuestRankingPreview.tsx");
        expect(c).toContain('queryKey: ["/api/hiq/umb/rankings?limit=3"]');
        expect(c).toContain('queryKey: ["/api/hiq/pba/rankings?league=PBA"]');
        expect(c).toContain("{umbRows.length > 0 && (");
        expect(c).toContain("{pbaRows.length > 0 && (");
        expect(c).toContain("<StoreTableBanner");
    });
    it("LoginGate 의 미리 보기 칸은 위에서부터 — 다른 화면(기록 · 친구)은 그대로 가운데", () => {
        const g = read("client/src/components/hiq/LoginGate.tsx");
        expect(g).toContain('${children ? "justify-start pt-8" : "justify-center"}');
    });
});

describe("비로그인 기록(2026-10-21)", () => {
    it("당구는 예시 인물의 '내 실전 기록'(홈과 같은 sample 갈래 — '예시' 표시 · 공유 없음), 골프는 그리지 않는다", () => {
        const h = readFileSync(resolve(__dirname, "../client/src/pages/hiq/history.tsx"), "utf8");
        expect(h).toContain('{(currentSport as string) !== "GOLF" ? <RealHandicapCard sample={GUEST_SAMPLE.billiards} onStartMatch={() => goLogin(setLocation)} /> : null}');
    });
});
