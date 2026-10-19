import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 크루 대회 "만들면 화면이 먹통"(2026-10-19 오너 신고) — 접수 중인 대회 화면이 다시 받지 않아, 크루장이 참가 신청하고 상대를 기다리면
 * 상대가 들어와도 '참가자 1'에 멈춰 '대진 짜기'가 안 떴다(iOS 시뮬레이터 사파리 + 가짜 응답으로 재현 · 고친 뒤 5초 안에 나타남).
 * 크루장 기록: 9/26 뒤 열네 번 모두 대회를 만든 지 4~22초 안에 앱이 닫혔다(껐다 켜서 넘어간 흔적).
 * 명예의 전당의 '뒤로'가 대회 목록을 새로 쌓아 두 화면 사이에 갇히던 것도 같이(10/18 기록 — 30초에 여덟 번 오감).
 */
const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

describe("크루 대회 — 남이 바꾸는 화면은 다시 받는다", () => {
    it("접수 중에도 다시 받는다(5초), 앱으로 돌아오면 바로", () => {
        const s = read("client/src/components/hiq/tabs/CrewTournamentTab.tsx");
        expect(s).toContain('return st === "recruiting" ? 5_000 : st === "drawn" || st === "ongoing" ? 10_000 : false;');
        expect(s).toContain("refetchOnWindowFocus: true,");
    });
    it("명예의 전당 '뒤로'는 온 곳으로(주소로 바로 왔으면 대회 목록)", () => {
        const s = read("client/src/pages/hiq/crew-hall-of-fame.tsx");
        expect(s).toContain("const back = () => (window.history.length > 1 ? window.history.back() : setLocation(`/crew/${id}/tournament`));");
    });
});
