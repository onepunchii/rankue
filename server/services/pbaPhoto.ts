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

/*
 * 실측(2026-09-27 ?why=1): 상세 JSON 에 ImgURL(작은)·ImgURLBig(큰) 가 있지만 그 값을 사이트 뿌리에 그대로 붙이면 404 다
 * (https://www.pbatour.org/players/PBA/small/… → 404). 사이트 화면은 앞에 무언가를 붙여 쓴다 — 그 앞머리를
 * (1) 공식 선수 검색 화면과 그 스크립트에서 'ImgURL' 을 쓰는 코드로 배우고, (2) 흔한 업로드 경로로 짐작해 차례로 받아 본다.
 * 한 번 맞은 앞머리는 기억해 다음 선수부터는 첫 시도에 맞힌다.
 */
const GUESS_PREFIXES = ["/upload", "/uploads", "/files", "/file", "/data", "/resources", "/static", "/img", "/images", "/ko", "/common"];
const LEARN_PAGES = ["/ko/player/search/index", "/en/player/search/index"];
const LEARN_TTL = 60 * 60 * 1000;
let learned: { at: number; prefixes: string[]; notes: string[] } | null = null;
let goodPrefix: string | null = null;
/** 짐작이 연달아 빗나가면 한 시간 쉰다 — 선수마다 PBA 에 십여 번씩 묻지 않게(진단 ?why=1 은 늘 끝까지 본다) */
let guessMiss = { n: 0, at: 0 };

/** 스크립트·HTML 에서 ImgURL 앞에 붙는 문자열 — `"앞머리" + x.ImgURL` · `` `앞머리${x.ImgURL}` `` */
export function prefixesFromCode(text: string): string[] {
    const out = new Set<string>();
    for (const m of text.matchAll(/["'`]([^"'`\s<>]{0,200})["'`]\s*\+\s*[\w$.\[\]'"]{0,80}ImgURL/g)) out.add(m[1]);
    for (const m of text.matchAll(/`([^`$<>\s]{0,200})\$\{\s*[\w$.\[\]'"]{0,80}ImgURL/g)) out.add(m[1]);
    return [...out].filter((x) => x && !/[<>]/.test(x)).slice(0, 5);
}

/** 앞머리 + 경로 → 절대 주소. 앞머리가 비었거나 이상하면 null */
export function joinPrefix(prefix: string, raw: string, origin: string): string | null {
    let path = raw.trim();
    try { if (/^https?:\/\//i.test(path)) { const u = new URL(path); path = u.pathname + u.search; } } catch { return null; }
    const p = prefix.replace(/\/+$/, "");
    return safeImageUrl(`${p}/${path.replace(/^\/+/, "")}`, origin);
}

async function learnPrefixes(deps: PhotoDeps, trace: string[]): Promise<string[]> {
    if (learned && Date.now() - learned.at < LEARN_TTL) { trace.push(`learned(cached) ${JSON.stringify(learned.prefixes)} ${learned.notes.join(" | ")}`); return learned.prefixes; }
    const prefixes = new Set<string>();
    const notes: string[] = [];
    const scan = (label: string, text: string) => {
        let i = text.indexOf("ImgURL"), n = 0;
        while (i >= 0 && n < 3) { notes.push(`${label}: …${text.slice(Math.max(0, i - 90), i + 40).replace(/\s+/g, " ")}…`); i = text.indexOf("ImgURL", i + 6); n++; }
        prefixesFromCode(text).forEach((x) => prefixes.add(x));
    };
    for (const page of LEARN_PAGES) {
        try {
            const r = await deps.fetchRaw(page, "text/html");
            const html = r.ok ? await r.text() : "";
            notes.push(`${page} ${r.status} len=${html.length}`);
            if (!html) continue;
            scan(page, html);
            const srcs = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1])
                .filter((src) => !/jquery|bootstrap|swiper|gtag|googletag|analytics|kakao|facebook|naver|slick|moment|lodash|polyfill/i.test(src))
                .slice(0, 12);
            notes.push(`scripts ${srcs.join(",")}`);
            for (const src of srcs) {
                try {
                    const url = new URL(src, new URL(page, deps.origin));
                    if (!/pbatour\.org$/i.test(url.hostname)) continue;
                    const js = await deps.fetchRaw(url.toString(), "*/*");
                    if (js.ok) scan(url.pathname, await js.text());
                } catch { /* 스크립트 하나 실패는 넘어간다 */ }
            }
            if (prefixes.size) break;
        } catch (e) {
            notes.push(`${page} error ${(e as Error)?.message}`);
        }
    }
    learned = { at: Date.now(), prefixes: [...prefixes], notes: notes.slice(0, 12) };
    trace.push(`learned ${JSON.stringify(learned.prefixes)} ${learned.notes.join(" | ")}`);
    return learned.prefixes;
}

/** 시험용 — 배운 앞머리·맞은 앞머리를 비운다 */
export function resetPhotoLearning() { learned = null; goodPrefix = null; guessMiss = { n: 0, at: 0 }; }

/**
 * 사진 찾기 + 받기. 후보 주소를 차례로 받아 이미지가 나오면 그 바이트. trace 는 ?why=1 진단(공개 정보만).
 */
export async function findPbaPhoto(memCode: string, deps: PhotoDeps, trace: string[] = [], full = false): Promise<{ type: string; body: Buffer; url: string } | null> {
    const code = encodeURIComponent(memCode);
    const tried = new Set<string>();
    const attempt = async (url: string | null, prefix: string | null) => {
        if (!url || tried.has(url) || tried.size >= 16) return null;
        tried.add(url);
        const photo = await fetchPhotoBytes(url, deps, trace).catch((e) => { trace.push(`img ${url} error ${(e as Error)?.message}`); return null; });
        if (photo && prefix !== null) goodPrefix = prefix;
        return photo ? { ...photo, url } : null;
    };
    let raws: string[] = [];
    try {
        const json = await deps.fetchJson(`/ko/player/search/ajax/detail?memCode=${code}`);
        const data = json?.data;
        trace.push(`json resultCode=${json?.resultCode} keys=${data && typeof data === "object" ? Object.keys(data).join(",") : typeof data}`);
        raws = [data?.ImgURL, data?.ImgURLBig, imageFromJson(data)].filter((x, i, a): x is string => typeof x === "string" && !!x.trim() && a.indexOf(x) === i);
        trace.push(`raw ${JSON.stringify(raws)} Resolution=${JSON.stringify(data?.Resolution ?? null)}`);
    } catch (e) {
        trace.push(`json error ${(e as Error)?.message}`);
    }
    if (raws.length) {
        // 이미 맞은 앞머리가 있으면 그것부터
        if (goodPrefix !== null) for (const raw of raws) { const r = await attempt(goodPrefix === "" ? safeImageUrl(raw, deps.origin) : joinPrefix(goodPrefix, raw, deps.origin), goodPrefix); if (r) return r; }
        for (const raw of raws) { const r = await attempt(safeImageUrl(raw, deps.origin), ""); if (r) return r; }
        const resting = !full && goodPrefix === null && guessMiss.n >= 3 && Date.now() - guessMiss.at < LEARN_TTL;
        if (!resting) {
            const learnedPrefixes = await learnPrefixes(deps, trace);
            const raw = raws[0];
            for (const p of [...learnedPrefixes, ...GUESS_PREFIXES]) { const r = await attempt(joinPrefix(p, raw, deps.origin), p); if (r) return r; }
            guessMiss = { n: guessMiss.n + 1, at: Date.now() };
        }
        if (!full) return null; // JSON 에 사진 칸이 있는 선수 — 페이지 HTML 까지는 보지 않는다(진단만)
    }
    for (const path of PBA_PLAYER_PAGES(code)) {
        try {
            const r = await deps.fetchRaw(path, "text/html");
            const html = r.ok ? await r.text() : "";
            const url = html ? safeImageUrl(imageFromHtml(html, memCode), new URL(path, deps.origin).toString()) : null;
            trace.push(`page ${path} ${r.status} len=${html.length} imgs=${(html.match(/<img\b/gi) ?? []).length} → ${url ?? "-"}`);
            const got = await attempt(url, null);
            if (got) return got;
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
        if (!r.ok) {
            trace.push(`img ${url} referer=${referer} status=${r.status}`);
            if (r.status === 401 || r.status === 403) continue; // 막힘 — Referer 없이 한 번 더
            return null;
        }
        const body = Buffer.from(await r.arrayBuffer());
        const type = sniffImage(body);
        trace.push(`img ${url} referer=${referer} status=${r.status} type=${ct} len=${body.length} sniff=${type ?? "-"} head=${body.subarray(0, 8).toString("hex")}`);
        if (type && body.length <= PHOTO_MAX_BYTES) return { type, body };
        if (!type) return null; // 받긴 했는데 이미지가 아니다 — Referer 탓이 아니니 다시 받지 않는다
    }
    return null;
}
