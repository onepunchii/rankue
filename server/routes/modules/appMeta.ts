import { Router } from "express";
import { IOS_APP_ID } from "../../../shared/appLinks.js";

// 스토어에 지금 올라가 있는 앱 버전(2026-09-11 오너: "옛 앱에 업데이트 안내가 스토어 출시에 맞춰 자동으로 뜨게").
//
// 옛 앱의 업데이트 안내(shared/appVersion.ts)는 스토어에 새 버전이 실제로 올라온 뒤에만 떠야 한다 —
// 먼저 뜨면 "업데이트"를 눌러도 스토어엔 옛 버전뿐이다. 사람이 켜는 걸 잊지 않게 iOS 는 여기서 확인한다.
//
// 왜 서버가 묻나: 애플 공개 조회(itunes lookup)는 브라우저 CORS 를 보장하지 않고, 사용자마다 애플에 물을 이유도 없다.
// 서버가 30분에 한 번 묻고, 그 사이 요청은 Vercel 가장자리 캐시(s-maxage)가 받는다.
// 안드로이드는 Play 에 이런 공개 조회가 없어서 여기 없다 — shared/appVersion.ts 의 enabled 로 켠다.

const router = Router();

const LOOKUP_URL = `https://itunes.apple.com/lookup?id=${IOS_APP_ID}&country=kr`;
const OK_TTL_MS = 30 * 60_000;
const FAIL_TTL_MS = 5 * 60_000;

/** itunes lookup 응답 → 버전 문자열(순수). 모양이 다르면 null. */
export function parseItunesLookup(json: unknown): string | null {
    const results = (json as { results?: unknown } | null)?.results;
    if (!Array.isArray(results) || results.length === 0) return null;
    const v = (results[0] as { version?: unknown } | null)?.version;
    if (typeof v !== "string") return null;
    const t = v.trim();
    return /^\d+(\.\d+){0,3}$/.test(t) ? t : null;
}

let cache: { version: string | null; at: number; ok: boolean } | null = null;

async function iosStoreVersion(now = Date.now()): Promise<string | null> {
    if (cache && now - cache.at < (cache.ok ? OK_TTL_MS : FAIL_TTL_MS)) return cache.version;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    try {
        const res = await fetch(LOOKUP_URL, { signal: ctrl.signal });
        const version = res.ok ? parseItunesLookup(await res.json()) : null;
        // 모양이 이상한 응답이면 마지막으로 알던 값을 두고 5분 뒤 다시 묻는다
        cache = version !== null ? { version, at: now, ok: true } : { version: cache?.version ?? null, at: now, ok: false };
    } catch {
        // 애플이 느리거나 막혀도 마지막으로 알던 값을 쓴다. 한 번도 몰랐으면 null → 웹은 안내를 켜지 않는다.
        cache = { version: cache?.version ?? null, at: now, ok: false };
    } finally {
        clearTimeout(timer);
    }
    return cache.version;
}

// GET /api/hiq/app/store-version — 공개·가벼움. { ios: "1.1" | null }
router.get("/store-version", async (_req, res) => {
    const ios = await iosStoreVersion();
    res.set("Cache-Control", "public, max-age=300, s-maxage=1800, stale-while-revalidate=600");
    res.json({ success: true, data: { ios } });
});

export default router;
