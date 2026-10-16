/**
 * 친구 초대 길이 다른 길에 가로채이지 않는가(2026-10-16 사고: 게임 초대 코드의 GET /invite/:code 가 먼저 걸려
 * 친구 초대의 /invite/me 를 'me' 라는 코드로 받았다 → 화면의 '초대 카드 보내기'가 늘 꺼져 있었다).
 * 실제 /api/hiq 라우터를 그대로 펼쳐, 요청마다 **처음 맞는 길**이 친구 초대 모듈의 것인지 본다.
 */
import { describe, expect, it } from "vitest";
import type { Router } from "express";

type Layer = { route?: { path: string; methods: Record<string, boolean> }; handle: any; match: (p: string) => boolean; regexp: RegExp; path?: string; keys?: unknown[] };

/** 처음 맞는 길의 경로 — 묶음(router.use)은 앞마디를 떼고 안으로 들어간다 */
function firstRoute(stack: Layer[], method: string, path: string): string | null {
    for (const layer of stack) {
        if (!layer.match(path)) continue;
        if (layer.route) {
            if (layer.route.methods[method] || layer.route.methods._all) return layer.route.path;
            continue;
        }
        if (layer.handle?.stack) {
            const prefix = (layer as any).path ?? "";
            const rest = path.slice(prefix.length) || "/";
            const hit = firstRoute(layer.handle.stack, method, rest.startsWith("/") ? rest : `/${rest}`);
            if (hit) return hit;
        }
    }
    return null;
}

describe("친구 초대 — 길 순서", () => {
    it("내 코드 · 링크 카드 · 내기는 친구 초대 모듈이 받는다(게임 초대 코드와 겹치지 않는다)", async () => {
        const mod = await import("./index.js");
        const router = mod.default as unknown as Router & { stack: Layer[] };
        expect(firstRoute(router.stack, "get", "/friend-invite/me")).toBe("/friend-invite/me");
        expect(firstRoute(router.stack, "get", "/friend-invite/code/K7QX2M")).toBe("/friend-invite/code/:code");
        expect(firstRoute(router.stack, "post", "/friend-invite/claim")).toBe("/friend-invite/claim");
        // 게임 초대 코드는 그대로
        expect(firstRoute(router.stack, "get", "/invite/123456")).toBe("/invite/:code");
        // 사고의 모양 — 옛 주소 /invite/me 는 게임 초대 코드가 받는다(그래서 /friend-invite 로 옮겼다)
        expect(firstRoute(router.stack, "get", "/invite/me")).toBe("/invite/:code");
        // 받은 선물 · 어드민 굿즈(2026-10-16)도 다른 길에 가로채이지 않는다
        expect(firstRoute(router.stack, "get", "/gifts/11111111-1111-4111-8111-111111111111")).toBe("/gifts/:id");
        expect(firstRoute(router.stack, "post", "/admin/goods/grant")).toBe("/grant");
        expect(firstRoute(router.stack, "get", "/admin/goods/member/abc")).toBe("/member/:id");
    }, 30_000);
});
