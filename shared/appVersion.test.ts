import { describe, it, expect } from "vitest";
import { APP_UPDATE_POLICY, compareVersions, decideUpdate, isPolicyActive, isUpToDate, parseBuildNumber, shownToday, type UpdatePolicy } from "./appVersion";

const on = (latestBuild: number, minBuild = 0): UpdatePolicy => ({ enabled: true, latestVersion: "9.9", latestBuild, minBuild });

describe("decideUpdate", () => {
    it("enabled 는 둘 다 false 로 출고(iOS 는 스토어 확인으로 자동, 안드로이드는 출시 후 수동)", () => {
        expect(APP_UPDATE_POLICY.ios.enabled).toBe(false);
        expect(APP_UPDATE_POLICY.android.enabled).toBe(false);
        expect(decideUpdate(APP_UPDATE_POLICY.ios, 1)).toBe("none");
        expect(decideUpdate(APP_UPDATE_POLICY.android, null)).toBe("none");
    });
    it("꺼져 있거나 정책이 없으면 아무것도 안 띄운다", () => {
        expect(decideUpdate({ enabled: false, latestVersion: "9.9", latestBuild: 99, minBuild: 99 }, 1)).toBe("none");
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

describe("iOS 자동 켜기(App Store 에 새 버전이 올라오면)", () => {
    const ios = APP_UPDATE_POLICY.ios;
    it("출고 정책: iOS 는 1.2 가 스토어에 뜨면 자동, 안드로이드는 수동", () => {
        expect(ios.autoFromStore).toBe(true);
        expect(ios.latestVersion).toBe("1.2");
        expect(APP_UPDATE_POLICY.android.autoFromStore).toBeUndefined();
    });
    it("latestBuild 와 latestVersion 은 같은 출시의 두 이름이다 — 하나만 올리면 여기서 걸린다", () => {
        // 새 버전을 낼 때 이 표에 (빌드 → 마케팅 버전)을 추가하고 정책의 두 값을 같이 올린다.
        const RELEASES = { ios: { 7: "1.2" } as Record<number, string>, android: { 5: "1.2.0" } as Record<number, string> };
        expect(RELEASES.ios[APP_UPDATE_POLICY.ios.latestBuild]).toBe(APP_UPDATE_POLICY.ios.latestVersion);
        expect(RELEASES.android[APP_UPDATE_POLICY.android.latestBuild]).toBe(APP_UPDATE_POLICY.android.latestVersion);
    });
    it("스토어가 아직 1.1 이면 안 띄운다", () => {
        expect(decideUpdate(ios, 6, "1.1")).toBe("none");
        expect(decideUpdate(ios, null, "1.1")).toBe("none");
    });
    it("스토어에 1.2 이상이 뜨면 옛 빌드에 권유, 새 빌드엔 없음", () => {
        expect(decideUpdate(ios, 6, "1.2")).toBe("suggest");
        expect(decideUpdate(ios, 2, "1.2.1")).toBe("suggest");
        expect(decideUpdate(ios, 7, "1.2")).toBe("none");
        expect(decideUpdate(ios, 8, "1.3")).toBe("none");
    });
    it("스토어 버전을 모르면(조회 실패) 안 띄운다", () => {
        expect(decideUpdate(ios, 6, null)).toBe("none");
        expect(decideUpdate(ios, 6, undefined)).toBe("none");
        expect(decideUpdate(ios, 6, "beta")).toBe("none");
    });
    it("enabled 가 true 면 스토어 버전과 상관없이 켠다", () => {
        expect(isPolicyActive({ enabled: true, latestVersion: "1.2", latestBuild: 7, minBuild: 0 }, null)).toBe(true);
        expect(isPolicyActive(undefined, "9.9")).toBe(false);
    });
});

describe("isUpToDate", () => {
    it("최신 빌드면 스토어를 물을 필요 없다", () => {
        expect(isUpToDate(APP_UPDATE_POLICY.ios, 7)).toBe(true);
        expect(isUpToDate(APP_UPDATE_POLICY.ios, 8)).toBe(true);
    });
    it("옛 빌드·모르는 빌드는 물어봐야 한다", () => {
        expect(isUpToDate(APP_UPDATE_POLICY.ios, 6)).toBe(false);
        expect(isUpToDate(APP_UPDATE_POLICY.ios, null)).toBe(false);
        expect(isUpToDate(undefined, 7)).toBe(false);
    });
});

describe("compareVersions", () => {
    it("자리별 숫자 비교, 모자란 자리는 0", () => {
        expect(compareVersions("1.2", "1.1")).toBe(1);
        expect(compareVersions("1.2", "1.2.0")).toBe(0);
        expect(compareVersions("1.10", "1.9")).toBe(1);
        expect(compareVersions("1.1.9", "1.2")).toBe(-1);
    });
    it("형식이 아니면 null", () => {
        expect(compareVersions("abc", "1.2")).toBeNull();
        expect(compareVersions("1.2", "")).toBeNull();
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
