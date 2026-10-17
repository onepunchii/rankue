/**
 * 바다 예보 받기(2026-10-17, shared/fishingSeaFcst 머리말) — 기상청 단기예보 통보문의 해상예보(getSeaFcst).
 * 화면이 바다를 고를 때 그 해역 하나만 받는다. 받아 둔 것(fishing_obs kind 'seafcst', key 해역 코드)이 한 시간보다 낡았으면 새로(3.5초까지),
 * 못 받으면 가진 것을 그대로 준다. 받기 결과는 공공자료 상태판에 남긴다(noteFeed 'kma:seaFcst').
 */
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { kma } from "./golfWeather.js";
import { noteFeed } from "./fishingFeedHealth.js";
import { SEA_FCST_REG, parseSeaFcst, type SeaFcst } from "../../shared/fishingSeaFcst.js";

const URL0 = "https://apis.data.go.kr/1360000/VilageFcstMsgService/getSeaFcst";
const TTL_MS = 60 * 60_000;
const rowsOf = (r: any) => (r.rows ?? r) as any[];

async function readSaved(reg: string): Promise<{ items: any[]; ms: number } | null> {
    try {
        const [row] = rowsOf(await db.execute(sql`select data, (extract(epoch from fetched_at) * 1000)::bigint as ms from fishing_obs where kind = 'seafcst' and key = ${reg}`));
        return row && Array.isArray(row.data) ? { items: row.data, ms: Number(row.ms) } : null;
    } catch { return null; }
}

export async function getSeaFcst(area: string, nowMs = Date.now()): Promise<SeaFcst | null> {
    const reg = SEA_FCST_REG[area];
    if (!reg || !process.env.DATA_GO_KR_KEY) return null;
    let have = await readSaved(reg);
    if (!have || nowMs - have.ms > TTL_MS) {
        const r = await kma(URL0, { numOfRows: 20, regId: reg }, 3500);
        const ok = r.code === "00" && r.items.length > 0;
        await noteFeed("kma:seaFcst", ok, ok ? "" : r.code ? `결과 코드 ${r.code}` : "응답 없음");
        if (ok) {
            await db.execute(sql`insert into fishing_obs (kind, key, data, fetched_at) values ('seafcst', ${reg}, ${JSON.stringify(r.items)}::jsonb, now())
                on conflict (kind, key) do update set data = excluded.data, fetched_at = now()`).catch(() => undefined);
            have = { items: r.items, ms: nowMs };
        }
    }
    if (!have) return null;
    const out = parseSeaFcst(area, have.items, nowMs);
    return out.slots.length ? out : null;
}
