import { describe, it, expect } from "vitest";
import { parseNativeGeneration, meetsRequirement, isNative, generation, hasPlugin, platform } from "./nativeCaps";

const IOS_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const ANDROID_UA = "Mozilla/5.0 (Linux; Android 15; SM-S928N Build/AP3A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0 Mobile Safari/537.36";

describe("parseNativeGeneration", () => {
    it("웹은 토큰이 있어도 0", () => {
        expect(parseNativeGeneration(`${IOS_UA} RankueNative/2`, false)).toBe(0);
        expect(parseNativeGeneration(IOS_UA, false)).toBe(0);
    });
    it("네이티브인데 토큰이 없으면 옛 바이너리 1세대", () => {
        expect(parseNativeGeneration(IOS_UA, true)).toBe(1);
        expect(parseNativeGeneration(ANDROID_UA, true)).toBe(1);
        expect(parseNativeGeneration("", true)).toBe(1);
        expect(parseNativeGeneration(undefined, true)).toBe(1);
        expect(parseNativeGeneration(null, true)).toBe(1);
    });
    it("appendUserAgent 토큰의 숫자를 그대로 쓴다", () => {
        expect(parseNativeGeneration(`${IOS_UA} RankueNative/2`, true)).toBe(2);
        expect(parseNativeGeneration(`${ANDROID_UA} RankueNative/2`, true)).toBe(2);
        expect(parseNativeGeneration(`${ANDROID_UA} RankueNative/13`, true)).toBe(13);
    });
    it("깨진 토큰은 옛 바이너리로 본다", () => {
        expect(parseNativeGeneration(`${IOS_UA} RankueNative/0`, true)).toBe(1);
        expect(parseNativeGeneration(`${IOS_UA} RankueNative/x`, true)).toBe(1);
        expect(parseNativeGeneration(`${IOS_UA} RankueNative/`, true)).toBe(1);
    });
    it("옛 React Native 래퍼 표식(RankueApp)은 세대로 치지 않는다", () => {
        expect(parseNativeGeneration(`${IOS_UA} RankueApp/1`, true)).toBe(1);
    });
});

describe("meetsRequirement", () => {
    const has = (names: string[]) => (n: string) => names.includes(n);
    it("웹(0세대)은 어떤 조건도 만족하지 못한다", () => {
        expect(meetsRequirement({}, 0, has(["SocialLogin"]))).toBe(false);
        expect(meetsRequirement({ plugin: "SocialLogin" }, 0, has(["SocialLogin"]))).toBe(false);
    });
    it("세대 조건", () => {
        expect(meetsRequirement({ minGeneration: 2 }, 1, has([]))).toBe(false);
        expect(meetsRequirement({ minGeneration: 2 }, 2, has([]))).toBe(true);
        expect(meetsRequirement({ minGeneration: 2 }, 3, has([]))).toBe(true);
    });
    it("플러그인 조건", () => {
        expect(meetsRequirement({ plugin: "SocialLogin" }, 1, has([]))).toBe(false);
        expect(meetsRequirement({ plugin: "SocialLogin" }, 1, has(["SocialLogin"]))).toBe(true);
    });
    it("둘 다 있으면 둘 다 만족해야 한다", () => {
        expect(meetsRequirement({ minGeneration: 2, plugin: "Badge" }, 2, has([]))).toBe(false);
        expect(meetsRequirement({ minGeneration: 2, plugin: "Badge" }, 1, has(["Badge"]))).toBe(false);
        expect(meetsRequirement({ minGeneration: 2, plugin: "Badge" }, 2, has(["Badge"]))).toBe(true);
    });
});

describe("런타임 판별 (node = Capacitor 전역 없음)", () => {
    it("웹으로 판정되고 throw 하지 않는다", () => {
        expect(isNative()).toBe(false);
        expect(platform()).toBe("web");
        expect(generation()).toBe(0);
        expect(hasPlugin("PushNotifications")).toBe(false);
    });
});
