/**
 * 시뮬레이터 네트워크 대전 A(비동기·폴링) 저장소.
 * 불변: 실전 경기 테이블·마감 함수·회원 성적 컬럼은 절대 건드리지 않는다(sim.guard.test.ts).
 * 시뮬 대전 성적(Elo)은 hiqSimMatchRatings.rating 에만 쓴다(2026-09-12 부터 대대·중대 통합).
 */
import { db } from "../db.js";
import { hiqSimMatches, hiqSimMatchShots, hiqSimMatchChats, hiqSimMatchRatings, hiqMembers, profiles } from "../../shared/schema.js";
import { alias } from "drizzle-orm/pg-core";
import { eq, and, or, desc, sql, inArray, gte, isNull } from "drizzle-orm";
import type { HiqSimMatch, HiqSimMatchShot, HiqSimMatchChat } from "../../shared/schema.js";
import { ABSENT_GRACE_MS, PRESENCE_MS, REPLAY_GRACE_MS } from "../../shared/sim/rules/session.js";
import { WATCHER_WINDOW_MS } from "../../shared/sim/watchers.js";
import { CHAT_PAGE_MAX, chatReject, type ChatReject } from "../../shared/sim/chat.js";
import { ratingEligibility, ratingDelta, START_RATING, SAME_PAIR_WINDOW_MS, MIN_SHOTS_EACH } from "../../shared/sim/rating.js";

const LIVE = ["waiting", "playing"] as const;
/** 접속 표시 갱신 간격(폴링마다 쓰지 않고 이 간격이 지났을 때만) */
const SEEN_THROTTLE_MS = 5_000;

/**
 * 다음 차례의 시계 시작 시각.
 *   접속 중       → now + graceMs (샷 재생을 보는 동안은 안 센다)
 *   자리 비움     → now + ABSENT_GRACE_MS (푸시를 보고 돌아올 시간만큼 봐주고 시작)
 *   대전 종료     → null (셀 시계가 없다)
 *
 * 2026-09-15 이전에는 자리 비움이 null 이어서 시계가 **영영 시작되지 않았다** — 남은 사람이 무한정 기다렸다.
 * 늦게 시작해도 시계는 한 번 돌기 시작하면 멈추지 않는다(자리를 비우는 것 자체가 패널티, 2026-09-08 오너 결정).
 */
export function nextTurnSeenAt(m: { hostSeenAt: Date | null; guestSeenAt: Date | null }, nextTurn: number, finished: boolean, graceMs: number, now = Date.now()): Date | null {
    if (finished) return null;
    const seen = nextTurn === 0 ? m.hostSeenAt : m.guestSeenAt;
    const away = !seen || now - seen.getTime() > PRESENCE_MS;
    return new Date(now + (away ? ABSENT_GRACE_MS : graceMs));
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
    /** 친 사람의 이닝 번호(shotInning). 다시 들어온 화면이 이닝별 점수판을 이 값으로 되살린다. */
    inning: number;
    newState: unknown;
    newBalls: unknown;
    newTurn: number;
    finished: boolean;
    winnerIndex: number | null;
    endReason: string | null;
}

export type MatchWithNames = HiqSimMatch & {
    hostName: string; guestName: string | null;
    /** ISO 3166-1 alpha-2. 가입할 때 IP 로 자동으로 잡히므로 없는 사람도 있다 — 화면은 없으면 국기를 안 그린다. */
    hostCountry: string | null; guestCountry: string | null;
};

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

    /**
     * 대전 행 + 두 선수의 이름·국가. 국가는 profiles.country_code 에 있어 회원 → 프로필을 한 번 더 탄다
     * (헤더의 국기, 2026-09-16 오너). 둘 다 기본키 조회라 비용은 인덱스 조회 두 번이고,
     * 가입할 때 IP 로 자동으로 잡히므로 **없는 사람이 더 많다** — 화면은 없으면 국기를 그리지 않는다.
     */
    private withNames() {
        const guest = alias(hiqMembers, "guest_member");
        const hostProfile = alias(profiles, "host_profile");
        const guestProfile = alias(profiles, "guest_profile");
        return {
            guest,
            q: db.select({
                m: hiqSimMatches,
                hostName: hiqMembers.name,
                guestName: guest.name,
                hostCountry: hostProfile.countryCode,
                guestCountry: guestProfile.countryCode,
            }).from(hiqSimMatches)
                .innerJoin(hiqMembers, eq(hiqMembers.id, hiqSimMatches.hostId))
                .leftJoin(guest, eq(guest.id, hiqSimMatches.guestId))
                .leftJoin(hostProfile, eq(hostProfile.id, hiqMembers.profileId))
                .leftJoin(guestProfile, eq(guestProfile.id, guest.profileId)),
        };
    }

    async get(id: string): Promise<MatchWithNames | undefined> {
        const { q } = this.withNames();
        const [row] = await q.where(eq(hiqSimMatches.id, id)).limit(1);
        return row ? { ...row.m, hostName: row.hostName, guestName: row.guestName ?? null, hostCountry: row.hostCountry ?? null, guestCountry: row.guestCountry ?? null } : undefined;
    }

    async findLiveByCode(code: string): Promise<MatchWithNames | undefined> {
        const { q } = this.withNames();
        const [row] = await q.where(and(eq(hiqSimMatches.code, code), inArray(hiqSimMatches.status, [...LIVE])))
            .orderBy(desc(hiqSimMatches.createdAt)).limit(1);
        return row ? { ...row.m, hostName: row.hostName, guestName: row.guestName ?? null, hostCountry: row.hostCountry ?? null, guestCountry: row.guestCountry ?? null } : undefined;
    }

    /** 내 대전 목록. 취소된 방(상대가 들어온 적 없다)은 빼고 준다 — 새 방을 열 때 접힌 방까지 줄로 남으면 목록이 지저분하다. */
    async listMine(memberId: string, limit = 20): Promise<MatchWithNames[]> {
        const { q } = this.withNames();
        const rows = await q.where(and(
            or(eq(hiqSimMatches.hostId, memberId), eq(hiqSimMatches.guestId, memberId)),
            sql`not (${hiqSimMatches.status} = 'canceled' and ${hiqSimMatches.guestId} is null)`,
        ))
            .orderBy(desc(hiqSimMatches.createdAt)).limit(limit);
        return rows.map((r) => ({ ...r.m, hostName: r.hostName, guestName: r.guestName ?? null, hostCountry: r.hostCountry ?? null, guestCountry: r.guestCountry ?? null }));
    }

    /** 최근 온라인 대전 상대 id(최근 순, 중복 없음) — 초대 목록에서 "또 한 판" 상대를 위로 올린다. */
    async recentOpponentIds(memberId: string, limit = 20): Promise<string[]> {
        const res = await db.execute(sql`
            select opp, max(at) as last_at from (
                select case when host_id = ${memberId} then guest_id else host_id end as opp,
                       coalesce(finished_at, last_shot_at, created_at) as at
                from hiq_sim_matches
                where (host_id = ${memberId} or guest_id = ${memberId})
                  and guest_id is not null and status in ('playing', 'finished')
            ) x
            where opp is not null and opp <> ${memberId}
            group by opp order by last_at desc limit ${limit}`);
        return (res.rows as Record<string, unknown>[]).map((r) => String(r.opp));
    }

    /** 멀티방 목록: 공개·대기 중·내 방 아님·sinceMs 이후 만든 방, 최신순. */
    async listPublicWaiting(viewerId: string, sinceMs: number, limit = 50): Promise<MatchWithNames[]> {
        const { q } = this.withNames();
        const rows = await q.where(and(
            eq(hiqSimMatches.isPublic, true), eq(hiqSimMatches.status, "waiting"),
            sql`${hiqSimMatches.hostId} <> ${viewerId}`, gte(hiqSimMatches.createdAt, new Date(sinceMs)),
        )).orderBy(desc(hiqSimMatches.createdAt)).limit(limit);
        return rows.map((r) => ({ ...r.m, hostName: r.hostName, guestName: r.guestName ?? null, hostCountry: r.hostCountry ?? null, guestCountry: r.guestCountry ?? null }));
    }

    /**
     * 온라인 다마용 최근 기록(2026-09-12). 끝난 대전에서 **내 몫의 점수·이닝**만 모은다.
     * 방장은 players[0], 게스트는 players[1] 이다(세션을 만들 때 그 순서로 넣는다 — joinAndStart).
     * 기권·무응답으로 끝난 판도 친 만큼은 기록이라 그대로 센다.
     */
    /**
     * 여러 사람의 최근 기록을 **한 번에**. 초대 목록이 사람마다 recentMatchRecord 를 부르면 50번 질의가 된다.
     * 사람당 limit 판까지만 세는 건 같다 — 끝난 순서로 받아 JS 에서 사람별로 끊는다.
     */
    async recentMatchRecords(memberIds: readonly string[], gameType: "3c" | "4c", perMember: number): Promise<Map<string, { score: number; innings: number; matches: number }>> {
        const out = new Map<string, { score: number; innings: number; matches: number }>();
        if (memberIds.length === 0) return out;
        const ids = [...new Set(memberIds)];
        for (const id of ids) out.set(id, { score: 0, innings: 0, matches: 0 });
        const rows = await db.select({ hostId: hiqSimMatches.hostId, guestId: hiqSimMatches.guestId, state: hiqSimMatches.state })
            .from(hiqSimMatches)
            .where(and(
                eq(hiqSimMatches.status, "finished"),
                eq(hiqSimMatches.gameType, gameType),
                or(inArray(hiqSimMatches.hostId, ids as string[]), inArray(hiqSimMatches.guestId, ids as string[])),
                sql`${hiqSimMatches.state} is not null`,
            ))
            .orderBy(desc(hiqSimMatches.finishedAt))
            .limit(Math.max(1, Math.min(ids.length * perMember, 2000)));
        for (const r of rows) {
            const players = (r.state as { players?: { score?: number; innings?: number }[] } | null)?.players;
            if (!players) continue;
            for (const [idx, id] of [[0, r.hostId], [1, r.guestId]] as const) {
                if (!id || !out.has(id)) continue;
                const acc = out.get(id)!;
                if (acc.matches >= perMember) continue;   // 사람당 최근 perMember 판까지만
                const p = players[idx];
                if (!p) continue;
                acc.score += p.score ?? 0;
                acc.innings += p.innings ?? 0;
                acc.matches += 1;
            }
        }
        return out;
    }

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
        return rows.map((r) => ({ ...r.m, hostName: r.hostName, guestName: r.guestName ?? null, hostCountry: r.hostCountry ?? null, guestCountry: r.guestCountry ?? null }));
    }

    /**
     * 조준 방향 기록(2026-09-16). **version 을 올리지 않는다** — 올리면 상대 화면이 매번 "다시 맞췄다"로 스냅한다.
     * 지금 차례인 사람의 것만 받는다(WHERE turn). 낡음 판정은 읽는 쪽에서 aim_at 으로 한다.
     */
    async setAim(id: string, playerIndex: number, phi: number): Promise<void> {
        await db.update(hiqSimMatches).set({ aimPhi: phi, aimAt: new Date() })
            .where(and(eq(hiqSimMatches.id, id), eq(hiqSimMatches.status, "playing"), eq(hiqSimMatches.turn, playerIndex)));
    }

    /* ────────── "한 판 더"(2026-09-15 오너: 라포) ────────── */

    /**
     * 재경기 의사 표시. 끝난 대전에서만, 참가자만. 이미 새 대전이 만들어졌으면 그 id 를 그대로 돌려준다(멱등).
     * 행을 잠그고 읽어-고쳐-쓰기 때문에 둘이 동시에 눌러도 한쪽 표시가 지워지지 않는다.
     */
    async requestRematch(id: string, memberId: string): Promise<{ by: Record<string, string>; rematchId: string | null } | null> {
        return db.transaction(async (tx) => {
            const [m] = await tx.select().from(hiqSimMatches).where(eq(hiqSimMatches.id, id)).for("update");
            if (!m || m.status !== "finished") return null;
            if (m.hostId !== memberId && m.guestId !== memberId) return null;
            if (m.rematchId) return { by: (m.rematchBy as Record<string, string>) ?? {}, rematchId: m.rematchId };
            const by = { ...((m.rematchBy as Record<string, string>) ?? {}), [memberId]: new Date().toISOString() };
            await tx.update(hiqSimMatches).set({ rematchBy: by }).where(eq(hiqSimMatches.id, id));
            return { by, rematchId: null };
        });
    }

    /**
     * 새 대전을 만들고 옛 대전에 이어 붙인다. rematchId 는 한 번만 정해진다 —
     * 둘이 거의 동시에 눌러 양쪽에서 이 함수가 불려도, 조건부 UPDATE 에서 진 쪽은 만든 행을 버리고 이긴 id 를 쓴다.
     */
    async linkRematch(oldId: string, newId: string): Promise<string> {
        const [row] = await db.update(hiqSimMatches).set({ rematchId: newId })
            .where(and(eq(hiqSimMatches.id, oldId), isNull(hiqSimMatches.rematchId)))
            .returning({ rematchId: hiqSimMatches.rematchId });
        if (row?.rematchId) return row.rematchId;
        const [cur] = await db.select({ rematchId: hiqSimMatches.rematchId }).from(hiqSimMatches).where(eq(hiqSimMatches.id, oldId));
        return cur?.rematchId ?? newId;
    }

    /** 만들어 놓고 못 쓰게 된 재경기 방을 지운다(위 경쟁에서 진 쪽). 한 샷도 안 친 방만. */
    async discardMatch(id: string): Promise<void> {
        await db.delete(hiqSimMatches).where(and(eq(hiqSimMatches.id, id), eq(hiqSimMatches.shots, 0)));
    }

    /**
     * 내 온라인 전적 — 종목·테이블별로 **끝난 대전 전부**를 센다(2026-09-16 테스터 제보).
     *
     * 왜 따로 만드나: 대시보드는 `/sim/matches`(listMine, 최근 20개)로 승패를 세고 있었다. 새 대전이 생길 때마다
     * 옛 대전이 창 밖으로 밀려나 **승수가 왔다갔다** 했다("17승 2패 → 18승 2패 → 17승 1패").
     * 레이팅 행(hiq_sim_match_ratings)도 못 쓴다 — 테이블을 합쳐 놓아서 조합별로 못 나누고,
     * 2026-09-12 합치기 때 값이 실제와 어긋나 있다(실측: rankue 4구 rated 22 / 실제 25).
     *
     * 무승부(winner_id is null)는 따로 돌려준다. 화면에서 승으로 합치는 것은 오너 결정(둘 다 승)이라
     * 데이터는 정직하게 두고 표시에서 더한다.
     */
    async myRecords(memberId: string): Promise<Array<{ gameType: string; tableId: string; wins: number; losses: number; draws: number; total: number }>> {
        const rows = await db.select({
            gameType: hiqSimMatches.gameType,
            tableId: hiqSimMatches.tableId,
            wins: sql<number>`count(*) filter (where ${hiqSimMatches.winnerId} = ${memberId})::int`,
            draws: sql<number>`count(*) filter (where ${hiqSimMatches.winnerId} is null)::int`,
            total: sql<number>`count(*)::int`,
        }).from(hiqSimMatches)
            .where(and(
                eq(hiqSimMatches.status, "finished"),
                sql`${hiqSimMatches.guestId} is not null`,
                or(eq(hiqSimMatches.hostId, memberId), eq(hiqSimMatches.guestId, memberId)),
            ))
            .groupBy(hiqSimMatches.gameType, hiqSimMatches.tableId);
        return rows.map((r) => ({
            gameType: r.gameType, tableId: r.tableId,
            wins: r.wins, draws: r.draws, total: r.total,
            losses: Math.max(0, r.total - r.wins - r.draws),
        }));
    }

    /**
     * 두 사람의 온라인 대전 상대전적(끝난 대전만). "오늘까지 3승 2패" 한 줄을 위한 것.
     * 기권·무응답 승리도 결과는 결과라 그대로 센다. 승자가 없는 행(중단)은 total 에서 빠진다.
     */
    async headToHead(meId: string, otherId: string): Promise<{ wins: number; losses: number; total: number }> {
        const pair = or(
            and(eq(hiqSimMatches.hostId, meId), eq(hiqSimMatches.guestId, otherId)),
            and(eq(hiqSimMatches.hostId, otherId), eq(hiqSimMatches.guestId, meId)),
        );
        const [row] = await db.select({
            wins: sql<number>`count(*) filter (where ${hiqSimMatches.winnerId} = ${meId})::int`,
            losses: sql<number>`count(*) filter (where ${hiqSimMatches.winnerId} = ${otherId})::int`,
            total: sql<number>`count(*) filter (where ${hiqSimMatches.winnerId} is not null)::int`,
        }).from(hiqSimMatches).where(and(eq(hiqSimMatches.status, "finished"), pair));
        return { wins: row?.wins ?? 0, losses: row?.losses ?? 0, total: row?.total ?? 0 };
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
                // 첫 샷(방장) 시계: 방장이 대기 화면을 보고 있으면(PRESENCE_MS 안) 돌아볼 시간만큼 봐주고 바로 건다.
                // 자리에 없으면 **걸지 않는다** — 2026-09-15 부터 늘 걸었더니, 방을 열고 앱을 닫은 방장이(화면이 "닫아도 괜찮다"고
                // 안내했다) 몇 시간 뒤 누가 들어오자 40초 × 3번으로 몰수패를 당했다(2026-09-26 검토). 방장이 푸시를 보고 들어와
                // 조준 화면을 열면(ack) 시작하고, 끝내 안 오면 게스트가 NO_SHOW_CLAIM_MS 뒤 승리를 주장한다(레이팅 미반영).
                turnSeenAt: m.hostSeenAt && Date.now() - m.hostSeenAt.getTime() <= PRESENCE_MS ? new Date(Date.now() + ABSENT_GRACE_MS) : null,
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

    /**
     * 이 방장이 minutes 분 안에 연 다른 공개 방 수(지금 방은 뺀다). 방 열림 알림 도배 방지에 쓴다.
     * 알림 행으로는 셀 수 없다 — 알림은 **받는 사람** 기준이라 누가 열었는지가 안 남는다.
     */
    async recentPublicRoomsByHost(hostId: string, minutes: number, excludeId: string): Promise<number> {
        const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(hiqSimMatches)
            .where(and(
                eq(hiqSimMatches.hostId, hostId), eq(hiqSimMatches.isPublic, true),
                sql`${hiqSimMatches.id} <> ${excludeId}`,
                sql`${hiqSimMatches.createdAt} > now() - make_interval(mins => ${minutes})`,
            ));
        return row?.n ?? 0;
    }

    /** 상대가 hours 시간 넘게 안 들어온 waiting 대전을 canceled 로. */
    /**
     * 둘 다 떠난 대전 정리(2026-09-26 검토): 7일 넘게 샷·승리 주장이 없는 playing 대전은 무효(canceled, endReason 'stale')로
     * 닫는다. 레이팅은 건드리지 않는다. 예전엔 영원히 '진행 중'으로 남아 대시보드 배너·대전 목록 폴링을 붙잡았다.
     */
    async cleanupStalePlaying(days = 7): Promise<number> {
        const rows = await db.update(hiqSimMatches)
            .set({ status: "canceled", endReason: "stale", finishedAt: new Date(), turnSeenAt: null })
            .where(and(eq(hiqSimMatches.status, "playing"),
                sql`coalesce(${hiqSimMatches.lastShotAt}, ${hiqSimMatches.startedAt}, ${hiqSimMatches.createdAt}) < now() - make_interval(days => ${days})`))
            .returning({ id: hiqSimMatches.id });
        return rows.length;
    }

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

    /** 채팅 따라잡기 — 샷과 같은 커서 규약(seq >= from). unique(match_id, seq) 의 btree 를 그대로 쓴다. */
    async getChats(matchId: string, fromSeq = 0, limit = CHAT_PAGE_MAX): Promise<HiqSimMatchChat[]> {
        return db.select().from(hiqSimMatchChats)
            .where(and(eq(hiqSimMatchChats.matchId, matchId), gte(hiqSimMatchChats.seq, fromSeq)))
            .orderBy(hiqSimMatchChats.seq)
            .limit(limit);
    }

    /**
     * 채팅 한 줄 보내기(원자적). 대전 행을 잠그고 seq 를 채번한 뒤 자식 행을 넣는다 —
     * 두 사람이 같은 순간에 보내도 seq 가 겹치지 않고, 한 줄도 덮이지 않는다(이모지 단일 슬롯과 다른 점).
     *
     * 판단은 전부 shared/sim/chat.ts 의 chatReject 가 한다(DB 없이 테스트하려고 뺐다).
     * 쿨다운 집계에서 **sender_index 를 빼먹지 마라** — 그게 이모지 쿨다운이 상대 전송에 풀리던 버그의 정체다.
     *
     * 이 함수는 version·lastShotAt·turnSeenAt·emoji_* 를 건드리지 않는다. 말을 걸었다고 40초 시계가
     * 다시 시작되거나 상대 화면이 스냅되면 안 된다.
     */
    async sendChat(a: {
        matchId: string;
        /** 0·1 선수, 2 관전자(shared/sim/chat CHAT_FROM_WATCHER) */
        from: number;
        senderId: string;
        kind: "text" | "code";
        text: string;
        clientKey: string | null;
        cooldownMs: number;
        maxPerMatch: number;
    }): Promise<{ ok: true; row: HiqSimMatchChat; chatSeq: number } | { ok: false; reason: NonNullable<ChatReject> }> {
        return db.transaction(async (tx) => {
            const [m] = await tx.select().from(hiqSimMatches).where(eq(hiqSimMatches.id, a.matchId)).for("update");
            if (!m) return { ok: false as const, reason: "gone" as const };

            // 같은 전송의 재시도면 새 줄을 만들지 않고 그때 넣은 줄을 그대로 돌려준다(응답만 유실된 경우).
            if (a.clientKey) {
                const [dup] = await tx.select().from(hiqSimMatchChats).where(and(
                    eq(hiqSimMatchChats.matchId, a.matchId),
                    eq(hiqSimMatchChats.senderIndex, a.from),
                    eq(hiqSimMatchChats.clientKey, a.clientKey),
                )).limit(1);
                if (dup) return { ok: true as const, row: dup, chatSeq: m.chatSeq };
            }

            // 보낸 **사람** 기준으로 센다 — 관전자는 자리 번호(2)를 함께 쓰므로 자리로 세면 한 사람의 쿨다운이
            // 다른 관전자에게 걸린다(2026-09-21 관전 응원). 선수는 자리 = 사람이라 값이 같다.
            const [agg] = await tx.select({
                count: sql<number>`count(*) filter (where ${hiqSimMatchChats.senderId} = ${a.senderId})::int`,
                lastMineAt: sql<Date | null>`max(${hiqSimMatchChats.createdAt}) filter (where ${hiqSimMatchChats.senderId} = ${a.senderId})`,
                lastAnyAt: sql<Date | null>`max(${hiqSimMatchChats.createdAt})`,
            }).from(hiqSimMatchChats).where(eq(hiqSimMatchChats.matchId, a.matchId));

            const reject = chatReject({
                status: m.status, turn: m.turn, from: a.from, kind: a.kind,
                count: agg?.count ?? 0,
                lastMineAt: agg?.lastMineAt ? new Date(agg.lastMineAt).getTime() : null,
                lastAnyAt: agg?.lastAnyAt ? new Date(agg.lastAnyAt).getTime() : null,
                now: Date.now(),
                finishedAt: m.finishedAt ? m.finishedAt.getTime() : null,
                cooldownMs: a.cooldownMs, maxPerMatch: a.maxPerMatch,
            });
            if (reject) return { ok: false as const, reason: reject };

            const seq = m.chatSeq + 1;
            const [row] = await tx.insert(hiqSimMatchChats).values({
                matchId: a.matchId, seq, senderIndex: a.from, senderId: a.senderId,
                kind: a.kind, text: a.text, clientKey: a.clientKey,
            }).returning();
            await tx.update(hiqSimMatches).set({ chatSeq: seq }).where(eq(hiqSimMatches.id, a.matchId));
            return { ok: true as const, row, chatSeq: seq };
        });
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
                inning: a.inning,
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
                aimPhi: null, aimAt: null,
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
            .where(and(eq(hiqSimMatches.id, id), inArray(hiqSimMatches.status, ["playing", "waiting"]),
                or(isNull(col), sql`${col} < now() - make_interval(secs => ${SEEN_THROTTLE_MS / 1000})`)));
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
                // 차례가 바뀌면 옛 조준은 남의 것이다 — 지운다(2026-09-16)
                aimPhi: null, aimAt: null,
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
     * 시뮬 대전 레이팅. 실전 RP 와 완전히 별개다. 규칙은 shared/sim/rating.ts(핸디전만 · 기대 승률 50:50 ·
     * 두 사람 다 MIN_SHOTS_EACH 번 이상 · 같은 두 사람 24시간 안 연속은 줄여서).
     * 2026-09-12 부터 **테이블(대대·중대)을 합쳐** hiq_sim_match_ratings 에 (회원, 종목) 한 줄로 쌓는다 — 오너 지시.
     * 반영하지 않는 판은 판 수·승수도 세지 않는다(랭킹 배치 3판에 안 들어간다).
     */
    private async applyElo(tx: any, m: HiqSimMatch, winnerId: string | null) {
        if (!m.guestId) return;
        const shots = await this.shotCounts(tx, m.id);
        const ok = ratingEligibility({ handicap: m.handicap, hasGuest: true, shots });
        if (!ok.rated) return;
        const prior = await this.samePairPrior(tx, m);
        const winner = winnerId === null ? null : winnerId === m.hostId ? 0 : 1;
        const da = ratingDelta(winner, prior);
        const ids = [m.hostId, m.guestId];
        for (const [i, id] of ids.entries()) {
            const delta = i === 0 ? da : -da;
            // 무승부는 **양쪽 다 승**으로 센다(2026-09-16 오너: "어차피 둘이 모두 같은 거라면 둘 다 승이 보기 좋다").
            // 랭킹 화면이 패를 `matches - wins` 로 뽑으므로, 여기서 세지 않으면 무승부가 패로 보인다.
            const won = winnerId === null || winnerId === id ? 1 : 0;
            await tx.insert(hiqSimMatchRatings).values({
                memberId: id, gameType: m.gameType,
                rating: START_RATING + delta, matches: 1, wins: won, updatedAt: new Date(),
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

    /** [방장 샷 수, 게스트 샷 수] */
    private async shotCounts(tx: any, matchId: string): Promise<[number, number]> {
        const rows = (await tx.execute(sql`
            select player_index, count(*)::int as n from hiq_sim_match_shots where match_id = ${matchId} group by player_index`)).rows as { player_index: number; n: number }[];
        const get = (i: number) => Number(rows.find((r) => Number(r.player_index) === i)?.n ?? 0);
        return [get(0), get(1)];
    }

    /**
     * 같은 두 사람이 이 판 전 24시간 안에 **반영된** 판 수. 반영 여부는 규칙(rating.ts)과 같은 조건으로 SQL 에서 다시 본다
     * (핸디전 · 게스트 있음 · 두 사람 다 MIN_SHOTS_EACH 이상 · 끝남).
     */
    private async samePairPrior(tx: any, m: HiqSimMatch): Promise<number> {
        const [row] = (await tx.execute(sql`
            select count(*)::int as n from hiq_sim_matches x
            where x.id <> ${m.id} and x.status = 'finished' and x.handicap and x.game_type = ${m.gameType}
              and ((x.host_id = ${m.hostId} and x.guest_id = ${m.guestId}) or (x.host_id = ${m.guestId} and x.guest_id = ${m.hostId}))
              and x.finished_at >= now() - make_interval(secs => ${SAME_PAIR_WINDOW_MS / 1000})
              and (select count(*) from hiq_sim_match_shots s where s.match_id = x.id and s.player_index = 0) >= ${MIN_SHOTS_EACH}
              and (select count(*) from hiq_sim_match_shots s where s.match_id = x.id and s.player_index = 1) >= ${MIN_SHOTS_EACH}`)).rows as { n: number }[];
        return Number(row?.n ?? 0);
    }

    /**
     * 레이팅 전체 다시 계산(2026-09-26 오너: "핸디전 기록만으로 처음부터 다시"). 끝난 대전을 끝난 순서대로 다시 돌려
     * hiq_sim_match_ratings 를 새로 채운다. dryRun 이면 계산만 하고 쓰지 않는다(어드민이 숫자를 보고 누른다).
     * 규칙은 applyElo 와 같다(rating.ts). 같은 두 사람 24시간 창도 대전의 끝난 시각 기준으로 똑같이 센다.
     */
    async recomputeRatings(dryRun: boolean) {
        const matches = (await db.execute(sql`
            select m.id, m.host_id, m.guest_id, m.game_type, m.handicap, m.winner_id,
                   extract(epoch from coalesce(m.finished_at, m.last_shot_at, m.created_at)) * 1000 as ended_ms,
                   (select count(*)::int from hiq_sim_match_shots s where s.match_id = m.id and s.player_index = 0) as s0,
                   (select count(*)::int from hiq_sim_match_shots s where s.match_id = m.id and s.player_index = 1) as s1
            from hiq_sim_matches m
            where m.status = 'finished' and m.guest_id is not null
            order by coalesce(m.finished_at, m.last_shot_at, m.created_at) asc, m.id asc`)).rows as Record<string, unknown>[];

        type Row = { rating: number; matches: number; wins: number; updatedAt: number };
        const table = new Map<string, Row>();
        const keyOf = (id: string, g: string) => `${id}|${g}`;
        const recentPairs = new Map<string, number[]>(); // pair|game → 반영된 판의 끝난 시각들
        let rated = 0;
        const skipped = { manual: 0, tooShort: 0, noGuest: 0 };
        for (const r of matches) {
            const hostId = String(r.host_id), guestId = String(r.guest_id), game = String(r.game_type);
            const ok = ratingEligibility({ handicap: r.handicap === true, hasGuest: true, shots: [Number(r.s0), Number(r.s1)] });
            if (!ok.rated) { skipped[ok.reason]++; continue; }
            const ended = Number(r.ended_ms);
            const pairKey = `${[hostId, guestId].sort().join("|")}|${game}`;
            const times = (recentPairs.get(pairKey) ?? []).filter((t) => ended - t < SAME_PAIR_WINDOW_MS);
            const winnerId = r.winner_id ? String(r.winner_id) : null;
            const winner = winnerId === null ? null : winnerId === hostId ? 0 : 1;
            const da = ratingDelta(winner, times.length);
            times.push(ended);
            recentPairs.set(pairKey, times);
            for (const [i, id] of [hostId, guestId].entries()) {
                const k = keyOf(id, game);
                const cur = table.get(k) ?? { rating: START_RATING, matches: 0, wins: 0, updatedAt: ended };
                cur.rating += i === 0 ? da : -da;
                cur.matches += 1;
                cur.wins += winnerId === null || winnerId === id ? 1 : 0;
                cur.updatedAt = ended;
                table.set(k, cur);
            }
            rated++;
        }

        const beforeRows = (await db.execute(sql`select count(*)::int as n from hiq_sim_match_ratings`)).rows as { n: number }[];
        const summary = {
            dryRun,
            finishedMatches: matches.length,
            ratedMatches: rated,
            skipped,
            players: table.size,
            rowsBefore: Number(beforeRows[0]?.n ?? 0),
            top: [...table.entries()].sort((a, b) => b[1].rating - a[1].rating).slice(0, 5)
                .map(([k, v]) => ({ memberId: k.split("|")[0], gameType: k.split("|")[1], rating: v.rating, matches: v.matches, wins: v.wins })),
        };
        if (dryRun) return summary;

        await db.transaction(async (tx) => {
            await tx.execute(sql`delete from hiq_sim_match_ratings`);
            const values = [...table.entries()].map(([k, v]) => {
                const [memberId, gameType] = k.split("|");
                return { memberId, gameType: gameType as "3c" | "4c", rating: v.rating, matches: v.matches, wins: v.wins, updatedAt: new Date(v.updatedAt) };
            });
            for (let i = 0; i < values.length; i += 500) {
                await tx.insert(hiqSimMatchRatings).values(values.slice(i, i + 500));
            }
        });
        return summary;
    }
}
