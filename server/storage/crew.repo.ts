import { db } from "../db.js";
import {
    hiqCrews,
    hiqCrewMembers,
    hiqMembers,
    hiqCrewActivities,
    hiqCrewActivityParticipants,
    hiqCrewPosts,
    hiqCrewLikes,
    hiqCrewComments,
    hiqCrewPhotos,
    hiqCrewPhotoLikes,
    hiqCrewPhotoComments,
    hiqCrewChats,
    hiqStores,
    profiles,
    hiqGameHistory,
    hiqSettlements,
    hiqSettlementItems,
    hiqSettlementParticipants,
    hiqPolls,
    hiqPollOptions,
    hiqPollVotes
} from "../../shared/schema.js";
import { eq, and, desc, asc, sql, or, gte, like, inArray, ne } from "drizzle-orm";
import { notFound, conflict } from "../utils/errors.js";
import type {
    InsertHiqCrew,
    HiqCrew,
    InsertHiqCrewActivity,
    InsertHiqCrewPost,
    InsertHiqCrewComment,
    InsertHiqCrewPhoto,
    InsertHiqCrewPhotoComment,
    InsertHiqCrewChat,
    InsertHiqPoll,
    InsertHiqPollVote
} from "../../shared/schema.js";

export class CrewRepository {
    async createCrew(data: InsertHiqCrew): Promise<HiqCrew> {
        return await db.transaction(async (tx) => {
            // 1. Create Crew
            const [crew] = await tx.insert(hiqCrews).values(data).returning();

            // 2. Add Leader as Member
            await tx.insert(hiqCrewMembers).values({
                crewId: crew.id,
                memberId: data.leaderId,
                role: 'leader',
            });

            return crew;
        });
    }

    async getCrew(id: string) {
        // 1. Get Crew Details
        const [crew] = await db.select().from(hiqCrews).where(eq(hiqCrews.id, id));
        if (!crew) return null;

        // 2. Get Base Store
        let baseStore = null;
        if (crew.baseStoreId) {
            [baseStore] = await db.select().from(hiqStores).where(eq(hiqStores.id, crew.baseStoreId));
        }

        // 3. Get Members with Role and Profile.
        // SECURITY: whitelist only non-sensitive columns — these two endpoints (GET /crews/:id
        // and /crews/:id/members) are public, so NEVER expose phone, profileId, storeId,
        // marketingAgree, visit/lastVisited, or defaultAccount* (bank/number/holder).
        const membersData = await db.select({
            member: {
                id: hiqMembers.id,
                name: hiqMembers.name,
                birthYear: hiqMembers.birthYear,
                gender: hiqMembers.gender,
                handi3c: hiqMembers.handi3c,
                handi4c: hiqMembers.handi4c,
                average: hiqMembers.average,
                rating3c: hiqMembers.rating3c,
                rating4c: hiqMembers.rating4c,
                avg3c: hiqMembers.avg3c,
                avg4c: hiqMembers.avg4c,
                golfHandicap: hiqMembers.golfHandicap,
                golfBestScore: hiqMembers.golfBestScore,
                golfAvgScore: hiqMembers.golfAvgScore,
                golfGrade: hiqMembers.golfGrade,
                golfGradeVerified: hiqMembers.golfGradeVerified,
                totalGolfGames: hiqMembers.totalGolfGames,
                totalSimPoints: hiqMembers.totalSimPoints,
                introduction: hiqMembers.introduction,
                createdAt: hiqMembers.createdAt,
            },
            profileNickname: profiles.nickname,
            profileImageUrl: profiles.profileImageUrl,
            role: hiqCrewMembers.role,
            joinedAt: hiqCrewMembers.joinedAt,
        })
            .from(hiqCrewMembers)
            .innerJoin(hiqMembers, eq(hiqCrewMembers.memberId, hiqMembers.id))
            .leftJoin(profiles, eq(hiqMembers.profileId, profiles.id))
            .where(eq(hiqCrewMembers.crewId, id));

        // 4a. Batch activity counts for ALL members in ONE grouped query (avoids N+1).
        const isGolfCrew = crew.sportCategory === 'GOLF';
        const activityCountRows = await db.select({
            memberId: hiqCrewActivityParticipants.memberId,
            group1Count: isGolfCrew
                ? sql<number>`SUM(CASE WHEN ${hiqCrewActivities.category} IN ('REGULAR_ROUNDING', 'BLITZ_ROUNDING', 'GOLF_TOUR') THEN 1 ELSE 0 END)`
                : sql<number>`SUM(CASE WHEN ${hiqCrewActivities.category} IN ('REGULAR_BILLIARDS', 'BLITZ_BILLIARDS') THEN 1 ELSE 0 END)`,
            group2Count: isGolfCrew
                ? sql<number>`SUM(CASE WHEN ${hiqCrewActivities.category} IN ('REGULAR_SCREEN', 'BLITZ_SCREEN') THEN 1 ELSE 0 END)`
                : sql<number>`SUM(CASE WHEN ${hiqCrewActivities.category} IN ('BILLIARDS_TOURNAMENT') THEN 1 ELSE 0 END)`,
            group3Count: sql<number>`SUM(CASE WHEN ${hiqCrewActivities.category} IN ('AFTER_PARTY', 'SOCIAL') THEN 1 ELSE 0 END)`,
        })
            .from(hiqCrewActivityParticipants)
            .innerJoin(hiqCrewActivities, eq(hiqCrewActivityParticipants.activityId, hiqCrewActivities.id))
            .where(and(
                eq(hiqCrewActivities.crewId, id),
                eq(hiqCrewActivityParticipants.status, 'joined'),
                sql`${hiqCrewActivities.activityDate} <= NOW()`
            ))
            .groupBy(hiqCrewActivityParticipants.memberId);

        const countsByMember = new Map<string, { group1: number; group2: number; group3: number }>();
        for (const r of activityCountRows) {
            countsByMember.set(r.memberId, {
                group1: Number(r.group1Count || 0),
                group2: Number(r.group2Count || 0),
                group3: Number(r.group3Count || 0),
            });
        }

        // 4b. Enrich members (golf stats only computed for golf/mixed crews).
        const enrichedMembers = await Promise.all(membersData.map(async (data) => {
            const memberObj = { ...data.member };

            // For Golf Crews or Mixed, calculate real-time golf stats
            if (crew.sportCategory === 'GOLF' || crew.sportCategory === 'MIXED') {
                const golfHistory = await db.select()
                    .from(hiqGameHistory)
                    .where(and(
                        eq(hiqGameHistory.memberId, data.member.id),
                        eq(hiqGameHistory.sportCategory, 'GOLF' as any)
                    ))
                    .orderBy(desc(hiqGameHistory.createdAt));

                const validGames = golfHistory.filter(h => h.score > 0);
                if (validGames.length > 0) {
                    const totalScore = validGames.reduce((sum, h) => sum + h.score, 0);
                    const avgScore = totalScore / validGames.length;
                    const bestScore = Math.min(...validGames.map(h => h.score));

                    memberObj.golfAvgScore = avgScore;
                    memberObj.golfBestScore = bestScore;
                    memberObj.totalGolfGames = validGames.length;
                }
            }

            return {
                member: {
                    ...memberObj,
                    nickname: data.profileNickname || data.member.name,
                    profileImageUrl: data.profileImageUrl,
                },
                role: data.role,
                joinedAt: data.joinedAt,
                activityCounts: countsByMember.get(data.member.id) || { group1: 0, group2: 0, group3: 0 },
            };
        }));

        return { crew, baseStore, members: enrichedMembers };
    }

    // Lightweight membership check — single indexed lookup, avoids loading the full enriched crew.
    async getCrewMembership(crewId: string, memberId: string): Promise<{ role: string } | null> {
        const [row] = await db.select({ role: hiqCrewMembers.role })
            .from(hiqCrewMembers)
            .where(and(eq(hiqCrewMembers.crewId, crewId), eq(hiqCrewMembers.memberId, memberId)));
        return row || null;
    }

    // Resolve a poll (id, crewId, isAnonymous) from one of its option ids — for authorization/anonymity checks.
    async getPollByOptionId(optionId: string): Promise<{ id: string; crewId: string; isAnonymous: boolean } | null> {
        const [row] = await db.select({
            id: hiqPolls.id,
            crewId: hiqPolls.crewId,
            isAnonymous: hiqPolls.isAnonymous,
        })
            .from(hiqPollOptions)
            .innerJoin(hiqPolls, eq(hiqPollOptions.pollId, hiqPolls.id))
            .where(eq(hiqPollOptions.id, optionId));
        return row || null;
    }

    async joinCrew(crewId: string, memberId: string, role?: string) {
        // 정원 경합을 막기 위해 크루 행을 FOR UPDATE로 잠근 뒤 세고 넣는다
        // (joinCrewActivity의 maxParticipants 처리와 동일한 패턴).
        return await db.transaction(async (tx) => {
            const [crew] = await tx.select().from(hiqCrews)
                .where(eq(hiqCrews.id, crewId))
                .for('update');
            if (!crew) throw notFound("Crew not found");

            // Check if already joined
            const [existing] = await tx.select().from(hiqCrewMembers)
                .where(and(eq(hiqCrewMembers.crewId, crewId), eq(hiqCrewMembers.memberId, memberId)));

            if (existing) {
                if (existing.role === 'pending') throw conflict("가입 승인 대기 중입니다");
                throw conflict("이미 활동 중인 멤버입니다");
            }

            // Determine Role if not provided
            if (!role) {
                role = crew.joinType === 'approval' ? 'pending' : 'member';
            }

            // 정원 확인. 승인 대기(pending)는 아직 크루원이 아니므로 인원에서 제외한다.
            // maxMembers가 null/0인 옛 크루는 제한 없음으로 취급(기존 데이터를 갑자기 막지 않기 위해).
            const limit = crew.maxMembers ?? 0;
            if (limit > 0) {
                const [row] = await tx.select({ count: sql<number>`count(*)` })
                    .from(hiqCrewMembers)
                    .where(and(eq(hiqCrewMembers.crewId, crewId), ne(hiqCrewMembers.role, 'pending')));
                if (Number(row?.count || 0) >= limit) throw conflict("크루 정원이 가득 찼습니다");
            }

            await tx.insert(hiqCrewMembers).values({
                crewId,
                memberId,
                role,
            });

            return role;
        });
    }

    async updateCrewMemberRole(crewId: string, memberId: string, role: string) {
        await db.update(hiqCrewMembers)
            .set({ role })
            .where(and(eq(hiqCrewMembers.crewId, crewId), eq(hiqCrewMembers.memberId, memberId)));
    }

    async updateCrew(id: string, data: Partial<InsertHiqCrew>) {
        const [crew] = await db.update(hiqCrews)
            .set(data)
            .where(eq(hiqCrews.id, id))
            .returning();
        return crew;
    }

    async leaveCrew(crewId: string, memberId: string) {
        await db.delete(hiqCrewMembers)
            .where(and(eq(hiqCrewMembers.crewId, crewId), eq(hiqCrewMembers.memberId, memberId)));
    }

    async deleteCrew(crewId: string): Promise<void> {
        await db.transaction(async (tx) => {
            // 1. Delete Crew Members
            await tx.delete(hiqCrewMembers).where(eq(hiqCrewMembers.crewId, crewId));

            // 2. Delete Activities & Participants
            const activities = await tx.select({ id: hiqCrewActivities.id }).from(hiqCrewActivities).where(eq(hiqCrewActivities.crewId, crewId));
            if (activities.length > 0) {
                const activityIds = activities.map(a => a.id);
                await tx.delete(hiqCrewActivityParticipants).where(inArray(hiqCrewActivityParticipants.activityId, activityIds));
                await tx.delete(hiqCrewActivities).where(eq(hiqCrewActivities.crewId, crewId));
            }

            // 3. Delete Posts, Likes, Comments
            const posts = await tx.select({ id: hiqCrewPosts.id }).from(hiqCrewPosts).where(eq(hiqCrewPosts.crewId, crewId));
            if (posts.length > 0) {
                const postIds = posts.map(p => p.id);
                await tx.delete(hiqCrewLikes).where(inArray(hiqCrewLikes.postId, postIds));
                await tx.delete(hiqCrewComments).where(inArray(hiqCrewComments.postId, postIds));
                await tx.delete(hiqCrewPosts).where(eq(hiqCrewPosts.crewId, crewId));
            }

            // 4. Delete Photos, Likes, Comments (Photos have cascade in schema, but being safe)
            // Note: Schema says onDelete: 'cascade' provided for likes/comments, so deleting photos might match.
            // But let's delete photos directly. If cascade exists, it handles children.
            await tx.delete(hiqCrewPhotos).where(eq(hiqCrewPhotos.crewId, crewId));

            // 5. Delete Chats
            await tx.delete(hiqCrewChats).where(eq(hiqCrewChats.crewId, crewId));

            // 6. Delete Settlements (and items/participants)
            const settlements = await tx.select({ id: hiqSettlements.id }).from(hiqSettlements).where(eq(hiqSettlements.crewId, crewId));
            if (settlements.length > 0) {
                const settlementIds = settlements.map(s => s.id);
                // Participants and Items likely cascade from Settlement if schema sets it, 
                // but explicit delete is safer given previous issues.

                // Get items to delete participants
                const items = await tx.select({ id: hiqSettlementItems.id }).from(hiqSettlementItems).where(inArray(hiqSettlementItems.settlementId, settlementIds));
                if (items.length > 0) {
                    const itemIds = items.map(i => i.id);
                    await tx.delete(hiqSettlementParticipants).where(inArray(hiqSettlementParticipants.itemId, itemIds));
                    await tx.delete(hiqSettlementItems).where(inArray(hiqSettlementItems.settlementId, settlementIds));
                }

                await tx.delete(hiqSettlements).where(eq(hiqSettlements.crewId, crewId));
            }

            // 7. 크루 본체 — 같은 트랜잭션 안에서 지운다. 밖에서 지우면 이 delete가 실패했을 때
            // 자식 행만 전부 사라지고 멤버 0명짜리 유령 크루가 남는다.
            await tx.delete(hiqCrews).where(eq(hiqCrews.id, crewId));
        });
    }

    async getUserCrews(memberId: string, sportCategory?: string) {
        // First subquery to get counts for all crews user is in
        const memberCounts = db.select({
            crewId: hiqCrewMembers.crewId,
            count: sql<number>`count(${hiqCrewMembers.id})`.as('count')
        })
            .from(hiqCrewMembers)
            .groupBy(hiqCrewMembers.crewId)
            .as('mc');

        return await db.select({
            crew: hiqCrews,
            role: hiqCrewMembers.role,
            joinedAt: hiqCrewMembers.joinedAt,
            memberCount: sql<number>`${memberCounts.count}`
        })
            .from(hiqCrewMembers)
            .innerJoin(hiqCrews, eq(hiqCrewMembers.crewId, hiqCrews.id))
            .leftJoin(memberCounts, eq(hiqCrews.id, memberCounts.crewId))
            .where(
                and(
                    eq(hiqCrewMembers.memberId, memberId),
                    sportCategory ? eq(hiqCrews.sportCategory, sportCategory as any) : undefined
                )
            )
            .orderBy(desc(hiqCrews.createdAt));
    }

    async searchCrews(query?: string, sportCategory?: string, userLat?: number, userLng?: number) {
        // TODO: For high-performance search on large datasets, consider using
        // PostgreSQL Full Text Search (GIN Index) instead of LIKE '%query%'.
        const crewsWithCount = await db.select({
            crew: hiqCrews,
            memberCount: sql<number>`count(${hiqCrewMembers.id})`,
            storeLat: hiqStores.latitude,
            storeLng: hiqStores.longitude
        })
            .from(hiqCrews)
            .leftJoin(hiqCrewMembers, eq(hiqCrews.id, hiqCrewMembers.crewId))
            .leftJoin(hiqStores, eq(hiqCrews.baseStoreId, hiqStores.id))
            .where(
                and(
                    query ? or(
                        like(hiqCrews.name, `%${query}%`),
                        like(hiqCrews.region, `%${query}%`)
                    ) : undefined,
                    sportCategory ? eq(hiqCrews.sportCategory, sportCategory as any) : undefined
                )
            )
            .groupBy(hiqCrews.id, hiqStores.latitude, hiqStores.longitude)
            .limit(50) // Increased limit for location sorting
            .orderBy(desc(hiqCrews.createdAt));

        let results = crewsWithCount.map(r => {
            let lat = r.crew.latitude || r.storeLat;
            let lng = r.crew.longitude || r.storeLng;
            let distance: number | undefined;

            if (userLat && userLng && lat && lng) {
                distance = getDistanceFromLatLonInKm(userLat, userLng, lat, lng);
            }

            return {
                ...r.crew,
                memberCount: Number(r.memberCount),
                distance
            };
        });

        if (userLat && userLng) {
            results.sort((a, b) => {
                // If distance is available, sort by it
                if (a.distance !== undefined && b.distance !== undefined) {
                    return a.distance - b.distance;
                }
                // If only one has distance, prefer it
                if (a.distance !== undefined) return -1;
                if (b.distance !== undefined) return 1;
                return 0;
            });
        }

        return results;
    }

    async getAllCrews(page = 1, limit = 20) {
        const offset = (page - 1) * limit;
        const results = await db.select({
            id: hiqCrews.id,
            name: hiqCrews.name,
            description: hiqCrews.description,
            leaderId: hiqCrews.leaderId,
            baseStoreId: hiqCrews.baseStoreId,
            sportCategory: hiqCrews.sportCategory,
            createdAt: hiqCrews.createdAt,
            memberCount: sql<number>`(SELECT count(*) FROM ${hiqCrewMembers} WHERE ${hiqCrewMembers.crewId} = ${hiqCrews.id})`,
            leaderName: hiqMembers.name,
            storeName: hiqStores.name
        })
            .from(hiqCrews)
            .leftJoin(hiqMembers, eq(hiqCrews.leaderId, hiqMembers.id))
            .leftJoin(hiqStores, eq(hiqCrews.baseStoreId, hiqStores.id))
            .limit(limit)
            .offset(offset)
            .orderBy(desc(hiqCrews.createdAt));

        return results.map(r => ({
            ...r,
            leaderName: r.leaderName || "Unknown",
            storeName: r.storeName || "지역 모임"
        }));
    }

    // --- Crew Activities ---
    async createCrewActivity(data: InsertHiqCrewActivity) {
        const [activity] = await db.insert(hiqCrewActivities).values(data).returning();
        return activity;
    }

    async getCrewActivities(crewId: string) {
        // Sort by date descending (history)
        return await db.select().from(hiqCrewActivities)
            .where(eq(hiqCrewActivities.crewId, crewId))
            .orderBy(desc(hiqCrewActivities.activityDate));
    }

    async getUpcomingCrewActivities(crewId: string) {
        const now = new Date();
        const activities = await db.select().from(hiqCrewActivities)
            .where(and(eq(hiqCrewActivities.crewId, crewId), gte(hiqCrewActivities.activityDate, now)))
            .orderBy(hiqCrewActivities.activityDate)
            .limit(5);

        if (activities.length === 0) return [];

        const activityIds = activities.map(a => a.id);

        // Fetch all participants for these activities in ONE query (Fix N+1)
        const allParticipants = await db.select({
            activityId: hiqCrewActivityParticipants.activityId,
            memberId: hiqCrewActivityParticipants.memberId,
            member: {
                name: hiqMembers.name,
                profileImageUrl: profiles.profileImageUrl,
                gender: hiqMembers.gender,
                avg4c: hiqMembers.avg4c,
                golfAvgScore: hiqMembers.golfAvgScore
            }
        })
            .from(hiqCrewActivityParticipants)
            .innerJoin(hiqMembers, eq(hiqCrewActivityParticipants.memberId, hiqMembers.id))
            .leftJoin(profiles, eq(hiqMembers.profileId, profiles.id))
            .where(inArray(hiqCrewActivityParticipants.activityId, activityIds));

        // Group participants by activityId
        return activities.map(activity => ({
            ...activity,
            participants: allParticipants.filter(p => p.activityId === activity.id)
        }));
    }

    async joinCrewActivity(activityId: string, memberId: string) {
        return await db.transaction(async (tx) => {
            // SELECT ... FOR UPDATE to prevent race conditions on maxParticipants check
            const [activity] = await tx.select().from(hiqCrewActivities)
                .where(eq(hiqCrewActivities.id, activityId))
                .for('update');

            if (!activity) throw notFound("Activity not found");

            const participants = await tx.select().from(hiqCrewActivityParticipants).where(eq(hiqCrewActivityParticipants.activityId, activityId));

            // Only count active participants ('joined')
            const activeParticipants = participants.filter(p => p.status === 'joined');
            if (activeParticipants.length >= (activity.maxParticipants || 999)) {
                throw conflict("정원 초과입니다");
            }

            // Check if already joined
            const existing = participants.find(p => p.memberId === memberId);
            if (existing) throw conflict("이미 참여 중입니다");

            await tx.insert(hiqCrewActivityParticipants).values({
                activityId, memberId, status: 'joined'
            });
        });
    }

    async leaveCrewActivity(activityId: string, memberId: string) {
        await db.delete(hiqCrewActivityParticipants)
            .where(and(
                eq(hiqCrewActivityParticipants.activityId, activityId),
                eq(hiqCrewActivityParticipants.memberId, memberId)
            ));
    }

    async updateCrewActivity(activityId: string, data: Partial<{
        title: string;
        description: string | null;
        activityDate: Date;
        locationName: string | null;
        cost: string | null;
        maxParticipants: number;
        category: string;
    }>) {
        const [updated] = await db.update(hiqCrewActivities)
            .set(data)
            .where(eq(hiqCrewActivities.id, activityId))
            .returning();
        return updated;
    }

    async deleteCrewActivity(activityId: string) {
        await db.transaction(async (tx) => {
            // 참여자 먼저 삭제
            await tx.delete(hiqCrewActivityParticipants)
                .where(eq(hiqCrewActivityParticipants.activityId, activityId));
            // 활동 삭제
            await tx.delete(hiqCrewActivities)
                .where(eq(hiqCrewActivities.id, activityId));
        });
    }

    async getCrewActivity(activityId: string) {
        const [activity] = await db.select().from(hiqCrewActivities)
            .where(eq(hiqCrewActivities.id, activityId));
        return activity || null;
    }

    // 참가자 memberId만 뽑는다. hiqCrewActivities 행에는 participants 컬럼이 없어서
    // getCrewActivity 결과로는 참가자를 알 수 없다(수정·취소 알림이 조용히 스킵되던 원인).
    async getActivityParticipantIds(activityId: string): Promise<string[]> {
        const rows = await db.select({ memberId: hiqCrewActivityParticipants.memberId })
            .from(hiqCrewActivityParticipants)
            .where(eq(hiqCrewActivityParticipants.activityId, activityId));
        return rows.map(r => r.memberId);
    }

    // 멤버별 활동 내역 조회 (페르소나 분석용)
    async getMemberActivities(memberId: string, crewId?: string) {
        const filters = [
            eq(hiqCrewActivityParticipants.memberId, memberId),
            eq(hiqCrewActivityParticipants.status, 'joined'),
            sql`${hiqCrewActivities.activityDate} <= NOW()`
        ];

        if (crewId) {
            filters.push(eq(hiqCrewActivities.crewId, crewId));
        }

        const results = await db.select({
            activityId: hiqCrewActivities.id,
            category: hiqCrewActivities.category,
            title: hiqCrewActivities.title,
            activityDate: hiqCrewActivities.activityDate,
        })
            .from(hiqCrewActivityParticipants)
            .innerJoin(hiqCrewActivities, eq(hiqCrewActivityParticipants.activityId, hiqCrewActivities.id))
            .where(and(...filters))
            .orderBy(desc(hiqCrewActivities.activityDate));

        // category가 null인 activity는 필터 (이전 데이터 호환)
        const activities = results
            .filter(r => r.category)
            .map(r => ({ category: r.category! }));

        return {
            activities,
            totalCount: activities.length
        };
    }

    // --- Community: Posts ---
    async getCrewPosts(crewId: string, currentMemberId?: string) {
        const results = await db.select({
            id: hiqCrewPosts.id,
            crewId: hiqCrewPosts.crewId,
            authorId: hiqCrewPosts.authorId,
            title: hiqCrewPosts.title,
            content: hiqCrewPosts.content,
            category: hiqCrewPosts.category,
            isNotice: hiqCrewPosts.isNotice,
            images: hiqCrewPosts.images,
            createdAt: hiqCrewPosts.createdAt,
            authorName: hiqMembers.name,
            authorProfileImage: profiles.profileImageUrl,
            authorRole: hiqCrewMembers.role,
            likeCount: sql<number>`(SELECT count(*) FROM ${hiqCrewLikes} WHERE ${hiqCrewLikes.postId} = ${hiqCrewPosts.id})`,
            commentCount: sql<number>`(SELECT count(*) FROM ${hiqCrewComments} WHERE ${hiqCrewComments.postId} = ${hiqCrewPosts.id})`,
            isLiked: currentMemberId ? sql<boolean>`EXISTS(SELECT 1 FROM ${hiqCrewLikes} WHERE ${hiqCrewLikes.postId} = ${hiqCrewPosts.id} AND ${hiqCrewLikes.memberId} = ${currentMemberId})` : sql<boolean>`false`
        })
            .from(hiqCrewPosts)
            .innerJoin(hiqMembers, eq(hiqCrewPosts.authorId, hiqMembers.id))
            .leftJoin(profiles, eq(hiqMembers.profileId, profiles.id))
            .leftJoin(hiqCrewMembers, and(
                eq(hiqCrewPosts.crewId, hiqCrewMembers.crewId),
                eq(hiqCrewPosts.authorId, hiqCrewMembers.memberId)
            ))
            .where(eq(hiqCrewPosts.crewId, crewId))
            .orderBy(desc(hiqCrewPosts.isNotice), desc(hiqCrewPosts.createdAt));

        return results.map(r => ({
            ...r,
            author: {
                name: r.authorName,
                profileImageUrl: r.authorProfileImage,
                role: r.authorRole
            }
        }));
    }

    async toggleCrewPostLike(postId: string, memberId: string) {
        const [existing] = await db.select().from(hiqCrewLikes)
            .where(and(eq(hiqCrewLikes.postId, postId), eq(hiqCrewLikes.memberId, memberId)));

        if (existing) {
            await db.delete(hiqCrewLikes).where(eq(hiqCrewLikes.id, existing.id));
            return { liked: false };
        } else {
            await db.insert(hiqCrewLikes).values({ postId, memberId });
            return { liked: true };
        }
    }

    async getCrewPost(postId: string) {
        const [post] = await db.select().from(hiqCrewPosts).where(eq(hiqCrewPosts.id, postId));
        return post;
    }

    async deleteCrewPost(postId: string) {
        // Child rows (likes, comments) have no ON DELETE CASCADE, so remove them first
        // inside a transaction — otherwise deleting an engaged post throws an FK violation.
        await db.transaction(async (tx) => {
            await tx.delete(hiqCrewLikes).where(eq(hiqCrewLikes.postId, postId));
            await tx.delete(hiqCrewComments).where(eq(hiqCrewComments.postId, postId));
            await tx.delete(hiqCrewPosts).where(eq(hiqCrewPosts.id, postId));
        });
    }

    async createCrewPost(data: InsertHiqCrewPost) {
        return await db.transaction(async (tx) => {
            const [post] = await tx.insert(hiqCrewPosts).values(data).returning();

            // Sync to Photo Album
            if (data.images && Array.isArray(data.images) && data.images.length > 0) {
                for (const url of data.images) {
                    await tx.insert(hiqCrewPhotos).values({
                        crewId: post.crewId,
                        uploaderId: post.authorId,
                        url: url,
                        caption: post.title
                    });
                }
            }
            return post;
        });
    }

    async getCrewPostComments(postId: string) {
        const rows = await db.select({
            comment: hiqCrewComments,
            authorName: hiqMembers.name,
            authorProfileImage: profiles.profileImageUrl
        })
            .from(hiqCrewComments)
            .innerJoin(hiqMembers, eq(hiqCrewComments.authorId, hiqMembers.id))
            .leftJoin(profiles, eq(hiqMembers.profileId, profiles.id))
            .where(eq(hiqCrewComments.postId, postId))
            .orderBy(hiqCrewComments.createdAt);

        return rows.map(row => ({
            ...row.comment,
            author: {
                name: row.authorName,
                profileImageUrl: row.authorProfileImage
            }
        }));
    }

    async getCrewComment(commentId: string) {
        const [comment] = await db.select().from(hiqCrewComments).where(eq(hiqCrewComments.id, commentId));
        return comment;
    }

    async deleteCrewComment(commentId: string) {
        await db.delete(hiqCrewComments).where(eq(hiqCrewComments.id, commentId));
    }

    async createCrewPostComment(data: InsertHiqCrewComment) {
        const [comment] = await db.insert(hiqCrewComments).values(data).returning();
        return comment;
    }

    // --- Community: Photos ---
    async getCrewPhotos(crewId: string, currentMemberId?: string) {
        const results = await db.select({
            id: hiqCrewPhotos.id,
            crewId: hiqCrewPhotos.crewId,
            uploaderId: hiqCrewPhotos.uploaderId,
            url: hiqCrewPhotos.url,
            createdAt: hiqCrewPhotos.createdAt,
            uploaderName: hiqMembers.name,
            uploaderProfileImage: profiles.profileImageUrl,
            likeCount: sql<number>`(SELECT count(*) FROM ${hiqCrewPhotoLikes} WHERE ${hiqCrewPhotoLikes.photoId} = ${hiqCrewPhotos.id})`,
            commentCount: sql<number>`(SELECT count(*) FROM ${hiqCrewPhotoComments} WHERE ${hiqCrewPhotoComments.photoId} = ${hiqCrewPhotos.id})`,
            isLiked: currentMemberId ? sql<boolean>`EXISTS(SELECT 1 FROM ${hiqCrewPhotoLikes} WHERE ${hiqCrewPhotoLikes.photoId} = ${hiqCrewPhotos.id} AND ${hiqCrewPhotoLikes.memberId} = ${currentMemberId})` : sql<boolean>`false`
        })
            .from(hiqCrewPhotos)
            .innerJoin(hiqMembers, eq(hiqCrewPhotos.uploaderId, hiqMembers.id))
            .leftJoin(profiles, eq(hiqMembers.profileId, profiles.id))
            .where(eq(hiqCrewPhotos.crewId, crewId))
            .orderBy(desc(hiqCrewPhotos.createdAt));

        return results.map(r => ({
            ...r,
            author: {
                name: r.uploaderName,
                profileImageUrl: r.uploaderProfileImage
            }
        }));
    }

    async getCrewPhoto(photoId: string) {
        const [photo] = await db.select().from(hiqCrewPhotos).where(eq(hiqCrewPhotos.id, photoId));
        return photo;
    }

    async deleteCrewPhoto(photoId: string) {
        await db.delete(hiqCrewPhotos).where(eq(hiqCrewPhotos.id, photoId));
    }

    async createCrewPhoto(data: InsertHiqCrewPhoto) {
        const [photo] = await db.insert(hiqCrewPhotos).values(data).returning();
        return photo;
    }

    async toggleCrewPhotoLike(photoId: string, memberId: string) {
        const [existing] = await db.select().from(hiqCrewPhotoLikes)
            .where(and(eq(hiqCrewPhotoLikes.photoId, photoId), eq(hiqCrewPhotoLikes.memberId, memberId)));

        if (existing) {
            await db.delete(hiqCrewPhotoLikes).where(eq(hiqCrewPhotoLikes.id, existing.id));
            return { liked: false };
        } else {
            await db.insert(hiqCrewPhotoLikes).values({ photoId, memberId });
            return { liked: true };
        }
    }

    async getCrewPhotoComments(photoId: string) {
        const rows = await db.select({
            comment: hiqCrewPhotoComments,
            authorName: hiqMembers.name,
            authorProfileImage: profiles.profileImageUrl
        })
            .from(hiqCrewPhotoComments)
            .innerJoin(hiqMembers, eq(hiqCrewPhotoComments.authorId, hiqMembers.id))
            .leftJoin(profiles, eq(hiqMembers.profileId, profiles.id))
            .where(eq(hiqCrewPhotoComments.photoId, photoId))
            .orderBy(hiqCrewPhotoComments.createdAt);

        return rows.map(row => ({
            ...row.comment,
            author: {
                name: row.authorName,
                profileImageUrl: row.authorProfileImage
            }
        }));
    }

    async getCrewPhotoComment(commentId: string) {
        const [comment] = await db.select().from(hiqCrewPhotoComments).where(eq(hiqCrewPhotoComments.id, commentId));
        return comment;
    }

    async deleteCrewPhotoComment(commentId: string) {
        await db.delete(hiqCrewPhotoComments).where(eq(hiqCrewPhotoComments.id, commentId));
    }

    async createCrewPhotoComment(data: InsertHiqCrewPhotoComment) {
        const [comment] = await db.insert(hiqCrewPhotoComments).values(data).returning();
        return comment;
    }

    // --- Community: Chats ---
    async getCrewChats(crewId: string, memberId?: string) {
        let joinedAt: Date | undefined;

        if (memberId) {
            const [membership] = await db.select({ joinedAt: hiqCrewMembers.joinedAt })
                .from(hiqCrewMembers)
                .where(and(eq(hiqCrewMembers.crewId, crewId), eq(hiqCrewMembers.memberId, memberId)));

            if (membership) {
                joinedAt = membership.joinedAt;
            } else {
                // Not a member - return empty array
                return [];
            }
        }

        const rows = await db.select({
            chat: hiqCrewChats,
            senderName: hiqMembers.name,
            senderProfileImage: profiles.profileImageUrl
        })
            .from(hiqCrewChats)
            .innerJoin(hiqMembers, eq(hiqCrewChats.senderId, hiqMembers.id))
            .leftJoin(profiles, eq(hiqMembers.profileId, profiles.id))
            .where(and(
                eq(hiqCrewChats.crewId, crewId),
                joinedAt ? gte(hiqCrewChats.createdAt, joinedAt) : undefined
            ))
            .orderBy(desc(hiqCrewChats.createdAt))
            .limit(100);

        const chatList = rows.map(row => ({
            ...row.chat,
            sender: {
                name: row.senderName,
                profileImageUrl: row.senderProfileImage
            }
        }));

        // Return in chronological order (Oldest at top, Newest at bottom)
        return chatList.reverse();
    }

    async getCrewChat(chatId: string) {
        const [chat] = await db.select().from(hiqCrewChats).where(eq(hiqCrewChats.id, chatId));
        return chat;
    }

    async deleteCrewChat(chatId: string) {
        await db.delete(hiqCrewChats).where(eq(hiqCrewChats.id, chatId));
    }

    async createCrewChat(data: InsertHiqCrewChat) {
        const [chat] = await db.insert(hiqCrewChats).values(data).returning();
        return chat;
    }
    async createPoll(data: InsertHiqPoll, options: string[]) {
        return await db.transaction(async (tx) => {
            const [poll] = await tx.insert(hiqPolls).values(data).returning();

            if (options.length > 0) {
                await tx.insert(hiqPollOptions).values(
                    options.map(text => ({ pollId: poll.id, text }))
                );
            }

            return poll;
        });
    }

    async getCrewPolls(crewId: string, memberId?: string) {
        const polls = await db.select({
            poll: hiqPolls,
            author: {
                id: hiqMembers.id,
                name: hiqMembers.name,
                profileImageUrl: profiles.profileImageUrl
            }
        })
            .from(hiqPolls)
            .innerJoin(hiqMembers, eq(hiqPolls.authorId, hiqMembers.id))
            .leftJoin(profiles, eq(hiqMembers.profileId, profiles.id))
            .where(eq(hiqPolls.crewId, crewId))
            .orderBy(desc(hiqPolls.createdAt));

        return await Promise.all(polls.map(async (p) => {
            const options = await db.select({
                id: hiqPollOptions.id,
                text: hiqPollOptions.text,
                voteCount: sql<number>`count(${hiqPollVotes.id})`
            })
                .from(hiqPollOptions)
                .leftJoin(hiqPollVotes, eq(hiqPollOptions.id, hiqPollVotes.optionId))
                .where(eq(hiqPollOptions.pollId, p.poll.id))
                .groupBy(hiqPollOptions.id, hiqPollOptions.text)
                .orderBy(asc(hiqPollOptions.createdAt));

            const myVotes = memberId
                ? await db.select({ optionId: hiqPollVotes.optionId })
                    .from(hiqPollVotes)
                    .where(and(eq(hiqPollVotes.pollId, p.poll.id), eq(hiqPollVotes.memberId, memberId)))
                : [];

            return {
                ...p.poll,
                author: p.author,
                options: options.map(o => ({ ...o, voteCount: Number(o.voteCount) })),
                myVoteIds: myVotes.map(v => v.optionId),
                totalVotes: options.reduce((sum, o) => sum + Number(o.voteCount), 0)
            };
        }));
    }

    async votePoll(pollId: string, optionId: string, memberId: string) {
        const [poll] = await db.select().from(hiqPolls).where(eq(hiqPolls.id, pollId));
        if (!poll) throw notFound("Poll not found");
        if (poll.status === 'closed') throw conflict("Poll is closed");
        // Enforce the deadline server-side — 'status' is never flipped to 'closed' anywhere,
        // so endTime is the real source of truth for whether voting is open.
        if (poll.endTime && poll.endTime < new Date()) throw conflict("Poll is closed");

        return await db.transaction(async (tx) => {
            // Check whether the member already voted for THIS option FIRST (before any delete),
            // so a single-choice re-tap on the same option correctly toggles OFF.
            const [existing] = await tx.select().from(hiqPollVotes)
                .where(and(eq(hiqPollVotes.optionId, optionId), eq(hiqPollVotes.memberId, memberId)));

            if (existing) {
                // Toggle OFF
                await tx.delete(hiqPollVotes).where(eq(hiqPollVotes.id, existing.id));
                return { voted: false };
            }

            // Toggle ON. For single-choice polls, clear the member's other votes first.
            if (!poll.allowMultiple) {
                await tx.delete(hiqPollVotes)
                    .where(and(eq(hiqPollVotes.pollId, pollId), eq(hiqPollVotes.memberId, memberId)));
            }
            await tx.insert(hiqPollVotes).values({ pollId, optionId, memberId });
            return { voted: true };
        });
    }

    async deletePoll(pollId: string) {
        await db.delete(hiqPolls).where(eq(hiqPolls.id, pollId));
    }

    async getPollVotes(optionId: string) {
        return await db.select({
            id: hiqMembers.id,
            name: hiqMembers.name,
            profileImageUrl: profiles.profileImageUrl
        })
            .from(hiqPollVotes)
            .innerJoin(hiqMembers, eq(hiqPollVotes.memberId, hiqMembers.id))
            .leftJoin(profiles, eq(hiqMembers.profileId, profiles.id))
            .where(eq(hiqPollVotes.optionId, optionId));
    }
}

function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    var R = 6371; // Radius of the earth in km
    var dLat = deg2rad(lat2 - lat1);  // deg2rad below
    var dLon = deg2rad(lon2 - lon1);
    var a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2)
        ;
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c; // Distance in km
    return d;
}

function deg2rad(deg: number) {
    return deg * (Math.PI / 180)
}
