/**
 * 진행 중인 판이 있으면 먼저 묻는다(2026-10-26 — 멀티방에 치다 나간 판이 '진행 중'으로 남아 '방이 2개'로 보이던 일).
 * 서버가 409 HAS_PLAYING → 묻고 → 고르면 forfeitPlaying 을 붙여 한 번 더. 안 고르면 null(아무 일도 없다). 다른 오류는 그대로.
 */
import { describe, expect, it, vi } from "vitest";
// vitest 에 "@" 별칭이 없어 @/lib/queryClient 는 가짜로(matchApi.test 와 같다)
vi.mock("@/lib/queryClient", () => ({ apiRequest: async () => null }));
import { createMatchApi, matchErrorCode, parseChatLine, toJoinBody, withForfeitConfirm } from "./matchApi";

const hasPlaying = Object.assign(new Error("진행 중인 대전이 있어요"), { status: 409, data: { code: "HAS_PLAYING" } });

describe("withForfeitConfirm", () => {
    it("진행 중인 판이 없으면 한 번에 — 묻지 않는다", async () => {
        const calls: unknown[] = [];
        let asked = 0;
        const r = await withForfeitConfirm(async (o) => { calls.push(o); return "ok"; }, async () => { asked++; return true; });
        expect(r).toBe("ok");
        expect(calls).toEqual([undefined]);
        expect(asked).toBe(0);
    });
    it("409 HAS_PLAYING → 묻고, 고르면 기권을 붙여 다시", async () => {
        const calls: unknown[] = [];
        const r = await withForfeitConfirm(async (o) => { calls.push(o); if (!o) throw hasPlaying; return "made"; }, async () => true);
        expect(r).toBe("made");
        expect(calls).toEqual([undefined, { forfeitPlaying: true }]);
    });
    it("안 고르면 null — 두 번째 요청은 없다", async () => {
        let n = 0;
        expect(await withForfeitConfirm(async () => { n++; throw hasPlaying; }, async () => false)).toBeNull();
        expect(n).toBe(1);
    });
    it("다른 오류는 그대로 던진다", async () => {
        const other = Object.assign(new Error("x"), { data: { code: "BAD_PASSWORD" } });
        await expect(withForfeitConfirm(async () => { throw other; }, async () => true)).rejects.toBe(other);
    });
    it("코드 읽기 · 본문", () => {
        expect(matchErrorCode(hasPlaying)).toBe("HAS_PLAYING");
        expect(toJoinBody(undefined, undefined, { forfeitPlaying: true })).toEqual({ forfeitPlaying: true });
        expect(toJoinBody(12, "abcd")).toEqual({ target: 12, password: "abcd" });
    });
    it("API 가 기권 표시를 본문에 싣는다(참가 · 코드 참가)", async () => {
        const bodies: unknown[] = [];
        const api = createMatchApi(async (_url, init) => { bodies.push(init?.body); return { id: "m1", code: "123456", status: "playing", myIndex: 1 }; });
        await api.joinRoom("r1", undefined, undefined, { forfeitPlaying: true }).catch(() => undefined);
        await api.joinMatch("123456", undefined, undefined, { forfeitPlaying: true }).catch(() => undefined);
        expect(bodies).toEqual([{ forfeitPlaying: true }, { forfeitPlaying: true }]);
    });
});

describe("차단 관계인 사람의 줄(hidden)", () => {
    it("서버가 글을 비워 보낸 줄은 hidden 을 지닌 채 남는다 — 줄을 빼면 seq 커서가 멈춘다", () => {
        expect(parseChatLine({ id: "c1", seq: 3, from: 1, kind: "text", text: "", at: "2026-10-26T10:00:00Z", hidden: true })).toMatchObject({ seq: 3, hidden: true, text: "" });
        expect(parseChatLine({ id: "c2", seq: 4, from: 1, kind: "text", text: "안녕", at: "2026-10-26T10:00:00Z" })).not.toHaveProperty("hidden");
    });
});
