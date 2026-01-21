import { db } from "../db.js";
import { hiqStores, hiqMembers, hiqGames, hiqVisitLogs, hiqGameHistory, hiqFriendships, hiqInvites } from "../../shared/schema.js";
import type { HiqStore, InsertHiqStore, HiqMember, InsertHiqMember, HiqGame, InsertHiqGame, HiqGameHistory, InsertHiqGameHistory, HiqFriendship } from "../../shared/schema.js";
import { eq, desc, and, or, sql, gt, isNull } from "drizzle-orm";

// Search users by nickname, ID, or phone
export async function searchUsers(keyword: string, currentUserId: string): Promise<any[]> {
    // Remove hyphens from phone numbers for comparison
    const cleanKeyword = keyword.replace(/-/g, '');

    // Get current user's friends to mark them
    const friendships = await db.select()
        .from(hiqFriendships)
        .where(
            or(
                eq(hiqFriendships.senderId, currentUserId),
                eq(hiqFriendships.receiverId, currentUserId)
            )
        );

    const friendIds = friendships.map(f =>
        f.senderId === currentUserId ? f.receiverId : f.senderId
    );

    // Search users
    const users = await db.select()
        .from(hiqMembers)
        .where(
            and(
                sql`${hiqMembers.id} != ${currentUserId}`, // Exclude self
                or(
                    sql`${hiqMembers.name} ILIKE ${'%' + keyword + '%'}`, // Nickname partial match
                    eq(hiqMembers.id, keyword), // ID exact match
                    sql`REPLACE(${hiqMembers.phone}, '-', '') = ${cleanKeyword}` // Phone exact match
                )
            )
        )
        .limit(10);

    // Check if user has played with this person
    const results = await Promise.all(users.map(async (user) => {
        const gamesPlayed = await db.select()
            .from(hiqGames)
            .where(
                and(
                    eq(hiqGames.gameMode, "match"),
                    or(
                        and(
                            eq(hiqGames.player1Id, currentUserId),
                            or(
                                eq(hiqGames.player2Id, user.id),
                                eq(hiqGames.player3Id, user.id),
                                eq(hiqGames.player4Id, user.id)
                            )
                        ),
                        and(
                            eq(hiqGames.player1Id, user.id),
                            or(
                                eq(hiqGames.player2Id, currentUserId),
                                eq(hiqGames.player3Id, currentUserId),
                                eq(hiqGames.player4Id, currentUserId)
                            )
                        )
                    )
                )
            )
            .limit(1);

        return {
            ...user,
            isFriend: friendIds.includes(user.id),
            hasPlayedTogether: gamesPlayed.length > 0
        };
    }));

    return results;
}

// Get Recent Opponents (last 7 days, not friends yet)
export async function getRecentOpponents(currentUserId: string): Promise<any[]> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Get current user's friends
    const friendships = await db.select()
        .from(hiqFriendships)
        .where(
            or(
                eq(hiqFriendships.senderId, currentUserId),
                eq(hiqFriendships.receiverId, currentUserId)
            )
        );

    const friendIds = friendships.map(f =>
        f.senderId === currentUserId ? f.receiverId : f.senderId
    );

    // Get recent match games
    const recentGames = await db.select()
        .from(hiqGames)
        .where(
            and(
                eq(hiqGames.gameMode, "match"),
                eq(hiqGames.status, "finished"),
                gt(hiqGames.playedAt, sevenDaysAgo),
                or(
                    eq(hiqGames.player1Id, currentUserId),
                    eq(hiqGames.player2Id, currentUserId),
                    eq(hiqGames.player3Id, currentUserId),
                    eq(hiqGames.player4Id, currentUserId)
                )
            )
        )
        .orderBy(desc(hiqGames.playedAt));

    // Extract opponent IDs and get their info
    const opponentMap = new Map<string, any>();

    for (const game of recentGames) {
        const opponentIds = [
            game.player1Id, game.player2Id, game.player3Id, game.player4Id
        ].filter(id => id && id !== currentUserId);

        for (const opponentId of opponentIds) {
            if (friendIds.includes(opponentId)) continue; // Skip friends
            if (opponentMap.has(opponentId)) continue; // Already added

            const [opponent] = await db.select().from(hiqMembers).where(eq(hiqMembers.id, opponentId));
            if (opponent) {
                // Get last game result
                const myScore = game.player1Id === currentUserId ? game.player1Score :
                    game.player2Id === currentUserId ? game.player2Score :
                        game.player3Id === currentUserId ? game.player3Score :
                            game.player4Score;

                const theirScore = game.player1Id === opponentId ? game.player1Score :
                    game.player2Id === opponentId ? game.player2Score :
                        game.player3Id === opponentId ? game.player3Score :
                            game.player4Score;

                opponentMap.set(opponentId, {
                    ...opponent,
                    lastGameScore: `${myScore} : ${theirScore}`,
                    lastGameResult: myScore > theirScore ? 'win' : myScore < theirScore ? 'loss' : 'draw',
                    playedAt: game.playedAt
                });
            }
        }
    }

    return Array.from(opponentMap.values()).slice(0, 10);
}
