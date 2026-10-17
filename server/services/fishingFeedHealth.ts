/**
 * 낚시 공공자료의 받기 기록(2026-10-17 어드민 › 낚시 › 공공자료 — "실패하면 catch(() => null) 로 구역이 조용히 사라진다").
 * 공공자료를 부를 때마다 그 출처(source)의 마지막 성공 · 마지막 실패 · 이어진 실패 수 · 실패 까닭을 fishing_obs(kind 'health')에 남긴다.
 * 받아 둔 값이 있을 땐 부르지 않으니(캐시) 기록도 그만큼만 생긴다. 적다가 실패해도 받기 자체는 깨지 않는다.
 */
import { sql } from "drizzle-orm";
import { db } from "../db.js";

/** 출처 이름 — 화면(어드민 공공자료)이 이 이름으로 묶는다 */
export type FeedSource =
    | "khoa:fcstFishingv2" | "khoa:surveyTideLevel" | "khoa:surveyWaterTemp" | "khoa:surveyAirTemp" | "khoa:twRecent" | "khoa:surveySeafog"
    | "kasi:riseSet" | "kma:pwn" | "kma:seaFcst" | "mof:market" | "krc:reservoir";

export async function noteFeed(source: FeedSource, ok: boolean, why: string | null = null): Promise<void> {
    try {
        const at = new Date().toISOString();
        const patch = ok ? { okAt: at, fails: 0 } : { failAt: at, lastError: (why ?? "응답 없음").slice(0, 120) };
        await db.execute(sql`
            insert into fishing_obs (kind, key, data, fetched_at) values ('health', ${source}, ${JSON.stringify({ ...patch, fails: ok ? 0 : 1 })}::jsonb, now())
            on conflict (kind, key) do update set
                data = fishing_obs.data || ${JSON.stringify(patch)}::jsonb
                    || jsonb_build_object('fails', case when ${ok} then 0 else coalesce((fishing_obs.data ->> 'fails')::int, 0) + 1 end),
                fetched_at = now()`);
    } catch { /* 기록 실패는 받기를 깨지 않는다 */ }
}
