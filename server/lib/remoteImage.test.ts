import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRemoteImage, hostIsPublic, isPublicAddress, sniffImage, type LookupAll } from "./remoteImage.js";
import { LOGO_FETCH_MAX_BYTES, LOGO_FETCH_TIMEOUT_MS } from "../../shared/golfLogo.js";

/**
 * 다른 사이트의 그림을 서버가 대신 받아 오는 길(어드민 로고 올리기, 2026-10-07).
 * 관리자만 부르지만, 서버가 아무 주소로나 요청을 보내는 길이 되면 안 된다 — 사설망·로컬·클라우드 메타데이터 주소,
 * 그리로 넘겨 보내는 응답, 그림이 아닌 응답을 전부 막는지 본다. 실제 사이트에 붙지 않는다(fetch·DNS 를 가짜로).
 */
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 1)]);
const publicDns: LookupAll = async () => [{ address: "203.0.113.10" }];
const respond = (body: Buffer | string, init: ResponseInit = {}) => new Response(body, { status: 200, ...init });

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("isPublicAddress — 공개 주소만", () => {
    it("사설·로컬·링크 로컬·CGNAT·멀티캐스트·예약 대역은 아니다", () => {
        for (const ip of [
            "0.0.0.0", "10.0.0.1", "10.255.255.255", "127.0.0.1", "127.9.9.9", "169.254.169.254", "172.16.0.1", "172.31.255.255",
            "192.168.0.1", "192.0.0.8", "100.64.0.1", "100.127.255.255", "198.18.0.1", "198.19.255.255", "224.0.0.1", "239.1.1.1", "255.255.255.255",
            "::", "::1", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1", "64:ff9b::a00:1",
            "::ffff:10.0.0.1", "::ffff:127.0.0.1", "::ffff:a00:1", "::ffff:a9fe:a9fe",
            "not-an-ip", "", "1.2.3", "999.1.1.1",
        ]) expect(isPublicAddress(ip), ip).toBe(false);
    });

    it("공개 주소는 된다", () => {
        for (const ip of ["8.8.8.8", "203.0.113.10", "172.15.0.1", "172.32.0.1", "100.63.0.1", "100.128.0.1", "192.167.1.1", "198.17.0.1", "2001:4860:4860::8888", "2404:6800::1", "::ffff:8.8.8.8", "::ffff:808:808"]) {
            expect(isPublicAddress(ip), ip).toBe(true);
        }
    });
});

describe("hostIsPublic — 이름이 가리키는 주소를 전부 본다", () => {
    it("주소 하나라도 사설이면 막는다(이름 하나에 공개·사설을 섞어 답하는 경우)", async () => {
        expect(await hostIsPublic("club.example", async () => [{ address: "203.0.113.10" }, { address: "10.0.0.5" }])).toBe("private");
        expect(await hostIsPublic("club.example", async () => [{ address: "203.0.113.10" }, { address: "2001:db8::1" }])).toBe("ok");
        expect(await hostIsPublic("club.example", async () => [])).toBe("dns");
        expect(await hostIsPublic("club.example", async () => { throw new Error("ENOTFOUND"); })).toBe("dns");
    });

    it("주소를 직접 적은 경우 · 안쪽 이름(localhost·.local·.internal)은 DNS 를 묻지 않고 판정한다", async () => {
        const lookup = vi.fn(publicDns);
        expect(await hostIsPublic("127.0.0.1", lookup)).toBe("private");
        expect(await hostIsPublic("169.254.169.254", lookup)).toBe("private");
        expect(await hostIsPublic("[::1]", lookup)).toBe("private");
        expect(await hostIsPublic("8.8.8.8", lookup)).toBe("ok");
        for (const h of ["localhost", "db.internal", "printer.local", "nas.lan", "app.localhost"]) expect(await hostIsPublic(h, lookup), h).toBe("private");
        expect(lookup).not.toHaveBeenCalled();
    });
});

describe("sniffImage — 받은 바이트로 판정한다(응답 머리는 믿지 않는다)", () => {
    it("png · jpeg · webp · gif · svg", () => {
        expect(sniffImage(PNG)).toBe("png");
        expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe("jpeg");
        expect(sniffImage(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(8)]))).toBe("webp");
        expect(sniffImage(Buffer.from("GIF89a\x01\x00\x01\x00", "latin1"))).toBe("gif");
        expect(sniffImage(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>`))).toBe("svg");
        expect(sniffImage(Buffer.from(`﻿<?xml version="1.0"?>\n<!-- logo -->\n<!DOCTYPE svg PUBLIC "x" "y">\n<svg width="10"></svg>`))).toBe("svg");
    });

    it("웹 문서 · 글자 · 빈 응답은 그림이 아니다 — 본문 안에 <svg 가 들어 있는 웹 문서도", () => {
        for (const s of ["<!doctype html><html><body><svg></svg></body></html>", "<html><svg/></html>", "로그인하세요", "", "{\"error\":true}", "<svgx>"]) {
            expect(sniffImage(Buffer.from(s)), s.slice(0, 30)).toBeNull();
        }
    });
});

describe("fetchRemoteImage", () => {
    it("그림을 받아 종류와 함께 돌려준다 — 요청에 우리 쪽 값(쿠키·인증)을 싣지 않는다", async () => {
        const fetchImpl = vi.fn(async () => respond(PNG, { headers: { "content-type": "text/plain" } }));
        const r = await fetchRemoteImage("https://club.example/images/logo.png", { fetchImpl: fetchImpl as unknown as typeof fetch, lookup: publicDns });
        expect(r).toMatchObject({ ok: true, type: "png", mime: "image/png", url: "https://club.example/images/logo.png" });
        expect(r.ok && r.buffer.equals(PNG)).toBe(true);
        const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
        expect(init.redirect).toBe("manual");
        expect(init.signal).toBeInstanceOf(AbortSignal);
        const sent = new Headers(init.headers);
        expect(sent.get("cookie")).toBeNull();
        expect(sent.get("authorization")).toBeNull();
    });

    it("받을 수 없는 주소 꼴이면 DNS 도 요청도 없다", async () => {
        const fetchImpl = vi.fn();
        const lookup = vi.fn(publicDns);
        for (const v of ["", null, "javascript:alert(1)", "file:///etc/passwd", "data:image/png;base64,AA", "https://user:pw@club.example/a.png", "http://localhost/a.png", "http://[fd00::1]/logo.png", "http://[::1]/a.png"]) {
            expect(await fetchRemoteImage(v, { fetchImpl: fetchImpl as unknown as typeof fetch, lookup }), String(v)).toEqual({ ok: false, reason: "bad-url" });
        }
        expect(lookup).not.toHaveBeenCalled();
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("사설 주소로 가는 요청은 보내지 않는다 — 주소를 직접 적었든, 이름이 그리로 풀리든", async () => {
        const fetchImpl = vi.fn(async () => respond(PNG));
        for (const url of ["http://169.254.169.254/latest/meta-data/", "http://10.0.0.5/logo.png", "http://127.0.0.1:5002/api/hiq/me"]) {
            expect(await fetchRemoteImage(url, { fetchImpl: fetchImpl as unknown as typeof fetch, lookup: publicDns }), url).toEqual({ ok: false, reason: "private" });
        }
        expect(await fetchRemoteImage("https://rebind.example/logo.png", { fetchImpl: fetchImpl as unknown as typeof fetch, lookup: async () => [{ address: "192.168.0.10" }] }))
            .toEqual({ ok: false, reason: "private" });
        expect(await fetchRemoteImage("https://nowhere.example/logo.png", { fetchImpl: fetchImpl as unknown as typeof fetch, lookup: async () => { throw new Error("ENOTFOUND"); } }))
            .toEqual({ ok: false, reason: "dns" });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("넘겨 보내기는 따라가되 매번 다시 검사한다 — 안쪽 주소로 넘기면 거기서 멈춘다", async () => {
        const hops: string[] = [];
        const fetchImpl = vi.fn(async (url: string) => {
            hops.push(url);
            if (url === "http://club.example/logo.png") return respond("", { status: 301, headers: { location: "https://www.club.example/logo.png" } });
            if (url === "https://www.club.example/logo.png") return respond("", { status: 302, headers: { location: "/img/logo-v2.png" } });
            if (url === "https://www.club.example/img/logo-v2.png") return respond(PNG);
            if (url === "https://trap.example/a.png") return respond("", { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } });
            throw new Error("시험에 없는 주소 " + url);
        });
        const ok = await fetchRemoteImage("http://club.example/logo.png", { fetchImpl: fetchImpl as unknown as typeof fetch, lookup: publicDns });
        expect(ok).toMatchObject({ ok: true, url: "https://www.club.example/img/logo-v2.png" });
        expect(hops).toEqual(["http://club.example/logo.png", "https://www.club.example/logo.png", "https://www.club.example/img/logo-v2.png"]);

        hops.length = 0;
        expect(await fetchRemoteImage("https://trap.example/a.png", { fetchImpl: fetchImpl as unknown as typeof fetch, lookup: publicDns })).toEqual({ ok: false, reason: "private" });
        expect(hops).toEqual(["https://trap.example/a.png"]);
    });

    it("넘겨 보내기가 3번을 넘으면 그만둔다", async () => {
        let n = 0;
        const fetchImpl = vi.fn(async () => respond("", { status: 302, headers: { location: `https://club.example/hop${++n}` } }));
        expect(await fetchRemoteImage("https://club.example/start", { fetchImpl: fetchImpl as unknown as typeof fetch, lookup: publicDns })).toEqual({ ok: false, reason: "redirects" });
        expect(fetchImpl).toHaveBeenCalledTimes(4);
    });

    it("그림이 아닌 응답 · 실패 응답 · 너무 큰 응답", async () => {
        const run = (res: () => unknown) => fetchRemoteImage("https://club.example/x", { fetchImpl: (async () => res()) as unknown as typeof fetch, lookup: publicDns });
        expect(await run(() => respond("<!doctype html><html></html>", { headers: { "content-type": "image/png" } }))).toEqual({ ok: false, reason: "not-image" });
        expect(await run(() => respond("없음", { status: 404 }))).toEqual({ ok: false, reason: "http", status: 404 });
        expect(await run(() => respond("금지", { status: 403 }))).toEqual({ ok: false, reason: "http", status: 403 });
        // 길이를 알려 줬으면 본문을 읽기 전에
        let read = false;
        const declared = { status: 200, ok: true, headers: new Headers({ "content-length": String(LOGO_FETCH_MAX_BYTES + 1) }), arrayBuffer: async () => { read = true; return new ArrayBuffer(0); } };
        expect(await run(() => declared)).toEqual({ ok: false, reason: "too-big" });
        expect(read).toBe(false);
        const big = Buffer.concat([PNG, Buffer.alloc(LOGO_FETCH_MAX_BYTES)]);
        const undeclared = { status: 200, ok: true, headers: new Headers(), arrayBuffer: async () => big.buffer.slice(big.byteOffset, big.byteOffset + big.byteLength) };
        expect(await run(() => undeclared)).toEqual({ ok: false, reason: "too-big" });
    });

    it("6초 안에 안 오면 끊는다 · 연결 실패는 network", async () => {
        expect(LOGO_FETCH_TIMEOUT_MS).toBe(6000);
        vi.useFakeTimers();
        const hang = (_u: string, init: RequestInit) => new Promise<Response>((_res, rej) => {
            init.signal!.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })));
        });
        const p = fetchRemoteImage("https://slow.example/logo.png", { fetchImpl: hang as unknown as typeof fetch, lookup: publicDns });
        await vi.advanceTimersByTimeAsync(LOGO_FETCH_TIMEOUT_MS + 1);
        expect(await p).toEqual({ ok: false, reason: "timeout" });
        vi.useRealTimers();
        const boom = async () => { throw new TypeError("fetch failed"); };
        expect(await fetchRemoteImage("https://down.example/logo.png", { fetchImpl: boom as unknown as typeof fetch, lookup: publicDns })).toEqual({ ok: false, reason: "network" });
    });
});
