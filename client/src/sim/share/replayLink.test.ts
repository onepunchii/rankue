/**
 * replayLink 검증: 실제 엔진으로 친 샷을 인코딩 → 디코딩 → 재시뮬하면 해시가 같다(반올림 없음), 0·z·기본 컨디션 생략,
 * 깨진 입력(버전·테이블·모델·컨디션 격자·공 집합·배치·입력 범위·해시 형식)은 전부 null, 노란 공 샷의 1인 세션 변환, URL 헬퍼.
 */
import { describe, it, expect } from "vitest";
import { simulateShot } from "@shared/sim/simulate";
import { openingLayout } from "@shared/sim/layouts";
import { TABLES } from "@shared/sim/params";
import type { BallState, ShotInput } from "@shared/sim/types";
import { buildConfig } from "../setupPresets";
import { paramsFromConfig } from "../simReducer";
import {
    currentOrigin, decodeReplay, encodeReplay, forSoloSession, parseReplay, preShotBalls, readReplayParam, replayPath,
    replaySource, replayUrl, toReplayConfig, REPLAY_TARGET, SITE_ORIGIN,
} from "./replayLink";

const cfg3c = buildConfig({ gameType: "3c", target: 15 });
const layout3c = openingLayout("3c", TABLES.DAEDAE, "white");
const input3c: ShotInput = { cueBallId: "white", phi: 1.2345678901234567, V0: 2.5, a: 0.2, b: -0.1, theta: 0 };
const result3c = simulateShot(layout3c, input3c, paramsFromConfig(cfg3c));

function wireOf(param: string): Record<string, any> {
    const b64 = param.replace(/-/g, "+").replace(/_/g, "/");
    const pad = "=".repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64 + pad), (c) => c.charCodeAt(0))));
}

describe("replayLink", () => {
    it("preShotBalls 는 history[0] 에서 샷 직전 정지 배치를 비트 그대로 되살린다", () => {
        const pre = preShotBalls(result3c);
        expect(pre.map((b) => [b.id, b.r[0], b.r[1], b.r[2]])).toEqual(layout3c.map((b) => [b.id, b.r[0], b.r[1], b.r[2]]));
        for (const b of pre) {
            expect(b.v).toEqual([0, 0, 0]);
            expect(b.w).toEqual([0, 0, 0]);
            expect(b.state).toBe("stationary");
        }
        expect(preShotBalls({ history: [] })).toEqual([]);
    });

    it("encode → decode → 같은 배치·입력으로 재시뮬하면 해시가 같다(base64url, 반올림 없음)", () => {
        const enc = encodeReplay(replaySource(result3c, cfg3c));
        expect(enc).not.toMatch(/[+/=]/);
        const p = decodeReplay(enc);
        expect(p).not.toBeNull();
        expect(p!.gameType).toBe("3c");
        expect(p!.table).toBe("DAEDAE");
        expect(p!.cushionModel).toBe("han2005");
        expect(p!.condition).toBe(1);
        expect(p!.input).toEqual(input3c);
        expect(p!.engineVersion).toBe(result3c.engineVersion);
        expect(p!.hash).toBe(result3c.hash);
        const again = simulateShot(p!.balls, p!.input, paramsFromConfig(toReplayConfig(p!)));
        expect(again.hash).toBe(result3c.hash);
        expect(toReplayConfig(p!)).toEqual(buildConfig({ gameType: "3c", tableId: "DAEDAE", target: REPLAY_TARGET }));
    });

    it("0 인 당점·큐 각, 기본 컨디션, z = R 은 생략되고 값이 있으면 실린다", () => {
        const plain: ShotInput = { cueBallId: "white", phi: 1.5, V0: 3, a: 0, b: 0, theta: 0 };
        const r = simulateShot(layout3c, plain, paramsFromConfig(cfg3c));
        const w = wireOf(encodeReplay(replaySource(r, cfg3c)));
        expect(w.v).toBe(1);
        expect(w.condition).toBeUndefined();
        expect(w.input).toEqual({ cueBallId: "white", phi: 1.5, V0: 3 });
        expect(w.balls.every((b: unknown[]) => b.length === 3)).toBe(true);
        expect(decodeReplay(encodeReplay(replaySource(r, cfg3c)))?.input).toEqual(plain);

        const R = TABLES.DAEDAE.ball.R;
        const lifted: BallState[] = layout3c.map((b, i) => (i === 2 ? { ...b, r: [b.r[0], b.r[1], R + 0.001] } : b));
        const enc = encodeReplay({ ...replaySource(r, cfg3c), balls: lifted, condition: 1.1 });
        const w2 = wireOf(enc);
        expect(w2.condition).toBe(1.1);
        expect(w2.balls[2]).toHaveLength(4);
        const p = decodeReplay(enc)!;
        expect(p.balls[2].r[2]).toBe(R + 0.001);
        expect(p.condition).toBe(1.1);
    });

    it("중대 4구·mathavan2010·컨디션 1.15 도 왕복하고 재시뮬 해시가 같다", () => {
        const cfg4c = buildConfig({ gameType: "4c", target: 80, tableId: "JUNGDAE_KR", condition: 1.15, cushionModel: "mathavan2010" });
        const layout4c = openingLayout("4c", TABLES.JUNGDAE_KR, "white");
        const input4c: ShotInput = { cueBallId: "white", phi: 1.7, V0: 2.2, a: -0.15, b: 0.3, theta: 0.05 };
        const r = simulateShot(layout4c, input4c, paramsFromConfig(cfg4c));
        const p = decodeReplay(encodeReplay(replaySource(r, cfg4c)));
        expect(p).not.toBeNull();
        expect(p!.gameType).toBe("4c");
        expect(p!.table).toBe("JUNGDAE_KR");
        expect(p!.cushionModel).toBe("mathavan2010");
        expect(p!.condition).toBe(1.15);
        expect(p!.balls.map((b) => b.id).sort()).toEqual(["red1", "red2", "white", "yellow"]);
        expect(toReplayConfig(p!)).toEqual(buildConfig({ gameType: "4c", tableId: "JUNGDAE_KR", target: REPLAY_TARGET, condition: 1.15, cushionModel: "mathavan2010" }));
        expect(simulateShot(p!.balls, p!.input, paramsFromConfig(toReplayConfig(p!))).hash).toBe(r.hash);
    });

    it("깨진 입력은 전부 null", () => {
        const good = wireOf(encodeReplay(replaySource(result3c, cfg3c)));
        expect(parseReplay(good)).not.toBeNull();
        const mut = (patch: Record<string, unknown>) => parseReplay({ ...good, ...patch });
        const mutInput = (patch: Record<string, unknown>) => mut({ input: { ...good.input, ...patch } });

        expect(decodeReplay(null)).toBeNull();
        expect(decodeReplay(undefined)).toBeNull();
        expect(decodeReplay("")).toBeNull();
        expect(decodeReplay("!!!not-base64!!!")).toBeNull();
        expect(decodeReplay(btoa("not json"))).toBeNull();
        expect(parseReplay(null)).toBeNull();
        expect(parseReplay([])).toBeNull();
        expect(parseReplay({})).toBeNull();

        expect(mut({ v: 2 })).toBeNull();
        expect(mut({ v: "1" })).toBeNull();
        expect(mut({ table: "NOPE" })).toBeNull();
        expect(mut({ cushionModel: "weird" })).toBeNull();
        expect(mut({ condition: 1.03 })).toBeNull();   // 0.05 격자 밖
        expect(mut({ condition: 0.5 })).toBeNull();
        expect(mut({ condition: 1.25 })).toBeNull();
        expect(mut({ condition: "1" })).toBeNull();
        expect(mut({ condition: 1.15 })).not.toBeNull();

        const balls = good.balls as unknown[][];
        expect(mut({ balls: balls.slice(0, 2) })).toBeNull();
        expect(mut({ balls: [...balls, ["red2", 0.3, 0.3], ["red3", 0.5, 0.5]] })).toBeNull();
        expect(mut({ balls: [balls[0], balls[1], ["blue", balls[2][1], balls[2][2]]] })).toBeNull();
        expect(mut({ balls: [balls[0], balls[1], ["white", 0.5, 2.0]] })).toBeNull();               // 중복 id
        expect(mut({ balls: [balls[0], balls[1], ["red", balls[0][1], balls[0][2]]] })).toBeNull();  // 겹침
        expect(mut({ balls: [balls[0], balls[1], ["red", -1, 1]] })).toBeNull();                     // 테이블 밖
        expect(mut({ balls: [balls[0], balls[1], ["red", "0.7", 2.1]] })).toBeNull();                // 숫자 아님
        expect(mut({ balls: [balls[0], balls[1], ["red", 0.711, 2.133, "x"]] })).toBeNull();
        expect(mut({ balls: [balls[0], balls[1], ["red", 0.711, 2.133, 0.03, 1]] })).toBeNull();     // 항목 5개
        expect(mut({ balls: [balls[0], balls[1], [3, 0.711, 2.133]] })).toBeNull();                  // id 문자열 아님
        expect(mut({ balls: "x" })).toBeNull();
        // 4구 id 집합은 4개일 때만
        expect(mut({ balls: [balls[0], balls[1], ["red1", 0.711, 2.133]] })).toBeNull();

        expect(mut({ input: null })).toBeNull();
        expect(mutInput({ cueBallId: "red" })).toBeNull();
        expect(mutInput({ cueBallId: "yellow" })).not.toBeNull();
        expect(mutInput({ phi: -1 })).toBeNull();
        expect(mutInput({ phi: 7 })).toBeNull();
        expect(mutInput({ phi: "1" })).toBeNull();
        expect(mutInput({ V0: 0.1 })).toBeNull();
        expect(mutInput({ V0: 10 })).toBeNull();
        expect(mutInput({ theta: -0.1 })).toBeNull();
        expect(mutInput({ theta: 1.5 })).toBeNull();
        expect(mutInput({ a: 0.5, b: 0.5 })).toBeNull();    // 미스큐 링 밖
        expect(mutInput({ a: 0.3, b: 0.3 })).not.toBeNull();
        expect(mutInput({ a: "0" })).toBeNull();

        expect(mut({ hash: "xyz" })).toBeNull();
        expect(mut({ hash: good.hash.toUpperCase() })).toBeNull();
        expect(mut({ hash: 1 })).toBeNull();
        expect(mut({ engineVersion: "" })).toBeNull();
        expect(mut({ engineVersion: undefined })).toBeNull();
        expect(mut({ engineVersion: "v".repeat(40) })).toBeNull();
    });

    it("forSoloSession: 흰 공 샷은 그대로, 노란 공 샷은 id 를 맞바꾸고 verifiable=false", () => {
        const p = decodeReplay(encodeReplay(replaySource(result3c, cfg3c)))!;
        const white = forSoloSession(p);
        expect(white.balls).toBe(p.balls);
        expect(white.input).toBe(p.input);
        expect(white.verifiable).toBe(true);

        const yellowShot = decodeReplay(encodeReplay({ ...replaySource(result3c, cfg3c), input: { ...input3c, cueBallId: "yellow" } }))!;
        const solo = forSoloSession(yellowShot);
        expect(solo.verifiable).toBe(false);
        expect(solo.input.cueBallId).toBe("white");
        const byId = new Map(solo.balls.map((b) => [b.id, b]));
        const origById = new Map(yellowShot.balls.map((b) => [b.id, b]));
        expect(byId.get("white")!.r).toEqual(origById.get("yellow")!.r);
        expect(byId.get("yellow")!.r).toEqual(origById.get("white")!.r);
        expect(byId.get("red")!.r).toEqual(origById.get("red")!.r);
    });

    it("URL 헬퍼: readReplayParam · replayPath · replayUrl · currentOrigin", () => {
        expect(readReplayParam("?replay=abc")).toBe("abc");
        expect(readReplayParam("replay=abc&cfg=1")).toBe("abc");
        expect(readReplayParam("?cfg=1")).toBeNull();
        expect(readReplayParam("")).toBeNull();
        expect(readReplayParam(undefined)).toBeNull();
        expect(replayPath("abc")).toBe("/online-game?replay=abc");
        expect(replayUrl("abc", "https://x.y")).toBe("https://x.y/online-game?replay=abc");
        expect(currentOrigin({ origin: "https://rankue-preview.vercel.app", hostname: "rankue-preview.vercel.app" })).toBe("https://rankue-preview.vercel.app");
        expect(currentOrigin({ origin: "https://localhost:5001", hostname: "localhost" })).toBe(SITE_ORIGIN);
        expect(currentOrigin({ origin: "http://192.168.0.2:5001", hostname: "192.168.0.2" })).toBe(SITE_ORIGIN);
        expect(currentOrigin({ origin: "capacitor://localhost", hostname: "localhost" })).toBe(SITE_ORIGIN);
        expect(currentOrigin(null)).toBe(SITE_ORIGIN);
        expect(currentOrigin()).toBe(SITE_ORIGIN);  // node: location 없음
        expect(replayUrl("abc")).toBe(`${SITE_ORIGIN}/online-game?replay=abc`);
    });
});
