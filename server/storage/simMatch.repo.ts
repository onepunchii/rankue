/**
 * 시뮬레이터 네트워크 대전 A(비동기·폴링) 저장소.
 * 불변: 실전 경기 테이블·마감 함수·회원 성적 컬럼은 절대 건드리지 않는다(sim.guard.test.ts).
 * 시뮬 대전 성적(Elo)은 hiqSimMatchRatings.rating 에만 쓴다(2026-09-12 부터 대대·중대 통합).
 */
import { db } from "../db.js";
import { hiqSimMatches, hiqSimMatchShots, hiqSimMatchRatings, hiqMembers } from "../../shared/schema.js";
import { alias } from "drizzle-orm/pg-core";
import { eq, and, or, desc, sql, inArray, gte, isNull } from "drizzle-orm";
import type { HiqSimMatch, HiqSimMatchShot } from "../../shared/schema.js";
import { PRESENCE_MS, REPLAY_GRACE_MS } from "../../shared/sim/rules/session.js";
import { WATCHER_WINDOW_MS } from "../../shared/sim/watchers.js";

const ELO_K = 24;
const LIVE = ["waiting", "playing"] as const;
/** 접속 표시 갱신 간격(폴링마다 쓰지 않고 이 간격이 지났을 때만) */
const SEEN_THROTTLE_MS = 5_000;

/** 다음 차례의 시계 시작 시각: 그 사람이 접속 중이면 now + grace, 아니면 null(조준 화면을 열 때 ack). */
export function nextTurnSeenAt(m: { hostSeenAt: Date | null; guestSeenAt: Date | null }, nextTurn: number, finished: boolean, graceMs: number, now = Date.now()): Date | null {
    if (finished) return null;
    const seen = nextTurn === 0 ? m.hostSeenAt : m.guestSeenAt;
    if (!seen || now - seen.getTime() > PRESENCE_MS) return null;
    return new Date(now + graceMs);
}

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

    /** 내 대전 목록. 취소된 방(상대가 들어온 적 없다)은 빼고 준다 — 새 방을 열 때 접힌 방까지 줄로 남으면 목록이 지저분하다. */
    async listMine(memberId: string, limit = 20): Promise<MatchWithNames[]> {
        const { q } = this.withNames();
        const rows = await q.where(and(
            or(eq(hiqSimMatches.hostId, memberId), eq(hiqSimMatches.guestId, memberId)),
            sql`not (${hiqSimMatches.status} = 'canceled' and ${hiqSimMatches.guestId} is null)`,
        ))
            .orderBy(desc(hiqSimMatches.createdAt)).limit(limit);
        return rows.map((r) => ({ ...r.m, hostName: r.hostName, guestName: r.guestName ?? null }));
    }

    /** 멀티방 목록: 공개·대기 중·내 방 아님·sinceMs 이후 만든 방, 최신순. */
    async listPublicWaiting(viewerId: string, sinceMs: number, limit = 50): Promise<MatchWithNames[]> {
        const { q } = this.withNames();
        const rows = await q.where(and(
            eq(hiqSimMatches.isPublic, true), eq(hiqSimMatches.status, "waiting"),
            sql`${hiqSimMatches.hostId} <> ${viewerId}`, gte(hiqSimMatches.createdAt, new Date(sinceMs)),
        )).orderBy(desc(hiqSimMatches.createdAt)).limit(limit);
        return rows.map((r) => ({ ...r.m, hostName: r.hostName, guestName: r.guestName ?? null }));
    }

    /**
     * 온라인 다마용 최근 기록(2026-09-12). 끝난 대전에서 **내 몫의 점수·이닝**만 모은다.
     * 방장은 players[0], 게스트는 players[1] 이다(세션을 만들 때 그 순서로 넣는다 — joinAndStart).
     * 기권·무응답으로 끝난 판도 친 만큼은 기록이라 그대로 센다.
     */
    async recentMatchRecord(memberId: string, gameType: "3c" | "4c", limit: number): Promise<{ score: number; innings: number; matches: number }> {
        const rows = await db.select({ hostId: hiqSimMatches.hostId, state: hiqSimMatches.state })
            .from(hiqSimMatches)
            .where(and(
                eq(hiqSimMatches.status, "finished"),
                eq(hiqSimMatches.gameType, gameType),
                or(eq(hiqSimMatches.hostId, memberId), eq(hiqSimMatches.guestId, memberId)),
                sql`${hiqSimMatches.state} is not null`,
            ))
            .orderBy(desc(hiqSimMatches.finishedAt))
            .limit(Math.max(1, limit));

        let score = 0, innings = 0, matches = 0;
        for (const r of rows) {
            const players = (r.state as { players?: { score?: number; innings?: number }[] } | null)?.players;
            const me = players?.[r.hostId === memberId ? 0 : 1];
            if (!me) continue;
            score += me.score ?? 0;
            innings += me.innings ?? 0;
            matches += 1;
        }
        return { score, innings, matches };
    }

    /**
     * 관전자 표시: 내 시각을 적고 오래된 사람은 같은 문장에서 걷어낸다(2026-09-12).
     * 한 문장이라 관전자 여럿이 동시에 들어와도 서로의 항목을 덮지 않는다(읽고-고쳐-쓰기가 아니다).
     * 선수는 적지 않는다 — 관전자 수는 "구경하는 사람"이라 대전 당사자는 빼고 센다.
     */
    async touchWatcher(id: string, memberId: string, nowMs: number): Promise<void> {
        const fresh = nowMs - WATCHER_WINDOW_MS;
        await db.execute(sql`
            update ${hiqSimMatches}
            set watchers = (
                select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
                from jsonb_each(coalesce(${hiqSimMatches.watchers}, '{}'::jsonb)) as t(k, v)
                where k <> ${memberId} and (v #>> '{}')::bigint > ${fresh}
            ) || jsonb_build_object(${memberId}::text, ${nowMs}::bigint)
            where id = ${id}::uuid and status = 'playing'
        `);
    }

    /**
     * 관전 목록(2026-09-12 오너: "게임 시작하면 방이 사라지는데 관전으로 들어가 볼 수 있게").
     * 공개 방이고 비밀번호가 없는 대전만 — 비밀번호를 건 방은 그들끼리 치겠다는 뜻이라 관전도 막는다.
     * live = 진행 중, replays = 최근에 끝난 대전(다시보기). 내가 뛰고 있는 대전은 빼고 보여준다(그건 '내 대전'이다).
     */
    async listWatchable(viewerId: string, status: "playing" | "finished", sinceMs: number, limit = 20): Promise<MatchWithNames[]> {
        const { q } = this.withNames();
        const timeCol = status === "playing" ? hiqSimMatches.startedAt : hiqSimMatches.finishedAt;
        const rows = await q.where(and(
            eq(hiqSimMatches.isPublic, true),
            eq(hiqSimMatches.status, status),
            isNull(hiqSimMatches.passwordHash),
            sql`${hiqSimMatches.hostId} <> ${viewerId}`,
            sql`(${hiqSimMatches.guestId} is null or ${hiqSimMatches.guestId} <> ${viewerId})`,
            gte(timeCol, new Date(sinceMs)),
            // 한 샷도 안 친 대전은 뺀다 — 시작하자마자 기권·취소된 판이라 볼 것이 없다.
            sql`${hiqSimMatches.shots} > 0`,
        )).orderBy(desc(timeCol)).limit(limit);
        return rows.map((r) => ({ ...r.m, hostName: r.hostName, guestName: r.guestName ?? null }));
    }

    async setInvited(id: string, memberId: string): Promise<void> {
        await db.update(hiqSimMatches).set({ invitedId: memberId }).where(eq(hiqSimMatches.id, id));
    }

    /** 게스트 참가 → playing. waiting 상태의 행을 잠그고 한 번만 성공한다. */
    /** hostTarget 은 핸디전에서만 넘어온다 — 참가하는 순간 두 사람의 에버리지로 방장 목표까지 다시 정하기 때문이다. */
    async start(id: string, guestId: string, guestTarget: number, state: unknown, balls: unknown, hostTarget?: number): Promise<HiqSimMatch | null> {
        return db.transaction(async (tx) => {
            const [m] = await tx.select().from(hiqSimMatches).where(eq(hiqSimMatches.id, id)).for("update");
            if (!m || m.status !== "waiting" || m.hostId === guestId) return null;
            const [row] = await tx.update(hiqSimMatches).set({
                guestId, guestTarget, state, balls, status: "playing", turn: 0,
                ...(typeof hostTarget === "number" ? { hostTarget } : {}),
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

    /**
     * 내가 만든 다른 대기 방을 접는다(keepId 만 남긴다) — 방은 한 번에 하나(2026-09-08 오너: "중복방은 제거").
     * 시작된(playing) 대전과 남의 방은 건드리지 않는다. 접은 방의 코드를 돌려준다(알림·로그용).
     */
    async cancelOtherWaiting(hostId: string, keepId: string): Promise<{ id: string; code: string; invitedId: string | null }[]> {
        return db.update(hiqSimMatches).set({ status: "canceled", finishedAt: new Date() })
            .where(and(eq(hiqSimMatches.hostId, hostId), eq(hiqSimMatches.status, "waiting"), sql`${hiqSimMatches.id} <> ${keepId}`))
            .returning({ id: hiqSimMatches.id, code: hiqSimMatches.code, invitedId: hiqSimMatches.invitedId });
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
                // 다음 차례가 접속 중이면 재생 여유 뒤 시계가 바로 돈다(같은 사람이 이어 칠 때도). 아니면 조준 화면을 열 때.
                turnSeenAt: nextTurnSeenAt(m, a.newTurn, a.finished, REPLAY_GRACE_MS),
                ...(a.finished ? { status: "finished" as const, finishedAt: new Date(), winnerId, endReason: a.endReason } : {}),
            }).where(eq(hiqSimMatches.id, a.matchId)).returning();

            if (a.finished && m.guestId) await this.applyElo(tx, updated, winnerId);
            return { shot, duplicate: false, match: updated };
        });
    }

    /** 접속 표시: 대전 화면 폴링·샷 때 내 자리의 seen_at 을 적는다(5 s 에 한 번). */
    async touchSeen(id: string, playerIndex: 0 | 1): Promise<void> {
        const col = playerIndex === 0 ? hiqSimMatches.hostSeenAt : hiqSimMatches.guestSeenAt;
        await db.update(hiqSimMatches).set(playerIndex === 0 ? { hostSeenAt: new Date() } : { guestSeenAt: new Date() })
            .where(and(eq(hiqSimMatches.id, id), eq(hiqSimMatches.status, "playing"),
                or(isNull(col), sql`${col} < now() - make_interval(secs => ${SEEN_THROTTLE_MS / 1000})`)));
    }

    /**
     * 이모지 인사 보내기. 마지막 하나만 남기고, 도배는 여기서 막는다 —
     * 같은 사람이 EMOJI_COOLDOWN_MS 안에 또 보내면 거부, 한 대전에서 EMOJI_MAX_PER_MATCH 를 넘어도 거부.
     * 보낸 횟수는 대전 행에 세지 않고(컬럼을 더 늘리지 않으려고) 알림 없이 카운트만 메모리에 두지 않는다 —
     * 대신 host/guest 각각의 누적을 emoji_counts jsonb 없이 간단히 처리하기 위해 shots 처럼 별도 컬럼 없이
     * "마지막 시각 + 총 횟수"를 한 컬럼(emoji_from/emoji_at)으로는 못 세므로, 횟수 제한은 라우트에서
     * 알림 테이블이 아닌 이 메서드의 반환값으로 판단한다(아래 sentCount 참고).
     */
    async sendEmoji(id: string, from: 0 | 1, code: string, cooldownMs: number, maxPerMatch: number): Promise<"ok" | "cooldown" | "limit" | "gone"> {
        return db.transaction(async (tx) => {
            const [m] = await tx.select().from(hiqSimMatches).where(eq(hiqSimMatches.id, id)).for("update");
            if (!m || m.status !== "playing") return "gone";
            const counts = (m.emojiCounts as Record<string, number> | null) ?? {};
            const key = String(from);
            if ((counts[key] ?? 0) >= maxPerMatch) return "limit";
            if (m.emojiAt && m.emojiFrom === from && Date.now() - m.emojiAt.getTime() < cooldownMs) return "cooldown";
            await tx.update(hiqSimMatches).set({
                emojiCode: code, emojiFrom: from, emojiAt: new Date(),
                emojiCounts: { ...counts, [key]: (counts[key] ?? 0) + 1 },
            }).where(eq(hiqSimMatches.id, id));
            return "ok";
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
    async passTurn(a: { id: string; turn: number; newState: unknown; newTurn: number; finished: boolean; winnerIndex: number | null; endReason: string | null; strikeIndex?: 0 | 1 }): Promise<HiqSimMatch | null> {
        return db.transaction(async (tx) => {
            const [m] = await tx.select().from(hiqSimMatches).where(eq(hiqSimMatches.id, a.id)).for("update");
            if (!m || m.status !== "playing" || m.turn !== a.turn) return null;
            const winnerId = a.finished ? (a.winnerIndex === 0 ? m.hostId : a.winnerIndex === 1 ? m.guestId : null) : null;
            const [row] = await tx.update(hiqSimMatches).set({
                state: a.newState, turn: a.newTurn, version: m.version + 1, lastShotAt: new Date(),
                // 시간 초과엔 재생이 없다 — 접속 중이면 바로 시작
                turnSeenAt: nextTurnSeenAt(m, a.newTurn, a.finished, 0),
                ...(a.strikeIndex === 0 ? { hostTimeouts: m.hostTimeouts + 1 } : a.strikeIndex === 1 ? { guestTimeouts: m.guestTimeouts + 1 } : {}),
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

    /**
     * 시뮬 대전 Elo. 실전 RP 와 완전히 별개다. 무승부(null)는 0.5.
     * 2026-09-12 부터 **테이블(대대·중대)을 합쳐** hiq_sim_match_ratings 에 (회원, 종목) 한 줄로 쌓는다 — 오너 지시.
     * 인원이 적어 사다리를 넷으로 쪼개면 한 판에 서너 명밖에 안 남았다.
     */
    private async applyElo(tx: any, m: HiqSimMatch, winnerId: string | null) {
        const ids = [m.hostId, m.guestId!];
        const rows = await tx.select().from(hiqSimMatchRatings)
            .where(and(inArray(hiqSimMatchRatings.memberId, ids), eq(hiqSimMatchRatings.gameType, m.gameType)));
        const rating = (id: string) => rows.find((r: any) => r.memberId === id)?.rating ?? 1000;
        const [ra, rb] = [rating(ids[0]), rating(ids[1])];
        const ea = 1 / (1 + Math.pow(10, (rb - ra) / 400));
        const sa = winnerId === null ? 0.5 : winnerId === ids[0] ? 1 : 0;
        const da = Math.round(ELO_K * (sa - ea));
        for (const [i, id] of ids.entries()) {
            const delta = i === 0 ? da : -da;
            const won = winnerId === id ? 1 : 0;
            await tx.insert(hiqSimMatchRatings).values({
                memberId: id, gameType: m.gameType,
                rating: 1000 + delta, matches: 1, wins: won, updatedAt: new Date(),
            }).onConflictDoUpdate({
                target: [hiqSimMatchRatings.memberId, hiqSimMatchRatings.gameType],
                set: {
                    rating: sql`${hiqSimMatchRatings.rating} + ${delta}`,
                    matches: sql`${hiqSimMatchRatings.matches} + 1`,
                    wins: sql`${hiqSimMatchRatings.wins} + ${won}`,
                    updatedAt: new Date(),
                },
            });
        }
    }
}
