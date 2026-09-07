/**
 * simApi 순수 부분 테스트. vitest 에 "@" 별칭이 없어 @/lib/queryClient 는 vi.mock 으로 대체한다.
 * 네트워크 자체는 createSimApi(가짜 request) 로 URL·메서드·본문 모양만 검증한다.
 */
import { describe, it, expect, vi } from "vitest";
import { openingLayout } from "@shared/sim/layouts";
import { TABLES } from "@shared/sim/params";
import { createSession, DEFAULT_3C_RULES } from "@shared/sim/rules";
import type { ShotInput } from "@shared/sim/types";
import { buildConfig } from "./setupPresets";

const api = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: api.apiRequest }));

import {
    sessionsUrl, shotsUrl, closeUrl,
    toCreateSessionBody, toShotBody,
    parseCreateSessionResponse, parseShotResponse, parseSessionRow,
    classifyApiError, isRetryable, serverShotsFromError,
    createSimApi, simApi,
} from "./simApi";

const config = buildConfig({ gameType: "3c", target: 20, inningCap: 10, condition: 1.05 });
const balls = openingLayout("3c", TABLES.DAEDAE, "white");
const state = createSession({ rules: DEFAULT_3C_RULES, players: [{ id: "p1", target: 20 }] });
const input: ShotInput = { cueBallId: "white", phi: 1.2345678901234567, V0: 2.5, a: 0.1, b: -0.2, theta: 0 };

const sessionRow = {
    id: "s-1", memberId: "m-1", kind: "solo", gameType: "3c", tableId: "DAEDAE", cushionModel: "han2005", condition: 1.05,
    rules: DEFAULT_3C_RULES, finishType: "none", targetScore: 20, inningCap: 10, state, balls,
    score: 0, innings: 0, highRun: 0, shots: 0, status: "playing", engineVersion: "2.0.0", paramsHash: "0".repeat(16),
    mismatches: 0, startedAt: "2026-09-07T00:00:00.000Z", finishedAt: null, lastShotAt: null,
};

describe("URL", () => {
    it("서버 라우트와 같은 경로, id 는 인코딩", () => {
        expect(sessionsUrl()).toBe("/api/hiq/sim/sessions");
        expect(shotsUrl("abc")).toBe("/api/hiq/sim/sessions/abc/shots");
        expect(closeUrl("a/b")).toBe("/api/hiq/sim/sessions/a%2Fb/close");
    });
});

describe("toCreateSessionBody", () => {
    it("설정의 알려진 필드만 옮기고 선수·배치는 있을 때만 붙인다", () => {
        const body = toCreateSessionBody(config);
        expect(body).toEqual({
            gameType: "3c", tableId: "DAEDAE", cushionModel: "han2005", condition: 1.05,
            rules: DEFAULT_3C_RULES, finishType: "none", target: 20, inningCap: 10,
        });
        expect("players" in body).toBe(false);
        expect("balls" in body).toBe(false);
    });
    it("2인 로컬 대전과 자유 배치", () => {
        const body = toCreateSessionBody(config, balls, [{ id: "p1", target: 20 }, { id: "p2", target: 15 }]);
        expect(body.players).toEqual([{ id: "p1", target: 20 }, { id: "p2", target: 15 }]);
        expect(body.balls).toBe(balls);
    });
    it("빈 선수 목록은 생략(서버가 요청자 1인으로 만든다)", () => {
        expect("players" in toCreateSessionBody(config, undefined, [])).toBe(false);
    });
    it("설정 객체에 딸린 여분 필드는 새지 않는다", () => {
        const dirty = { ...config, extra: 1 } as typeof config;
        expect("extra" in toCreateSessionBody(dirty)).toBe(false);
    });
});

describe("toShotBody", () => {
    it("입력 숫자를 손대지 않는다(비트 동일) — 결정론 해시의 전제", () => {
        const body = toShotBody({ idx: 3, input, clientHash: "abcdef0123456789" });
        expect(body.idx).toBe(3);
        expect(body.clientHash).toBe("abcdef0123456789");
        expect(Object.is(body.input.phi, input.phi)).toBe(true);
        expect(body.input).toEqual(input);
        // JSON 왕복 후에도 같은 double
        expect(JSON.parse(JSON.stringify(body)).input.phi).toBe(input.phi);
    });
    it("입력에 붙은 여분 키는 버린다", () => {
        const body = toShotBody({ idx: 0, input: { ...input, junk: 1 } as ShotInput, clientHash: "x".repeat(16) });
        expect(Object.keys(body.input).sort()).toEqual(["V0", "a", "b", "cueBallId", "phi", "theta"]);
    });
    it("비유한 값·음수 idx 는 RangeError", () => {
        expect(() => toShotBody({ idx: -1, input, clientHash: "x" })).toThrow(RangeError);
        expect(() => toShotBody({ idx: 1.5, input, clientHash: "x" })).toThrow(RangeError);
        expect(() => toShotBody({ idx: 0, input: { ...input, V0: Number.NaN }, clientHash: "x" })).toThrow(RangeError);
        expect(() => toShotBody({ idx: 0, input: { ...input, phi: Infinity }, clientHash: "x" })).toThrow(RangeError);
    });
});

describe("응답 검증", () => {
    it("세션 개설 응답", () => {
        const r = parseCreateSessionResponse({ session: sessionRow, state, balls });
        expect(r.session.id).toBe("s-1");
        expect(r.state).toBe(state);
        expect(r.balls).toBe(balls);
    });
    it("세션 개설 응답이 깨졌으면 TypeError", () => {
        expect(() => parseCreateSessionResponse(null)).toThrow(TypeError);
        expect(() => parseCreateSessionResponse({ session: {}, state, balls })).toThrow(TypeError);
        expect(() => parseCreateSessionResponse({ session: sessionRow, state: {}, balls })).toThrow(TypeError);
        expect(() => parseCreateSessionResponse({ session: sessionRow, state, balls: "no" })).toThrow(TypeError);
    });
    it("샷 응답: 필수 필드·기본값·history 는 있을 때만", () => {
        const outcome = { code: "point", points: 1, scored: true, consumesInning: false, cushionsBeforeSecond: 3, cushionsBeforeFirst: 0, contacts: ["red", "yellow"], kisses: 0 };
        const raw = { shot: { id: "x", idx: 0 }, duplicate: false, mismatch: true, hash: "f".repeat(16), events: [], final: balls, duration: 1.5, truncated: false, history: [{ t: 0, balls }], outcome, state };
        const r = parseShotResponse(raw);
        expect(r.mismatch).toBe(true);
        expect(r.history).toHaveLength(1);
        expect(r.outcome.code).toBe("point");
        const noHist = parseShotResponse({ ...raw, history: undefined, duplicate: undefined, events: undefined, duration: undefined });
        expect("history" in noHist).toBe(false);
        expect(noHist.duplicate).toBe(false);
        expect(noHist.events).toEqual([]);
        expect(noHist.duration).toBe(0);
    });
    it("샷 응답이 깨졌으면 TypeError", () => {
        expect(() => parseShotResponse({})).toThrow(TypeError);
        expect(() => parseShotResponse({ mismatch: "no", hash: "x", final: balls, state, outcome: { code: "point" } })).toThrow(TypeError);
        expect(() => parseShotResponse({ mismatch: false, hash: "x", final: balls, state: {}, outcome: { code: "point" } })).toThrow(TypeError);
        expect(() => parseShotResponse({ mismatch: false, hash: "x", final: balls, state, outcome: {} })).toThrow(TypeError);
    });
    it("세션 행", () => {
        expect(parseSessionRow(sessionRow).status).toBe("playing");
        expect(() => parseSessionRow({ id: 1 })).toThrow(TypeError);
    });
});

describe("classifyApiError", () => {
    const err = (status: number, data?: unknown, message = "") => ({ status, data, message });
    it("상태 코드 없음·5xx → network(재시도)", () => {
        expect(classifyApiError(new TypeError("Failed to fetch"))).toBe("network");
        expect(classifyApiError(undefined)).toBe("network");
        expect(classifyApiError(err(503))).toBe("network");
        expect(isRetryable("network")).toBe(true);
    });
    it("409 IDX_MISMATCH / 409·404 세션 종료 / 401 / 400", () => {
        expect(classifyApiError(err(409, { code: "IDX_MISMATCH" }))).toBe("idx-mismatch");
        expect(classifyApiError(err(409, { code: undefined }))).toBe("session-closed");
        expect(classifyApiError(err(404))).toBe("session-closed");
        expect(classifyApiError(err(401))).toBe("unauthorized");
        expect(classifyApiError(err(403))).toBe("unauthorized");
        expect(classifyApiError(err(400))).toBe("rejected");
        expect(isRetryable("rejected")).toBe(false);
        expect(isRetryable("idx-mismatch")).toBe(false);
    });
    it("IDX_MISMATCH 메시지에서 서버 샷 수를 읽는다", () => {
        expect(serverShotsFromError(err(409, { code: "IDX_MISMATCH" }, "샷 순서가 맞지 않습니다 (서버 4)"))).toBe(4);
        expect(serverShotsFromError({ status: 409, data: { message: "샷 순서가 맞지 않습니다 (서버 12)" } })).toBe(12);
        expect(serverShotsFromError(err(409, {}, "끝난 세션입니다"))).toBeNull();
        expect(serverShotsFromError(null)).toBeNull();
    });
});

describe("createSimApi", () => {
    it("createSession: POST /sessions, 본문은 매퍼 결과, 응답은 검증", async () => {
        const request = vi.fn(async () => ({ session: sessionRow, state, balls }));
        const a = createSimApi(request);
        const r = await a.createSession(config, balls);
        expect(request).toHaveBeenCalledWith(sessionsUrl(), { method: "POST", body: toCreateSessionBody(config, balls) });
        expect(r.session.id).toBe("s-1");
    });
    it("postShot: POST /sessions/:id/shots, 입력 동일", async () => {
        const request = vi.fn(async () => ({
            shot: {}, duplicate: false, mismatch: false, hash: "a".repeat(16), events: [], final: balls, duration: 1, truncated: false,
            outcome: { code: "miss-no-contact" }, state,
        }));
        const a = createSimApi(request);
        const r = await a.postShot("s-1", { idx: 0, input, clientHash: "a".repeat(16) });
        expect(request).toHaveBeenCalledWith("/api/hiq/sim/sessions/s-1/shots", { method: "POST", body: { idx: 0, input, clientHash: "a".repeat(16) } });
        expect(r.mismatch).toBe(false);
    });
    it("closeSession: POST /sessions/:id/close {status}", async () => {
        const request = vi.fn(async () => ({ ...sessionRow, status: "abandoned" }));
        const a = createSimApi(request);
        const r = await a.closeSession("s-1", "abandoned");
        expect(request).toHaveBeenCalledWith("/api/hiq/sim/sessions/s-1/close", { method: "POST", body: { status: "abandoned" } });
        expect(r.status).toBe("abandoned");
    });
    it("request 가 던지면 그대로 전파(호출자가 분류)", async () => {
        const a = createSimApi(async () => { throw { status: 409, data: { code: "IDX_MISMATCH" } }; });
        await expect(a.postShot("s", { idx: 1, input, clientHash: "x" })).rejects.toMatchObject({ status: 409 });
    });
    it("기본 인스턴스는 apiRequest 를 쓴다", async () => {
        api.apiRequest.mockResolvedValueOnce({ ...sessionRow, status: "finished" });
        const r = await simApi.closeSession("s-1", "finished");
        expect(api.apiRequest).toHaveBeenCalledWith("/api/hiq/sim/sessions/s-1/close", { method: "POST", body: { status: "finished" } });
        expect(r.status).toBe("finished");
    });
});
