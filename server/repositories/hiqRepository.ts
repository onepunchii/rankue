import { db } from "../db.js";
import { hiqStores, hiqMembers, hiqGames, hiqVisitLogs, hiqGameHistory, type HiqStore, type InsertHiqStore, type HiqMember, type InsertHiqMember, type HiqGame, type InsertHiqGame, type HiqGameHistory, type InsertHiqGameHistory } from "../../shared/schema.js";
import { eq, sql, and, desc } from "drizzle-orm";

const HANDICAP_MAP_4C = [
    { avg: 2.0, handi: 250 },
    { avg: 1.5, handi: 200 },
    { avg: 1.2, handi: 150 },
    { avg: 1.0, handi: 120 },
    { avg: 0.8, handi: 100 },
    { avg: 0.5, handi: 80 },
    { avg: 0.3, handi: 50 },
    { avg: 0.0, handi: 30 },
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

    async getTopRankings(storeId: string, limit: number = 10): Promise<HiqMember[]> {
        return await db
            .select()
            .from(hiqMembers)
            .where(eq(hiqMembers.storeId, storeId))
            .orderBy(sql`${hiqMembers.handi4c} DESC`)
            .limit(limit);
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
        const [game] = await db.update(hiqGames).set({
            ...finalData,
            status: "finished",
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
            average: p1Average
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
                average: p2Average
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
                average: p3Average
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
                average: p4Average
            });
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
        }

        return { oldHandi: currentHandi || 0, newHandi: currentHandi || 0, message: null };
    }
}
