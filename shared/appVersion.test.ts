import { describe, it, expect } from "vitest";
import { APP_UPDATE_POLICY, decideUpdate, parseBuildNumber, shownToday, type UpdatePolicy } from "./appVersion";

const on = (latestBuild: number, minBuild = 0): UpdatePolicy => ({ enabled: true, latestBuild, minBuild });

describe("decideUpdate", () => {
    it("출고 상태는 두 플랫폼 모두 꺼져 있다(오너가 출시 확인 후 켠다)", () => {
        expect(APP_UPDATE_POLICY.ios.enabled).toBe(false);
        expect(APP_UPDATE_POLICY.android.enabled).toBe(false);
        expect(decideUpdate(APP_UPDATE_POLICY.ios, 1)).toBe("none");
        expect(decideUpdate(APP_UPDATE_POLICY.android, null)).toBe("none");
    });
    it("꺼져 있거나 정책이 없으면 아무것도 안 띄운다", () => {
        expect(decideUpdate({ enabled: false, latestBuild: 99, minBuild: 99 }, 1)).toBe("none");
        expect(decideUpdate(undefined, 1)).toBe("none");
    });
    it("최신보다 낮으면 권유, 같거나 높으면 없음", () => {
        expect(decideUpdate(on(7), 6)).toBe("suggest");
        expect(decideUpdate(on(7), 7)).toBe("none");
        expect(decideUpdate(on(7), 8)).toBe("none");
    });
    it("최소보다 낮으면 강제가 권유보다 우선", () => {
        expect(decideUpdate(on(7, 6), 5)).toBe("force");
        expect(decideUpdate(on(7, 6), 6)).toBe("suggest");
    });
    it("minBuild 0 은 강제하지 않는다", () => {
        expect(decideUpdate(on(7, 0), 0)).toBe("suggest");
    });
    it("빌드를 모르면 아주 옛 앱으로 본다", () => {
        expect(decideUpdate(on(7), null)).toBe("suggest");
        expect(decideUpdate(on(7, 6), null)).toBe("force");
        expect(decideUpdate(on(7, 6), NaN)).toBe("force");
    });
});

describe("parseBuildNumber", () => {
    it("App.getInfo().build 문자열을 숫자로", () => {
        expect(parseBuildNumber("7")).toBe(7);
        expect(parseBuildNumber(" 12 ")).toBe(12);
        expect(parseBuildNumber(4)).toBe(4);
    });
    it("못 읽으면 null", () => {
        expect(parseBuildNumber("")).toBeNull();
        expect(parseBuildNumber("abc")).toBeNull();
        expect(parseBuildNumber(undefined)).toBeNull();
        expect(parseBuildNumber(NaN)).toBeNull();
    });
});

describe("shownToday", () => {
    // 현지 시각으로 만든 날짜라 어느 시간대에서 돌려도 결과가 같다
    const at = (d: number, h: number) => new Date(2026, 8, d, h).getTime();
    it("같은 날이면 true, 날이 바뀌면 false", () => {
        expect(shownToday(at(11, 9), at(11, 23))).toBe(true);
        expect(shownToday(at(11, 23), at(12, 0))).toBe(false);
    });
    it("기록이 없거나 미래 시각이면 false", () => {
        expect(shownToday(null, at(11, 9))).toBe(false);
        expect(shownToday(at(12, 9), at(11, 9))).toBe(false);
    });
});
