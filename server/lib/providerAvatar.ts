import { put } from "@vercel/blob";
import { IMAGE_CONTENT_TYPE, IMAGE_EXT, stripImageMetadata } from "../utils/imageMeta.js";

/**
 * 카카오·구글 계정의 프로필 사진을 랭큐 프로필 사진으로 쓴다 — **직접 올린 사진이 없을 때만**.
 * 2026-10-07 오너: "카카오 가입이나 구글 가입 시 프로필 사진 가지고 오지? … 내가 수동 프로필 사진 업로드 전까지 프로필 사진 쓰면 좋고".
 *
 * 주소를 그대로 적어 두지 않고 **우리 저장소(Blob)에 사본을 넣는다**:
 *  - 카카오의 사진 주소는 본인이 사진을 바꾸면 죽을 수 있다 — 랭킹·크루·채팅에 깨진 그림이 뜬다.
 *  - 직접 올린 사진과 같은 길(메타 정보 제거 · 알아볼 수 있는 그림만)을 지나게 한다.
 * 가져오는 곳은 두 제공자의 사진 서버뿐이다(아래 HOSTS) — 화면이나 토큰이 준 아무 주소로 서버가 요청을 보내지 않게.
 * 어떤 실패도 로그인·가입을 막지 않는다 — 사진이 없을 뿐이다(null).
 */

/** 사진을 가져와도 되는 호스트 — 구글 프로필 사진(lh3.googleusercontent.com …) · 카카오 프로필 사진(k.kakaocdn.net …) */
const HOSTS: readonly RegExp[] = [/(^|\.)googleusercontent\.com$/, /(^|\.)kakaocdn\.net$/];
/** 사진 한 장에 쓰는 시간의 상한 — 로그인 응답이 이만큼 늦어질 수 있다(처음 한 번) */
export const AVATAR_FETCH_TIMEOUT_MS = 2500;
/** 프로필 사진으로 받는 크기의 상한 */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

/**
 * 제공자가 준 사진 주소를 가져와도 되는 꼴로 — 아니면 null.
 *  - https 만(카카오는 http 주소를 주기도 한다 — 같은 파일이 https 로도 열려 바꿔 쓴다) · 계정 정보·다른 포트가 붙은 주소는 받지 않는다
 *  - 위 두 제공자의 사진 서버만
 *  - 구글의 작은 그림(=s96-c)은 256 으로 키워 받는다
 *  - 카카오의 기본 그림(사진을 안 올린 계정 — …/account_images/default_profile…)은 받지 않는다. 웹 로그인은 is_default_image 로
 *    먼저 거르지만(kakaoAuth), 앱 로그인의 ID 토큰에는 그 표시가 없어 주소로 한 번 더 본다. 랭큐의 이름 첫 글자가 낫다.
 *  - 구글의 기본 그림(회색 사람 모양 — …/a/default-user…)도 받지 않는다. 사진을 안 올린 구글 계정의 **글자 그림**(이름 첫 글자가 든
 *    색 동그라미)은 주소로 가려낼 수 없어 그대로 받는다 — 본인이 구글에서 보던 얼굴이다.
 */
export function providerAvatarUrl(raw: unknown): string | null {
    if (typeof raw !== "string" || !raw.trim() || raw.length > 2048) return null;
    let u: URL;
    try { u = new URL(raw.trim()); } catch { return null; }
    if (u.protocol === "http:") u.protocol = "https:";
    if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return null;
    const host = u.hostname.toLowerCase();
    if (!HOSTS.some((re) => re.test(host))) return null;
    const href = u.toString();
    if (/account_images\/default_profile/i.test(href) || /\/a\/default-user/i.test(u.pathname)) return null;
    return /googleusercontent\.com$/.test(host) ? href.replace(/=s\d+(-c)?$/, "=s256-c") : href;
}

/**
 * 사진을 받아 우리 저장소에 넣고 그 주소를 돌려준다. 못 했으면 null(이유는 경고 로그에만).
 * 받는 것: 2.5초 안에 · 2MB 이하 · webp/jpeg/png 로 알아볼 수 있는 그림. 다른 곳으로 넘기는 응답(redirect)은 따라가지 않는다.
 */
export async function copyProviderAvatar(memberId: string, raw: unknown, fetchImpl: typeof fetch = fetch): Promise<string | null> {
    const url = providerAvatarUrl(raw);
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!url || !token) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), AVATAR_FETCH_TIMEOUT_MS);
    try {
        const res = await fetchImpl(url, { signal: ctrl.signal, redirect: "error" });
        if (!res.ok) return null;
        if (Number(res.headers.get("content-length") ?? 0) > AVATAR_MAX_BYTES) return null;
        const buffer = Buffer.from(await res.arrayBuffer());
        if (buffer.length === 0 || buffer.length > AVATAR_MAX_BYTES) return null;
        // 직접 올린 사진과 같은 길 — 메타 정보(EXIF·위치)를 걷고, 알아볼 수 있는 그림만 받는다
        const clean = stripImageMetadata(buffer);
        if (!clean.type) return null;
        const saved = await put(`hiq/profile/${memberId}.${IMAGE_EXT[clean.type]}`, clean.buffer, {
            access: "public",
            contentType: IMAGE_CONTENT_TYPE[clean.type],
            addRandomSuffix: true,
            token,
        });
        return saved.url;
    } catch (e) {
        console.warn("[avatar] 제공자 프로필 사진을 가져오지 못했다:", (e as Error)?.name === "AbortError" ? "시간 초과" : (e as Error)?.message);
        return null;
    } finally {
        clearTimeout(timer);
    }
}
