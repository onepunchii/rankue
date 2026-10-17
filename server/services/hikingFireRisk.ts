/**
 * 산불위험지수 받기(2026-10-17, shared/hikingFireRisk 머리말) — 시군구 전부를 한 번에(250곳 남짓) 받아 인스턴스 메모리에 한 시간.
 * 분석은 3시간마다다. 실패하면 가진 것(한 시간 넘었어도), 그것도 없으면 null — 화면은 그 줄을 그리지 않는다.
 */
import { parseFire, type FireRisk } from "../../shared/hikingFireRisk.js";

const URL0 = "https://apis.data.go.kr/1400377/forestPointV2/forestPointListSigunguSearchV2";
const TTL_MS = 60 * 60_000;
let cache: { at: number; list: FireRisk[] } | null = null;
let inflight: Promise<FireRisk[] | null> | null = null;

async function fetchAll(timeoutMs: number): Promise<FireRisk[] | null> {
    const key = process.env.DATA_GO_KR_KEY;
    if (!key) return null;
    const enc = /%[0-9A-Fa-f]{2}/.test(key) ? key : encodeURIComponent(key);
    try {
        const r = await fetch(`${URL0}?pageNo=1&numOfRows=400&_type=json&serviceKey=${enc}`, { signal: AbortSignal.timeout(timeoutMs) });
        if (!r.ok) return null;
        const j: any = await r.json();
        const items = j?.response?.body?.items?.item;
        const rows = Array.isArray(items) ? items : items ? [items] : [];
        const list = rows.map((x: Record<string, unknown>) => parseFire(x)).filter((x): x is FireRisk => !!x);
        return list.length ? list : null;
    } catch {
        return null;
    }
}

export async function fireRiskAll(nowMs = Date.now()): Promise<FireRisk[] | null> {
    if (cache && nowMs - cache.at < TTL_MS) return cache.list;
    if (!inflight) {
        inflight = (async () => {
            const list = await fetchAll(3500);
            if (list) cache = { at: Date.now(), list };
            return list ?? cache?.list ?? null;
        })().finally(() => { inflight = null; });
    }
    return inflight;
}
