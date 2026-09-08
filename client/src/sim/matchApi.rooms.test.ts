/** 멀티방·비밀번호·초대(2026-09-08)에 붙은 매퍼·파서. */
import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn() }));
import { DEFAULT_3C_RULES } from "@shared/sim/rules";
import { buildConfig } from "./setupPresets";
import {
    classifyMatchError, createMatchApi, isValidRoomPassword, matchErrorCode, parseMatch, parseOpponents, toCreateMatchBody, toJoinBody,
    roomsUrl, matchJoinByIdUrl, matchInviteUrl, opponentsUrl,
} from "./matchApi";

const config = buildConfig({ gameType: "3c", target: 15 });
const raw = {
    id: "m1", code: "123456", status: "waiting", gameType: "3c", tableId: "DAEDAE", rules: DEFAULT_3C_RULES,
    turn: 0, shots: 0, version: 1, hostName: "호스트", hostTarget: 15, createdAt: "2026-09-08T00:00:00.000Z",
};

describe("matchApi · 멀티방·비밀번호·초대", () => {
    it("만들기 본문: 방 옵션은 공개일 때만 비밀번호를 보내고, 4~20자가 아니면 뺀다", () => {
        expect(toCreateMatchBody(config)).toMatchObject({ isPublic: false });
        expect("password" in toCreateMatchBody(config)).toBe(false);
        expect(toCreateMatchBody(config, { isPublic: true, password: "1234" })).toMatchObject({ isPublic: true, password: "1234" });
        expect("password" in toCreateMatchBody(config, { isPublic: true, password: "12" })).toBe(false);
        expect("password" in toCreateMatchBody(config, { isPublic: false, password: "1234" })).toBe(false);
        expect(isValidRoomPassword("")).toBe(true);
        expect(isValidRoomPassword("123")).toBe(false);
        expect(isValidRoomPassword("x".repeat(21))).toBe(false);
    });

    it("참가 본문: 다마수·비밀번호는 있을 때만", () => {
        expect(toJoinBody()).toEqual({});
        expect(toJoinBody(20)).toEqual({ target: 20 });
        expect(toJoinBody(20, "pw")).toEqual({ target: 20, password: "pw" });
        expect(toJoinBody(undefined, "pw")).toEqual({ password: "pw" });
        expect(toJoinBody(0, "")).toEqual({});
    });

    it("파서: isPublic·hasPassword 는 boolean 일 때만, 코드가 비어도(목록) 통과", () => {
        const m = parseMatch({ ...raw, isPublic: true, hasPassword: true });
        expect([m.isPublic, m.hasPassword]).toEqual([true, true]);
        const plain = parseMatch(raw);
        expect([plain.isPublic, plain.hasPassword]).toEqual([undefined, undefined]);
        expect(parseMatch({ ...raw, code: "" }).code).toBe("");
        expect(parseOpponents([{ id: "a", name: "가", handi3c: 18, handi4c: null }, { id: 1 }, null, { id: "b", name: "나" }])).toEqual([
            { id: "a", name: "가", handi3c: 18, handi4c: null }, { id: "b", name: "나", handi3c: null, handi4c: null },
        ]);
        expect(parseOpponents("x")).toEqual([]);
    });

    it("오류: 403 BAD_PASSWORD → bad-password", () => {
        const err = { status: 403, data: { code: "BAD_PASSWORD" } };
        expect(matchErrorCode(err)).toBe("BAD_PASSWORD");
        expect(classifyMatchError(err)).toBe("bad-password");
    });

    it("요청: 목록·id 참가·초대·상대 목록 URL 과 본문", async () => {
        const calls: { url: string; method?: string; body?: unknown }[] = [];
        const api = createMatchApi(async (url, options) => {
            calls.push({ url, method: options?.method, body: options?.body });
            if (url === roomsUrl()) return [{ ...raw, code: "", isPublic: true }];
            if (url === matchInviteUrl("m1")) return { name: "친구" };
            if (url === opponentsUrl()) return [{ id: "o1", name: "친구", handi3c: 20, handi4c: 80 }];
            return { ...raw, status: "playing", myIndex: 1 };
        });
        const rooms = await api.listRooms();
        expect(rooms[0].isPublic).toBe(true);
        const joined = await api.joinRoom("m1", 18, "pw");
        expect(joined.status).toBe("playing");
        expect(calls[1]).toEqual({ url: matchJoinByIdUrl("m1"), method: "POST", body: { target: 18, password: "pw" } });
        expect(await api.invite("m1", "o1")).toEqual({ name: "친구" });
        expect(calls[2].body).toEqual({ memberId: "o1" });
        expect((await api.listOpponents())[0]).toMatchObject({ id: "o1", handi4c: 80 });
        await api.createMatch(config, { isPublic: true, password: "1234" });
        expect(calls[4].body).toMatchObject({ isPublic: true, password: "1234" });
        await api.joinMatch("123456", 15, "abcd");
        expect(calls[5].body).toEqual({ target: 15, password: "abcd" });
    });
});
