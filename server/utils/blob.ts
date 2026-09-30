import { del } from "@vercel/blob";

// Vercel Blob public URLs live on *.blob.vercel-storage.com. Crew emblems may be a plain
// emoji, cover images may be null, and legacy rows may hold external URLs — none of those
// must ever reach del(). Only URLs on our own Blob store are deletable.
const OWNED_BLOB_RE = /blob\.vercel-storage\.com\//;

export function isOwnedBlobUrl(url: unknown): url is string {
    return typeof url === "string" && OWNED_BLOB_RE.test(url);
}

/**
 * **우리** Blob 저장소의 공개 호스트 — 토큰 `vercel_blob_rw_<storeId>_…` 의 storeId 를 소문자로 한 것(9/30 운영 DB 실측으로 일치 확인).
 * *.blob.vercel-storage.com 만 보면 남의 Blob 저장소에 같은 경로로 올린 파일도 통과한다(서버의 EXIF 제거·용량 제한을 건너뛴다).
 * 토큰이 없거나 모양이 다르면 null — 부르는 쪽은 이때 호스트 검사를 건너뛴다(업로드 자체를 막지 않게).
 */
export function ownBlobHost(): string | null {
    const m = (process.env.BLOB_READ_WRITE_TOKEN || "").match(/^vercel_blob_rw_([A-Za-z0-9]+)_/);
    return m ? `${m[1].toLowerCase()}.public.blob.vercel-storage.com` : null;
}

export function isOnOwnBlobHost(url: string): boolean {
    const host = ownBlobHost();
    if (!host) return true;
    try { return new URL(url).hostname.toLowerCase() === host; } catch { return false; }
}

// Fire-and-forget cleanup of replaced/removed images. NEVER throws: image GC must not
// break the API response that triggered it. Accepts a scalar, an array, or null/undefined
// and silently ignores anything that isn't one of our Blob URLs.
export async function deleteBlobs(input: unknown): Promise<void> {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) return;
    const urls = (Array.isArray(input) ? input : [input]).filter(isOwnedBlobUrl) as string[];
    if (urls.length === 0) return;
    try {
        await del(urls, { token });
    } catch (e) {
        console.warn("[blob] cleanup failed:", (e as Error)?.message);
    }
}
