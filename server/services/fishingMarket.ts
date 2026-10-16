/**
 * 위판장 소식 — 어종마다 지난 이레의 경매 건수를 받아 둔다(2026-10-14).
 *
 * 자료: 해양수산부 위판장별 위탁판매 현황(select0040List). 어종 이름(mprcStdCodeNm)으로 물어 한 줄만 받고 totalCount(그날의 건수)만 쓴다.
 * 받아 두는 곳: fishing_obs(kind 'market', key 어종 id) — { 날: 건수, … }. 사흘이 지난 날은 다시 묻지 않고(다 찬 값),
 * 어제 · 그제는 여섯 시간마다 다시 묻는다(늦게 들어오는 줄이 있다).
 * ⚠️ 이 서비스는 **초당 호출 제한이 빡빡하다**(여덟 개를 한꺼번에 불렀더니 429 · 코드 23 이 한동안 이어졌다 — 2026-10-14).
 *    그래서 한 번에 하나씩, 사이를 띄워, 한 요청에 3.5초어치만 받는다. 제한에 걸리면 그 자리에서 멈추고 1분 쉰다. 한 주가 다 차는 데 요청 몇 번이 걸린다.
 * 한 주(이레)가 다 찬 어종만 표에 싣는다 — 덜 받은 날이 0 으로 보이면 안 된다.
 */
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { MARKET_FISH, marketDays, marketWeek, type MarketWeek } from "../../shared/fishingMarket.js";
import { fishingKstDay } from "../../shared/fishing.js";
import { noteFeed } from "./fishingFeedHealth.js";

const URL0 = "https://apis.data.go.kr/1192000/select0040List/getselect0040List";
const FRESH_MS = 6 * 3600_000;
const rowsOf = (r: any) => (r.rows ?? r) as any[];
interface Saved { counts: Record<string, number>; /** 날마다 마지막으로 물은 때(ms) */ asked: Record<string, number> }

let restUntil = 0;
/** 그날 그 어종의 경매 건수. 자료 없음(03)은 0, 실패는 null, 호출 제한에 걸리면 "limit" */
async function dayCount(ask: string, day: string, timeoutMs: number): Promise<number | null | "limit"> {
    const key = process.env.DATA_GO_KR_KEY;
    if (!key) return null;
    const u = new URL(URL0);
    for (const [k, v] of Object.entries({ type: "json", numOfRows: 1, pageNo: 1, baseDt: day.replace(/-/g, ""), mprcStdCodeNm: ask })) u.searchParams.set(k, String(v));
    try {
        const r = await fetch(`${u.toString()}&serviceKey=${/%[0-9A-Fa-f]{2}/.test(key) ? key : encodeURIComponent(key)}`, { signal: AbortSignal.timeout(timeoutMs) });
        if (r.status === 429) { await noteFeed("mof:market", false, "호출 제한(429)"); return "limit"; }
        const j: any = await r.json().catch(() => null);
        if (["22", "23"].includes(String(j?.OpenAPI_ServiceResponse?.cmmMsgHeader?.returnReasonCode ?? ""))) { await noteFeed("mof:market", false, "호출 제한"); return "limit"; }
        const h = j?.responseJson?.header;
        if (h?.resultCode === "03") { await noteFeed("mof:market", true); return 0; }
        const n = Number(h?.totalCount);
        const ok = h?.resultCode === "00" && Number.isFinite(n);
        await noteFeed("mof:market", ok, ok ? null : h?.resultCode ? `결과 코드 ${h.resultCode}` : "응답 없음");
        return ok ? n : null;
    } catch { await noteFeed("mof:market", false, "응답 없음(시간 초과)"); return null; }
}

export async function getMarketWeek(nowMs = Date.now()): Promise<MarketWeek | null> {
    if (!process.env.DATA_GO_KR_KEY) return null;
    const today = fishingKstDay(nowMs), days = marketDays(today);
    const saved = new Map<string, Saved>();
    for (const r of rowsOf(await db.execute(sql`select key, data from fishing_obs where kind = 'market'`))) saved.set(String(r.key), { counts: r.data?.counts ?? {}, asked: r.data?.asked ?? {} });
    // 물어야 할 것 — 없는 날, 그리고 어제 · 그제 가운데 여섯 시간 넘게 안 물은 날
    const recent = new Set(days.slice(-2));
    const jobs: { id: string; ask: string; day: string }[] = [];
    for (const f of MARKET_FISH) {
        const s = saved.get(f.id);
        for (const d of days) {
            const have = s?.counts[d] != null, at = s?.asked[d] ?? 0;
            if (!have || (recent.has(d) && nowMs - at > FRESH_MS)) jobs.push({ id: f.id, ask: f.ask, day: d });
        }
    }
    const touched = new Set<string>();
    const until = Date.now() + 3500;
    // 한 번에 하나씩, 180ms 띄워서 — 어종 하나의 이레를 다 채우고 다음 어종으로 간다(jobs 가 어종 순이다)
    for (const j of jobs) {
        if (Date.now() >= until || Date.now() < restUntil) break;
        const n = await dayCount(j.ask, j.day, 2500);
        if (n === "limit") { restUntil = Date.now() + 60_000; break; }
        if (n != null) {
            const s = saved.get(j.id) ?? { counts: {}, asked: {} };
            s.counts[j.day] = n; s.asked[j.day] = nowMs;
            saved.set(j.id, s); touched.add(j.id);
        }
        await new Promise((r) => setTimeout(r, 180));
    }
    // 이레 밖의 날은 버린다(표가 자라지 않게)
    for (const id of touched) {
        const s = saved.get(id)!;
        const keep = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).filter(([d]) => days.includes(d)));
        const data: Saved = { counts: keep(s.counts), asked: keep(s.asked) };
        await db.execute(sql`
            insert into fishing_obs (kind, key, data, fetched_at) values ('market', ${id}, ${JSON.stringify(data)}::jsonb, now())
            on conflict (kind, key) do update set data = excluded.data, fetched_at = now()`).catch(() => {});
    }
    const have: Record<string, Record<string, number>> = {};
    for (const [id, s] of saved) have[id] = s.counts;
    const week = marketWeek(days, have);
    return week.fish.length ? week : null;
}
