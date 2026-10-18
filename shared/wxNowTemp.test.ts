import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 오늘의 최저 · 최고가 없을 때(기상청 오후 발표에는 오늘 것이 없다) "– / –" 대신 지금 기온(2026-10-18 디자이너 리뷰).
 * 골프장 날씨의 오늘 줄 · 산의 날씨 맨 위 칸. 지나간 시간을 지어 채우지 않고, 이번 시각(한 시간 뒤까지)의 예보만 '지금'이라 부른다.
 * 산 화면 '가까운 산' 판: 아주 가까운 산이 가운데 표시와 '이 산' 글씨를 덮지 않게 민다.
 */
const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

describe("오늘 줄의 지금 기온 · 가까운 산 판", () => {
    it("골프장 날씨 — 오늘 줄에 nowTmp, 이번 시각 ~ 한 시간 뒤까지만", () => {
        const s = read("client/src/golf/components/course/detail/WeatherCard.tsx");
        expect(s).toContain("nowTmp={d.date === today ? nowTmp : null}");
        expect(s).toContain("return hr >= hNow && hr <= hNow + 1;");
        expect(s).toContain('<span className="mr-1.5 text-[12px] text-[#FFFFFF73]">지금</span>');
    });
    it("산의 날씨 — 최고 기온이 없을 때만 지금 기온", () => {
        const s = read("client/src/hiking/components/MountainParts.tsx");
        expect(s).toContain("if (today.tmx != null) return null;");
        expect(s).toContain(">지금</span>");
    });
    it("가까운 산 판 — 가운데에서 22 안의 산은 민다, '이 산'은 종이색 판 위에", () => {
        const s = read("client/src/hiking/components/NearMe.tsx");
        expect(s).toContain("const r = Math.hypot(px, py), MIN = 22;");
        expect(s).toContain('rx={9.5} fill="#F4EFE3"');
    });
});
