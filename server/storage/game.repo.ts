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
import { eq, desc, asc, and, or, sql, gt, inArray } from "drizzle-orm";
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

        const isRanked = currentGame.gameMode === "match" && !!currentGame.player2Id;

        const [game] = await db.update(hiqGames).set({
            ...finalData,
            status: "finished",
            isRanked
        }).where(eq(hiqGames.id, id)).returning();

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
            const [p1] = await db.select().from(hiqMembers).where(eq(hiqMembers.id, game.player1Id));
            if (p1) {
                const delta = calculateRpDelta(game.winnerId === game.player1Id, p1[handiField] || 0);
                await db.update(hiqMembers)
                    .set({ [ratingField]: sql`GREATEST(0, ${hiqMembers[ratingField]} + ${delta})` })
                    .where(eq(hiqMembers.id, game.player1Id));
            }

            if (game.player2Id) {
                const [p2] = await db.select().from(hiqMembers).where(eq(hiqMembers.id, game.player2Id));
                if (p2) {
                    const delta = calculateRpDelta(game.winnerId === game.player2Id, p2[handiField] || 0);
                    await db.update(hiqMembers)
                        .set({ [ratingField]: sql`GREATEST(0, ${hiqMembers[ratingField]} + ${delta})` })
                        .where(eq(hiqMembers.id, game.player2Id));
                }
            }
        }

        // Update Cached Averages
        await this._updateUserAverage(game.player1Id, game.gameType as "3c" | "4c");
        if (game.player2Id) await this._updateUserAverage(game.player2Id, game.gameType as "3c" | "4c");
        if (game.player3Id) await this._updateUserAverage(game.player3Id, game.gameType as "3c" | "4c");
        if (game.player4Id) await this._updateUserAverage(game.player4Id, game.gameType as "3c" | "4c");

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
        const field = `player${slotIndex}Id` as any;
        await db.update(hiqGames)
            .set({ [field]: memberId })
            .where(eq(hiqGames.id, gameId));
        return true;
    }

    async recordSuccessfulShot(data: InsertHiqSuccessfulShot): Promise<any> {
        const [shot] = await db.insert(hiqSuccessfulShots).values(data).returning();
        return shot;
    }

    async searchSuccessfulShots(gameType: "3c" | "4c", currentPositions: any, limit: number = 5): Promise<any[]> {
        return await db.select().from(hiqSuccessfulShots)
            .where(eq(hiqSuccessfulShots.gameType, gameType))
            .limit(limit)
            .orderBy(desc(hiqSuccessfulShots.createdAt));
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

    async getInviteStatus(code: string): Promise<any> {
        const invites = await db.select().from(hiqInvites).where(eq(hiqInvites.code, code));
        if (invites.length === 0) return null;

        const base = invites[0];
        const result: any = { ...base, guests: [] };

        const guestIds = invites.map(inv => inv.guestId).filter(id => id !== null) as string[];
        if (guestIds.length > 0) {
            const guests = await db.select().from(hiqMembers).where(inArray(hiqMembers.id, guestIds));
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

        const alreadyJoined = invites.some(inv => inv.guestId === guestId);
        if (alreadyJoined) return true;

        const pendingInvite = invites.find(inv => inv.status === 'pending');

        if (pendingInvite) {
            await db.update(hiqInvites)
                .set({ guestId, status: 'accepted' })
                .where(eq(hiqInvites.id, pendingInvite.id));
        } else {
            const base = invites[0];
            await db.insert(hiqInvites).values({
                code: base.code,
                hostId: base.hostId,
                storeId: base.storeId,
                status: 'accepted',
                guestId: guestId,
                expiresAt: base.expiresAt,
                sportCategory: base.sportCategory
            });
        }

        return true;
    }

    // --- Private Helper ---
    async _updateUserAverage(memberId: string, type: "3c" | "4c") {
        const history = await this.getMemberGameHistory(memberId);
        const filtered = history.filter(h => h.gameType === type);
        if (filtered.length === 0) return;

        const totalAvg = filtered.reduce((acc, h) => acc + parseFloat(h.average), 0) / filtered.length;
        const avgField = type === "3c" ? "avg3c" : "avg4c";

        await db.update(hiqMembers)
            .set({ [avgField]: totalAvg, updatedAt: new Date() })
            .where(eq(hiqMembers.id, memberId));
    }
}
