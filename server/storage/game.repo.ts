import { db } from "../db.js";
import {
    hiqMembers,
    hiqGames,
    hiqGameHistory,
    hiqSuccessfulShots,
    hiqInvites,
    hiqFriendships,
    profiles
} from "../../shared/schema.js";
import type {
    InsertHiqGame,
    HiqGame,
    HiqGameHistory,
    InsertHiqSuccessfulShot,
    HiqMember
} from "../../shared/schema.js";
import { eq, ne, desc, asc, and, or, sql, gt, inArray } from "drizzle-orm";
import { notFound } from "../utils/errors.js";

const HANDICAP_MAP_4C = [
    { avg: 1.5, handi: 50 },
    { avg: 1.2, handi: 40 },
    { avg: 0.9, handi: 30 },
    { avg: 0.75, handi: 25 },
    { avg: 0.6, handi: 20 },
    { avg: 0.45, handi: 15 },
    { avg: 0.35, handi: 12 },
    { avg: 0.3, handi: 10 },
    { avg: 0.24, handi: 8 },
    { avg: 0.15, handi: 5 },
    { avg: 0.0, handi: 3 },
];

const HANDICAP_MAP_3C = [
    { avg: 1.0, handi: 30 },
    { avg: 0.7, handi: 25 },
    { avg: 0.6, handi: 23 },
    { avg: 0.5, handi: 20 },
    { avg: 0.4, handi: 18 },
    { avg: 0.3, handi: 15 },
    { avg: 0.0, handi: 12 },
];

export class GameRepository {
    async startHiqGame(gameData: InsertHiqGame): Promise<HiqGame> {
        const [game] = await db.insert(hiqGames).values(gameData).returning();
        return game;
    }

    async getHiqGameById(id: string): Promise<HiqGame | undefined> {
        const [game] = await db.select().from(hiqGames).where(eq(hiqGames.id, id));
        return game;
    }

    async updateHiqGameScore(id: string, data: Partial<HiqGame>): Promise<void> {
        await db.update(hiqGames).set({
            ...data,
        }).where(eq(hiqGames.id, id));
    }

    async finishHiqGame(id: string, finalData: Partial<HiqGame>): Promise<HiqGame> {
        const currentGame = await this.getHiqGameById(id);
        if (!currentGame) throw notFound("Game not found");

        // Fast path: already finished.
        if (currentGame.status === "finished") return currentGame;

        // Ranked status is decided ONCE at start by the consent gate (startHiqGame), which
        // accounts for consented members in ANY slot (2, 3 or 4). Recomputing it here from
        // player2Id alone silently un-ranked legit 1v2 / 1v3 matches, so we keep the persisted
        // decision instead of second-guessing it.
        const isRanked = currentGame.gameMode === "match" && !!currentGame.isRanked;

        // winnerId must be one of THIS game's players — never an arbitrary member id.
        const playerIds = [currentGame.player1Id, currentGame.player2Id, currentGame.player3Id, currentGame.player4Id]
            .filter((pid): pid is string => !!pid);
        const submittedWinner = (finalData as any).winnerId;
        const winnerId = submittedWinner && playerIds.includes(submittedWinner) ? submittedWinner : null;

        // Atomic finish: the status guard lives INSIDE the UPDATE, so two concurrent finish
        // requests can't both pass a read-then-write check and double-insert history / double-apply RP.
        const [game] = await db.update(hiqGames).set({
            ...finalData,
            winnerId,
            status: "finished",
            isRanked
        }).where(and(eq(hiqGames.id, id), ne(hiqGames.status, "finished"))).returning();

        // Lost the race — another request finished it first. Return that result untouched.
        if (!game) {
            const existing = await this.getHiqGameById(id);
            if (!existing) throw notFound("Game not found");
            return existing;
        }

        // Save history for Player 1
        const p1Average = (game.player1Score / (game.totalInnings || 1)).toFixed(2);
        await db.insert(hiqGameHistory).values({
            memberId: game.player1Id,
            gameId: game.id,
            gameMode: game.gameMode,
            gameType: game.gameType,
            score: game.player1Score,
            innings: game.totalInnings,
            average: p1Average,
            isRanked: game.isRanked,
            isWinner: game.winnerId === game.player1Id,
            highRun: game.player1HighRun || 0,
            inningData: game.player1Innings,
            opponentName: game.player2Name || "상대방", // logic adjusted slightly to default
            sportCategory: game.sportCategory
        });

        // Save history for Player 2
        if (game.gameMode === "match" && game.player2Id) {
            const p2Average = (game.player2Score / (game.totalInnings || 1)).toFixed(2);
            await db.insert(hiqGameHistory).values({
                memberId: game.player2Id,
                gameId: game.id,
                gameMode: game.gameMode,
                gameType: game.gameType,
                score: game.player2Score,
                innings: game.totalInnings,
                average: p2Average,
                isRanked: game.isRanked,
                isWinner: game.winnerId === game.player2Id,
                highRun: game.player2HighRun || 0,
                inningData: game.player2Innings,
                opponentName: game.player1Name || "상대방",
                sportCategory: game.sportCategory
            });
        }

        // Save history for Player 3
        if (game.player3Id) {
            const p3Average = (game.player3Score / (game.totalInnings || 1)).toFixed(2);
            await db.insert(hiqGameHistory).values({
                memberId: game.player3Id,
                gameId: game.id,
                gameMode: game.gameMode,
                gameType: game.gameType,
                score: game.player3Score,
                innings: game.totalInnings,
                average: p3Average,
                isRanked: game.isRanked,
                isWinner: game.winnerId === game.player3Id,
                highRun: game.player3HighRun || 0,
                inningData: game.player3Innings,
                opponentName: game.player1Name || "상대방",
                sportCategory: game.sportCategory
            });
        }

        // Save history for Player 4
        if (game.player4Id) {
            const p4Average = (game.player4Score / (game.totalInnings || 1)).toFixed(2);
            await db.insert(hiqGameHistory).values({
                memberId: game.player4Id,
                gameId: game.id,
                gameMode: game.gameMode,
                gameType: game.gameType,
                score: game.player4Score,
                innings: game.totalInnings,
                average: p4Average,
                isRanked: game.isRanked,
                isWinner: game.winnerId === game.player4Id,
                highRun: game.player4HighRun || 0,
                inningData: game.player4Innings,
                opponentName: game.player1Name || "상대방",
                sportCategory: game.sportCategory
            });
        }

        // Update Ratings based on result (Record-based Ranking Point with Tier Protection)
        const ratingField = game.gameType === "3c" ? "rating3c" : "rating4c";
        const handiField = game.gameType === "3c" ? "handi3c" : "handi4c";

        const calculateRpDelta = (isWinner: boolean, handi: number) => {
            if (isWinner) return 30;
            const h = handi || 0;
            if (game.gameType === "3c") {
                if (h < 16) return 0;
                if (h < 22) return -5;
                return -15;
            } else {
                if (h < 80) return 0;
                if (h < 150) return -5;
                return -15;
            }
        };

        if (game.isRanked) {
            // Apply RP to EVERY bound member slot, not just 1 and 2 — a consented member in
            // slot 3 or 4 was getting a ranked history row while their rating never moved.
            const rankedIds = [game.player1Id, game.player2Id, game.player3Id, game.player4Id]
                .filter((pid): pid is string => !!pid);

            for (const pid of rankedIds) {
                const [p] = await db.select().from(hiqMembers).where(eq(hiqMembers.id, pid));
                if (!p) continue;
                const delta = calculateRpDelta(game.winnerId === pid, p[handiField] || 0);
                await db.update(hiqMembers)
                    .set({ [ratingField]: sql`GREATEST(0, ${hiqMembers[ratingField]} + ${delta})` })
                    .where(eq(hiqMembers.id, pid));
            }
        }

        // Update Cached Averages (every bound member, so the lobby's target-score input stays fresh)
        for (const pid of [game.player1Id, game.player2Id, game.player3Id, game.player4Id]) {
            if (pid) await this._updateUserAverage(pid, game.gameType as "3c" | "4c");
        }

        return game;
    }

    async getMemberGameHistory(memberId: string, sportCategory?: string): Promise<HiqGameHistory[]> {
        return await db
            .select()
            .from(hiqGameHistory)
            .where(
                and(
                    eq(hiqGameHistory.memberId, memberId),
                    sportCategory ? eq(hiqGameHistory.sportCategory, sportCategory as any) : undefined
                )
            )
            .orderBy(desc(hiqGameHistory.createdAt));
    }

    async checkAndUpdateHandicap(memberId: string, gameType: "3c" | "4c") {
        const history = await this.getMemberGameHistory(memberId);
        const filtered = history.filter(h => h.gameType === gameType && h.isRanked).slice(0, 10);

        if (filtered.length < 5) return { oldHandi: 0, newHandi: 0, message: null };

        const totalAvg = filtered.reduce((acc, h) => acc + parseFloat(h.average), 0) / filtered.length;
        const [currentMember] = await db.select().from(hiqMembers).where(eq(hiqMembers.id, memberId));
        if (!currentMember) return { oldHandi: 0, newHandi: 0, message: null };

        const handiField = gameType === "3c" ? "handi3c" : "handi4c";
        const oldHandi = currentMember[handiField] || 0;

        const map = gameType === "4c" ? HANDICAP_MAP_4C : HANDICAP_MAP_3C;
        let newHandi = map[map.length - 1].handi;
        for (const tier of map) {
            if (totalAvg >= tier.avg) {
                newHandi = tier.handi;
                break;
            }
        }

        if (newHandi !== oldHandi) {
            await db.update(hiqMembers)
                .set({ [handiField]: newHandi, updatedAt: new Date() })
                .where(eq(hiqMembers.id, memberId));

            return {
                oldHandi,
                newHandi,
                message: `최근 ${filtered.length}게임 에버리지(${totalAvg.toFixed(2)}) 기준 핸디가 ${newHandi}로 조정되었습니다.`
            };
        }

        return { oldHandi, newHandi, message: null };
    }

    async getMemberStatsAnalysis(memberId: string, type: "3c" | "4c" = "4c") {
        const history = await this.getMemberGameHistory(memberId);
        const filtered = history.filter(h => h.gameType === type && h.gameMode === 'match' && h.isRanked);

        const wins = filtered.filter(h => h.isWinner).length;
        const losses = filtered.length - wins;
        const totalGames = filtered.length;

        let overallAvg = 0;
        let recentAvg = 0;
        let highRunMax = 0;

        if (totalGames > 0) {
            overallAvg = filtered.reduce((acc, h) => acc + parseFloat(h.average), 0) / totalGames;
            highRunMax = Math.max(...filtered.map(h => h.highRun || 0));

            const recent = filtered.slice(0, 5);
            if (recent.length > 0) {
                recentAvg = recent.reduce((acc, h) => acc + parseFloat(h.average), 0) / recent.length;
            }
        }

        const winRate = totalGames > 0 ? (wins / totalGames) * 100 : 0;
        const mentalScore = Math.abs(recentAvg - overallAvg) < 0.1 ? 80 : 50;

        return {
            power: Math.min(100, 40 + (highRunMax * 5)),
            technique: Math.min(100, 30 + (overallAvg * 50)),
            mental: mentalScore,
            experience: Math.min(100, 20 + totalGames),
            trend: 50 + (filtered[0]?.isWinner ? 10 : -10),
            winRate: Math.round(winRate),
            avgAverage: overallAvg.toFixed(2),
            totalGames: totalGames,
            summary: {
                overallAvg: overallAvg.toFixed(3),
                recentAvg: recentAvg.toFixed(3),
                highRun: highRunMax,
                wins,
                losses,
                matchCount: totalGames
            }
        };
    }

    async getHeadToHeadStats(myId: string, friendId: string, sport: string = "BILLIARDS") {
        const games = await db.select()
            .from(hiqGameHistory)
            .innerJoin(hiqGames, eq(hiqGameHistory.gameId, hiqGames.id))
            .where(
                and(
                    eq(hiqGameHistory.memberId, myId),
                    eq(hiqGames.sportCategory, sport as "BILLIARDS" | "GOLF"),
                    or(
                        eq(hiqGames.player1Id, friendId),
                        eq(hiqGames.player2Id, friendId),
                        eq(hiqGames.player3Id, friendId),
                        eq(hiqGames.player4Id, friendId)
                    )
                )
            );

        const myWins = games.filter(g => g.hiq_game_history.isWinner).length;
        const total = games.length;

        return {
            total,
            myWins,
            friendWins: total - myWins,
            winRate: total > 0 ? Math.round((myWins / total) * 100) : 0
        };
    }

    async getHeadToHeadGames(myId: string, friendId: string, sport: string = "BILLIARDS") {
        const history = await db.select()
            .from(hiqGameHistory)
            .innerJoin(hiqGames, eq(hiqGameHistory.gameId, hiqGames.id))
            .where(
                and(
                    eq(hiqGameHistory.memberId, myId),
                    eq(hiqGames.sportCategory, sport as "BILLIARDS" | "GOLF"),
                    or(
                        eq(hiqGames.player1Id, friendId),
                        eq(hiqGames.player2Id, friendId),
                        eq(hiqGames.player3Id, friendId),
                        eq(hiqGames.player4Id, friendId)
                    )
                )
            )
            .orderBy(desc(hiqGameHistory.createdAt))
            .limit(10);

        return history.map(h => ({
            ...h.hiq_games,
            historyId: h.hiq_game_history.id,
            myScore: h.hiq_game_history.score,
            myInnings: h.hiq_game_history.innings,
            isWinner: h.hiq_game_history.isWinner
        }));
    }

    async claimGameRecord(gameId: string, memberId: string, slotIndex: number): Promise<boolean> {
        // Slot 1 is always the host/creator and must never be claimable.
        if (!Number.isInteger(slotIndex) || slotIndex < 2 || slotIndex > 4) return false;

        const game = await this.getHiqGameById(gameId);
        if (!game) return false;

        const idField = `player${slotIndex}Id`;
        const nameField = `player${slotIndex}Name`;
        const g = game as any;

        // Target slot must be an unclaimed guest: no bound member id but a name present.
        if (g[idField] !== null || !g[nameField]) return false;

        // Reject if this member already occupies any player slot in this game
        // (prevents claiming two slots / self-duplication in head-to-head).
        const occupied = [game.player1Id, game.player2Id, game.player3Id, game.player4Id];
        if (occupied.includes(memberId)) return false;

        await db.transaction(async (tx) => {
            await tx.update(hiqGames)
                .set({ [idField]: memberId })
                .where(eq(hiqGames.id, gameId));

            // Backfill a hiqGameHistory row so the claimed game surfaces in the
            // claimer's own history / head-to-head reads (both keyed by memberId).
            // Only finished games have derivable score/inning data.
            if (game.status === "finished") {
                const score = g[`player${slotIndex}Score`] ?? 0;
                const innings = game.totalInnings ?? 0;
                const highRun = g[`player${slotIndex}HighRun`] ?? 0;
                const inningData = g[`player${slotIndex}Innings`] ?? null;
                const average = (score / (innings || 1)).toFixed(2);

                // Winner derivation for a claimed slot: highest score among filled slots.
                const slotScores = [game.player1Score, game.player2Score, game.player3Score, game.player4Score]
                    .filter((s): s is number => typeof s === "number");
                const maxScore = slotScores.length > 0 ? Math.max(...slotScores) : 0;

                await tx.insert(hiqGameHistory).values({
                    memberId,
                    gameId: game.id,
                    gameMode: game.gameMode,
                    gameType: game.gameType,
                    score,
                    innings,
                    average,
                    isRanked: game.isRanked,
                    isWinner: score === maxScore,
                    highRun,
                    inningData,
                    opponentName: game.player1Name || "상대방",
                    sportCategory: game.sportCategory,
                });
            }
        });

        return true;
    }

    async recordSuccessfulShot(data: InsertHiqSuccessfulShot): Promise<any> {
        const [shot] = await db.insert(hiqSuccessfulShots).values(data).returning();
        return shot;
    }

    async searchSuccessfulShots(gameType: "3c" | "4c", currentPositions: any, limit: number = 5): Promise<any[]> {
        // Fetch a bounded pool of recent candidates, then rank by how closely their
        // stored ball layout matches the user's current layout. Distance math is done
        // in Node (ball-position keys are free-form jsonb entries, so summed-distance
        // SQL over jsonb would be brittle). Both sides are already in meters.
        const CANDIDATE_CAP = 300;
        const candidates = await db.select().from(hiqSuccessfulShots)
            .where(eq(hiqSuccessfulShots.gameType, gameType))
            .orderBy(desc(hiqSuccessfulShots.createdAt))
            .limit(CANDIDATE_CAP);

        // If the client sent no usable layout, fall back to the newest shots.
        if (!currentPositions || typeof currentPositions !== "object") {
            return candidates.slice(0, limit);
        }

        // Summed Euclidean distance over the ball keys common to both layouts.
        const layoutDistance = (a: any, b: any): number => {
            if (!a || !b || typeof a !== "object" || typeof b !== "object") return Infinity;
            let sum = 0;
            let matched = 0;
            for (const key of Object.keys(a)) {
                const pa = a[key];
                const pb = b[key];
                if (!pa || !pb) continue;
                if (typeof pa.x !== "number" || typeof pa.y !== "number") continue;
                if (typeof pb.x !== "number" || typeof pb.y !== "number") continue;
                const dx = pa.x - pb.x;
                const dy = pa.y - pb.y;
                sum += Math.sqrt(dx * dx + dy * dy);
                matched++;
            }
            return matched > 0 ? sum : Infinity;
        };

        // Summed-distance threshold (meters). Genuinely unrelated layouts are excluded;
        // the client shows a "조회 결과 없음" toast for an empty result.
        const MAX_DISTANCE = 1.5;

        return candidates
            .map(shot => ({ shot, distance: layoutDistance(currentPositions, (shot as any).ballPositions) }))
            .filter(entry => Number.isFinite(entry.distance) && entry.distance <= MAX_DISTANCE)
            .sort((a, b) => a.distance - b.distance)
            .slice(0, limit)
            .map(entry => entry.shot);
    }

    // Set of member ids who accepted an invite from this host and whose invite is still
    // valid — the consent primitive used to gate binding members into game slots.
    async getConsentedGuestIds(hostId: string): Promise<Set<string>> {
        const rows = await db
            .select({ guestId: hiqInvites.guestId })
            .from(hiqInvites)
            .where(
                and(
                    eq(hiqInvites.hostId, hostId),
                    eq(hiqInvites.status, "accepted"),
                    gt(hiqInvites.expiresAt, new Date())
                )
            );
        return new Set(rows.map(r => r.guestId).filter((id): id is string => id !== null));
    }

    async getGameHistoryById(id: string): Promise<HiqGameHistory | undefined> {
        const [history] = await db.select().from(hiqGameHistory).where(eq(hiqGameHistory.id, id));
        return history;
    }

    async createInvite(hostId: string): Promise<string> {
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        await db.insert(hiqInvites).values({
            code,
            hostId,
            status: 'pending',
            expiresAt: new Date(Date.now() + 30 * 60 * 1000)
        });
        return code;
    }

    // Mark the accepted invites this host used to build a ranked game as consumed, so a single
    // PIN can't authorize an unlimited stream of ranked games until it naturally expires.
    async consumeInvites(hostId: string, guestIds: string[]): Promise<void> {
        if (guestIds.length === 0) return;
        await db.update(hiqInvites)
            .set({ status: "expired" })
            .where(and(
                eq(hiqInvites.hostId, hostId),
                eq(hiqInvites.status, "accepted"),
                inArray(hiqInvites.guestId, guestIds)
            ));
    }

    async getInviteStatus(code: string): Promise<any> {
        // Only live invites: an expired code must not keep showing the opponent in the lobby
        // (the host would then start a match that the consent gate silently un-ranks).
        const invites = await db.select().from(hiqInvites).where(
            and(eq(hiqInvites.code, code), gt(hiqInvites.expiresAt, new Date()))
        );
        if (invites.length === 0) return null;

        const base = invites[0];
        const result: any = { ...base, guests: [] };

        const guestIds = invites.map(inv => inv.guestId).filter(id => id !== null) as string[];
        if (guestIds.length > 0) {
            // Project the fields the match lobby actually needs (identity + the skill stats used
            // to compute each opponent's target score / displayed average) and nothing more —
            // never leak phone, birthYear, gender, or default settlement bank account fields.
            const guests = await db
                .select({
                    id: hiqMembers.id,
                    name: hiqMembers.name,
                    average: hiqMembers.average,
                    avg3c: hiqMembers.avg3c,
                    avg4c: hiqMembers.avg4c,
                    handi3c: hiqMembers.handi3c,
                    handi4c: hiqMembers.handi4c,
                    rating3c: hiqMembers.rating3c,
                    rating4c: hiqMembers.rating4c,
                })
                .from(hiqMembers)
                .where(inArray(hiqMembers.id, guestIds));
            result.guests = guests;
        }

        return result;
    }

    async joinInvite(code: string, guestId: string): Promise<boolean> {
        const invites = await db.select().from(hiqInvites).where(
            and(
                eq(hiqInvites.code, code),
                gt(hiqInvites.expiresAt, new Date())
            )
        );

        if (invites.length === 0) return false;

        // The host cannot join their own PIN — otherwise they'd be bound into an opponent slot
        // and collect RP twice from a single "match" against themselves.
        if (invites[0].hostId === guestId) return false;

        const alreadyJoined = invites.some(inv => inv.guestId === guestId);
        if (alreadyJoined) return true;

        const base = invites[0];
        const pendingInvite = invites.find(inv => inv.status === 'pending');

        if (pendingInvite) {
            // Claim the pending row ATOMICALLY. Previously this was a read-then-write, so two
            // guests entering the same PIN concurrently both saw it as 'pending' and the second
            // UPDATE overwrote the first — silently dropping one guest's consent.
            const claimed = await db.update(hiqInvites)
                .set({ guestId, status: 'accepted' })
                .where(and(eq(hiqInvites.id, pendingInvite.id), eq(hiqInvites.status, 'pending')))
                .returning();

            if (claimed.length > 0) return true;
            // Lost the race — fall through and add our own accepted row instead.
        }

        await db.insert(hiqInvites).values({
            code: base.code,
            hostId: base.hostId,
            storeId: base.storeId,
            status: 'accepted',
            guestId: guestId,
            expiresAt: base.expiresAt,
            sportCategory: base.sportCategory
        });

        return true;
    }

    // --- Private Helper ---
    async _updateUserAverage(memberId: string, type: "3c" | "4c") {
        const history = await this.getMemberGameHistory(memberId);
        const filtered = history.filter(h => h.gameType === type);
        if (filtered.length === 0) return;

        const totalAvg = filtered.reduce((acc, h) => acc + parseFloat(h.average), 0) / filtered.length;
        const avgField = type === "3c" ? "avg3c" : "avg4c";

        // Also refresh the generic `average` column. It was never written here, yet it is the
        // field the match lobby and the ranking cards read — which is why every opponent was
        // handicapped off a stale default and rankings showed "평균 0.000".
        await db.update(hiqMembers)
            .set({ [avgField]: totalAvg, average: totalAvg.toFixed(3), updatedAt: new Date() })
            .where(eq(hiqMembers.id, memberId));
    }
}
