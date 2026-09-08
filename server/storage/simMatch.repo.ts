/**
 * 시뮬레이터 네트워크 대전 A(비동기·폴링) 저장소.
 * 불변: 실전 경기 테이블·마감 함수·회원 성적 컬럼은 절대 건드리지 않는다(sim.guard.test.ts).
 * 시뮬 대전 성적(Elo)은 hiqSimRatings.simRating 에만 쓴다.
 */
import { db } from "../db.js";
import { hiqSimMatches, hiqSimMatchShots, hiqSimRatings, hiqMembers } from "../../shared/schema.js";
import { alias } from "drizzle-orm/pg-core";
import { eq, and, or, desc, sql, inArray, gte, isNull } from "drizzle-orm";
import type { HiqSimMatch, HiqSimMatchShot } from "../../shared/schema.js";

const ELO_K = 24;
const LIVE = ["waiting", "playing"] as const;

export interface MatchShotArgs {
    matchId: string;
    idx: number;
    playerIndex: number;
    memberId: string;
    preState: unknown;
    input: unknown;
    hash: string;
    clientHash: string | null;
    eventCount: number;
    outcomeCode: string;
    points: number;
    cushions: number;
    newState: unknown;
    newBalls: unknown;
    newTurn: number;
    finished: boolean;
    winnerIndex: number | null;
    endReason: string | null;
}

export type MatchWithNames = HiqSimMatch & { hostName: string; guestName: string | null };

function randomCode(): string {
    // 6자리, 앞자리 0 허용 안 함(입력 혼동 방지)
    return String(100000 + Math.floor(Math.random() * 900000));
}

export class SimMatchRepository {
    /** 살아 있는 대전과 겹치지 않는 코드를 뽑아 만든다. */
    async create(data: Omit<typeof hiqSimMatches.$inferInsert, "code">): Promise<HiqSimMatch> {
        for (let attempt = 0; attempt < 8; attempt++) {
            const code = randomCode();
            const [dup] = await db.select({ id: hiqSimMatches.id }).from(hiqSimMatches)
                .where(and(eq(hiqSimMatches.code, code), inArray(hiqSimMatches.status, [...LIVE]))).limit(1);
            if (dup) continue;
            const [row] = await db.insert(hiqSimMatches).values({ ...data, code }).returning();
            return row;
        }
        throw new Error("코드 생성 실패");
    }

    private withNames() {
        const guest = alias(hiqMembers, "guest_member");
        return {
            guest,
            q: db.select({
                m: hiqSimMatches,
                hostName: hiqMembers.name,
                guestName: guest.name,
            }).from(hiqSimMatches)
                .innerJoin(hiqMembers, eq(hiqMembers.id, hiqSimMatches.hostId))
                .leftJoin(guest, eq(guest.id, hiqSimMatches.guestId)),
        };
    }

    async get(id: string): Promise<MatchWithNames | undefined> {
        const { q } = this.withNames();
        const [row] = await q.where(eq(hiqSimMatches.id, id)).limit(1);
        return row ? { ...row.m, hostName: row.hostName, guestName: row.guestName ?? null } : undefined;
    }

    async findLiveByCode(code: string): Promise<MatchWithNames | undefined> {
        const { q } = this.withNames();
        const [row] = await q.where(and(eq(hiqSimMatches.code, code), inArray(hiqSimMatches.status, [...LIVE])))
            .orderBy(desc(hiqSimMatches.createdAt)).limit(1);
        return row ? { ...row.m, hostName: row.hostName, guestName: row.guestName ?? null } : undefined;
    }

    async listMine(memberId: string, limit = 20): Promise<MatchWithNames[]> {
        const { q } = this.withNames();
        const rows = await q.where(or(eq(hiqSimMatches.hostId, memberId), eq(hiqSimMatches.guestId, memberId)))
            .orderBy(desc(hiqSimMatches.createdAt)).limit(limit);
        return rows.map((r) => ({ ...r.m, hostName: r.hostName, guestName: r.guestName ?? null }));
    }

    /** 게스트 참가 → playing. waiting 상태의 행을 잠그고 한 번만 성공한다. */
    async start(id: string, guestId: string, guestTarget: number, state: unknown, balls: unknown): Promise<HiqSimMatch | null> {
        return db.transaction(async (tx) => {
            const [m] = await tx.select().from(hiqSimMatches).where(eq(hiqSimMatches.id, id)).for("update");
            if (!m || m.status !== "waiting" || m.hostId === guestId) return null;
            const [row] = await tx.update(hiqSimMatches).set({
                guestId, guestTarget, state, balls, status: "playing", turn: 0,
                startedAt: new Date(), version: m.version + 1,
            }).where(eq(hiqSimMatches.id, id)).returning();
            return row;
        });
    }

    async cancel(id: string, hostId: string): Promise<boolean> {
        const res = await db.update(hiqSimMatches).set({ status: "canceled", finishedAt: new Date() })
            .where(and(eq(hiqSimMatches.id, id), eq(hiqSimMatches.hostId, hostId), eq(hiqSimMatches.status, "waiting"))).returning({ id: hiqSimMatches.id });
        return res.length > 0;
    }

    /** 상대가 hours 시간 넘게 안 들어온 waiting 대전을 canceled 로. */
    async cleanupStaleWaiting(hours = 24): Promise<number> {
        const rows = await db.update(hiqSimMatches)
            .set({ status: "canceled", finishedAt: new Date() })
            .where(and(eq(hiqSimMatches.status, "waiting"), sql`${hiqSimMatches.createdAt} < now() - make_interval(hours => ${hours})`))
            .returning({ id: hiqSimMatches.id });
        return rows.length;
    }

    async getShots(matchId: string, fromIdx = 0): Promise<HiqSimMatchShot[]> {
        return db.select().from(hiqSimMatchShots)
            .where(and(eq(hiqSimMatchShots.matchId, matchId), gte(hiqSimMatchShots.idx, fromIdx)))
            .orderBy(hiqSimMatchShots.idx);
    }

    /**
     * 샷 기록(원자적). 잠근 뒤 idx·차례·선수를 검증한다. 같은 idx 가 이미 있으면 기존 행(멱등).
     * 호출자는 잠금 밖에서 시뮬레이션했으므로 preState 가 현재 balls 와 같은지도 여기서 확인한다.
     */
    async recordShot(a: MatchShotArgs): Promise<{ shot: HiqSimMatchShot; duplicate: boolean; match: HiqSimMatch }> {
        return db.transaction(async (tx) => {
            const [m] = await tx.select().from(hiqSimMatches).where(eq(hiqSimMatches.id, a.matchId)).for("update");
            if (!m) throw new Error("match not found");
            const [existing] = await tx.select().from(hiqSimMatchShots)
                .where(and(eq(hiqSimMatchShots.matchId, a.matchId), eq(hiqSimMatchShots.idx, a.idx))).limit(1);
            if (existing) return { shot: existing, duplicate: true, match: m };
            if (m.status !== "playing") throw new Error("match not playing");
            if (a.idx !== m.shots) throw new Error(`idx mismatch: expected ${m.shots}, got ${a.idx}`);
            if (a.playerIndex !== m.turn) throw new Error("not your turn");
            if (JSON.stringify(m.balls) !== JSON.stringify(a.preState)) throw new Error("stale preState");

            const [shot] = await tx.insert(hiqSimMatchShots).values({
                matchId: a.matchId, idx: a.idx, playerIndex: a.playerIndex, memberId: a.memberId,
                preState: a.preState, input: a.input, hash: a.hash, clientHash: a.clientHash,
                eventCount: a.eventCount, outcomeCode: a.outcomeCode, points: a.points, cushions: a.cushions,
            }).returning();

            const mismatch = a.clientHash !== null && a.clientHash !== a.hash;
            const winnerId = a.finished
                ? (a.winnerIndex === 0 ? m.hostId : a.winnerIndex === 1 ? m.guestId : null)
                : null;
            const [updated] = await tx.update(hiqSimMatches).set({
                state: a.newState, balls: a.newBalls, turn: a.newTurn,
                shots: m.shots + 1, version: m.version + 1,
                mismatches: mismatch ? m.mismatches + 1 : m.mismatches,
                lastShotAt: new Date(),
                turnSeenAt: null,
                ...(a.finished ? { status: "finished" as const, finishedAt: new Date(), winnerId, endReason: a.endReason } : {}),
            }).where(eq(hiqSimMatches.id, a.matchId)).returning();

            if (a.finished && m.guestId) await this.applyElo(tx, updated, winnerId);
            return { shot, duplicate: false, match: updated };
        });
    }

    /** 40초 룰: 차례인 사람이 조준 화면에 들어온 시각을 한 번만 적는다(이미 있으면 그대로 → undefined). */
    async markTurnSeen(id: string, turn: number): Promise<HiqSimMatch | undefined> {
        const [row] = await db.update(hiqSimMatches).set({ turnSeenAt: new Date() })
            .where(and(eq(hiqSimMatches.id, id), eq(hiqSimMatches.status, "playing"), eq(hiqSimMatches.turn, turn), isNull(hiqSimMatches.turnSeenAt)))
            .returning();
        return row;
    }

    /** 40초 룰 시간 초과: 샷 행 없이 이닝을 넘긴다(상태·차례·버전 갱신). 차례가 이미 바뀌었으면 null. */
    async passTurn(a: { id: string; turn: number; newState: unknown; newTurn: number; finished: boolean; winnerIndex: number | null; endReason: string | null }): Promise<HiqSimMatch | null> {
        return db.transaction(async (tx) => {
            const [m] = await tx.select().from(hiqSimMatches).where(eq(hiqSimMatches.id, a.id)).for("update");
            if (!m || m.status !== "playing" || m.turn !== a.turn) return null;
            const winnerId = a.finished ? (a.winnerIndex === 0 ? m.hostId : a.winnerIndex === 1 ? m.guestId : null) : null;
            const [row] = await tx.update(hiqSimMatches).set({
                state: a.newState, turn: a.newTurn, version: m.version + 1, lastShotAt: new Date(), turnSeenAt: null,
                ...(a.finished ? { status: "finished" as const, finishedAt: new Date(), winnerId, endReason: a.endReason } : {}),
            }).where(eq(hiqSimMatches.id, a.id)).returning();
            if (a.finished && m.guestId) await this.applyElo(tx, row, winnerId);
            return row;
        });
    }

    /** 기권·무응답 승리 등 샷 없이 끝내기. playing 일 때만. */
    async finish(id: string, winnerId: string | null, endReason: string): Promise<HiqSimMatch | null> {
        return db.transaction(async (tx) => {
            const [m] = await tx.select().from(hiqSimMatches).where(eq(hiqSimMatches.id, id)).for("update");
            if (!m || m.status !== "playing") return null;
            const [row] = await tx.update(hiqSimMatches).set({
                status: "finished", finishedAt: new Date(), winnerId, endReason, version: m.version + 1,
            }).where(eq(hiqSimMatches.id, id)).returning();
            if (m.guestId) await this.applyElo(tx, row, winnerId);
            return row;
        });
    }

    /** 시뮬 대전 Elo. 실전 RP 와 완전히 별개의 hiqSimRatings.simRating. 무승부(null)는 0.5. */
    private async applyElo(tx: any, m: HiqSimMatch, winnerId: string | null) {
        const ids = [m.hostId, m.guestId!];
        const rows = await tx.select().from(hiqSimRatings)
            .where(and(inArray(hiqSimRatings.memberId, ids), eq(hiqSimRatings.gameType, m.gameType), eq(hiqSimRatings.tableId, m.tableId)));
        const rating = (id: string) => rows.find((r: any) => r.memberId === id)?.simRating ?? 1000;
        const [ra, rb] = [rating(ids[0]), rating(ids[1])];
        const ea = 1 / (1 + Math.pow(10, (rb - ra) / 400));
        const sa = winnerId === null ? 0.5 : winnerId === ids[0] ? 1 : 0;
        const da = Math.round(ELO_K * (sa - ea));
        for (const [i, id] of ids.entries()) {
            const delta = i === 0 ? da : -da;
            const won = winnerId === id ? 1 : 0;
            await tx.insert(hiqSimRatings).values({
                memberId: id, gameType: m.gameType, tableId: m.tableId,
                simRating: 1000 + delta, matches: 1, wins: won, updatedAt: new Date(),
            }).onConflictDoUpdate({
                target: [hiqSimRatings.memberId, hiqSimRatings.gameType, hiqSimRatings.tableId],
                set: {
                    simRating: sql`${hiqSimRatings.simRating} + ${delta}`,
                    matches: sql`${hiqSimRatings.matches} + 1`,
                    wins: sql`${hiqSimRatings.wins} + ${won}`,
                    updatedAt: new Date(),
                },
            });
        }
    }
}
