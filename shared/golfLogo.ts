/**
 * 골프장 로고 올리기(2026-10-07 오너: "해당 로고 바로 끌고 와서 로고 업로드 기능 할 수 있나? 지금 로고 업로드 기능은 없지?").
 * 어드민 '골프장 데이터'의 로고 칸에 **골프장 홈페이지의 로고를 끌어다 놓거나 · 복사해 붙여넣거나 · 파일을 고르면** 올라간다.
 *
 * 흐름: 화면이 그림을 받아(파일이면 그대로, 다른 사이트에서 끌어온 것이면 주소만 오므로 서버가 대신 받아 준다)
 *       캔버스에서 PNG 로 다시 그리고(긴 변 512 · 투명 여백 잘라 냄) → 서버가 우리 저장소(Blob)에 넣고 → 페이지의 logo 칸에 그 주소.
 * 왜 shared 인가: '올린 로고인가'의 판정을 화면(출처 표시)·서버(지울 때 파일도 지움 · 공유 카드)·적재 스크립트(다시 적재해도 남김)가 같이 쓴다.
 *
 * ⚠️ shared 상대 임포트는 반드시 ./x.js(서버리스 규칙). 지금은 임포트가 없다.
 */

/** 올린 로고가 놓이는 폴더 — 주소에 이 글자가 있으면 '올린 로고'다 */
export const GOLF_LOGO_FOLDER = "hiq/golf-logo";
/** 올리는 그림의 긴 변(px) — 화면의 가장 큰 로고판이 176×64 라 3배 밀도까지 넉넉하다 */
export const GOLF_LOGO_MAX_PX = 512;
/** 올리는 PNG 의 상한 — 512px 로고가 이걸 넘으면 사진이지 로고가 아니다 */
export const GOLF_LOGO_MAX_BYTES = 600 * 1024;
/** 서버가 대신 받아 오는 원본 그림의 상한 */
export const LOGO_FETCH_MAX_BYTES = 2 * 1024 * 1024;
/** 서버가 대신 받아 오는 시간의 상한 */
export const LOGO_FETCH_TIMEOUT_MS = 6000;

const UPLOADED_RE = /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/hiq\/golf-logo\/[\w.-]+\.png$/i;
/**
 * 어드민에서 올린 로고인가 — 우리 저장소의 golf-logo 폴더에 있는 PNG.
 * 적재 스크립트가 다시 돌아도 이 로고는 남긴다(golf-course-pages.ts 의 on conflict). SQL 쪽 판정은 UPLOADED_LOGO_SQL_RE.
 */
export function isUploadedLogo(logo: string | null | undefined): boolean {
    return typeof logo === "string" && UPLOADED_RE.test(logo.trim());
}
/** Postgres `~` 에 넣는 같은 판정(적재 스크립트) — 위 정규식과 어긋나면 다시 적재할 때 올린 로고가 지워진다(테스트로 묶었다) */
export const UPLOADED_LOGO_SQL_RE = "^https://[a-z0-9-]+\\.public\\.blob\\.vercel-storage\\.com/hiq/golf-logo/[A-Za-z0-9_.-]+\\.png$";

/**
 * 저장소 경로 — `hiq/golf-logo/g-<슬러그 해시 10자>-<난수>[-light].png`.
 * 흰색뿐인 로고는 이름이 `-light.png` 로 끝난다 — 화면(CourseLogo isLightLogo)과 공유 카드가 파일 이름으로 어두운 판을 고른다.
 * 난수를 직접 붙인다(저장소의 addRandomSuffix 는 꼬리를 확장자 앞에 붙여 `-light` 가 끝에 오지 않는다).
 */
export function golfLogoBlobPath(slugHash: string, rand: string, light: boolean): string {
    const h = slugHash.toLowerCase().replace(/[^0-9a-f]/g, "").slice(0, 10);
    const r = rand.toLowerCase().replace(/[^0-9a-z]/g, "").slice(0, 12);
    if (h.length !== 10 || r.length < 6) throw new Error("로고 경로를 만들 수 없습니다");
    return `${GOLF_LOGO_FOLDER}/g-${h}-${r}${light ? "-light" : ""}.png`;
}

/** 페이지의 logo 칸 → 밖에서 열 수 있는 주소. 정적 파일(/img/…)이면 사이트 원본을 앞에 붙이고, 올린 로고는 그대로 */
export function absoluteLogoUrl(origin: string, logo: string | null | undefined): string | null {
    if (!logo || !logo.trim()) return null;
    const v = logo.trim();
    if (/^https?:\/\//i.test(v)) return v;
    return v.startsWith("/") ? `${origin.replace(/\/+$/, "")}${v}` : null;
}

/**
 * 서버가 대신 받아 와도 되는 주소 꼴인가(문법만 — 사설 주소인지는 서버가 DNS 로 한 번 더 본다: server/lib/remoteImage.ts).
 * http·https 만, 계정 정보가 붙은 주소·너무 긴 주소는 받지 않는다. `//host/a.png` 는 https 로 본다.
 */
export function cleanRemoteImageUrl(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    let v = raw.trim();
    if (!v || v.length > 2048) return null;
    if (v.startsWith("//")) v = `https:${v}`;
    let u: URL;
    try { u = new URL(v); } catch { return null; }
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.username || u.password || !u.hostname.includes(".")) return null;
    u.hash = "";
    return u.toString();
}

const decodeEntities = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
/**
 * 다른 사이트에서 그림을 끌어다 놓으면 파일이 아니라 **주소**가 온다(브라우저가 그림 파일을 건네지 않는다).
 * 놓인 자료에서 그림 주소를 찾는다 — text/html 의 첫 <img src>(srcset 은 보지 않는다), 없으면 text/uri-list·글자의 첫 http(s) 주소.
 * 링크를 끌어온 것(그림이 아닌 주소)도 일단 돌려준다 — 그림인지는 서버가 받아 보고 판정한다.
 */
export function imageUrlFromDrop(html: string | null | undefined, uriList: string | null | undefined, plain?: string | null): string | null {
    const m = String(html ?? "").match(/<img\b[^>]*?\ssrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
    if (m) {
        const src = decodeEntities(m[1] ?? m[2] ?? m[3] ?? "");
        const ok = cleanRemoteImageUrl(src);
        if (ok) return ok;
    }
    for (const text of [uriList, plain]) {
        for (const line of String(text ?? "").split(/\r?\n/)) {
            const t = line.trim();
            if (!t || t.startsWith("#")) continue;
            const ok = cleanRemoteImageUrl(t);
            if (ok) return ok;
        }
    }
    return null;
}

/** 캔버스 픽셀(RGBA)에서 안 비치는 부분의 테두리 — 투명 여백을 잘라 로고가 판을 채우게 한다. 전부 투명이면 null */
export function opaqueBounds(rgba: ArrayLike<number>, width: number, height: number, alphaMin = 8): { x: number; y: number; w: number; h: number } | null {
    let x0 = width, y0 = height, x1 = -1, y1 = -1;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (rgba[(y * width + x) * 4 + 3] >= alphaMin) {
                if (x < x0) x0 = x;
                if (x > x1) x1 = x;
                if (y < y0) y0 = y;
                if (y > y1) y1 = y;
            }
        }
    }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * 흰색뿐인 로고인가 — 안 비치는 픽셀의 거의 전부가 아주 밝으면(흰 판에 얹으면 안 보인다) 어두운 판에 얹는다.
 * 바탕이 불투명한 그림(흰 바탕 JPEG)은 해당 없다: 투명한 곳이 거의 없으면 false — 흰 바탕째 흰 판에 얹으면 된다.
 */
export function looksLightLogo(rgba: ArrayLike<number>): boolean {
    let opaque = 0, bright = 0, clear = 0;
    const n = Math.floor(rgba.length / 4);
    for (let i = 0; i < n; i++) {
        const a = rgba[i * 4 + 3];
        if (a < 32) { clear++; continue; }
        opaque++;
        const lum = 0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2];
        if (lum >= 225) bright++;
    }
    if (!opaque || clear / n < 0.1) return false;
    return bright / opaque >= 0.9;
}

/** 긴 변을 max 에 맞춘 크기 — 작은 그림은 키우지 않는다(벡터는 크기가 없어 키운다: upscale) */
export function fitLogoSize(w: number, h: number, max = GOLF_LOGO_MAX_PX, upscale = false): { w: number; h: number } {
    if (!(w > 0) || !(h > 0)) return { w: max, h: max };
    const k = max / Math.max(w, h);
    const s = upscale ? k : Math.min(1, k);
    return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}
