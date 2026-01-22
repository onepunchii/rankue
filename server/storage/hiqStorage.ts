import { db } from "../db.js";
import { hiqStores, hiqMembers, hiqGames, hiqVisitLogs, hiqGameHistory, hiqFriendships, hiqInvites, hiqSuccessfulShots } from "../../shared/schema.js";
import type { HiqStore, InsertHiqStore, HiqMember, InsertHiqMember, HiqGame, InsertHiqGame, HiqGameHistory, InsertHiqGameHistory, HiqFriendship, InsertHiqSuccessfulShot, HiqSuccessfulShot } from "../../shared/schema.js";
import { eq, desc, and, or, sql, gt, isNull } from "drizzle-orm";

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

export class HiqStorage {
    // --- Store Management ---
    async getStoreBySlug(slug: string): Promise<HiqStore | undefined> {
        const [store] = await db.select().from(hiqStores).where(eq(hiqStores.slug, slug));
        return store;
    }

    async getStoreById(id: string): Promise<HiqStore | undefined> {
        const [store] = await db.select().from(hiqStores).where(eq(hiqStores.id, id));
        return store;
    }

    async createStore(data: InsertHiqStore): Promise<HiqStore> {
        const [store] = await db.insert(hiqStores).values(data).returning();
        return store;
    }

    // --- Member Management ---
    async getMemberByPhone(storeId: string, phone: string): Promise<HiqMember | undefined> {
        const [member] = await db.select().from(hiqMembers).where(
            and(
                eq(hiqMembers.storeId, storeId),
                eq(hiqMembers.phone, phone)
            )
        );
        return member;
    }

    async getMemberById(id: string): Promise<HiqMember | undefined> {
        const [member] = await db.select().from(hiqMembers).where(eq(hiqMembers.id, id));
        return member;
    }

    async createMember(memberData: InsertHiqMember): Promise<HiqMember> {
        const [member] = await db
            .insert(hiqMembers)
            .values(memberData)
            .returning();
        return member;
    }

    async updateMember(id: string, data: Partial<HiqMember>): Promise<HiqMember> {
        const [member] = await db
            .update(hiqMembers)
            .set(data)
            .where(eq(hiqMembers.id, id))
            .returning();
        return member;
    }

    async incrementVisitCount(id: string): Promise<void> {
        const [member] = await db.select().from(hiqMembers).where(eq(hiqMembers.id, id));
        if (!member) return;

        const now = new Date();
        const lastVisit = member.lastVisitedAt;

        // Only increment if last visit was not today
        const isSameDay = lastVisit &&
            lastVisit.getFullYear() === now.getFullYear() &&
            lastVisit.getMonth() === now.getMonth() &&
            lastVisit.getDate() === now.getDate();

        if (!isSameDay) {
            await db
                .update(hiqMembers)
                .set({
                    visitCount: sql`${hiqMembers.visitCount} + 1`,
                    lastVisitedAt: now,
                    updatedAt: now
                })
                .where(eq(hiqMembers.id, id));

            // Log the visit for stats
            await db.insert(hiqVisitLogs).values({ memberId: id });
        }
    }

    async getTopRankings(storeId?: string, limit: number = 20, type: '3c' | '4c' = '4c'): Promise<HiqMember[]> {
        const field = type === '3c' ? hiqMembers.rating3c : hiqMembers.rating4c;
        const query = db.select().from(hiqMembers);

        if (storeId) {
            return await query
                .where(eq(hiqMembers.storeId, storeId))
                .orderBy(desc(field))
                .limit(limit);
        } else {
            return await query
                .orderBy(desc(field))
                .limit(limit);
        }
    }

    async getAvailableOpponents(storeId: string, currentUserId: string): Promise<HiqMember[]> {
        const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);

        return await db
            .select()
            .from(hiqMembers)
            .where(
                and(
                    eq(hiqMembers.storeId, storeId),
                    sql`${hiqMembers.id} != ${currentUserId}`
                )
            )
            .orderBy(
                sql`CASE WHEN ${hiqMembers.updatedAt} >= ${threeHoursAgo} THEN 0 ELSE 1 END`,
                desc(hiqMembers.updatedAt),
                hiqMembers.name
            );
    }

    async getAllMembers(storeId: string): Promise<HiqMember[]> {
        return await db
            .select()
            .from(hiqMembers)
            .where(eq(hiqMembers.storeId, storeId))
            .orderBy(sql`${hiqMembers.createdAt} DESC`);
    }

    async getAdminStats(storeId: string): Promise<{
        totalMembers: number;
        visitsToday: number;
        visitsYesterday: number;
        newToday: number;
    }> {
        const [total] = await db.select({ count: sql<number>`count(*)` })
            .from(hiqMembers)
            .where(eq(hiqMembers.storeId, storeId));

        // Count unique member visits today and yesterday for this store
        const [today] = await db.select({ count: sql<number>`count(distinct ${hiqVisitLogs.memberId})` })
            .from(hiqVisitLogs)
            .innerJoin(hiqMembers, eq(hiqVisitLogs.memberId, hiqMembers.id))
            .where(
                and(
                    eq(hiqMembers.storeId, storeId),
                    sql`DATE(${hiqVisitLogs.visitedAt}) = CURRENT_DATE`
                )
            );

        const [yesterday] = await db.select({ count: sql<number>`count(distinct ${hiqVisitLogs.memberId})` })
            .from(hiqVisitLogs)
            .innerJoin(hiqMembers, eq(hiqVisitLogs.memberId, hiqMembers.id))
            .where(
                and(
                    eq(hiqMembers.storeId, storeId),
                    sql`DATE(${hiqVisitLogs.visitedAt}) = CURRENT_DATE - INTERVAL '1 day'`
                )
            );

        const [newMembersToday] = await db.select({ count: sql<number>`count(*)` })
            .from(hiqMembers)
            .where(
                and(
                    eq(hiqMembers.storeId, storeId),
                    sql`DATE(${hiqMembers.createdAt}) = CURRENT_DATE`
                )
            );

        return {
            totalMembers: Number(total.count),
            visitsToday: Number(today.count || 0),
            visitsYesterday: Number(yesterday.count || 0),
            newToday: Number(newMembersToday.count)
        };
    }

    // --- Game Logic ---

    async updateHiqMember(id: string, data: Partial<HiqMember>): Promise<HiqMember> {
        const [member] = await db
            .update(hiqMembers)
            .set(data)
            .where(eq(hiqMembers.id, id))
            .returning();
        return member;
    }

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
        if (!currentGame) throw new Error("Game not found");

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
            isRanked: game.isRanked, // Now correctly reflects ranked status
            isWinner: game.winnerId === game.player1Id,
            highRun: game.player1HighRun || 0,
            inningData: game.player1Innings,
            opponentName: game.player2Name || "상대방"
        });

        // Save history for Player 2 if it's a match
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
                opponentName: game.player1Name || "상대방"
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
                opponentName: game.player1Name || "상대방"
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
                opponentName: game.player1Name || "상대방"
            });
        }

        // Update Ratings based on result (Record-based Ranking Point)
        // Update Ratings based on result (Record-based Ranking Point with Tier Protection)
        const ratingField = game.gameType === "3c" ? "rating3c" : "rating4c";
        const handiField = game.gameType === "3c" ? "handi3c" : "handi4c";

        // Helper: Calculate Delta
        const calculateRpDelta = (isWinner: boolean, handi: number) => {
            if (isWinner) return 30;

            // Loss Logic - Check Tier Protection
            const h = handi || 0;
            if (game.gameType === "3c") {
                if (h < 16) return 0; // Bronze: No penalty
                if (h < 22) return -5; // Silver: Soft penalty
                return -15; // Gold+: Full penalty
            } else {
                if (h < 80) return 0; // Bronze
                if (h < 150) return -5; // Silver
                return -15; // Gold+
            }
        };

        // Fetch Members to get current handicap
        // ONLY update RP for RANKED MATCH mode (Member vs Member)
        if (game.isRanked) {
            const p1 = await this.getMemberById(game.player1Id);
            if (p1) {
                const delta = calculateRpDelta(game.winnerId === game.player1Id, p1[handiField] || 0);
                await db.update(hiqMembers)
                    .set({ [ratingField]: sql`GREATEST(0, ${hiqMembers[ratingField]} + ${delta})` })
                    .where(eq(hiqMembers.id, game.player1Id));
            }

            if (game.player2Id) {
                const p2 = await this.getMemberById(game.player2Id);
                if (p2) {
                    const delta = calculateRpDelta(game.winnerId === game.player2Id, p2[handiField] || 0);
                    await db.update(hiqMembers)
                        .set({ [ratingField]: sql`GREATEST(0, ${hiqMembers[ratingField]} + ${delta})` })
                        .where(eq(hiqMembers.id, game.player2Id));
                }
            }
        }

        return game;
    }

    async getMemberGameHistory(memberId: string): Promise<HiqGameHistory[]> {
        return await db
            .select()
            .from(hiqGameHistory)
            .where(eq(hiqGameHistory.memberId, memberId))
            .orderBy(desc(hiqGameHistory.createdAt));
    }

    async checkAndUpdateHandicap(userId: string, gameType: "3c" | "4c"): Promise<{ oldHandi: number, newHandi: number, message: string | null }> {
        const recentGames = await db
            .select()
            .from(hiqGames)
            .where(and(
                eq(hiqGames.player1Id, userId),
                eq(hiqGames.gameType, gameType),
                eq(hiqGames.status, "finished")
            ))
            .orderBy(desc(hiqGames.playedAt))
            .limit(10);

        if (recentGames.length < 5) return { oldHandi: 0, newHandi: 0, message: null };

        const totalScores = recentGames.reduce((acc, g) => acc + g.player1Score, 0);
        const totalInnings = recentGames.reduce((acc, g) => acc + (g.totalInnings || 1), 0);
        const totalFinishInnings = recentGames.reduce((acc, g) => acc + (g.player1FinishInnings || 0), 0);

        // Use adjusted average for upgrade: base_score / (total_innings - player_finish_innings)
        const adjustedInnings = Math.max(1, totalInnings - totalFinishInnings);
        const avg = totalScores / adjustedInnings;

        const member = await this.getMemberById(userId);
        if (!member) return { oldHandi: 0, newHandi: 0, message: null };

        const currentHandi = gameType === "3c" ? member.handi3c : member.handi4c;
        const map = gameType === "3c" ? HANDICAP_MAP_3C : HANDICAP_MAP_4C;

        let newHandi = currentHandi || 0;
        for (const level of map) {
            if (avg >= level.avg) {
                newHandi = level.handi;
                break;
            }
        }

        if (newHandi > (currentHandi || 0)) {
            await db.update(hiqMembers).set({
                [gameType === "3c" ? "handi3c" : "handi4c"]: newHandi,
                average: avg.toFixed(2),
                updatedAt: new Date()
            }).where(eq(hiqMembers.id, userId));

            return {
                oldHandi: currentHandi || 0,
                newHandi,
                message: `🎉 실력 상승! ${gameType === "3c" ? "3구" : "4구"} 핸디가 ${currentHandi} → ${newHandi}로 조정되었습니다!`
            };
        } else {
            // Even if no promotion, update the official average (Recent 10 games)
            await db.update(hiqMembers).set({
                average: avg.toFixed(2),
                updatedAt: new Date()
            }).where(eq(hiqMembers.id, userId));
        }

        return { oldHandi: currentHandi || 0, newHandi: currentHandi || 0, message: null };
    }
    async getMemberStatsAnalysis(memberId: string, type: "3c" | "4c" = "4c"): Promise<any> {
        const member = await this.getMemberById(memberId);
        if (!member) return null;

        const allHistory = await this.getMemberGameHistory(memberId);
        // Filter history by type for stats calculation (Official Ranked Match Only)
        // Ensure we only use games that are actually RANKED (isRanked: true) 
        // Note: gameMode 'match' is usually implied by isRanked, but we check isRanked specifically for official records.
        const history = allHistory.filter(h => h.gameType === type && h.gameMode === 'match' && h.isRanked);
        const totalGames = history.length;

        // 1. Power (AVG)
        // Calculate actual average from history
        const totalScore = history.reduce((sum, h) => sum + h.score, 0);
        const totalInnings = history.reduce((sum, h) => sum + h.innings, 0);

        let avgVal = 0;
        if (totalInnings > 0) {
            avgVal = totalScore / totalInnings;
        }

        // Scale
        // 3c: 1.0 (Master Standard) = 100 Power
        // 4c: 5.0 (Platinum/Diamond Standard) = 100 Power
        const maxAvg = type === '3c' ? 1.0 : 5.0;
        const power = Math.min(100, (avgVal / maxAvg) * 100);

        // 2. Technique (High Run)
        // 2. Technique (High Run)
        const actualHighRun = history.reduce((max, h) => Math.max(max, h.highRun || 0), 0);
        // Target Reference (3c: 10, 4c: 50) - DB now stores Count for both.
        const highRunCount = actualHighRun;
        const hrTarget = type === '3c' ? 10 : 50;
        const technique = Math.min(100, (highRunCount / hrTarget) * 100);

        // 3. Mental (Win Rate)
        const wins = history.filter(h => h.isWinner).length;
        const winRate = totalGames > 0 ? wins / totalGames : 0;
        const mental = Math.min(100, winRate * 100);

        // 4. Experience (Games Count)
        // 50 games = 100 Experience
        const experience = Math.min(100, totalGames * 2);

        // 5. Trend (Recent vs Total)
        const recentGames = history.slice(0, 10);
        let recentAvg = 0;
        if (recentGames.length > 0) {
            const rScore = recentGames.reduce((sum, h) => sum + h.score, 0);
            const rInn = recentGames.reduce((sum, h) => sum + h.innings, 0);
            if (rInn > 0) {
                recentAvg = rScore / rInn;
            }
        }

        // 1.2x of Avg = 100 Trend (Rising Star)
        // 0.8x of Avg = 60 Trend
        // Base 50 + (Ratio - 1.0) * 100? 
        // Let's use simple Ratio * 80?
        // If Recent == Overall, Trend = 80.
        // If Recent 1.2 * Overall, Trend = 96.
        const baseTrend = avgVal > 0 ? (recentAvg / avgVal) : 0;
        const trend = Math.min(100, baseTrend * 80);

        // Tags
        const tags: string[] = [];
        if (technique > power + 20) tags.push("폭격기 💣");
        if (mental > 80) tags.push("늪 당구 🐢");

        // Calculate type-specific averages (Based on Recent 10 Match Games - Official Standard)
        const games3c = allHistory
            .filter(h => h.gameType === '3c' && h.gameMode === 'match')
            .slice(0, 10);
        const score3c = games3c.reduce((sum, h) => sum + h.score, 0);
        const innings3c = games3c.reduce((sum, h) => sum + h.innings, 0);
        const avg3c = innings3c > 0 ? (score3c / innings3c).toFixed(2) : "0.00";

        const games4c = allHistory
            .filter(h => h.gameType === '4c' && h.gameMode === 'match')
            .slice(0, 10);
        const score4c = games4c.reduce((sum, h) => sum + h.score, 0);
        const innings4c = games4c.reduce((sum, h) => sum + h.innings, 0);
        // 4-ball score IS now shot count (normalized)
        const avg4c = innings4c > 0 ? (score4c / innings4c).toFixed(2) : "0.00";

        return {
            stats: [
                { subject: 'Power', A: Math.round(power), fullMark: 100 },
                { subject: 'Technique', A: Math.round(technique), fullMark: 100 },
                { subject: 'Mental', A: Math.round(mental), fullMark: 100 },
                { subject: 'Experience', A: Math.round(experience), fullMark: 100 },
                { subject: 'Trend', A: Math.round(trend), fullMark: 100 },
            ],
            summary: {
                overallAvg: avgVal.toFixed(3),
                recentAvg: recentAvg.toFixed(3),
                highRun: actualHighRun,
                wins,
                losses: totalGames - wins,
                matchCount: totalGames,
                avg3c,
                avg4c
            },
            tags
        };
    }

    // --- Friend Management ---
    async getFriends(memberId: string): Promise<any[]> {
        // Fetch friends: where user is requester OR receiver, and status 'accepted'
        const friendships = await db.select()
            .from(hiqFriendships)
            .where(
                and(
                    or(eq(hiqFriendships.requesterId, memberId), eq(hiqFriendships.receiverId, memberId)),
                    eq(hiqFriendships.status, 'accepted')
                )
            );

        if (friendships.length === 0) return [];

        const friendsData = await Promise.all(friendships.map(async (f) => {
            const friendId = f.requesterId === memberId ? f.receiverId : f.requesterId;
            const friend = await this.getMemberById(friendId);
            if (!friend) return null;

            // Get Head-to-Head Stats
            const h2h = await this.getHeadToHeadStats(memberId, friendId);

            return {
                ...friend,
                h2h,
                status: 'offline' // Placeholder for online status
            };
        }));

        return friendsData.filter(f => f !== null);
    }

    async createFriendship(requesterId: string, receiverId: string): Promise<HiqFriendship> {
        const [result] = await db.insert(hiqFriendships).values({
            requesterId,
            receiverId,
            status: 'accepted', // Auto-accept for MVP simplicity
        }).returning();
        return result;
    }

    async getHeadToHeadStats(myId: string, friendId: string) {
        // H2H calculation from hiqGames
        // Find games where (p1=me AND p2=friend) OR (p1=friend AND p2=me), etc.
        // For simplicity, checking P1 vs P2 slots primarily if current system uses 4 player slots.

        // Query games where both players participated
        const games = await db.select().from(hiqGames).where(
            or(
                and(eq(hiqGames.player1Id, myId), eq(hiqGames.player2Id, friendId)),
                and(eq(hiqGames.player1Id, friendId), eq(hiqGames.player2Id, myId))
            )
        );

        let wins = 0;
        let losses = 0;
        let draws = 0;

        games.forEach(g => {
            if (g.winnerId === myId) wins++;
            else if (g.winnerId === friendId) losses++;
            else draws++; // Simplified draw logic
        });

        return { wins, losses, draws };
    }

    async getHeadToHeadGames(myId: string, friendId: string) {
        return await db.select().from(hiqGames).where(
            or(
                and(eq(hiqGames.player1Id, myId), eq(hiqGames.player2Id, friendId)),
                and(eq(hiqGames.player1Id, friendId), eq(hiqGames.player2Id, myId))
            )
        ).orderBy(desc(hiqGames.playedAt));
    }

    // --- Invite System ---
    async createInvite(hostId: string): Promise<string> {
        // Generate random 6-digit PIN
        // Ensure padding
        const code = Math.floor(100000 + Math.random() * 900000).toString();

        await db.insert(hiqInvites).values({
            code,
            hostId,
            expiresAt: new Date(Date.now() + 1000 * 60 * 5), // 5 min expiry
        });

        return code;
    }

    async getInviteByCode(code: string): Promise<any> {
        // Fetch all entries for this code
        const entries = await db.select().from(hiqInvites)
            .where(and(eq(hiqInvites.code, code), gt(hiqInvites.expiresAt, new Date())));

        if (entries.length === 0) return null;

        const hostEntry = entries.find(e => !e.guestId) || entries[0];
        const guestEntries = entries.filter(e => e.guestId);

        const guests: HiqMember[] = [];
        for (const ge of guestEntries) {
            if (ge.guestId) {
                const g = await this.getMemberById(ge.guestId);
                if (g) guests.push(g);
            }
        }

        return {
            code,
            hostId: hostEntry.hostId,
            guests,
            expiresAt: hostEntry.expiresAt
        };
    }

    async joinInvite(code: string, guestId: string): Promise<boolean> {
        // Find if code exists and is valid
        const [template] = await db.select().from(hiqInvites)
            .where(and(eq(hiqInvites.code, code), isNull(hiqInvites.guestId)));

        if (!template || new Date() > template.expiresAt) return false;

        // Check if already joined
        const [existing] = await db.select().from(hiqInvites)
            .where(and(eq(hiqInvites.code, code), eq(hiqInvites.guestId, guestId)));

        if (existing) return true; // Already in

        // Add new entry for participant
        await db.insert(hiqInvites).values({
            code,
            hostId: template.hostId,
            guestId,
            status: 'accepted',
            expiresAt: template.expiresAt
        });

        return true;
    }

    async claimGameRecord(gameId: string, memberId: string, slotIndex: number): Promise<boolean> {
        const game = await this.getHiqGameById(gameId);
        if (!game) return false;

        const member = await this.getMemberById(memberId);
        if (!member) return false;

        // 1. Update Game Link
        const updateData: any = {};
        // slotIndex 0 -> player2, 1 -> player3, 2 -> player4
        if (slotIndex === 0) { updateData.player2Id = memberId; updateData.player2Name = member.name; }
        else if (slotIndex === 1) { updateData.player3Id = memberId; updateData.player3Name = member.name; }
        else if (slotIndex === 2) { updateData.player4Id = memberId; updateData.player4Name = member.name; }

        await db.update(hiqGames).set(updateData).where(eq(hiqGames.id, gameId));

        // 2. Create History Record if finished
        if (game.status === 'finished') {
            let score = 0;
            const innings = game.totalInnings || 1;

            // Map slotIndex (0, 1, 2) to correct player scores from Game table
            if (slotIndex === 0) score = game.player2FinishScore;
            else if (slotIndex === 1) score = game.player3FinishScore;
            else if (slotIndex === 2) score = game.player4FinishScore;

            const average = (score / innings).toFixed(3);
            const isWinner = game.winnerId === memberId;

            const player1 = await this.getMemberById(game.player1Id);
            const opponentName = player1?.name || "Player 1";

            await db.insert(hiqGameHistory).values({
                memberId,
                gameId,
                gameMode: game.gameMode,
                gameType: game.gameType,
                score,
                innings,
                average,
                isWinner,
                earnedPoints: 0,
                opponentName,
                createdAt: game.playedAt || new Date()
            });
        }

        return true;
    }

    async recordSuccessfulShot(data: InsertHiqSuccessfulShot): Promise<HiqSuccessfulShot> {
        const [shot] = await db.insert(hiqSuccessfulShots).values(data).returning();
        return shot;
    }

    async searchSuccessfulShots(gameType: "3c" | "4c", currentPositions: any, limit: number = 5): Promise<HiqSuccessfulShot[]> {
        const shots = await db.select().from(hiqSuccessfulShots)
            .where(eq(hiqSuccessfulShots.gameType, gameType))
            .orderBy(desc(hiqSuccessfulShots.createdAt))
            .limit(100);

        if (shots.length === 0) return [];

        const scoredShots = shots.map(shot => {
            const dbPos = shot.ballPositions as any;
            const userPos = currentPositions;

            let totalDist = 0;
            const balls = ['white', 'yellow', 'red', 'red2'];
            balls.forEach(color => {
                if (dbPos[color] && userPos[color]) {
                    const dx = dbPos[color].x - userPos[color].x;
                    const dy = dbPos[color].y - userPos[color].y;
                    totalDist += Math.sqrt(dx * dx + dy * dy);
                }
            });
            return { shot, distance: totalDist };
        });

        scoredShots.sort((a, b) => a.distance - b.distance);
        return scoredShots.slice(0, limit).map(s => s.shot);
    }
}
