/**
 * PBA 선수 사진 찾기(2026-09-27 오너: "사진 연동하고 출처만 짧게").
 * 첫 배포는 선수 상세 JSON 의 사진 칸 이름을 짐작(ImgURL)했다가 하나도 안 떴다 — 상세 JSON 에는 사진 칸이 없을 수 있다.
 * 그래서 칸 이름에 기대지 않고 (1) 상세 JSON 안의 '사진처럼 생긴' 값 → (2) 공식 선수 페이지 HTML 의 선수 사진 순으로 찾는다.
 * 사진은 우리 서버가 받아 대신 보낸다 — pbatour.org 가 중간 인증서를 빠뜨려(pbaService.ts 참고) 안드로이드 웹뷰가 직접 못 여는 탓.
 * 저장하지 않는다(CDN 캐시만).
 */

const IMG_EXT = /\.(jpe?g|png|webp|gif)(?:[?#]|$)/i;
const KEY_HINT = /img|image|photo|pic|profile|thumb/i;
const PATH_HINT = /player|profile|photo|upload|member/i;
/** 로고·아이콘·국기·배너 같은 장식 이미지는 선수 사진이 아니다 */
const NOT_PHOTO = /logo|icon|banner|sns|flag|nation|btn|bg_|sprite|arrow|loading|noimg|no_img|default|blank|favicon|kakao|naver|facebook|instagram|youtube/i;

/** 공식 응답에서 나온 주소만, https 로 — 내부 주소(localhost·IP)는 막는다(서버가 대신 받으니 SSRF 방지) */
export function safeImageUrl(raw: unknown, base: string): string | null {
    if (typeof raw !== "string") return null;
    const v = raw.trim();
    if (!v || v.length > 1000) return null;
    try {
        const u = new URL(v, base);
        if (u.protocol !== "https:" && u.protocol !== "http:") return null;
        u.protocol = "https:";
        const h = u.hostname.toLowerCase();
        if (!h.includes(".") || h === "localhost" || /^[\d.]+$/.test(h) || h.includes(":") || h.startsWith("[")) return null;
        if (h.endsWith(".local") || h.endsWith(".internal")) return null;
        return u.toString();
    } catch { return null; }
}

/** 상세 JSON 안에서 사진 주소 — 칸 이름(img·photo…)과 모양(.jpg·/upload/)으로 점수를 매겨 가장 그럴듯한 하나 */
export function imageFromJson(data: unknown): string | null {
    let best: { v: string; score: number } | null = null;
    const walk = (node: unknown, key: string, depth: number) => {
        if (depth > 4 || node == null) return;
        if (typeof node === "string") {
            const v = node.trim();
            if (!v || v.length > 1000 || NOT_PHOTO.test(v)) return;
            const ext = IMG_EXT.test(v);
            const keyHint = KEY_HINT.test(key);
            if (!ext && !(keyHint && v.includes("/"))) return;
            const score = (ext ? 2 : 0) + (keyHint ? 2 : 0) + (PATH_HINT.test(v) ? 1 : 0);
            if (!best || score > best.score) best = { v, score };
            return;
        }
        if (Array.isArray(node)) { node.slice(0, 20).forEach((x) => walk(x, key, depth + 1)); return; }
        if (typeof node === "object") for (const [k, x] of Object.entries(node as Record<string, unknown>)) walk(x, k, depth + 1);
    };
    walk(data, "", 0);
    return (best as { v: string } | null)?.v ?? null;
}

/** 선수 페이지 HTML 에서 사진 — memCode 가 든 주소가 가장 확실, 그다음 player·profile·upload 경로. 장식 이미지는 뺀다. */
export function imageFromHtml(html: string, memCode: string): string | null {
    const found: { v: string; score: number }[] = [];
    const push = (v: string | undefined, bonus: number) => {
        if (!v) return;
        const s = v.trim().replace(/&amp;/g, "&");
        if (!s || s.startsWith("data:") || NOT_PHOTO.test(s)) return;
        let score = bonus;
        if (s.includes(memCode)) score += 5;
        if (PATH_HINT.test(s)) score += 2;
        if (IMG_EXT.test(s)) score += 1;
        if (score >= 3) found.push({ v: s, score });
    };
    for (const m of html.matchAll(/<meta[^>]+(?:property|name)=["']og:image["'][^>]*>/gi)) push(/content=["']([^"']+)["']/i.exec(m[0])?.[1], 0);
    for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
        const tag = m[0];
        const src = /\s(?:data-src|data-original|src)=["']([^"']+)["']/i.exec(tag)?.[1];
        push(src, /alt=["'][^"']*(선수|player|photo|사진)/i.test(tag) ? 1 : 0);
    }
    for (const m of html.matchAll(/background(?:-image)?\s*:\s*url\(\s*['"]?([^'")]+)['"]?\s*\)/gi)) push(m[1], 0);
    found.sort((a, b) => b.score - a.score);
    return found[0]?.v ?? null;
}

/** 공식 선수 페이지 후보(주소 규칙을 실측하지 못해 몇 개를 차례로 본다) */
export const PBA_PLAYER_PAGES = (code: string) => [
    `/ko/player/search/detail?memCode=${code}`,
    `/ko/player/search/view?memCode=${code}`,
    `/ko/player/detail?memCode=${code}`,
    `/ko/player/search/index?memCode=${code}`,
];

export interface PhotoDeps {
    fetchJson: (path: string) => Promise<any>;
    fetchRaw: (url: string, accept: string, referer?: boolean) => Promise<Response>;
    origin: string;
}

/** 사진 주소 찾기. trace 에는 어디서 무엇을 봤는지 남긴다(?why=1 진단용 — 공개 정보만). */
export async function resolvePbaPhoto(memCode: string, deps: PhotoDeps, trace: string[] = []): Promise<string | null> {
    const code = encodeURIComponent(memCode);
    try {
        const json = await deps.fetchJson(`/ko/player/search/ajax/detail?memCode=${code}`);
        const data = json?.data;
        trace.push(`json resultCode=${json?.resultCode} keys=${data && typeof data === "object" ? Object.keys(data).join(",") : typeof data}`);
        // 실측(2026-09-27 ?why=1): data.ImgURL(작은 사진)·ImgURLBig(큰 사진) — 작은 것부터, 없으면 모양으로 찾는다
        const url = safeImageUrl(data?.ImgURL, deps.origin) ?? safeImageUrl(data?.ImgURLBig, deps.origin) ?? safeImageUrl(imageFromJson(data), deps.origin);
        if (url) { trace.push(`json → ${url}`); return url; }
    } catch (e) {
        trace.push(`json error ${(e as Error)?.message}`);
    }
    for (const path of PBA_PLAYER_PAGES(code)) {
        try {
            const r = await deps.fetchRaw(path, "text/html");
            const html = r.ok ? await r.text() : "";
            const url = html ? safeImageUrl(imageFromHtml(html, memCode), new URL(path, deps.origin).toString()) : null;
            trace.push(`page ${path} ${r.status} len=${html.length} imgs=${(html.match(/<img\b/gi) ?? []).length} → ${url ?? "-"}`);
            if (url) return url;
        } catch (e) {
            trace.push(`page ${path} error ${(e as Error)?.message}`);
        }
    }
    return null;
}

export const PHOTO_MAX_BYTES = 3 * 1024 * 1024;

/** 파일 머리로 이미지 종류를 알아낸다 — PBA 사진 서버가 content-type 을 image/* 로 주지 않을 때가 있다(실측: '이미지 아님') */
export function sniffImage(b: Buffer): string | null {
    if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
    if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
    if (b.length >= 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "image/webp";
    if (b.length >= 6 && /^GIF8[79]a$/.test(b.toString("latin1", 0, 6))) return "image/gif";
    return null;
}

/**
 * 사진 바이트 — 파일 머리가 jpeg·png·webp·gif 이고 3MB 이하만(보내는 content-type 은 파일 머리를 따른다).
 * 먼저 Referer 를 붙여 받고, 막히면 한 번 빼고 다시 받는다. trace 에 상태·형식·크기를 남긴다.
 */
export async function fetchPhotoBytes(url: string, deps: Pick<PhotoDeps, "fetchRaw">, trace: string[] = []): Promise<{ type: string; body: Buffer } | null> {
    for (const referer of [true, false]) {
        const r = await deps.fetchRaw(url, "image/avif,image/webp,image/*;q=0.8,*/*;q=0.5", referer);
        const ct = r.headers.get("content-type") ?? "";
        if (!r.ok) { trace.push(`img referer=${referer} status=${r.status} type=${ct}`); continue; }
        const body = Buffer.from(await r.arrayBuffer());
        const type = sniffImage(body);
        trace.push(`img referer=${referer} status=${r.status} type=${ct} len=${body.length} sniff=${type ?? "-"} head=${body.subarray(0, 8).toString("hex")}`);
        if (type && body.length <= PHOTO_MAX_BYTES) return { type, body };
        if (!type) return null; // 받긴 했는데 이미지가 아니다 — Referer 탓이 아니니 다시 받지 않는다
    }
    return null;
}
