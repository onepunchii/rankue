import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { RETENTION_BENCH, retentionGrade, retentionHeadline, retentionRate, stickinessRate, type RetentionGroup } from "./retention";

/**
 * 회원 리텐션(2026-11-07 오너: "타 플랫폼 대비 리텐션" → "니가 보고 내가 알아보기 쉽게") — 업계와 같은 '그날' 셈 · 업계 평균선 · 한 줄 요약.
 */
const g = (label: string, d1: [number, number], d7: [number, number] = [0, 0], d30: [number, number] = [0, 0]): RetentionGroup => ({
    key: label, label, signed: d1[1],
    days: { 1: { returned: d1[0], eligible: d1[1] }, 7: { returned: d7[0], eligible: d7[1] }, 30: { returned: d30[0], eligible: d30[1] } },
});

describe("셈과 등급", () => {
    it("업계 평균(전 분야, Adjust 2025): 1일째 26 · 7일째 13 · 30일째 7", () => {
        expect(RETENTION_BENCH).toEqual({ 1: 26, 7: 13, 30: 7 });
    });
    it("비율 · 셀 사람이 없으면 null", () => {
        expect(retentionRate({ returned: 21, eligible: 91 })).toBeCloseTo(23.08, 2);
        expect(retentionRate({ returned: 0, eligible: 0 })).toBeNull();
    });
    it("평균 이상 · 평균의 60% 이상은 조금 낮음 · 그 아래 낮음 · 20명 미만은 표본 적음", () => {
        expect(retentionGrade({ returned: 30, eligible: 100 }, 1)).toBe("good");
        expect(retentionGrade({ returned: 23, eligible: 100 }, 1)).toBe("near");
        expect(retentionGrade({ returned: 15, eligible: 100 }, 1)).toBe("low");
        expect(retentionGrade({ returned: 9, eligible: 19 }, 1)).toBe("few");
        expect(retentionGrade({ returned: 7, eligible: 100 }, 30)).toBe("good");
    });
    it("앱 하루/한 달 비율", () => {
        expect(stickinessRate({ appAvgDaily: 12, appMonthly: 104, appOneDay: 59 })).toBeCloseTo(11.54, 2);
        expect(stickinessRate({ appAvgDaily: 0, appMonthly: 0, appOneDay: 0 })).toBeNull();
    });
});

describe("한 줄 요약 — 숫자에서만 고른다", () => {
    it("앱 회원이 평균 근처 · 웹 가입자가 앱의 3분의 1 이하면 '앱으로 넘기는 게 숙제'", () => {
        const lines = retentionHeadline({ app: g("앱", [21, 91]), web: g("웹", [10, 297]), all: g("전체", [31, 406]) });
        expect(lines).toEqual([
            "앱 회원은 다음 날 23%가 다시 와요 — 업계 평균 26%에 조금 못 미쳐요.",
            "웹으로 가입한 회원은 다음 날 3%만 다시 와요 — 웹 가입자를 앱으로 넘기는 게 가장 큰 숙제예요.",
        ]);
    });
    it("앱 회원이 적으면 그렇게 말한다 · 웹 차이가 작으면 숙제라고 하지 않는다", () => {
        expect(retentionHeadline({ app: g("앱", [5, 12]), web: g("웹", [0, 5]), all: g("전체", [5, 17]) })).toEqual(["앱 회원은 아직 셀 사람이 적어요(12명)."]);
        expect(retentionHeadline({ app: g("앱", [30, 100]), web: g("웹", [20, 100]), all: g("전체", [50, 200]) })[1]).toBe("웹으로 가입한 회원은 다음 날 20%가 다시 와요.");
    });
});

describe("서버 · 화면", () => {
    const read = (f: string) => readFileSync(resolve(process.cwd(), f), "utf8");
    it("어드민 접속 요약이 리텐션을 함께 낸다(실패해도 요약은 그대로)", () => {
        const admin = read("server/routes/modules/admin.ts");
        expect(admin).toContain("storage.appSessions.retention().catch(");
        expect(admin).toContain("return sendSuccess(res, { ...summary, retention });");
    });
    it("셈: 사람 단위 · 탈퇴 제외 · 그날(day = N) · 분모는 그날이 지난 사람", () => {
        const repo = read("server/storage/appSession.repo.ts");
        expect(repo).toContain("coalesce(profile_id::text, id::text) as pid");
        expect(repo).toContain("phone is null or phone not like 'del-%'");
        expect(repo).toContain("and day = ${n}) as r${n}");
        expect(repo).toContain("filter (where signed + interval '${n + 1} days' <= now()) as e${n}");
    });
    it("회원 화면 맨 위에 '회원이 다시 오나요' · 옛 표는 '안에 한 번이라도'로 이름을 바꿨다", () => {
        const view = read("client/src/pages/admin/MembersView.tsx");
        expect(view).toContain("{activity.retention && <RetentionPanel r={activity.retention} />}");
        expect(view).toContain("가입 주별 — 그 기간 안에 한 번이라도 다시 왔나");
    });
});
