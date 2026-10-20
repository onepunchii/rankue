import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AGE_BANDS, ageBandOf, isAgeBand, needsProfileBasics } from "./profileBasics";

describe("프로필 기본 두 가지 — 성별 · 나이대(2026-10-20)", () => {
    it("고른 나이대가 먼저, 없으면 출생연도로", () => {
        expect(ageBandOf({ ageBand: "40s", birthYear: 1995 }, 2026)).toBe("40s");
        expect(ageBandOf({ birthYear: 1995 }, 2026)).toBe("30s");          // 31살
        expect(ageBandOf({ birthYear: 1997 }, 2026)).toBe("20s");          // 29살
        expect(ageBandOf({ birthYear: 1950 }, 2026)).toBe("60s");          // 60 이상은 한 칸
        expect(ageBandOf({ birthYear: 2012 }, 2026)).toBe("10s");
        expect(ageBandOf({ birthYear: 2020 }, 2026)).toBeNull();           // 10살 미만은 모름
        expect(ageBandOf({ ageBand: "70s" as never }, 2026)).toBeNull();   // 모르는 값은 버린다
        expect(ageBandOf(null, 2026)).toBeNull();
    });
    it("배너는 둘 중 하나라도 비었을 때만 — 비로그인은 띄우지 않는다", () => {
        expect(needsProfileBasics({ gender: "male", ageBand: "30s" }, 2026)).toBe(false);
        expect(needsProfileBasics({ gender: "female", birthYear: 1990 }, 2026)).toBe(false);
        expect(needsProfileBasics({ gender: "male" }, 2026)).toBe(true);
        expect(needsProfileBasics({ ageBand: "20s" }, 2026)).toBe(true);
        expect(needsProfileBasics(null, 2026)).toBe(false);
    });
    it("나이대는 여섯 칸 — 순서대로", () => {
        expect(AGE_BANDS).toEqual(["10s", "20s", "30s", "40s", "50s", "60s"]);
        expect(isAgeBand("30s")).toBe(true);
        expect(isAgeBand(30)).toBe(false);
    });
});

const src = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

describe("배너 · 창 · 저장 길 — 네 종목 같은 것", () => {
    it("네 종목 홈에 배너, 창은 App 에 하나", () => {
        expect(src("client/src/pages/hiq/dashboard.tsx")).toContain('<ProfileNudge sport="BILLIARDS"');
        expect(src("client/src/golf/pages/Dashboard.tsx")).toContain('<ProfileNudge sport="GOLF"');
        expect(src("client/src/hiking/pages/HikingHome.tsx")).toContain('<ProfileNudge sport="HIKING"');
        expect(src("client/src/fishing/FishingPage.tsx")).toContain('<ProfileNudge sport="FISHING"');
        expect(src("client/src/App.tsx")).toContain("<ProfileBasicsHost />");
    });
    it("서버: 나이대는 여섯 칸만 받고 null 은 지운다 · 탈퇴하면 지운다 · 크루원이 아니면 지워서 보낸다", () => {
        const me = src("server/routes/modules/member.ts");
        expect(me).toContain("if (isAgeBand(req.body.ageBand)) updateData.ageBand = req.body.ageBand;");
        expect(me).toContain("if (req.body.ageBand === null) { updateData.ageBand = null; updateData.birthYear = null; }");
        expect(src("server/storage/user.repo.ts")).toMatch(/birthYear: null,\s*ageBand: null,\s*gender: null,/);
        expect(src("server/routes/modules/crew.ts")).toContain("member: { ...m.member, birthYear: null, ageBand: null, gender: null },");
    });
    it("창의 약속('같은 크루 안에서만') — 남에게 가는 공개 열에는 출생연도 · 성별이 없다", () => {
        const repo = src("server/storage/user.repo.ts");
        const cols = repo.slice(repo.indexOf("export const PUBLIC_MEMBER_COLUMNS = {"), repo.indexOf("};", repo.indexOf("export const PUBLIC_MEMBER_COLUMNS = {")));
        expect(cols).not.toContain("hiqMembers.birthYear");
        expect(cols).not.toContain("hiqMembers.gender");
        expect(cols).not.toContain("hiqMembers.ageBand");
    });
});
