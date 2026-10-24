/**
 * 낚시 방문자 화면(2026-10-24 오너: "낚시 비로그인시에 골프랑 등산처럼 해당 페이지 스타일로") — 소스 검사.
 * 공개 낚시 화면은 FishingShell 하나: 낚시를 쓰는 회원 → 하단 탭 · 방문자 → 머리줄 '로그인' + 아래 가입 단추 · 그 밖 → 없음.
 * 예전엔 누구에게나 회원용 하단 탭(오늘 바다 · 크루 · 수족관 · 일지 · 채팅)을 그려 방문자가 누르면 전부 가입 안내였다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const src = (p: string) => readFileSync(resolve(__dirname, "../client/src", p), "utf8");
const shell = src("fishing/FishingShell.tsx");
const spots = src("fishing/spots/SpotsPages.tsx");
const fest = src("festivals/FestShell.tsx");
const page = src("fishing/FishingPage.tsx");
const home = src("fishing/spots/GuestHome.tsx");

describe("낚시 공개 틀(FishingShell) — 등산 · 골프와 같은 규칙", () => {
    it("하단 탭은 낚시를 쓰는 회원에게만, 방문자에겐 '로그인'과 아래 가입 단추", () => {
        expect(shell).toContain("const fishingOk = useFishingAccess() && nav;");
        expect(shell).toContain("{fishingOk && <HiqNavigation />}");
        expect(shell).toContain("const guest = !isLoading && !member;");
        expect(shell).toContain('data-testid="fishing-login"');
        expect(shell).toContain('data-track-as="fishing-join"');
        expect(shell).toContain('export const FISHING_JOIN_CTA = "가입하고 내 어탁 모으기";');
        // 회원이 보던 낚시 머리줄 그대로
        expect(shell).toContain('<SportBackHeader');
        expect(shell).toContain('sport="FISHING"');
    });
    it("낚시터 · 바다 · 항구 · 어종 · 금어기(Shell)와 낚시 축제가 이 틀을 쓴다 — 하단 탭을 따로 그리지 않는다", () => {
        expect(spots).toContain("return <FishingShell title={title} backTo={FISHING_SPOTS_PATH}>{children}</FishingShell>;");
        expect(spots).not.toContain("<HiqNavigation />");
        expect(fest).toContain('if (sport === "FISHING") return <FishingShell title={title} backTo={back} right={right}>');
        expect(fest).not.toContain("<HiqNavigation />");
    });
});

describe("방문자 첫 화면 · 회원 화면", () => {
    it("/fishing 방문자 → 공개 낚시 홈, 회원 화면(수족관 · 일지 …) → 같은 틀 안의 안내(벽 아님)", () => {
        expect(page).toContain('if (tab === "home") return <FishingGuestHome />;');
        expect(page).toContain('<FishingShell title={TAB_TITLE[tab]} backTo="/fishing">');
        expect(page).not.toContain('className="flex min-h-screen flex-col items-center justify-center gap-3 px-8 text-center"');
    });
    it("공개 홈 — 오늘 바다 · 전국 낚시터 · 입구 넷 · '예시' 어탁(가입하면 쓰는 것). 공개 주소로만 보낸다", () => {
        for (const id of ["fishing-guest-home", "fishing-guest-sea", "fishing-guest-spots", "fishing-guest-tiles", "fishing-guest-sample"]) expect(home, id).toContain(`"${id}"`);
        expect(home).toContain('<FishingShell title="랭큐 낚시" backTo="/">');
        expect(home).toContain(">예시</span>");
        for (const p of ["FISHING_SEA_PATH", "FISHING_SPOTS_PATH", "FISHING_FISH_PATH", "FISHING_CLOSED_PATH", '"/fishing/festivals"']) expect(home, p).toContain(p);
        // 회원 화면으로 보내는 링크가 없다(누르면 가입 안내로 가는 길을 만들지 않는다)
        for (const p of ["/fishing/tank", "/fishing/log", "/fishing/book", "/fishing/trip", "/dashboard"]) expect(home, p).not.toContain(`"${p}"`);
    });
});
