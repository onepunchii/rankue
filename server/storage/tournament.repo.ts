import { db } from "../db.js";
import { and, eq, desc, inArray, sql } from "drizzle-orm";
import {
    hiqCrewTournaments,
    hiqCrewTournamentParticipants,
    hiqCrewTournamentMatches,
    hiqCrewMembers,
    hiqMembers,
    hiqGames,
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
        const rows = await db
            .select()
            .from(hiqCrewTournaments)
            .where(eq(hiqCrewTournaments.crewId, crewId))
            .orderBy(desc(hiqCrewTournaments.createdAt));
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
     * 이미 동의한 상대다. 대신 이 검증이 뚫리면 아무나 남의 이름으로 경기를 만들 수 있으니
     * (1) 대진 존재·미완료 (2) 호출자가 그 자리의 선수 (3) 크루 정식 멤버 셋 다 본다.
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
        if (match.status === "done" || match.status === "bye") return null;
        if (!match.p1Id || !match.p2Id) return null;
        if (match.p1Id !== callerId && match.p2Id !== callerId) return null;
        if (tournament.status === "ended" || tournament.status === "canceled") return null;

        // 크루 정식 멤버인지 — 탈퇴했는데 대진에 이름이 남아 있을 수 있다.
        const [membership] = await db.select().from(hiqCrewMembers).where(and(
            eq(hiqCrewMembers.crewId, tournament.crewId),
            eq(hiqCrewMembers.memberId, callerId),
        ));
        if (!membership || membership.role === "pending") return null;

        const opponentId = match.p1Id === callerId ? match.p2Id : match.p1Id;
        return { tournamentId: tournament.id, matchId: match.id, opponentId, crewId: tournament.crewId };
    }

    /** 경기 시작 직후 대진에 경기를 물린다. */
    async attachGame(matchId: string, gameId: string) {
        await db.update(hiqCrewTournamentMatches)
            .set({ gameId, status: "playing", startedAt: new Date() })
            .where(and(
                eq(hiqCrewTournamentMatches.id, matchId),
                inArray(hiqCrewTournamentMatches.status, ["ready", "pending"]),
            ));
        const [t] = await db.select({ tournamentId: hiqCrewTournamentMatches.tournamentId })
            .from(hiqCrewTournamentMatches).where(eq(hiqCrewTournamentMatches.id, matchId));
        if (t) {
            await db.update(hiqCrewTournaments)
                .set({ status: "ongoing", updatedAt: new Date() })
                .where(and(eq(hiqCrewTournaments.id, t.tournamentId), inArray(hiqCrewTournaments.status, ["recruiting", "drawn"])));
        }
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
        const match = await this.findMatchByGameId(gameId);
        if (!match || match.status === "done") return null;

        const [game] = await db.select().from(hiqGames).where(eq(hiqGames.id, gameId));
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
            await db.update(hiqCrewTournamentMatches)
                .set({ p1Score: s1, p2Score: s2, status: "ready", gameId: null, endedAt: null })
                .where(eq(hiqCrewTournamentMatches.id, match.id));
            return null;
        }
        const loserId = winnerId === match.p1Id ? match.p2Id : match.p1Id;

        const [t] = await db.select().from(hiqCrewTournaments).where(eq(hiqCrewTournaments.id, match.tournamentId));
        if (!t) return null;

        await db.update(hiqCrewTournamentMatches)
            .set({ p1Score: s1, p2Score: s2, winnerId, loserId, status: "done", endedAt: new Date() })
            .where(eq(hiqCrewTournamentMatches.id, match.id));

        await db.update(hiqCrewTournamentParticipants)
            .set({ wins: sql`${hiqCrewTournamentParticipants.wins} + 1` })
            .where(and(eq(hiqCrewTournamentParticipants.tournamentId, t.id), eq(hiqCrewTournamentParticipants.memberId, winnerId)));
        if (loserId) {
            await db.update(hiqCrewTournamentParticipants)
                .set({ losses: sql`${hiqCrewTournamentParticipants.losses} + 1` })
                .where(and(eq(hiqCrewTournamentParticipants.tournamentId, t.id), eq(hiqCrewTournamentParticipants.memberId, loserId)));
        }

        if (t.format === "league") return await this.settleLeagueIfDone(t.id);

        const participantCount = await this.countParticipants(t.id);
        const rounds = totalRounds(bracketSize(participantCount));
        // 진 사람은 여기서 탈락 확정.
        if (loserId) {
            await db.update(hiqCrewTournamentParticipants)
                .set({ status: "eliminated" })
                .where(and(eq(hiqCrewTournamentParticipants.tournamentId, t.id), eq(hiqCrewTournamentParticipants.memberId, loserId)));
        }
        return await db.transaction(async (tx) =>
            await this.pushWinnerUp(tx, t.id, match.round, match.slot, winnerId!, rounds));
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

    private async countParticipants(tournamentId: string) {
        const [row] = await db.select({ n: sql<number>`count(*)::int` })
            .from(hiqCrewTournamentParticipants)
            .where(eq(hiqCrewTournamentParticipants.tournamentId, tournamentId));
        return Number(row?.n ?? 0);
    }

    /** 풀리그는 모든 경기가 끝나면 승수로 순위를 매긴다. 동률이면 공동 순위. */
    private async settleLeagueIfDone(tournamentId: string) {
        const matches = await db.select().from(hiqCrewTournamentMatches)
            .where(eq(hiqCrewTournamentMatches.tournamentId, tournamentId));
        if (matches.some((m) => m.status !== "done" && m.status !== "bye")) return { champion: null };

        const parts = await db.select().from(hiqCrewTournamentParticipants)
            .where(eq(hiqCrewTournamentParticipants.tournamentId, tournamentId));
        const ranked = [...parts].sort((a, b) => (b.wins - a.wins) || (a.losses - b.losses));

        let rank = 0, prevKey = "";
        for (let i = 0; i < ranked.length; i++) {
            const key = `${ranked[i].wins}-${ranked[i].losses}`;
            if (key !== prevKey) { rank = i + 1; prevKey = key; }
            await db.update(hiqCrewTournamentParticipants)
                .set({ finalRank: rank, status: rank === 1 ? "winner" : "eliminated" })
                .where(eq(hiqCrewTournamentParticipants.id, ranked[i].id));
        }
        const champion = ranked[0]?.memberId ?? null;
        await db.update(hiqCrewTournaments)
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
