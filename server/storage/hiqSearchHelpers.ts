import { db } from "../db.js";
import { profiles, hiqStores, hiqMembers, hiqGames, hiqVisitLogs, hiqGameHistory, hiqFriendships, hiqInvites, golfMatchSessions } from "../../shared/schema.js";
import type { HiqStore, InsertHiqStore, HiqMember, InsertHiqMember, HiqGame, InsertHiqGame, HiqGameHistory, InsertHiqGameHistory, HiqFriendship } from "../../shared/schema.js";
import { eq, desc, and, or, sql, gt, isNull, inArray } from "drizzle-orm";

// Search users by nickname, ID, or phone
export async function searchUsers(keyword: string, currentUserId: string, sport: "BILLIARDS" | "GOLF" = "BILLIARDS"): Promise<any[]> {
    // Remove hyphens from phone numbers for comparison
    const cleanKeyword = keyword.replace(/[^0-9]/g, '');

    // Get current user's friends to mark them
    const friendships = await db.select()
        .from(hiqFriendships)
        .where(
            and(
                or(
                    eq(hiqFriendships.requesterId, currentUserId),
                    eq(hiqFriendships.receiverId, currentUserId)
                ),
                eq(hiqFriendships.sportCategory, sport)
            )
        );

    const friendIds = friendships.map(f =>
        f.requesterId === currentUserId ? f.receiverId : f.requesterId
    );

    // Build search conditions
    const searchConditions: any[] = [
        sql`${hiqMembers.name} ILIKE ${'%' + keyword + '%'}`, // Nickname
        // @핸들 검색 — 동명이인 구분용 유니크 아이디('@' 붙여 검색해도 매칭)
        sql`${profiles.handle} ILIKE ${'%' + keyword.replace(/^@/, '') + '%'}`
    ];

    // Only search by ID if keyword is a valid UUID (prevents 22P02 error)
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(keyword);
    if (isUuid) {
        searchConditions.push(eq(hiqMembers.id, keyword));
    }

    // Only search phone if there are digits (prevents '%%' matching everything)
    if (cleanKeyword.length > 0) {
        searchConditions.push(
            sql`REPLACE(REPLACE(${hiqMembers.phone}, '-', ''), ' ', '') LIKE ${'%' + cleanKeyword + '%'}`
        );
    }

    // Search users
    const users = await db.select({
        member: hiqMembers,
        profileImageUrl: profiles.profileImageUrl,
        nickname: profiles.nickname,
        handle: profiles.handle,
        countryCode: profiles.countryCode
    })
        .from(hiqMembers)
        .leftJoin(profiles, eq(hiqMembers.profileId, profiles.id))
        .where(or(...searchConditions))
        .limit(10);

    // Check if user has played with this person
    const results = await Promise.all(users.map(async (u) => {
        let hasPlayedTogether = false;
        const user = {
            ...u.member,
            profileImageUrl: u.profileImageUrl,
            nickname: u.nickname || u.member.name,
            handle: u.handle ?? null,
            countryCode: u.countryCode ?? null
        };

        if (sport === "GOLF") {
            const [session] = await db.select()
                .from(golfMatchSessions)
                .where(
                    and(
                        eq(golfMatchSessions.status, 'finished'),
                        // Check if both players exist in the players array
                        sql`${golfMatchSessions.players} @> ${JSON.stringify([{ memberId: currentUserId }])}::jsonb`,
                        sql`${golfMatchSessions.players} @> ${JSON.stringify([{ memberId: user.id }])}::jsonb`
                    )
                )
                .limit(1);
            hasPlayedTogether = !!session;
        } else {
            const gamesPlayed = await db.select()
                .from(hiqGames)
                .where(
                    and(
                        eq(hiqGames.gameMode, "match"),
                        eq(hiqGames.sportCategory, sport),
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
            hasPlayedTogether = gamesPlayed.length > 0;
        }

        return {
            ...user,
            isFriend: friendIds.includes(user.id),
            hasPlayedTogether
        };
    }));

    console.log(`[Search] Keyword: "${keyword}", Clean: "${cleanKeyword}", Found: ${users.length}`);
    return results;
}

// Get Recent Opponents (last 7 days, not friends yet)
export async function getRecentOpponents(currentUserId: string, sport: "BILLIARDS" | "GOLF" = "BILLIARDS"): Promise<any[]> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Get current user's friends
    const friendships = await db.select()
        .from(hiqFriendships)
        .where(
            and(
                or(
                    eq(hiqFriendships.requesterId, currentUserId),
                    eq(hiqFriendships.receiverId, currentUserId)
                ),
                eq(hiqFriendships.sportCategory, sport)
            )
        );

    const friendIds = friendships.map(f =>
        f.requesterId === currentUserId ? f.receiverId : f.requesterId
    );

    const opponentMap = new Map<string, any>();

    if (sport === "GOLF") {
        // --- Golf Logic ---
        const recentSessions = await db.select()
            .from(golfMatchSessions)
            .where(
                and(
                    inArray(golfMatchSessions.status, ['finished', 'playing']),
                    gt(golfMatchSessions.updatedAt, sevenDaysAgo)
                )
            )
            .orderBy(desc(golfMatchSessions.updatedAt));

        for (const session of recentSessions) {
            const players = session.players as any[];
            // Find me
            const meIndex = players.findIndex(p => p.memberId === currentUserId);
            if (meIndex === -1) continue;

            const me = players[meIndex];
            const opponents = players.filter(p => p.memberId && p.memberId !== currentUserId);

            for (const opp of opponents) {
                if (friendIds.includes(opp.memberId)) continue;
                if (opponentMap.has(opp.memberId)) continue;

                const [opponentData] = await db.select({
                    member: hiqMembers,
                    profileImageUrl: profiles.profileImageUrl,
                    nickname: profiles.nickname
                })
                    .from(hiqMembers)
                    .leftJoin(profiles, eq(hiqMembers.profileId, profiles.id))
                    .where(eq(hiqMembers.id, opp.memberId));

                if (opponentData) {
                    const opponentMember = {
                        ...opponentData.member,
                        profileImageUrl: opponentData.profileImageUrl,
                        nickname: opponentData.nickname || opponentData.member.name
                    };
                    const myTotal = me.scores ? me.scores.reduce((a: number, b: number) => a + (b || 0), 0) : 0;
                    const oppTotal = opp.scores ? opp.scores.reduce((a: number, b: number) => a + (b || 0), 0) : 0;

                    opponentMap.set(opp.memberId, {
                        ...opponentMember,
                        lastGameScore: `${myTotal} : ${oppTotal}`,
                        // Golf: Lower is better
                        lastGameResult: myTotal < oppTotal ? 'win' : myTotal > oppTotal ? 'loss' : 'draw',
                        playedAt: session.updatedAt
                    });
                }
            }
        }

    } else {
        // --- Billiards Logic ---
        const recentGames = await db.select()
            .from(hiqGames)
            .where(
                and(
                    eq(hiqGames.gameMode, "match"),
                    eq(hiqGames.status, "finished"),
                    eq(hiqGames.sportCategory, sport),
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

        for (const game of recentGames) {
            const opponentIds = [
                game.player1Id, game.player2Id, game.player3Id, game.player4Id
            ].filter(id => id && id !== currentUserId);

            for (const opponentId of opponentIds) {
                if (friendIds.includes(opponentId)) continue; // Skip friends
                if (opponentMap.has(opponentId)) continue; // Already added

                const [opponentData] = await db.select({
                    member: hiqMembers,
                    profileImageUrl: profiles.profileImageUrl,
                    nickname: profiles.nickname
                })
                    .from(hiqMembers)
                    .leftJoin(profiles, eq(hiqMembers.profileId, profiles.id))
                    .where(eq(hiqMembers.id, opponentId));

                if (opponentData) {
                    const opponent = {
                        ...opponentData.member,
                        profileImageUrl: opponentData.profileImageUrl,
                        nickname: opponentData.nickname || opponentData.member.name
                    };
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
    }

    return Array.from(opponentMap.values()).slice(0, 10);
}
