import { db } from "../db.js";
import { and, eq, desc, inArray, isNull, sql } from "drizzle-orm";
import {
    hiqCrewTournaments,
    hiqCrewTournamentParticipants,
    hiqCrewTournamentMatches,
    hiqCrewMembers,
    hiqMembers,
    hiqGames,
    hiqGameHistory,
} from "../../shared/schema.js";
import { badRequest, conflict, notFound } from "../utils/errors.js";
import { planKnockout, planLeague, advanceTarget, bracketSize, totalRounds, shouldUseLeague } from "../../shared/tournamentBracket.js";

// 크루 토너먼트 저장소.
//
// 대진 좌표 규칙은 shared/tournamentBracket.ts 가 정본이다 — round 1 이 가장 아래(첫 경기),
// 위로 갈수록 커지고 결승이 제일 큰 round. (round, slot) 의 승자는 (round+1, slot>>1) 로 간다.
//
// 경기 연결에서 hiq_games 스키마는 건드리지 않는다. 대회 경기도 gameMode="match" 그대로
// 만들어야 RP·상대전적·에버리지가 지금과 똑같이 남기 때문이다(game.repo.ts:77,140 이
// "match" 일 때만 처리한다). 대진과 경기는 이 테이블의 gameId 로만 잇고, 경기가 끝나면
// gameId 로 대진을 되찾아 승자를 올린다.

export class TournamentRepository {

    // ---------- 조회 ----------

    /** 크루의 대회 목록 — 진행 중인 것이 위, 끝난 것이 아래. 참가자 수를 함께 센다. */
    async listByCrew(crewId: string) {
        // 끝난 대회는 목록에서도 우승자가 제일 중요한 정보라 이름을 같이 붙인다.
        const raw = await db
            .select({ t: hiqCrewTournaments, championName: hiqMembers.name })
            .from(hiqCrewTournaments)
            .leftJoin(hiqMembers, eq(hiqMembers.id, hiqCrewTournaments.championId))
            .where(eq(hiqCrewTournaments.crewId, crewId))
            .orderBy(desc(hiqCrewTournaments.createdAt));
        const rows = raw.map((r) => ({ ...r.t, championName: r.championName }));
        if (rows.length === 0) return [];

        // N+1 회피 — 참가자 수를 한 방에 집계한다(getUpcomingCrewActivities 패턴).
        const ids = rows.map((r) => r.id);
        const counts = await db
            .select({
                tournamentId: hiqCrewTournamentParticipants.tournamentId,
                n: sql<number>`count(*)::int`,
            })
            .from(hiqCrewTournamentParticipants)
            .where(inArray(hiqCrewTournamentParticipants.tournamentId, ids))
            .groupBy(hiqCrewTournamentParticipants.tournamentId);
        const byId = new Map(counts.map((c) => [c.tournamentId, Number(c.n)]));

        const rank = (s: string) => (s === "ongoing" ? 0 : s === "drawn" ? 1 : s === "recruiting" ? 2 : 3);
        return rows
            .map((r) => ({ ...r, participantCount: byId.get(r.id) ?? 0 }))
            .sort((a, b) => rank(a.status) - rank(b.status));
    }

    /** 대회 하나 + 참가자 + 대진 전부. 화면이 이 한 번의 응답으로 다 그려진다. */
    async getDetail(tournamentId: string) {
        const [tournament] = await db.select().from(hiqCrewTournaments).where(eq(hiqCrewTournaments.id, tournamentId));
        if (!tournament) return null;

        const participants = await db
            .select({
                id: hiqCrewTournamentParticipants.id,
                memberId: hiqCrewTournamentParticipants.memberId,
                seed: hiqCrewTournamentParticipants.seed,
                status: hiqCrewTournamentParticipants.status,
                finalRank: hiqCrewTournamentParticipants.finalRank,
                wins: hiqCrewTournamentParticipants.wins,
                losses: hiqCrewTournamentParticipants.losses,
                registeredAt: hiqCrewTournamentParticipants.registeredAt,
                nickname: hiqMembers.name,
                rating3c: hiqMembers.rating3c,
                rating4c: hiqMembers.rating4c,
                // 대진에서 경기를 시작할 때 상대의 목표 점수(다마수)를 뽑는 데 쓴다.
                // 없으면 매칭 화면이 상대를 기본값 15점으로 앉힌다.
                avg3c: hiqMembers.avg3c,
                avg4c: hiqMembers.avg4c,
            })
            .from(hiqCrewTournamentParticipants)
            .innerJoin(hiqMembers, eq(hiqMembers.id, hiqCrewTournamentParticipants.memberId))
            .where(eq(hiqCrewTournamentParticipants.tournamentId, tournamentId))
            // 대진이 나온 뒤에는 시드 순이 읽기 쉽다(1번부터). 아직 접수중이면 시드가 없으니
            // 신청한 순서 그대로 — 먼저 신청한 사람이 위에 있어야 자기 자리를 찾는다.
            .orderBy(hiqCrewTournamentParticipants.seed, hiqCrewTournamentParticipants.registeredAt);

        const matches = await db
            .select()
            .from(hiqCrewTournamentMatches)
            .where(eq(hiqCrewTournamentMatches.tournamentId, tournamentId))
            .orderBy(hiqCrewTournamentMatches.round, hiqCrewTournamentMatches.slot);

        return { tournament, participants, matches };
    }

    /**
     * 명예의 전당 — 끝난 대회만 모아 보여준다.
     * 새로 저장하는 건 없다. 대회의 championId 와 참가자의 finalRank 가 이미 쌓이고 있어서
     * 집계만 하면 된다.
     *
     * 종목을 나누는 이유: 3쿠션과 4구는 실력 스케일이 완전히 달라서 한 줄로 세우면
     * 한 사람이 모든 왕관을 쓴다. 종목별로 왕을 따로 두면 크루 안에서 자랑거리가 늘어난다.
     */
    async getHallOfFame(crewId: string) {
        const ended = await db
            .select({
                id: hiqCrewTournaments.id,
                title: hiqCrewTournaments.title,
                gameType: hiqCrewTournaments.gameType,
                format: hiqCrewTournaments.format,
                championId: hiqCrewTournaments.championId,
                endedAt: hiqCrewTournaments.updatedAt,
                championName: hiqMembers.name,
            })
            .from(hiqCrewTournaments)
            .leftJoin(hiqMembers, eq(hiqMembers.id, hiqCrewTournaments.championId))
            .where(and(eq(hiqCrewTournaments.crewId, crewId), eq(hiqCrewTournaments.status, "ended")))
            .orderBy(desc(hiqCrewTournaments.updatedAt));

        if (ended.length === 0) return { current: null, honors: [], history: [] };

        // 참가자별 성적 — 끝난 대회 것만. N+1 없이 한 방에.
        const ids = ended.map((t) => t.id);
        const rows = await db
            .select({
                memberId: hiqCrewTournamentParticipants.memberId,
                nickname: hiqMembers.name,
                finalRank: hiqCrewTournamentParticipants.finalRank,
                gameType: hiqCrewTournaments.gameType,
            })
            .from(hiqCrewTournamentParticipants)
            .innerJoin(hiqCrewTournaments, eq(hiqCrewTournaments.id, hiqCrewTournamentParticipants.tournamentId))
            .innerJoin(hiqMembers, eq(hiqMembers.id, hiqCrewTournamentParticipants.memberId))
            .where(inArray(hiqCrewTournamentParticipants.tournamentId, ids));

        // (회원 × 종목) 별로 우승·준우승·4강 횟수를 센다.
        const byKey = new Map<string, {
            memberId: string; nickname: string; gameType: "3c" | "4c";
            wins: number; runnerUp: number; semi: number; played: number;
        }>();
        for (const r of rows) {
            const key = `${r.memberId}:${r.gameType}`;
            const cur = byKey.get(key) ?? {
                memberId: r.memberId, nickname: r.nickname, gameType: r.gameType as "3c" | "4c",
                wins: 0, runnerUp: 0, semi: 0, played: 0,
            };
            cur.played += 1;
            if (r.finalRank === 1) cur.wins += 1;
            else if (r.finalRank === 2) cur.runnerUp += 1;
            else if (r.finalRank === 3) cur.semi += 1;
            byKey.set(key, cur);
        }

        const honors = [...byKey.values()]
            .filter((h) => h.wins > 0 || h.runnerUp > 0 || h.semi > 0)
            .sort((a, b) => b.wins - a.wins || b.runnerUp - a.runnerUp || b.semi - a.semi);

        return {
            // 현 챔피언 = 가장 최근에 끝난 대회의 우승자
            current: ended.find((t) => t.championId) ?? null,
            honors,
            history: ended,
        };
    }

    /** 크루 멤버 목록에 붙일 우승 횟수 — 회원 id → 우승 수. */
    async getWinCounts(crewId: string): Promise<Record<string, number>> {
        const rows = await db
            .select({
                memberId: hiqCrewTournamentParticipants.memberId,
                n: sql<number>`count(*)::int`,
            })
            .from(hiqCrewTournamentParticipants)
            .innerJoin(hiqCrewTournaments, eq(hiqCrewTournaments.id, hiqCrewTournamentParticipants.tournamentId))
            .where(and(
                eq(hiqCrewTournaments.crewId, crewId),
                eq(hiqCrewTournaments.status, "ended"),
                eq(hiqCrewTournamentParticipants.finalRank, 1),
            ))
            .groupBy(hiqCrewTournamentParticipants.memberId);
        return Object.fromEntries(rows.map((r) => [r.memberId, Number(r.n)]));
    }

    // ---------- 개설 · 참가 ----------

    async create(data: any) {
        const [row] = await db.insert(hiqCrewTournaments).values(data).returning();
        return row;
    }

    /**
     * 참가 신청 — 오너 결정(2026-08-30): 승인 절차 없이 즉시 확정.
     * 정원 경합은 joinCrewActivity 와 같은 방식으로 막는다: 대회 행을 FOR UPDATE 로 잠그고
     * 그 안에서 인원을 센다. 잠그지 않으면 마지막 한 자리에 두 명이 동시에 들어간다.
     */
    async join(tournamentId: string, memberId: string) {
        return await db.transaction(async (tx) => {
            const [t] = await tx.select().from(hiqCrewTournaments)
                .where(eq(hiqCrewTournaments.id, tournamentId)).for("update");
            if (!t) throw notFound("대회를 찾을 수 없습니다");
            if (t.status !== "recruiting") throw conflict("접수가 마감된 대회입니다");
            if (t.recruitEnd && new Date(t.recruitEnd).getTime() < Date.now()) {
                throw conflict("접수 기간이 끝났습니다");
            }

            const existing = await tx.select().from(hiqCrewTournamentParticipants)
                .where(eq(hiqCrewTournamentParticipants.tournamentId, tournamentId));
            if (existing.some((p) => p.memberId === memberId)) throw conflict("이미 신청했습니다");
            if (existing.length >= t.maxPlayers) throw conflict("정원이 찼습니다");

            const [row] = await tx.insert(hiqCrewTournamentParticipants)
                .values({ tournamentId, memberId }).returning();
            return row;
        });
    }

    /** 참가 취소 — 대진이 나오기 전까지만. 대진이 이미 짜였으면 자리에 구멍이 난다. */
    async leave(tournamentId: string, memberId: string) {
        const [t] = await db.select().from(hiqCrewTournaments).where(eq(hiqCrewTournaments.id, tournamentId));
        if (!t) throw notFound("대회를 찾을 수 없습니다");
        if (t.status !== "recruiting") throw conflict("대진이 이미 짜여서 취소할 수 없습니다");
        await db.delete(hiqCrewTournamentParticipants).where(and(
            eq(hiqCrewTournamentParticipants.tournamentId, tournamentId),
            eq(hiqCrewTournamentParticipants.memberId, memberId),
        ));
    }

    // ---------- 대진 생성 ----------

    /**
     * 대진표를 만든다. 시드는 종목에 맞는 RP 내림차순(3쿠션 대회면 rating3c).
     * 인원이 4명 미만이면 토너먼트 대신 풀리그로 돌린다 — 3명 토너먼트는 1번 시드가
     * 한 경기만 치고 결승에 올라가서 나머지보다 덜 친다.
     * 이미 대진이 있으면 전부 지우고 다시 만든다(재추첨). 단 시작된 경기가 하나라도 있으면 거절.
     */
    async draw(tournamentId: string, opts: { shuffle?: boolean } = {}) {
        return await db.transaction(async (tx) => {
            const [t] = await tx.select().from(hiqCrewTournaments)
                .where(eq(hiqCrewTournaments.id, tournamentId)).for("update");
            if (!t) throw notFound("대회를 찾을 수 없습니다");
            if (t.status === "ended" || t.status === "canceled") throw conflict("이미 끝난 대회입니다");

            const started = await tx.select({ id: hiqCrewTournamentMatches.id })
                .from(hiqCrewTournamentMatches)
                .where(and(
                    eq(hiqCrewTournamentMatches.tournamentId, tournamentId),
                    inArray(hiqCrewTournamentMatches.status, ["playing", "done"]),
                ));
            if (started.length > 0) throw conflict("이미 시작된 경기가 있어 다시 뽑을 수 없습니다");

            const parts = await tx
                .select({
                    memberId: hiqCrewTournamentParticipants.memberId,
                    rating3c: hiqMembers.rating3c,
                    rating4c: hiqMembers.rating4c,
                })
                .from(hiqCrewTournamentParticipants)
                .innerJoin(hiqMembers, eq(hiqMembers.id, hiqCrewTournamentParticipants.memberId))
                .where(eq(hiqCrewTournamentParticipants.tournamentId, tournamentId));
            if (parts.length < 2) throw badRequest("참가자가 2명 이상이어야 대진을 짤 수 있습니다");

            const ratingOf = (p: typeof parts[number]) => (t.gameType === "3c" ? p.rating3c : p.rating4c) ?? 0;
            const ordered = [...parts].sort((a, b) => ratingOf(b) - ratingOf(a));
            if (opts.shuffle) {
                // 재추첨 — RP 순서를 버리고 섞는다. 크루장이 "실력순 말고 랜덤" 을 고를 때.
                for (let i = ordered.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
                }
            }
            const ids = ordered.map((p) => p.memberId);

            const league = shouldUseLeague(ids.length);
            const planned = league ? planLeague(ids) : planKnockout(ids);

            await tx.delete(hiqCrewTournamentMatches).where(eq(hiqCrewTournamentMatches.tournamentId, tournamentId));
            await tx.insert(hiqCrewTournamentMatches).values(planned.map((m) => ({
                tournamentId,
                round: m.round,
                slot: m.slot,
                p1Id: m.p1Id,
                p2Id: m.p2Id,
                // 부전승은 그 자리에서 승자가 정해진다. 아래에서 윗칸으로 밀어 올린다.
                status: m.isBye ? ("bye" as const)
                    : m.p1Id && m.p2Id ? ("ready" as const)
                        : ("pending" as const),
                winnerId: m.isBye ? m.p1Id : null,
                endedAt: m.isBye ? new Date() : null,
            })));

            // 시드 번호를 참가자 행에 기록해 화면에서 순번을 보여준다.
            for (let i = 0; i < ids.length; i++) {
                await tx.update(hiqCrewTournamentParticipants)
                    .set({ seed: i + 1, status: "active", wins: 0, losses: 0, finalRank: null })
                    .where(and(
                        eq(hiqCrewTournamentParticipants.tournamentId, tournamentId),
                        eq(hiqCrewTournamentParticipants.memberId, ids[i]),
                    ));
            }

            await tx.update(hiqCrewTournaments)
                .set({ status: "drawn", format: league ? "league" : "knockout", championId: null, updatedAt: new Date() })
                .where(eq(hiqCrewTournaments.id, tournamentId));

            // 부전승자를 윗칸으로 올린다(토너먼트만).
            if (!league) {
                const rounds = totalRounds(bracketSize(ids.length));
                for (const m of planned.filter((p) => p.isBye && p.p1Id)) {
                    await this.pushWinnerUp(tx, tournamentId, m.round, m.slot, m.p1Id!, rounds);
                }
            }
            return { league, matchCount: planned.length };
        });
    }

    /**
     * 첫 라운드 두 자리를 맞바꾼다 — 오너 요구(2026-08-30): "참가는 자유롭게 하되
     * 대진 설정은 조정이 되어야 함". 아직 시작 안 한 경기끼리만, 첫 라운드에서만 허용한다.
     * 윗 라운드는 승자가 자동으로 올라오는 자리라 손으로 바꾸면 기록과 어긋난다.
     */
    async swapSlots(
        tournamentId: string,
        a: { matchId: string; side: "p1" | "p2" },
        b: { matchId: string; side: "p1" | "p2" },
    ) {
        return await db.transaction(async (tx) => {
            const rows = await tx.select().from(hiqCrewTournamentMatches)
                .where(and(
                    eq(hiqCrewTournamentMatches.tournamentId, tournamentId),
                    inArray(hiqCrewTournamentMatches.id, [a.matchId, b.matchId]),
                ))
                .for("update");
            const ma = rows.find((r) => r.id === a.matchId);
            const mb = rows.find((r) => r.id === b.matchId);
            if (!ma || !mb) throw notFound("대진을 찾을 수 없습니다");
            if (ma.round !== 1 || mb.round !== 1) throw badRequest("첫 라운드 자리만 바꿀 수 있습니다");
            for (const m of [ma, mb]) {
                if (m.status === "playing" || m.status === "done") {
                    throw conflict("이미 시작된 경기의 자리는 바꿀 수 없습니다");
                }
            }
            if (a.matchId === b.matchId && a.side === b.side) throw badRequest("같은 자리입니다");

            const val = (m: typeof ma, side: "p1" | "p2") => (side === "p1" ? m.p1Id : m.p2Id);
            const av = val(ma, a.side);
            const bv = val(mb, b.side);

            // 같은 경기 안에서의 교환이면 한 번에 업데이트한다(두 번 쓰면 서로 덮어쓴다).
            if (a.matchId === b.matchId) {
                await tx.update(hiqCrewTournamentMatches)
                    .set({ p1Id: a.side === "p1" ? bv : av, p2Id: a.side === "p1" ? av : bv })
                    .where(eq(hiqCrewTournamentMatches.id, a.matchId));
            } else {
                await tx.update(hiqCrewTournamentMatches)
                    .set(a.side === "p1" ? { p1Id: bv } : { p2Id: bv })
                    .where(eq(hiqCrewTournamentMatches.id, a.matchId));
                await tx.update(hiqCrewTournamentMatches)
                    .set(b.side === "p1" ? { p1Id: av } : { p2Id: av })
                    .where(eq(hiqCrewTournamentMatches.id, b.matchId));
            }

            // 자리가 비거나 차면서 부전승 여부가 달라질 수 있다 — 두 경기의 상태를 다시 계산한다.
            for (const id of [a.matchId, b.matchId]) {
                const [m] = await tx.select().from(hiqCrewTournamentMatches).where(eq(hiqCrewTournamentMatches.id, id));
                if (!m) continue;
                const both = !!m.p1Id && !!m.p2Id;
                const one = !!m.p1Id !== !!m.p2Id;
                await tx.update(hiqCrewTournamentMatches)
                    .set({
                        // 부전승 자리는 항상 p1 에 사람을 둔다.
                        p1Id: one ? (m.p1Id ?? m.p2Id) : m.p1Id,
                        p2Id: one ? null : m.p2Id,
                        status: both ? "ready" : one ? "bye" : "pending",
                        winnerId: one ? (m.p1Id ?? m.p2Id) : null,
                    })
                    .where(eq(hiqCrewTournamentMatches.id, id));
            }
            return { ok: true };
        });
    }

    // ---------- 경기 연결 ----------

    /**
     * 대진에서 경기를 시작할 때, 호출자가 그 자리의 선수가 맞는지 확인하고 상대를 알려준다.
     * PIN 을 건너뛰는 근거가 여기다 — 두 사람 다 이 대회에 스스로 참가 신청했으므로
     * 이미 동의한 상대다.
     *
     * ⚠️ 이 검증이 곧 랭킹 경기 생성 권한이다. PIN 경로에는 "초대 1개 = 랭크 경기 1회"
     * 상한(consumeInvites)이 있는데 대진 경로는 그걸 건너뛰므로, 상한을 여기서 세워야 한다.
     * 예전엔 status "playing" 을 통과시켜서, 경기를 시작해 놓고 끝내지 않은 채 같은 칸으로
     * /game/start 를 무한 반복하면 랭킹 경기를 찍어내 RP 를 올릴 수 있었다.
     * 그래서 **아직 아무 경기도 안 붙은 ready 상태**에서만 자리를 내준다.
     *
     * 상대의 크루 멤버십도 같이 본다 — 대진 확정 뒤 탈퇴·강퇴된 사람은 대회 화면조차 못 보는데
     * 그 사람 이름으로 랭킹 패배가 기록될 수 있었다(본인은 존재도 모르는 경기).
     */
    async resolveSeat(matchId: string, callerId: string) {
        const [row] = await db
            .select({
                match: hiqCrewTournamentMatches,
                tournament: hiqCrewTournaments,
            })
            .from(hiqCrewTournamentMatches)
            .innerJoin(hiqCrewTournaments, eq(hiqCrewTournaments.id, hiqCrewTournamentMatches.tournamentId))
            .where(eq(hiqCrewTournamentMatches.id, matchId));
        if (!row) return null;

        const { match, tournament } = row;
        // ready = 두 자리가 찼고 아직 경기가 안 붙은 상태. playing/done/bye/pending 은 전부 거절.
        if (match.status !== "ready" || match.gameId) return null;
        if (!match.p1Id || !match.p2Id) return null;
        if (match.p1Id !== callerId && match.p2Id !== callerId) return null;
        if (tournament.status === "ended" || tournament.status === "canceled") return null;

        // 두 선수 다 크루 정식 멤버여야 한다 — 호출자만 보면 상대가 탈퇴했어도 통과했다.
        const rows = await db.select().from(hiqCrewMembers).where(and(
            eq(hiqCrewMembers.crewId, tournament.crewId),
            inArray(hiqCrewMembers.memberId, [match.p1Id, match.p2Id]),
        ));
        const active = rows.filter((r) => r.role !== "pending").map((r) => r.memberId);
        if (!active.includes(match.p1Id) || !active.includes(match.p2Id)) return null;

        const opponentId = match.p1Id === callerId ? match.p2Id : match.p1Id;
        return { tournamentId: tournament.id, matchId: match.id, opponentId, crewId: tournament.crewId };
    }

    /**
     * 경기 시작 직후 대진에 경기를 물린다.
     * 0행이 갱신되면 그 사이 다른 사람이 먼저 시작한 것이다 — 조용히 넘기면 두 번째 경기가
     * 대진에서 떨어져 나가 승자가 영영 안 올라가므로, 실패를 알려 호출부가 되돌리게 한다.
     */
    async attachGame(matchId: string, gameId: string) {
        const updated = await db.update(hiqCrewTournamentMatches)
            .set({ gameId, status: "playing", startedAt: new Date() })
            .where(and(
                eq(hiqCrewTournamentMatches.id, matchId),
                eq(hiqCrewTournamentMatches.status, "ready"),
                isNull(hiqCrewTournamentMatches.gameId),
            ))
            .returning({ tournamentId: hiqCrewTournamentMatches.tournamentId });
        if (updated.length === 0) throw conflict("이미 시작된 대진입니다");

        await db.update(hiqCrewTournaments)
            .set({ status: "ongoing", updatedAt: new Date() })
            .where(and(
                eq(hiqCrewTournaments.id, updated[0].tournamentId),
                inArray(hiqCrewTournaments.status, ["recruiting", "drawn"]),
            ));
    }

    /**
     * 시작만 하고 끝내지 않은 대진 자리를 되돌린다(크루장).
     * 당구대가 안 나서 점수판을 그냥 닫는 이탈이 흔한데, 그러면 그 칸이 영구히 "경기중"으로
     * 굳고 재추첨도 막혀(draw 가 409) 대회를 통째로 지우는 것 말고는 복구 수단이 없었다.
     * 이미 끝난(done) 칸은 되돌리지 않는다 — 결과가 RP·전적에 이미 반영됐다.
     */
    async resetMatch(tournamentId: string, matchId: string) {
        const [m] = await db.select().from(hiqCrewTournamentMatches).where(and(
            eq(hiqCrewTournamentMatches.id, matchId),
            eq(hiqCrewTournamentMatches.tournamentId, tournamentId),
        ));
        if (!m) throw notFound("대진을 찾을 수 없습니다");
        if (m.status !== "playing") throw conflict("진행 중인 경기만 되돌릴 수 있습니다");
        await db.update(hiqCrewTournamentMatches)
            .set({ status: "ready", gameId: null, startedAt: null, p1Score: null, p2Score: null })
            .where(eq(hiqCrewTournamentMatches.id, matchId));
        return { ok: true };
    }

    /**
     * 대진에 못 붙은 방금 만든 경기를 되돌린다.
     * 아직 시작 상태(playing_base)이고 전적 행이 하나도 없을 때만 지운다 — 실제로 친 경기를
     * 지우는 일이 절대 없도록 조건을 좁게 둔다.
     */
    async discardOrphanGame(gameId: string) {
        const hist = await db.select({ id: hiqGameHistory.id }).from(hiqGameHistory)
            .where(eq(hiqGameHistory.gameId, gameId));
        if (hist.length > 0) return false;
        const gone = await db.delete(hiqGames).where(and(
            eq(hiqGames.id, gameId),
            eq(hiqGames.status, "playing_base"),
        )).returning({ id: hiqGames.id });
        return gone.length > 0;
    }

    /** 이 경기가 대진 경기인지. 경기 종료 훅에서 한 번만 조회해 쓴다. */
    async findMatchByGameId(gameId: string) {
        const [m] = await db.select().from(hiqCrewTournamentMatches).where(eq(hiqCrewTournamentMatches.gameId, gameId));
        return m ?? null;
    }

    /**
     * 경기 결과를 대진에 반영하고 승자를 윗칸으로 올린다.
     *
     * winnerId 가 null 로 올 수 있다(game.repo.ts 가 슬롯에 없는 id 를 null 로 떨군다).
     * 그러면 대진이 승자 없이 멈추므로 점수로 되짚는 폴백을 둔다 — 두 점수가 다를 때만
     * 높은 쪽을 승자로 본다. 동점이거나 점수가 없으면 손대지 않고 그대로 둔다.
     */
    async reportResult(gameId: string, winnerIdFromGame: string | null) {
        // 전부 한 트랜잭션 안에서 한다. 예전엔 대진 UPDATE 와 승자 진출이 따로 커밋돼서,
        // 중간에 끊기면 그 칸만 done 이 되고 윗칸은 비어 아무도 다음 경기를 못 시작했다.
        return await db.transaction(async (tx) => {
            const [match] = await tx.select().from(hiqCrewTournamentMatches)
                .where(eq(hiqCrewTournamentMatches.gameId, gameId)).for("update");
            if (!match || match.status === "done") return null;

            const [game] = await tx.select().from(hiqGames).where(eq(hiqGames.id, gameId));
            if (!game) return null;

            // 대진의 두 선수가 경기의 어느 슬롯에 앉았는지 찾아 점수를 가져온다.
            const slotOf = (memberId: string | null) => {
                if (!memberId) return null;
                if (game.player1Id === memberId) return { score: game.player1Score };
                if (game.player2Id === memberId) return { score: game.player2Score };
                if (game.player3Id === memberId) return { score: game.player3Score };
                if (game.player4Id === memberId) return { score: game.player4Score };
                return null;
            };
            const s1 = slotOf(match.p1Id)?.score ?? null;
            const s2 = slotOf(match.p2Id)?.score ?? null;

            let winnerId = winnerIdFromGame;
            if (winnerId !== match.p1Id && winnerId !== match.p2Id) winnerId = null;
            if (!winnerId && s1 != null && s2 != null && s1 !== s2) {
                winnerId = s1 > s2 ? match.p1Id : match.p2Id;
            }
            if (!winnerId) {
                // 승자를 못 정했다 — 경기는 끝났지만 대진은 열어둔다. 크루장이 다시 붙이면 된다.
                await tx.update(hiqCrewTournamentMatches)
                    .set({ p1Score: s1, p2Score: s2, status: "ready", gameId: null, endedAt: null, startedAt: null })
                    .where(eq(hiqCrewTournamentMatches.id, match.id));
                return null;
            }
            const loserId = winnerId === match.p1Id ? match.p2Id : match.p1Id;

            const [t] = await tx.select().from(hiqCrewTournaments).where(eq(hiqCrewTournaments.id, match.tournamentId));
            if (!t) return null;

            // status 를 조건에 넣어 승자 처리가 정확히 1회만 돌게 한다. 두 사람이 동시에
            // '경기 종료'를 누르면 둘 다 여기까지 와서 wins/losses 가 2씩 올랐다.
            const claimed = await tx.update(hiqCrewTournamentMatches)
                .set({ p1Score: s1, p2Score: s2, winnerId, loserId, status: "done", endedAt: new Date() })
                .where(and(
                    eq(hiqCrewTournamentMatches.id, match.id),
                    eq(hiqCrewTournamentMatches.status, match.status),
                ))
                .returning({ id: hiqCrewTournamentMatches.id });
            if (claimed.length === 0) return null;

            await tx.update(hiqCrewTournamentParticipants)
                .set({ wins: sql`${hiqCrewTournamentParticipants.wins} + 1` })
                .where(and(eq(hiqCrewTournamentParticipants.tournamentId, t.id), eq(hiqCrewTournamentParticipants.memberId, winnerId)));
            if (loserId) {
                await tx.update(hiqCrewTournamentParticipants)
                    .set({ losses: sql`${hiqCrewTournamentParticipants.losses} + 1` })
                    .where(and(eq(hiqCrewTournamentParticipants.tournamentId, t.id), eq(hiqCrewTournamentParticipants.memberId, loserId)));
            }

            if (t.format === "league") return await this.settleLeagueIfDone(tx, t.id);

            const [cnt] = await tx.select({ n: sql<number>`count(*)::int` })
                .from(hiqCrewTournamentParticipants)
                .where(eq(hiqCrewTournamentParticipants.tournamentId, t.id));
            const rounds = totalRounds(bracketSize(Number(cnt?.n ?? 0)));
            // 진 사람은 여기서 탈락 확정 + 최종 순위 기록.
            // 명예의 전당이 우승자만 남기면 참가자 대부분에게 아무것도 안 남으므로,
            // 탈락한 라운드로 순위를 매긴다(관례): 결승에서 지면 2위, 4강에서 지면 공동 3위,
            // 8강에서 지면 공동 5위 — finalRank = 2^(남은 라운드 수) + 1.
            if (loserId) {
                await tx.update(hiqCrewTournamentParticipants)
                    .set({ status: "eliminated", finalRank: Math.pow(2, rounds - match.round) + 1 })
                    .where(and(eq(hiqCrewTournamentParticipants.tournamentId, t.id), eq(hiqCrewTournamentParticipants.memberId, loserId)));
            }
            return await this.pushWinnerUp(tx, t.id, match.round, match.slot, winnerId, rounds);
        });
    }

    /** 승자를 윗칸에 앉힌다. 결승이면 우승 확정. */
    private async pushWinnerUp(tx: any, tournamentId: string, round: number, slot: number, winnerId: string, rounds: number) {
        const target = advanceTarget(round, slot, rounds);
        if (!target) {
            await tx.update(hiqCrewTournaments)
                .set({ status: "ended", championId: winnerId, updatedAt: new Date() })
                .where(eq(hiqCrewTournaments.id, tournamentId));
            await tx.update(hiqCrewTournamentParticipants)
                .set({ status: "winner", finalRank: 1 })
                .where(and(
                    eq(hiqCrewTournamentParticipants.tournamentId, tournamentId),
                    eq(hiqCrewTournamentParticipants.memberId, winnerId),
                ));
            return { champion: winnerId };
        }

        const [next] = await tx.select().from(hiqCrewTournamentMatches).where(and(
            eq(hiqCrewTournamentMatches.tournamentId, tournamentId),
            eq(hiqCrewTournamentMatches.round, target.round),
            eq(hiqCrewTournamentMatches.slot, target.slot),
        ));
        if (!next) return { champion: null };

        const p1Id = target.side === "p1" ? winnerId : next.p1Id;
        const p2Id = target.side === "p2" ? winnerId : next.p2Id;
        const both = !!p1Id && !!p2Id;
        await tx.update(hiqCrewTournamentMatches)
            .set({ p1Id, p2Id, status: both ? "ready" : "pending" })
            .where(eq(hiqCrewTournamentMatches.id, next.id));
        return { champion: null, advancedTo: { round: target.round, slot: target.slot } };
    }

    /** 풀리그는 모든 경기가 끝나면 승수로 순위를 매긴다. 동률이면 공동 순위. */
    private async settleLeagueIfDone(tx: any, tournamentId: string) {
        const matches = await tx.select().from(hiqCrewTournamentMatches)
            .where(eq(hiqCrewTournamentMatches.tournamentId, tournamentId));
        if (matches.some((m: any) => m.status !== "done" && m.status !== "bye")) return { champion: null };

        const parts = await tx.select().from(hiqCrewTournamentParticipants)
            .where(eq(hiqCrewTournamentParticipants.tournamentId, tournamentId));
        const ranked = [...parts].sort((a: any, b: any) => (b.wins - a.wins) || (a.losses - b.losses));

        let rank = 0, prevKey = "";
        for (let i = 0; i < ranked.length; i++) {
            const key = `${ranked[i].wins}-${ranked[i].losses}`;
            if (key !== prevKey) { rank = i + 1; prevKey = key; }
            await tx.update(hiqCrewTournamentParticipants)
                .set({ finalRank: rank, status: rank === 1 ? "winner" : "eliminated" })
                .where(eq(hiqCrewTournamentParticipants.id, ranked[i].id));
        }
        const champion = ranked[0]?.memberId ?? null;
        await tx.update(hiqCrewTournaments)
            .set({ status: "ended", championId: champion, updatedAt: new Date() })
            .where(eq(hiqCrewTournaments.id, tournamentId));
        return { champion };
    }

    // ---------- 관리 ----------

    async update(tournamentId: string, data: any) {
        const [row] = await db.update(hiqCrewTournaments)
            .set({ ...data, updatedAt: new Date() })
            .where(eq(hiqCrewTournaments.id, tournamentId)).returning();
        return row;
    }

    async remove(tournamentId: string) {
        await db.transaction(async (tx) => {
            await tx.delete(hiqCrewTournamentMatches).where(eq(hiqCrewTournamentMatches.tournamentId, tournamentId));
            await tx.delete(hiqCrewTournamentParticipants).where(eq(hiqCrewTournamentParticipants.tournamentId, tournamentId));
            await tx.delete(hiqCrewTournaments).where(eq(hiqCrewTournaments.id, tournamentId));
        });
    }

    /** 알림 대상 — 참가자 id 만 가볍게. */
    async getParticipantIds(tournamentId: string): Promise<string[]> {
        const rows = await db.select({ memberId: hiqCrewTournamentParticipants.memberId })
            .from(hiqCrewTournamentParticipants)
            .where(eq(hiqCrewTournamentParticipants.tournamentId, tournamentId));
        return rows.map((r) => r.memberId);
    }
}
