/**
 * 스코어카드 스캔 기록(golf_scan_log — migrations/golf_scan_log.sql). 하루 횟수 제한의 바탕이고, 쓰는 양과 판독 품질을 본다.
 * 그림 · 이름 · 읽은 점수는 남기지 않는다.
 */
import { eq, sql } from "drizzle-orm";
import { db } from "../db.js";
import { hiqMembers, profiles } from "../../shared/schema.js";
import { scanKstDay } from "../../shared/golfScorecardScan.js";

const rowsOf = (r: any) => (r.rows ?? r) as any[];

export type ScanOutcome = "ok" | "handwritten" | "other" | "none" | "failed";

/** 오늘(한국 날짜) 이 회원이 쓴 횟수 — 모델까지 간 것은 실패도 센다(돈이 든다) */
export async function scansToday(memberId: string, nowMs: number = Date.now()): Promise<number> {
    const from = `${scanKstDay(nowMs)}T00:00:00+09:00`;
    const [row] = rowsOf(await db.execute(sql`select count(*)::int as n from golf_scan_log where member_id = ${memberId} and created_at >= ${from}::timestamptz`));
    return Number(row?.n) || 0;
}

export async function logScan(v: { memberId: string; sessionId: string; model: string; outcome: ScanOutcome; rows?: number; ok?: number; check?: number; empty?: number; ms: number }): Promise<void> {
    await db.execute(sql`
        insert into golf_scan_log (member_id, session_id, model, outcome, rows, cells_ok, cells_check, cells_empty, ms)
        values (${v.memberId}, ${v.sessionId}, ${v.model}, ${v.outcome}, ${v.rows ?? 0}, ${v.ok ?? 0}, ${v.check ?? 0}, ${v.empty ?? 0}, ${Math.round(v.ms)})`);
}

/** 이 회원의 역할(profiles.role) — 공개 전의 문(슈퍼관리자만)을 가리는 데 쓴다. 전화번호 · 이메일로 가르지 않는다 */
export async function scanRole(memberId: string): Promise<string | null> {
    const [row] = await db.select({ role: profiles.role }).from(hiqMembers)
        .innerJoin(profiles, eq(profiles.id, hiqMembers.profileId)).where(eq(hiqMembers.id, memberId)).limit(1);
    return row ? String(row.role) : null;
}
