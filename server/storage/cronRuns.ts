/**
 * 크론 일의 실행 기록(2026-10-17 어드민 › 등산 › 현황 — "전날 브리핑 크론이 실패해도 아무도 모른다"). 표 hiq_cron_runs(migrations/cron_runs.sql).
 * 매시 리마인더 크론에 얹힌 일이 **실제로 일했거나 실패했을 때만** 한 줄을 적는다(시간 밖의 빈 실행은 적지 않는다).
 * 적다가 실패해도(표가 아직 없을 때 등) 크론의 응답은 깨지 않는다.
 */
import { sql } from "drizzle-orm";
import { db } from "../db.js";

export type CronJob = "hiking_eve" | "golf_eve" | "cup_roll";
export interface CronRunRow { job: CronJob; at: string; ok: boolean; result: Record<string, unknown> | null }

export async function recordCronRun(job: CronJob, ok: boolean, result: unknown): Promise<void> {
    try {
        await db.execute(sql`insert into hiq_cron_runs (job, ok, result) values (${job}, ${ok}, ${JSON.stringify(result ?? null)}::jsonb)`);
    } catch (e) {
        console.error("[CronRuns]", job, e);
    }
}

export async function recentCronRuns(job: CronJob, limit = 10): Promise<CronRunRow[]> {
    try {
        const r: any = await db.execute(sql`select job, to_char(ran_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as at, ok, result
            from hiq_cron_runs where job = ${job} order by ran_at desc limit ${Math.min(50, Math.max(1, limit))}`);
        return ((r.rows ?? r) as any[]).map((x) => ({ job: x.job, at: String(x.at), ok: x.ok === true, result: x.result ?? null }));
    } catch {
        return [];
    }
}

/** 실패 까닭 한 줄 — 크론 기록에 남길 만큼만(경로 · 비밀은 싣지 않는다) */
export const errorText = (e: unknown) => String((e as any)?.message ?? e).split("\n")[0].slice(0, 200);
