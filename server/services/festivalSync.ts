/**
 * 전국 축제 받기(2026-10-21) — 한국관광공사 TourAPI(KorService2)를 표 tour_festivals 로 옮긴다. 규칙은 shared/festivals.
 *  1) 목록(searchFestival2) — 지난해 1월부터 시작한 축제 전부(한 번에 1,000줄 · 900줄쯤이라 한두 번). 축제(EV01)만 넣고 고친다.
 *     해마다 같은 번호(contentid)에 날짜만 새로 실린다 — 올해 날짜가 아직 안 나온 축제는 지난 날짜로 남는다(페이지는 '끝남'으로 그린다).
 *  2) 상세(detailIntro2 · detailCommon2) — 새 줄 · 자료가 고쳐진 줄만, 열려 있거나 곧 열리는 것 먼저 detailMax 곳까지.
 * 개발 계정은 기능마다 하루 1,000번 — 매일 크론은 목록 1~2번 + 상세 40곳(80번). 처음 채우기는 scripts/sync-festivals.ts.
 * 못 받으면 표는 그대로 둔다(지난 값으로 그린다).
 */
import { cleanTourText, festivalFromTour, festivalPhone, kstToday, tourHomepage, type FestivalRow } from "../../shared/festivals.js";
import { dropStaleFestivals, festivalsNeedingDetail, setFestivalDetail, upsertFestivalRows } from "../storage/festivals.js";

const BASE = "https://apis.data.go.kr/B551011/KorService2";

function common(): string | null {
    const key = process.env.DATA_GO_KR_KEY;
    if (!key) return null;
    const k = /%[0-9A-Fa-f]{2}/.test(key) ? key : encodeURIComponent(key);
    return `serviceKey=${k}&MobileOS=ETC&MobileApp=rankue&_type=json`;
}
async function getJson(url: string): Promise<any> {
    for (let t = 0; t < 2; t++) {
        try {
            const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
            if (r.ok) return await r.json();
        } catch { /* 다시 한 번 */ }
        await new Promise((r) => setTimeout(r, 800));
    }
    return null;
}
const itemsOf = (j: any): any[] => { const x = j?.response?.body?.items?.item; return Array.isArray(x) ? x : x ? [x] : []; };

export interface FestivalSyncResult { got: number; kept: number; dropped: number; details: number; detailFailed: number; error?: string }

export async function syncFestivals(opts: { nowMs?: number; detailMax?: number; list?: boolean } = {}): Promise<FestivalSyncResult> {
    const c = common();
    const out: FestivalSyncResult = { got: 0, kept: 0, dropped: 0, details: 0, detailFailed: 0 };
    if (!c) return { ...out, error: "DATA_GO_KR_KEY 없음" };
    const today = kstToday(opts.nowMs ?? Date.now());

    if (opts.list !== false) {
        const from = `${Number(today.slice(0, 4)) - 1}0101`;
        const raw: any[] = [];
        let total = 0;
        for (let page = 1; page <= 5; page++) {
            const j = await getJson(`${BASE}/searchFestival2?${c}&numOfRows=1000&pageNo=${page}&eventStartDate=${from}&arrange=A`);
            if (!j) return { ...out, error: `목록 ${page}쪽을 받지 못함` };
            const it = itemsOf(j);
            total = Number(j?.response?.body?.totalCount ?? 0);
            raw.push(...it);
            if (!it.length || raw.length >= total) break;
        }
        out.got = raw.length;
        const rows = raw.map(festivalFromTour).filter((x): x is FestivalRow & { tel: string | null } => !!x);
        // 같은 번호가 두 번 오면 마지막 것
        const byId = new Map(rows.map((r) => [r.id, r]));
        out.kept = await upsertFestivalRows([...byId.values()]);
        // 목록이 넉넉히 왔을 때만 사라진 줄을 지운다(반쯤 받다 끊긴 날 표를 비우지 않게)
        if (total > 0 && raw.length >= total && out.kept >= 200) out.dropped = await dropStaleFestivals();
    }

    const todo = await festivalsNeedingDetail(today, opts.detailMax ?? 40);
    let i = 0;
    const worker = async () => {
        while (i < todo.length) {
            const t = todo[i++];
            const [intro, com] = await Promise.all([
                getJson(`${BASE}/detailIntro2?${c}&contentId=${t.id}&contentTypeId=15`),
                getJson(`${BASE}/detailCommon2?${c}&contentId=${t.id}`),
            ]);
            const a = itemsOf(intro)[0], b = itemsOf(com)[0];
            if (!a && !b) { out.detailFailed++; continue; }
            await setFestivalDetail(t.id, t.mod, {
                place: cleanTourText(a?.eventplace, 120),
                playtime: cleanTourText(a?.playtime, 240),
                fee: cleanTourText(a?.usetimefestival, 240),
                host: cleanTourText(a?.sponsor1, 120),
                hostTel: festivalPhone(a?.sponsor1tel),
                homepage: tourHomepage(b?.homepage) ?? tourHomepage(a?.eventhomepage),
                overview: cleanTourText(b?.overview, 2400),
                tel: festivalPhone(b?.tel),
            });
            out.details++;
        }
    };
    await Promise.all([worker(), worker(), worker()]);
    return out;
}
