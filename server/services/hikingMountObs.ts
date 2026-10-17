/**
 * 산악기상 관측 받기(2026-10-17, shared/hikingMountObs 머리말) — 산림청 국립산림과학원 산악기상정보(apis.data.go.kr/1400377/mtweather).
 * 관측 시각(tm)을 주면 한 번에 513곳의 그 시각 값이 온다. 10분마다 재고, 올라오기까지 시간이 걸려 20분 전 칸부터 묻는다(비면 30분 전).
 * 인스턴스 메모리에 10분 둔다 — 산 화면 날씨(/hiking/mountains/:slug/weather)가 부를 때만 받는다. 실패하면 null(화면은 그 칸을 그리지 않는다).
 * 키: DATA_GO_KR_KEY(골프 날씨 · 낚시와 같은 키).
 */
import { parseObs, type MountObs } from "../../shared/hikingMountObs.js";

const URL0 = "https://apis.data.go.kr/1400377/mtweather/mountListSearch";
const TTL_MS = 10 * 60_000;
let cache: { at: number; list: MountObs[] } | null = null;
let inflight: Promise<MountObs[] | null> | null = null;

/** 한국 시각 yyyyMMddHHmm, 10분 단위로 내림 */
export function obsSlot(nowMs: number, backMin: number): string {
    const k = new Date(nowMs + 9 * 3600_000 - backMin * 60_000);
    const iso = k.toISOString();
    return `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}${iso.slice(11, 13)}${iso.slice(14, 15)}0`;
}

async function fetchSlot(tm: string, timeoutMs: number): Promise<MountObs[] | null> {
    const key = process.env.DATA_GO_KR_KEY;
    if (!key) return null;
    const enc = /%[0-9A-Fa-f]{2}/.test(key) ? key : encodeURIComponent(key);
    try {
        const r = await fetch(`${URL0}?pageNo=1&numOfRows=600&_type=json&tm=${tm}&serviceKey=${enc}`, { signal: AbortSignal.timeout(timeoutMs) });
        if (!r.ok) return null;
        const j: any = await r.json();
        const items = j?.response?.body?.items?.item;
        const rows = Array.isArray(items) ? items : items ? [items] : [];
        const list = rows.map((x: Record<string, unknown>) => parseObs(x)).filter((x): x is MountObs => !!x);
        return list.length ? list : null;
    } catch {
        return null;
    }
}

/** 지금 받아 둔(또는 새로 받은) 관측 전부 — 실패하면 가진 것(10분 넘었어도), 그것도 없으면 null */
export async function mountObsAll(nowMs = Date.now()): Promise<MountObs[] | null> {
    if (cache && nowMs - cache.at < TTL_MS) return cache.list;
    if (!inflight) {
        inflight = (async () => {
            const list = (await fetchSlot(obsSlot(nowMs, 20), 3500)) ?? (await fetchSlot(obsSlot(nowMs, 30), 2500));
            if (list) cache = { at: Date.now(), list };
            return list ?? cache?.list ?? null;
        })().finally(() => { inflight = null; });
    }
    return inflight;
}
