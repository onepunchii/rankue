/**
 * matchApi 순수 부분 테스트. vitest 에 "@" 별칭이 없어 @/lib/queryClient 는 vi.mock 으로 대체한다(simApi.test 와 같다).
 * 네트워크 자체는 createMatchApi(가짜 request) 로 URL·메서드·본문 모양만 검증한다.
 */
import { describe, it, expect, vi } from "vitest";
import { openingLayout } from "@shared/sim/layouts";
import { TABLES } from "@shared/sim/params";
import { createSession, DEFAULT_3C_RULES, DEFAULT_4C_RULES } from "@shared/sim/rules";
import type { ShotInput } from "@shared/sim/types";
import { buildConfig } from "./setupPresets";

const api = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: api.apiRequest }));

import {
    matchesUrl, matchUrl, matchCodeUrl, matchJoinUrl, matchShotsUrl, matchResignUrl, matchClaimUrl,
    toCreateMatchBody, toJoinBody, sanitizeCode, isCompleteCode, formatCode,
    parseMatch, parseMatchList, parseMatchShot, parseMatchShots, parsePostShotResponse, parseResignResponse, parseClaimResponse,
    matchErrorCode, classifyMatchError,
    isMyTurn, playerNames, myName, opponentName, claimableNow, matchResult, myTarget, matchConfig,
    createMatchApi, matchApi,
} from "./matchApi";

const balls = openingLayout("3c", TABLES.DAEDAE, "white");
const state = createSession({
    rules: DEFAULT_3C_RULES,
    players: [{ id: "host-uuid", target: 20, cueBallId: "white" }, { id: "guest-uuid", target: 15, cueBallId: "yellow" }],
});
const input: ShotInput = { cueBallId: "white", phi: 1.2345678901234567, V0: 2.5, a: 0.1, b: -0.2, theta: 0 };

/** 서버 publicMatch() 가 주는 모양(JSON 직렬화 후). */
const rawMatch = {
    id: "m-1", code: "123456", status: "playing",
    gameType: "3c", tableId: "DAEDAE", cushionModel: "han2005", condition: 1,
    rules: DEFAULT_3C_RULES, finishType: "none", inningCap: 0,
    hostName: "호스트", guestName: "게스트", hostTarget: 20, guestTarget: 15,
    myIndex: 0, turn: 0, shots: 0, version: 1,
    state, balls,
    winnerIndex: null, endReason: null, engineVersion: "2.1.0", paramsHash: "0".repeat(16),
    createdAt: "2026-09-07T00:00:00.000Z", startedAt: "2026-09-07T00:01:00.000Z", lastShotAt: null, finishedAt: null,
    claimableAt: "2026-09-09T00:01:00.000Z",
};

describe("URL", () => {
    it("서버 라우트와 같은 경로, id·코드는 인코딩", () => {
        expect(matchesUrl()).toBe("/api/hiq/sim/matches");
        expect(matchUrl("m-1")).toBe("/api/hiq/sim/matches/m-1");
        expect(matchUrl("a/b")).toBe("/api/hiq/sim/matches/a%2Fb");
        expect(matchCodeUrl("123456")).toBe("/api/hiq/sim/matches/code/123456");
        expect(matchJoinUrl("123456")).toBe("/api/hiq/sim/matches/code/123456/join");
        expect(matchShotsUrl("m-1")).toBe("/api/hiq/sim/matches/m-1/shots");
        expect(matchShotsUrl("m-1", 0)).toBe("/api/hiq/sim/matches/m-1/shots");
        expect(matchShotsUrl("m-1", 7)).toBe("/api/hiq/sim/matches/m-1/shots?from=7");
        expect(matchResignUrl("m-1")).toBe("/api/hiq/sim/matches/m-1/resign");
        expect(matchClaimUrl("m-1")).toBe("/api/hiq/sim/matches/m-1/claim");
    });
});

describe("요청 매핑", () => {
    it("toCreateMatchBody: 설정의 알려진 필드만(선수·배치 없음, 여분 필드 안 샘)", () => {
        const config = buildConfig({ gameType: "4c", target: 80, inningCap: 15, condition: 0.9, cushionModel: "mathavan2010", rules: { threeCushionDouble: true } });
        const body = toCreateMatchBody({ ...config, extra: 1 } as typeof config);
        expect(body).toEqual({
            gameType: "4c", tableId: "JUNGDAE_KR", cushionModel: "mathavan2010", condition: 0.9,
            rules: { ...DEFAULT_4C_RULES, threeCushionDouble: true }, finishType: "none", target: 80, inningCap: 15,
            aimAssist: true,
        });
        expect(Object.keys(body)).toHaveLength(9);
    });
    it("toJoinBody: 유효한 정수 다마수만 싣고 아니면 빈 본문(서버가 호스트 다마수를 쓴다)", () => {
        expect(toJoinBody(15)).toEqual({ target: 15 });
        expect(toJoinBody()).toEqual({});
        expect(toJoinBody(0)).toEqual({});
        expect(toJoinBody(1000)).toEqual({});
        expect(toJoinBody(2.5)).toEqual({});
    });
    it("코드: 숫자만 6자리, 완성 판정, 읽기용 띄어쓰기", () => {
        expect(sanitizeCode(" 12-34 5678 ")).toBe("123456");
        expect(sanitizeCode("abc")).toBe("");
        expect(isCompleteCode("123456")).toBe(true);
        expect(isCompleteCode("12345")).toBe(false);
        expect(isCompleteCode("12345a")).toBe(false);
        expect(formatCode("123456")).toBe("123 456");
        expect(formatCode("12")).toBe("12");
    });
});

describe("응답 검증", () => {
    it("parseMatch: publicMatch 모양을 그대로, 모르는 값은 안전한 기본값", () => {
        const m = parseMatch(rawMatch);
        expect(m.id).toBe("m-1");
        expect(m.myIndex).toBe(0);
        expect(m.state).toBe(state);
        expect(m.balls).toBe(balls);
        expect(m.claimableAt).toBe("2026-09-09T00:01:00.000Z");
        expect(m.winnerIndex).toBeNull();
        expect(m.endReason).toBeNull();
        // 참가 전(waiting): state/balls null, 게스트 없음, 코드 조회자는 myIndex -1
        const w = parseMatch({ ...rawMatch, status: "waiting", state: null, balls: null, guestName: null, guestTarget: null, myIndex: -1, claimableAt: null });
        expect(w.state).toBeNull();
        expect(w.balls).toBeNull();
        expect(w.guestName).toBeNull();
        expect(w.myIndex).toBe(-1);
        expect(w.claimableAt).toBeNull();
        // 끝난 대전
        const f = parseMatch({ ...rawMatch, status: "finished", winnerIndex: 1, endReason: "resign", finishedAt: "2026-09-07T01:00:00.000Z" });
        expect(f.winnerIndex).toBe(1);
        expect(f.endReason).toBe("resign");
        expect(parseMatch({ ...rawMatch, endReason: "weird", winnerIndex: 5 }).endReason).toBeNull();
        expect(parseMatch({ ...rawMatch, winnerIndex: 5 }).winnerIndex).toBeNull();
    });
    it("parseMatch: 깨진 응답은 TypeError", () => {
        expect(() => parseMatch(null)).toThrow(TypeError);
        expect(() => parseMatch({ ...rawMatch, status: "nope" })).toThrow(TypeError);
        expect(() => parseMatch({ ...rawMatch, rules: DEFAULT_4C_RULES })).toThrow(TypeError);   // 종목과 규칙 불일치
        expect(() => parseMatch({ ...rawMatch, tableId: "SMALL" })).toThrow(TypeError);
        expect(() => parseMatch({ ...rawMatch, shots: "3" })).toThrow(TypeError);
        expect(() => parseMatchList({})).toThrow(TypeError);
        expect(parseMatchList([rawMatch])).toHaveLength(1);
    });
    it("parseMatchShot: preState·input 검사, 입력의 여분 키는 버린다", () => {
        const s = parseMatchShot({ idx: 2, playerIndex: 1, preState: balls, input: { ...input, junk: 1 }, hash: "a".repeat(16), outcomeCode: "point", points: 1, cushions: 3, createdAt: "2026-09-07T00:02:00.000Z" });
        expect(s.idx).toBe(2);
        expect(s.playerIndex).toBe(1);
        expect(s.preState).toBe(balls);
        expect(Object.keys(s.input).sort()).toEqual(["V0", "a", "b", "cueBallId", "phi", "theta"]);
        expect(Object.is(s.input.phi, input.phi)).toBe(true);
        expect(() => parseMatchShot({ idx: 0, preState: "x", input, hash: "h" })).toThrow(TypeError);
        expect(() => parseMatchShot({ idx: 0, preState: balls, input: { ...input, V0: "fast" }, hash: "h" })).toThrow(TypeError);
        expect(() => parseMatchShots({})).toThrow(TypeError);
    });
    it("parsePostShotResponse: 정상 응답과 duplicate 응답(final·outcome 없음)", () => {
        const outcome = { code: "point", points: 1, scored: true, consumesInning: false, cushionsBeforeSecond: 3, cushionsBeforeFirst: 0, contacts: ["yellow", "red"], kisses: 0 };
        const ok = parsePostShotResponse({
            shot: { idx: 0 }, duplicate: false, mismatch: true, hash: "f".repeat(16), events: [], final: balls, duration: 1.5, truncated: false,
            history: [{ t: 0, balls }], outcome, state, turn: 1, version: 2, status: "playing", winnerIndex: null,
        });
        expect(ok.duplicate).toBe(false);
        expect(ok.mismatch).toBe(true);
        expect(ok.final).toBe(balls);
        expect(ok.outcome!.code).toBe("point");
        expect(ok.turn).toBe(1);
        expect(ok.history).toHaveLength(1);
        const dup = parsePostShotResponse({ shot: { idx: 0 }, duplicate: true, mismatch: false, hash: "a".repeat(16), state, turn: 1, version: 3, status: "playing", winnerIndex: null });
        expect(dup.duplicate).toBe(true);
        expect(dup.mismatch).toBe(false);
        expect(dup.final).toBeNull();
        expect(dup.outcome).toBeNull();
        expect(dup.events).toEqual([]);
        expect("history" in dup).toBe(false);
        // 정상 응답인데 final 이 없으면 깨진 것
        expect(() => parsePostShotResponse({ duplicate: false, mismatch: false, hash: "a", state, turn: 0, version: 1, status: "playing" })).toThrow(TypeError);
        expect(() => parsePostShotResponse({ duplicate: true, hash: "a", state: {}, turn: 0, version: 1, status: "playing" })).toThrow(TypeError);
        // 끝난 대전의 마지막 샷
        const fin = parsePostShotResponse({ duplicate: false, mismatch: false, hash: "a".repeat(16), final: balls, outcome, state: { ...state, status: "finished", winnerIndex: 0 }, turn: 0, version: 9, status: "finished", winnerIndex: 0 });
        expect(fin.status).toBe("finished");
        expect(fin.winnerIndex).toBe(0);
    });
    it("resign / claim 응답", () => {
        expect(parseResignResponse({ status: "canceled" })).toEqual({ status: "canceled" });
        expect(parseResignResponse({ status: "finished", winnerIndex: 1 })).toEqual({ status: "finished", winnerIndex: 1 });
        expect(() => parseResignResponse({ status: "finished" })).toThrow(TypeError);
        expect(parseClaimResponse({ status: "finished", winnerIndex: 0 })).toEqual({ status: "finished", winnerIndex: 0 });
        expect(() => parseClaimResponse({ status: "canceled" })).toThrow(TypeError);
    });
});

describe("오류 분류", () => {
    const err = (status: number, code?: string, message = "") => ({ status, data: { success: false, message, code }, message });
    it("서버 code 를 읽고, 대전 전용 두 가지를 simApi 분류 위에 얹는다", () => {
        expect(matchErrorCode(err(409, "NOT_YOUR_TURN"))).toBe("NOT_YOUR_TURN");
        expect(matchErrorCode(err(409, "TOO_EARLY"))).toBe("TOO_EARLY");
        expect(matchErrorCode(err(409))).toBeNull();
        expect(matchErrorCode(new TypeError("Failed to fetch"))).toBeNull();
        expect(classifyMatchError(err(409, "NOT_YOUR_TURN", "상대 차례입니다"))).toBe("not-your-turn");
        expect(classifyMatchError(err(409, "TOO_EARLY"))).toBe("too-early");
        expect(classifyMatchError(err(409, "IDX_MISMATCH", "샷 순서가 맞지 않습니다 (서버 3)"))).toBe("idx-mismatch");
        expect(classifyMatchError(err(409, "RECORD_CONFLICT"))).toBe("session-closed");
        expect(classifyMatchError(err(409, undefined, "진행 중인 대전이 아닙니다"))).toBe("session-closed");
        expect(classifyMatchError(err(404))).toBe("session-closed");
        expect(classifyMatchError(err(400))).toBe("rejected");
        expect(classifyMatchError(err(401))).toBe("unauthorized");
        expect(classifyMatchError(err(503))).toBe("network");
        expect(classifyMatchError(new TypeError("Failed to fetch"))).toBe("network");
    });
});

describe("파생값", () => {
    const m = parseMatch(rawMatch);
    it("내 차례·이름·다마수·승패", () => {
        expect(isMyTurn(m)).toBe(true);
        expect(isMyTurn({ ...m, turn: 1 })).toBe(false);
        expect(isMyTurn({ ...m, status: "finished" })).toBe(false);
        expect(isMyTurn({ ...m, myIndex: -1 })).toBe(false);
        expect(playerNames(m)).toEqual(["호스트", "게스트"]);
        expect(playerNames({ ...m, guestName: null })).toEqual(["호스트", ""]);
        expect(myName(m)).toBe("호스트");
        expect(opponentName(m)).toBe("게스트");
        expect(myName({ ...m, myIndex: 1 })).toBe("게스트");
        expect(opponentName({ ...m, myIndex: 1 })).toBe("호스트");
        expect(myTarget(m)).toBe(20);
        expect(myTarget({ ...m, myIndex: 1 })).toBe(15);
        expect(myTarget({ ...m, myIndex: 1, guestTarget: null })).toBe(20);
        expect(matchResult(m)).toBeNull();
        expect(matchResult({ ...m, status: "finished", winnerIndex: 0 })).toBe("win");
        expect(matchResult({ ...m, status: "finished", winnerIndex: 1 })).toBe("loss");
        expect(matchResult({ ...m, status: "finished", winnerIndex: null })).toBe("draw");
        expect(matchResult({ ...m, status: "finished", winnerIndex: 0, myIndex: -1 })).toBeNull();
    });
    it("claimableNow: 상대 차례이고 claimableAt 이 지났을 때만", () => {
        const at = Date.parse(m.claimableAt!);
        expect(claimableNow({ ...m, turn: 1 }, at)).toBe(true);
        expect(claimableNow({ ...m, turn: 1 }, at - 1)).toBe(false);
        expect(claimableNow(m, at + 1)).toBe(false);                       // 내 차례
        expect(claimableNow({ ...m, turn: 1, claimableAt: null }, at)).toBe(false);
        expect(claimableNow({ ...m, turn: 1, status: "finished" }, at)).toBe(false);
    });
    it("matchConfig: HUD·파라미터용 설정, target 은 내 다마수", () => {
        const c = matchConfig(m);
        expect(c).toEqual({ gameType: "3c", tableId: "DAEDAE", target: 20, rules: DEFAULT_3C_RULES, finishType: "none", inningCap: 0, cushionModel: "han2005", condition: 1, mode: "normal" });
        expect(matchConfig({ ...m, aimAssist: false }).mode).toBe("reality");
        expect(matchConfig({ ...m, myIndex: 1 }).target).toBe(15);
    });
});

describe("createMatchApi", () => {
    it("createMatch: POST /matches, 본문은 매퍼 결과", async () => {
        const request = vi.fn(async () => rawMatch);
        const config = buildConfig({ gameType: "3c", target: 20 });
        const r = await createMatchApi(request).createMatch(config);
        expect(request).toHaveBeenCalledWith(matchesUrl(), { method: "POST", body: toCreateMatchBody(config) });
        expect(r.code).toBe("123456");
    });
    it("listMatches / lookupCode / joinMatch / getMatch", async () => {
        const request = vi.fn(async (url: string) => (url === matchesUrl() ? [rawMatch] : rawMatch));
        const a = createMatchApi(request);
        expect(await a.listMatches()).toHaveLength(1);
        expect(request).toHaveBeenLastCalledWith(matchesUrl(), { method: "GET" });
        await a.lookupCode("123 456");
        expect(request).toHaveBeenLastCalledWith("/api/hiq/sim/matches/code/123456", { method: "GET" });
        await a.joinMatch("123456", 15);
        expect(request).toHaveBeenLastCalledWith("/api/hiq/sim/matches/code/123456/join", { method: "POST", body: { target: 15 } });
        await a.joinMatch("123456");
        expect(request).toHaveBeenLastCalledWith("/api/hiq/sim/matches/code/123456/join", { method: "POST", body: {} });
        await a.getMatch("m-1");
        expect(request).toHaveBeenLastCalledWith("/api/hiq/sim/matches/m-1", { method: "GET" });
    });
    it("getShots: from 쿼리, postShot: 입력 동일, resign/claim: POST", async () => {
        const request = vi.fn(async (url: string) => {
            if (url.includes("/shots?")) return [{ idx: 3, playerIndex: 1, preState: balls, input, hash: "h".repeat(16), outcomeCode: "point", points: 1, cushions: 3, createdAt: "" }];
            if (url.endsWith("/shots")) return { duplicate: false, mismatch: false, hash: "a".repeat(16), final: balls, outcome: { code: "point" }, state, turn: 0, version: 2, status: "playing", winnerIndex: null };
            if (url.endsWith("/resign")) return { status: "finished", winnerIndex: 1 };
            if (url.endsWith("/claim")) return { status: "finished", winnerIndex: 0 };
            return rawMatch;
        });
        const a = createMatchApi(request);
        const shots = await a.getShots("m-1", 3);
        expect(request).toHaveBeenLastCalledWith("/api/hiq/sim/matches/m-1/shots?from=3", { method: "GET" });
        expect(shots[0].idx).toBe(3);
        const r = await a.postShot("m-1", { idx: 0, input, clientHash: "a".repeat(16) });
        expect(request).toHaveBeenLastCalledWith("/api/hiq/sim/matches/m-1/shots", { method: "POST", body: { idx: 0, input, clientHash: "a".repeat(16) } });
        expect(r.turn).toBe(0);
        expect(await a.resign("m-1")).toEqual({ status: "finished", winnerIndex: 1 });
        expect(request).toHaveBeenLastCalledWith("/api/hiq/sim/matches/m-1/resign", { method: "POST" });
        expect(await a.claim("m-1")).toEqual({ status: "finished", winnerIndex: 0 });
        expect(request).toHaveBeenLastCalledWith("/api/hiq/sim/matches/m-1/claim", { method: "POST" });
    });
    it("request 가 던지면 그대로 전파(호출자가 분류)", async () => {
        const a = createMatchApi(async () => { throw { status: 409, data: { code: "NOT_YOUR_TURN" } }; });
        await expect(a.postShot("m", { idx: 1, input, clientHash: "x" })).rejects.toMatchObject({ status: 409 });
    });
    it("기본 인스턴스는 apiRequest 를 쓴다", async () => {
        api.apiRequest.mockResolvedValueOnce(rawMatch);
        const r = await matchApi.getMatch("m-1");
        expect(api.apiRequest).toHaveBeenCalledWith("/api/hiq/sim/matches/m-1", { method: "GET" });
        expect(r.id).toBe("m-1");
    });
});

describe("40초 룰 필드·요청", () => {
    it("parseMatch 는 turnSeenAt·serverNow 를 ISO 로 읽고 없으면 null", () => {
        const m = parseMatch({ ...rawMatch, turnSeenAt: "2026-09-07T10:00:00.000Z", serverNow: "2026-09-07T10:00:05.000Z" });
        expect(m.turnSeenAt).toBe("2026-09-07T10:00:00.000Z");
        expect(m.serverNow).toBe("2026-09-07T10:00:05.000Z");
        expect(parseMatch(rawMatch).turnSeenAt).toBeNull();
    });
    it("getMatch(ack) 는 ?ack=1, timeout 은 POST /timeout", async () => {
        const request = vi.fn(async () => rawMatch);
        const a = createMatchApi(request);
        await a.getMatch("m-1", { ack: true });
        expect(request).toHaveBeenLastCalledWith("/api/hiq/sim/matches/m-1?ack=1", { method: "GET" });
        await a.timeout!("m-1");
        expect(request).toHaveBeenLastCalledWith("/api/hiq/sim/matches/m-1/timeout", { method: "POST" });
    });
});
