/**
 * 시뮬레이터 드릴 래더 저장소. 실전 경기 테이블·회원 성적 컬럼은 건드리지 않는다(sim.guard.test.ts).
 */
import { db } from "../db.js";
import { hiqSimDrillAttempts, hiqMembers } from "../../shared/schema.js";
import { eq, and, desc, sql, asc } from "drizzle-orm";
import type { HiqSimDrillAttempt } from "../../shared/schema.js";

export class SimDrillRepository {
    async myAttempts(memberId: string, weekId: string): Promise<HiqSimDrillAttempt[]> {
        return db.select().from(hiqSimDrillAttempts)
            .where(and(eq(hiqSimDrillAttempts.memberId, memberId), eq(hiqSimDrillAttempts.weekId, weekId)));
    }

    /** 문제당 첫 시도만 기록된다(unique). 이미 있으면 null. */
    async recordAttempt(data: typeof hiqSimDrillAttempts.$inferInsert): Promise<HiqSimDrillAttempt | null> {
        const rows = await db.insert(hiqSimDrillAttempts).values(data).onConflictDoNothing().returning();
        return rows[0] ?? null;
    }

    /** 대시보드: 내 주별 시도·성공·쿠션 합(최근 limit 주, 최신 주 먼저). 문제당 첫 시도만 남으므로 attempts ≤ 5. */
    async myWeeks(memberId: string, limit = 12) {
        return db.select({
            weekId: hiqSimDrillAttempts.weekId,
            attempts: sql<number>`count(*)::int`,
            successes: sql<number>`sum(case when ${hiqSimDrillAttempts.success} then 1 else 0 end)::int`,
            cushions: sql<number>`sum(${hiqSimDrillAttempts.cushions})::int`,
        })
            .from(hiqSimDrillAttempts)
            .where(eq(hiqSimDrillAttempts.memberId, memberId))
            .groupBy(hiqSimDrillAttempts.weekId)
            .orderBy(desc(hiqSimDrillAttempts.weekId))
            .limit(limit);
    }

    /** 주간 래더: 성공 수 → 쿠션 합 → 먼저 끝낸 순. */
    async ladder(weekId: string, limit = 50) {
        return db.select({
            memberId: hiqSimDrillAttempts.memberId,
            name: hiqMembers.name,
            successes: sql<number>`sum(case when ${hiqSimDrillAttempts.success} then 1 else 0 end)::int`,
            attempts: sql<number>`count(*)::int`,
            cushions: sql<number>`sum(${hiqSimDrillAttempts.cushions})::int`,
            lastAt: sql<string>`max(${hiqSimDrillAttempts.createdAt})`,
        })
            .from(hiqSimDrillAttempts)
            .innerJoin(hiqMembers, eq(hiqMembers.id, hiqSimDrillAttempts.memberId))
            .where(eq(hiqSimDrillAttempts.weekId, weekId))
            .groupBy(hiqSimDrillAttempts.memberId, hiqMembers.name)
            .orderBy(desc(sql`sum(case when ${hiqSimDrillAttempts.success} then 1 else 0 end)`), desc(sql`sum(${hiqSimDrillAttempts.cushions})`), asc(sql`max(${hiqSimDrillAttempts.createdAt})`))
            .limit(limit);
    }
}
