import { describe, it, expect } from "vitest";
import { LOBBY_PREFS_KEY, deviceLobbyPrefs, parseLobbyPrefs } from "./lobbyPrefs";

/**
 * 방 만들기의 지난번 설정(2026-10-12 오너: "방 만드는 거 조금 더 쉽게").
 * 저장소의 글은 믿지 않는다 — 칸마다 검사해 쓸 수 있는 것만 받는다. 방제 · 비밀번호 · 공개 여부는 적지도 읽지도 않는다.
 */
describe("parseLobbyPrefs", () => {
    it("온전한 값은 그대로", () => {
        const p = { gameType: "4c", tableId: "JUNGDAE_KR", handicap: false, target: 120, mode: "reality", ruleSet: "pba", threeCushionDouble: true, inningCap: 30 };
        expect(parseLobbyPrefs(JSON.stringify(p))).toEqual(p);
    });

    it("없거나 깨진 글이면 빈 값 — 화면은 기본값으로 열린다", () => {
        for (const raw of [null, undefined, "", "{", "null", "3", '"x"', "[]"]) expect(parseLobbyPrefs(raw)).toEqual({});
    });

    it("틀린 칸은 그 칸만 버린다", () => {
        const got = parseLobbyPrefs(JSON.stringify({
            gameType: "pool", tableId: "POCKET", handicap: "yes", target: 9999, mode: "god", ruleSet: "x", threeCushionDouble: 1, inningCap: 7,
        }));
        expect(got).toEqual({});
        expect(parseLobbyPrefs(JSON.stringify({ gameType: "3c", target: -1, mode: "normal", inningCap: 0 }))).toEqual({ gameType: "3c", mode: "normal", inningCap: 0 });
    });

    it("방제 · 비밀번호 · 공개 여부는 들어 있어도 읽지 않는다", () => {
        const got = parseLobbyPrefs(JSON.stringify({ gameType: "3c", title: "초보 환영", password: "1234", isPublic: true }));
        expect(got).toEqual({ gameType: "3c" });
    });
});

describe("deviceLobbyPrefs", () => {
    it("저장소가 없는 곳에서는 조용히 아무것도 하지 않는다", () => {
        const g = globalThis as unknown as { window?: unknown };
        const had = "window" in g;
        const prev = g.window;
        // 저장소를 읽으면 던지는 창(사파리 개인 정보 보호 · 출처 없는 문서)
        g.window = { get localStorage(): never { throw new Error("blocked"); } };
        try {
            expect(deviceLobbyPrefs.load()).toEqual({});
            expect(() => deviceLobbyPrefs.save({ gameType: "3c", tableId: "DAEDAE", handicap: true, target: 15, mode: "normal", ruleSet: "umb", threeCushionDouble: false, inningCap: 0 })).not.toThrow();
        } finally {
            if (had) g.window = prev; else delete g.window;
        }
    });

    it("적은 것을 그대로 읽는다", () => {
        const g = globalThis as unknown as { window?: unknown };
        const had = "window" in g;
        const prev = g.window;
        const mem = new Map<string, string>();
        g.window = { localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } } };
        try {
            const p = { gameType: "4c" as const, tableId: "JUNGDAE_KR" as const, handicap: true, target: 80, mode: "normal" as const, ruleSet: "umb" as const, threeCushionDouble: false, inningCap: 0 };
            deviceLobbyPrefs.save(p);
            expect([...mem.keys()]).toEqual([LOBBY_PREFS_KEY]);
            expect(deviceLobbyPrefs.load()).toEqual(p);
        } finally {
            if (had) g.window = prev; else delete g.window;
        }
    });
});
