/**
 * 시뮬레이터 v2 기록 저장소.
 *
 * 불변: 이 파일은 실전 경기 테이블·경기 마감 함수·회원 성적 컬럼(레이팅·에버리지·핸디)을 절대 건드리지 않는다.
 * sim.guard.test.ts 가 식별자 grep 으로 지킨다. 시뮬 성적은 hiqSimRatings 에만 쓴다.
 */
import { db } from "../db.js";
import { hiqSimSessions, hiqSimShots, hiqSimRatings, hiqMembers } from "../../shared/schema.js";
import { eq, and, desc, sql } from "drizzle-orm";
import type { HiqSimSession, HiqSimShot } from "../../shared/schema.js";

export interface RecordShotArgs {
    sessionId: string;
    idx: number;
    playerIndex: number;
    preState: unknown;
    input: unknown;
    hash: string;
    clientHash: string | null;
    eventCount: number;
    outcomeCode: string;
    points: number;
    cushions: number;
    /** 샷 반영 후 정본 세션 상태·공 배치·비정규화 값 */
    newState: unknown;
    newBalls: unknown;
    score: number;
    innings: number;
    highRun: number;
    finished: boolean;
}

export class SimRepository {
    async createSession(data: typeof hiqSimSessions.$inferInsert): Promise<HiqSimSession> {
        const [row] = await db.insert(hiqSimSessions).values(data).returning();
        return row;
    }

    async getSession(id: string): Promise<HiqSimSession | undefined> {
        const [row] = await db.select().from(hiqSimSessions).where(eq(hiqSimSessions.id, id)).limit(1);
        return row;
    }

    async listSessions(memberId: string, limit = 30): Promise<HiqSimSession[]> {
        return db.select().from(hiqSimSessions)
            .where(eq(hiqSimSessions.memberId, memberId))
            .orderBy(desc(hiqSimSessions.startedAt))
            .limit(limit);
    }

    async getShots(sessionId: string): Promise<HiqSimShot[]> {
        return db.select().from(hiqSimShots)
            .where(eq(hiqSimShots.sessionId, sessionId))
            .orderBy(hiqSimShots.idx);
    }

    /**
     * 샷 한 개를 원자적으로 기록한다. 세션 행을 잠그고(FOR UPDATE) idx 가 현재 shots 와 같을 때만 쓴다.
     * 같은 idx 가 이미 있으면(재전송) 기존 행을 돌려준다 — 멱등.
     */
    async recordShot(a: RecordShotArgs): Promise<{ shot: HiqSimShot; duplicate: boolean }> {
        return db.transaction(async (tx) => {
            const [s] = await tx.select().from(hiqSimSessions)
                .where(eq(hiqSimSessions.id, a.sessionId)).for("update");
            if (!s) throw new Error("session not found");
            if (s.status !== "playing") throw new Error("session not playing");

            const [existing] = await tx.select().from(hiqSimShots)
                .where(and(eq(hiqSimShots.sessionId, a.sessionId), eq(hiqSimShots.idx, a.idx))).limit(1);
            if (existing) return { shot: existing, duplicate: true };
            if (a.idx !== s.shots) throw new Error(`idx mismatch: expected ${s.shots}, got ${a.idx}`);

            const [shot] = await tx.insert(hiqSimShots).values({
                sessionId: a.sessionId, idx: a.idx, playerIndex: a.playerIndex,
                preState: a.preState, input: a.input, hash: a.hash, clientHash: a.clientHash,
                eventCount: a.eventCount, outcomeCode: a.outcomeCode, points: a.points, cushions: a.cushions,
            }).returning();

            const mismatch = a.clientHash !== null && a.clientHash !== a.hash;
            await tx.update(hiqSimSessions).set({
                state: a.newState, balls: a.newBalls,
                score: a.score, innings: a.innings, highRun: a.highRun,
                shots: s.shots + 1,
                mismatches: mismatch ? s.mismatches + 1 : s.mismatches,
                lastShotAt: new Date(),
                ...(a.finished ? { status: "finished" as const, finishedAt: new Date() } : {}),
            }).where(eq(hiqSimSessions.id, a.sessionId));

            if (a.finished) await this.upsertSoloRating(tx, { ...s, score: a.score, innings: a.innings, highRun: a.highRun });
            return { shot, duplicate: false };
        });
    }

    /** 플레이어가 나가거나 포기. finished 로 마감하면 성적에 반영, abandoned 는 반영 안 함. */
    async closeSession(id: string, memberId: string, status: "finished" | "abandoned"): Promise<HiqSimSession | undefined> {
        return db.transaction(async (tx) => {
            const [s] = await tx.select().from(hiqSimSessions)
                .where(and(eq(hiqSimSessions.id, id), eq(hiqSimSessions.memberId, memberId))).for("update");
            if (!s) return undefined;
            if (s.status !== "playing") return s;
            const [row] = await tx.update(hiqSimSessions)
                .set({ status, finishedAt: new Date() })
                .where(eq(hiqSimSessions.id, id)).returning();
            if (status === "finished" && s.innings > 0) await this.upsertSoloRating(tx, s);
            return row;
        });
    }

    /** 솔로 세션 마감 → 시뮬 성적 집계. 이닝 0 이면 반영하지 않는다(에버리지 분모). */
    private async upsertSoloRating(tx: any, s: Pick<HiqSimSession, "memberId" | "gameType" | "tableId" | "score" | "innings" | "highRun" | "kind">) {
        if (s.kind !== "solo" || s.innings <= 0) return;
        const avg = s.score / s.innings;
        await tx.insert(hiqSimRatings).values({
            memberId: s.memberId, gameType: s.gameType, tableId: s.tableId,
            sessions: 1, totalScore: s.score, totalInnings: s.innings,
            bestAvg: avg, bestHighRun: s.highRun, updatedAt: new Date(),
        }).onConflictDoUpdate({
            target: [hiqSimRatings.memberId, hiqSimRatings.gameType, hiqSimRatings.tableId],
            set: {
                sessions: sql`${hiqSimRatings.sessions} + 1`,
                totalScore: sql`${hiqSimRatings.totalScore} + ${s.score}`,
                totalInnings: sql`${hiqSimRatings.totalInnings} + ${s.innings}`,
                bestAvg: sql`GREATEST(${hiqSimRatings.bestAvg}, ${avg})`,
                bestHighRun: sql`GREATEST(${hiqSimRatings.bestHighRun}, ${s.highRun})`,
                updatedAt: new Date(),
            },
        });
    }

    /** 방치된 playing 세션 정리: 마지막 샷(없으면 시작) 뒤 hours 시간이 지나면 abandoned. 성적 반영 없음. */
    async cleanupStale(hours = 6): Promise<number> {
        const rows = await db.update(hiqSimSessions)
            .set({ status: "abandoned", finishedAt: new Date() })
            .where(and(
                eq(hiqSimSessions.status, "playing"),
                sql`coalesce(${hiqSimSessions.lastShotAt}, ${hiqSimSessions.startedAt}) < now() - make_interval(hours => ${hours})`,
            ))
            .returning({ id: hiqSimSessions.id });
        return rows.length;
    }

    /** 연습 에버리지 랭킹. 최소 세션 수·이닝 수 조건은 호출자가 정한다. */
    async ladder(gameType: "3c" | "4c", tableId: "DAEDAE" | "JUNGDAE_KR", limit = 50) {
        return db.select({
            memberId: hiqSimRatings.memberId,
            name: hiqMembers.name,
            sessions: hiqSimRatings.sessions,
            bestAvg: hiqSimRatings.bestAvg,
            bestHighRun: hiqSimRatings.bestHighRun,
            avg: sql<number>`CASE WHEN ${hiqSimRatings.totalInnings} > 0 THEN ${hiqSimRatings.totalScore}::float / ${hiqSimRatings.totalInnings} ELSE 0 END`,
            updatedAt: hiqSimRatings.updatedAt,
        })
            .from(hiqSimRatings)
            .innerJoin(hiqMembers, eq(hiqMembers.id, hiqSimRatings.memberId))
            .where(and(eq(hiqSimRatings.gameType, gameType), eq(hiqSimRatings.tableId, tableId)))
            .orderBy(desc(hiqSimRatings.bestAvg), desc(hiqSimRatings.bestHighRun))
            .limit(limit);
    }


    async myRatings(memberId: string) {
        return db.select().from(hiqSimRatings).where(eq(hiqSimRatings.memberId, memberId));
    }

    async myRating(memberId: string, gameType: "3c" | "4c", tableId: "DAEDAE" | "JUNGDAE_KR") {
        const [row] = await db.select().from(hiqSimRatings)
            .where(and(eq(hiqSimRatings.memberId, memberId), eq(hiqSimRatings.gameType, gameType), eq(hiqSimRatings.tableId, tableId)))
            .limit(1);
        return row;
    }
}
