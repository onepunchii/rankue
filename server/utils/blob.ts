import { del } from "@vercel/blob";

// Vercel Blob public URLs live on *.blob.vercel-storage.com. Crew emblems may be a plain
// emoji, cover images may be null, and legacy rows may hold external URLs — none of those
// must ever reach del(). Only URLs on our own Blob store are deletable.
const OWNED_BLOB_RE = /blob\.vercel-storage\.com\//;

export function isOwnedBlobUrl(url: unknown): url is string {
    return typeof url === "string" && OWNED_BLOB_RE.test(url);
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
