import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { cleanRemoteImageUrl, LOGO_FETCH_MAX_BYTES, LOGO_FETCH_TIMEOUT_MS } from "../../shared/golfLogo.js";
import { detectImageKind } from "../utils/imageMeta.js";

/**
 * 다른 사이트의 그림을 서버가 대신 받아 온다 — 어드민 로고 올리기 전용(2026-10-07).
 * 골프장 홈페이지에서 로고를 끌어다 놓으면 브라우저는 파일이 아니라 **주소**만 건넨다. 화면은 다른 사이트의 그림을 읽을 수 없어(CORS)
 * 서버가 받아서 넘겨준다. 받은 것은 저장하지 않는다 — 화면이 PNG 로 다시 그려 따로 올린다(routes/adminGolf/courses.ts).
 *
 * 관리자만 부를 수 있지만, 서버가 아무 주소로나 요청을 보내는 길이 되지 않게 지킨다:
 *  - http·https 만 · 이름이 가리키는 주소가 **전부 공개 주소**일 때만(사설망·로컬·클라우드 메타데이터 주소 금지)
 *  - 넘겨 보내기(redirect)는 따라가되 3번까지, 매번 같은 검사를 다시
 *  - 6초 · 2MB · 그림으로 알아볼 수 있는 것만(png·jpeg·webp·gif·svg)
 *  - 우리 쪽 값(쿠키·토큰)은 싣지 않는다
 */
export type RemoteImageType = "png" | "jpeg" | "webp" | "gif" | "svg";
export type RemoteImageResult =
    | { ok: true; type: RemoteImageType; mime: string; buffer: Buffer; url: string }
    | { ok: false; reason: "bad-url" | "private" | "dns" | "http" | "too-big" | "not-image" | "timeout" | "redirects" | "network"; status?: number };

const MIME: Record<RemoteImageType, string> = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml" };
const MAX_REDIRECTS = 3;

/** 공개 주소인가 — 사설·로컬·링크 로컬(169.254 — 클라우드 메타데이터)·CGNAT·멀티캐스트·예약 대역은 아니다 */
export function isPublicAddress(ip: string): boolean {
    const v = isIP(ip);
    if (v === 4) {
        const p = ip.split(".").map(Number);
        const [a, b] = p;
        if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
        if (a === 100 && b >= 64 && b <= 127) return false;
        if (a === 169 && b === 254) return false;
        if (a === 172 && b >= 16 && b <= 31) return false;
        if (a === 192 && b === 168) return false;
        if (a === 192 && b === 0 && p[2] === 0) return false;
        if (a === 198 && (b === 18 || b === 19)) return false;
        return true;
    }
    if (v === 6) {
        const low = ip.toLowerCase();
        // IPv4 를 감싼 주소(::ffff:10.0.0.1 · ::ffff:0a00:1)는 속의 IPv4 로 본다
        const dotted = low.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
        if (dotted) return isPublicAddress(dotted[1]);
        const hex = low.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
        if (hex) {
            const hi = parseInt(hex[1], 16), lo = parseInt(hex[2], 16);
            return isPublicAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
        }
        if (low === "::" || low === "::1") return false;
        // 공개 IPv6 는 2000::/3 뿐이다(fc00::/7 사설 · fe80::/10 링크 로컬 · ff00::/8 멀티캐스트 · 64:ff9b:: 변환 등은 밖)
        const first = parseInt(low.split(":")[0] || "0", 16);
        return first >= 0x2000 && first <= 0x3fff;
    }
    return false;
}

export type LookupAll = (host: string) => Promise<{ address: string }[]>;
const systemLookup: LookupAll = (host) => dnsLookup(host, { all: true, verbatim: true });

/** 그 주소의 호스트가 공개 주소만 가리키는가 */
export async function hostIsPublic(hostname: string, lookup: LookupAll = systemLookup): Promise<"ok" | "private" | "dns"> {
    const host = hostname.replace(/^\[|\]$/g, "");
    if (isIP(host)) return isPublicAddress(host) ? "ok" : "private";
    if (/(^|\.)(localhost|local|internal|lan|home|corp)$/i.test(host)) return "private";
    let addrs: { address: string }[];
    try { addrs = await lookup(host); } catch { return "dns"; }
    if (!addrs.length) return "dns";
    return addrs.every((a) => isPublicAddress(a.address)) ? "ok" : "private";
}

/** 받은 바이트가 무슨 그림인가 — 응답 머리의 content-type 은 믿지 않는다 */
export function sniffImage(buffer: Buffer): RemoteImageType | null {
    const kind = detectImageKind(buffer);
    if (kind) return kind;
    if (buffer.length >= 6 && /^GIF8[79]a$/.test(buffer.toString("latin1", 0, 6))) return "gif";
    // SVG — 글자 파일이다. 앞머리(BOM·xml 선언·주석·doctype 뒤)에 <svg 가 있어야 한다
    const head = buffer.toString("utf8", 0, Math.min(buffer.length, 4096)).replace(/^﻿/, "");
    if (/^\s*(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<!DOCTYPE[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(head)) return "svg";
    return null;
}

export async function fetchRemoteImage(raw: unknown, deps: { fetchImpl?: typeof fetch; lookup?: LookupAll } = {}): Promise<RemoteImageResult> {
    const fetchImpl = deps.fetchImpl ?? fetch;
    let url = cleanRemoteImageUrl(raw);
    if (!url) return { ok: false, reason: "bad-url" };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), LOGO_FETCH_TIMEOUT_MS);
    try {
        for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
            const u = new URL(url);
            const pub = await hostIsPublic(u.hostname, deps.lookup);
            if (pub !== "ok") return { ok: false, reason: pub };
            const res = await fetchImpl(url, {
                signal: ctrl.signal,
                redirect: "manual",
                headers: { Accept: "image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.5", "User-Agent": "Mozilla/5.0 (compatible; RankueAdmin/1.0; +https://www.rankue.co.kr)" },
            });
            if (res.status >= 300 && res.status < 400) {
                const next = cleanRemoteImageUrl(new URL(res.headers.get("location") ?? "", url).toString());
                if (!next) return { ok: false, reason: "bad-url" };
                url = next;
                continue;
            }
            if (!res.ok) return { ok: false, reason: "http", status: res.status };
            if (Number(res.headers.get("content-length") ?? 0) > LOGO_FETCH_MAX_BYTES) return { ok: false, reason: "too-big" };
            const buffer = Buffer.from(await res.arrayBuffer());
            if (buffer.length > LOGO_FETCH_MAX_BYTES) return { ok: false, reason: "too-big" };
            const type = sniffImage(buffer);
            if (!type) return { ok: false, reason: "not-image" };
            return { ok: true, type, mime: MIME[type], buffer, url };
        }
        return { ok: false, reason: "redirects" };
    } catch (e) {
        return { ok: false, reason: (e as Error)?.name === "AbortError" ? "timeout" : "network" };
    } finally {
        clearTimeout(timer);
    }
}
