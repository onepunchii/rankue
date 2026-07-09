import { db } from "../db.js";
import {
    profiles,
    hiqMembers,
    hiqGameHistory,
    hiqFriendships,
    hiqVisitLogs,
    hiqGames
} from "../../shared/schema.js";
import type {
    Profile,
    InsertHiqMember,
    HiqMember
} from "../../shared/schema.js";
import { eq, desc, asc, and, or, sql, gte, inArray } from "drizzle-orm";

export class UserRepository {
    async createProfile(data: Partial<Profile>): Promise<Profile> {
        const [profile] = await db.insert(profiles).values({
            id: crypto.randomUUID(),
            ...data
        } as any).returning();
        return profile;
    }

    async getProfileByPhone(phone: string): Promise<Profile | undefined> {
        const [profile] = await db.select().from(profiles).where(eq(profiles.phone, phone));
        return profile;
    }

    async getProfile(id: string): Promise<Profile | undefined> {
        const [profile] = await db.select().from(profiles).where(eq(profiles.id, id));
        return profile;
    }

    async updateProfile(id: string, data: Partial<Profile>): Promise<Profile> {
        const [updated] = await db.update(profiles)
            .set({ ...data, updatedAt: new Date() })
            .where(eq(profiles.id, id))
            .returning();
        return updated;
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
        let query = db.select().from(hiqMembers);

        if (storeId) {
            query.where(eq(hiqMembers.storeId, storeId));
        }

        const members = await query.orderBy(desc(field)).limit(limit);

        // Calculate Official AVG for each member based on Game History
        const enhancedMembers = await Promise.all(members.map(async (member) => {
            const stats = await db.select({
                totalScore: sql<number>`sum(${hiqGameHistory.score})`,
                totalInnings: sql<number>`sum(${hiqGameHistory.innings})`
            })
                .from(hiqGameHistory)
                .where(and(
                    eq(hiqGameHistory.memberId, member.id),
                    eq(hiqGameHistory.gameType, type),
                    eq(hiqGameHistory.gameMode, 'match'),
                    eq(hiqGameHistory.isRanked, true)
                ));

            const totalScore = Number(stats[0]?.totalScore || 0);
            const totalInnings = Number(stats[0]?.totalInnings || 0);
            const officialAvg = totalInnings > 0
                ? (totalScore / totalInnings).toFixed(3)
                : "0.000";

            return {
                ...member,
                average: officialAvg // Override with official calculated average
            };
        }));

        return enhancedMembers;
    }

    async getAvailableOpponents(storeId: string, currentUserId: string, sport: "BILLIARDS" | "GOLF" = "BILLIARDS"): Promise<HiqMember[]> {
        const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);

        const members = await db
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

        if (sport === 'GOLF') {
            // Filter for Golf players and map stats
            return members
                .filter(m => (m.totalGolfGames > 0 || m.golfBestScore > 0)) // Only show golfers
                .map(m => ({
                    ...m,
                    average: m.golfAvgScore ? m.golfAvgScore.toFixed(1) : "0.0", // Show Golf Avg
                    handi4c: m.golfHandicap || 0, // Reuse handi field for display if needed
                }));
        }

        return members;
    }

    async getAllMembers(storeId: string): Promise<HiqMember[]> {
        return await db
            .select()
            .from(hiqMembers)
            .where(eq(hiqMembers.storeId, storeId))
            .orderBy(sql`${hiqMembers.createdAt} DESC`);
    }

    async getStoreMembersWithStats(storeId: string) {
        const members = await this.getAllMembers(storeId);
        if (members.length === 0) return [];

        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const gameCounts = await db.select({
            memberId: hiqGameHistory.memberId,
            count: sql<number>`count(*)`
        })
            .from(hiqGameHistory)
            .where(and(
                inArray(hiqGameHistory.memberId, members.map(m => m.id)),
                gte(hiqGameHistory.createdAt, startOfMonth)
            ))
            .groupBy(hiqGameHistory.memberId);

        const countMap = new Map(gameCounts.map(c => [c.memberId, Number(c.count)]));

        return members.map(m => ({
            ...m,
            monthlyGameCount: countMap.get(m.id) || 0
        }));
    }

    async getMembersByPhone(phone: string): Promise<HiqMember[]> {
        return await db.select().from(hiqMembers).where(eq(hiqMembers.phone, phone));
    }

    async getFriends(memberId: string, sport: string = "BILLIARDS"): Promise<any[]> {
        const friends = await db.select({
            friend: hiqMembers,
            profile: profiles,
            status: hiqFriendships.status
        })
            .from(hiqFriendships)
            .innerJoin(hiqMembers, or(
                eq(hiqFriendships.receiverId, hiqMembers.id),
                eq(hiqFriendships.requesterId, hiqMembers.id)
            ))
            .leftJoin(profiles, eq(hiqMembers.profileId, profiles.id))
            .where(
                and(
                    or(
                        eq(hiqFriendships.requesterId, memberId),
                        eq(hiqFriendships.receiverId, memberId)
                    ),
                    eq(hiqFriendships.sportCategory, sport as "BILLIARDS" | "GOLF"),
                    sql`${hiqMembers.id} != ${memberId}`
                )
            );

        const result: any[] = [];
        for (const f of friends) {
            const h2h = await this.getHeadToHeadStats(memberId, f.friend.id, sport);
            result.push({
                ...f.friend,
                status: f.status,
                profileImageUrl: f.profile?.profileImageUrl,
                nickname: f.profile?.nickname || f.friend.name,
                h2h: {
                    wins: h2h.myWins,
                    losses: h2h.friendWins,
                    draws: 0
                }
            });
        }
        return result;
    }

    async createFriendship(requesterId: string, receiverId: string, sportCategory: "BILLIARDS" | "GOLF" = "BILLIARDS"): Promise<any> {
        const [friendship] = await db.insert(hiqFriendships).values({
            requesterId,
            receiverId,
            sportCategory,
            status: 'accepted'
        }).returning();
        return friendship;
    }

    async requestFriend(requesterId: string, receiverId: string, sportCategory: "BILLIARDS" | "GOLF" = "BILLIARDS"): Promise<any> {
        return this.createFriendship(requesterId, receiverId, sportCategory);
    }

    async updatePushToken(memberId: string, token: string): Promise<void> {
        const [member] = await db.select().from(hiqMembers).where(eq(hiqMembers.id, memberId));
        if (member && member.profileId) {
            await db.update(profiles)
                .set({ pushToken: token, updatedAt: new Date() })
                .where(eq(profiles.id, member.profileId));
        }
    }

    // --- Private / Shared Helpers ---
    private async getHeadToHeadStats(myId: string, friendId: string, sport: string = "BILLIARDS") {
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
            friendWins: total - myWins, // Simple loss calculation
            winRate: total > 0 ? Math.round((myWins / total) * 100) : 0
        };
    }
}
