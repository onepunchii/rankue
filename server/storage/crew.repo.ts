import { db } from "../db.js";
import { alias } from "drizzle-orm/pg-core";
import {
    storeListings,
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
    hiqPollVotes,
    hiqBlocks
} from "../../shared/schema.js";
import { eq, and, desc, asc, sql, or, gte, lt, like, inArray, ne } from "drizzle-orm";
import { notFound, conflict } from "../utils/errors.js";
import { msg } from "../lib/i18n.js";
import { upcomingActivityCutoff } from "../../shared/crewActivity.js";
import { CREW_NOTICES_MAX, imageUrlList, type CrewCursor } from "../../shared/crewBoard.js";
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

// 차단 필터 — viewer 가 차단한 사람의 크루 글·댓글·사진·채팅을 숨긴다 (Apple 1.2 / Play UGC).
// community.repo 와 같은 규칙: 목록·댓글·카운트 모든 조회에 횡단 적용한다. 한쪽 방향(차단한 사람만
// 안 보임)이라 크루 운영진의 관리 화면이나 상대방 화면은 그대로다.
const notBlockedBy = (viewerId: string | undefined, authorCol: any) =>
    viewerId
        ? sql`NOT EXISTS (SELECT 1 FROM ${hiqBlocks} WHERE ${hiqBlocks.blockerId} = ${viewerId} AND ${hiqBlocks.blockedId} = ${authorCol})`
        : sql`true`;

// 쪽 나누기 정렬·비교는 밀리초로 자른 작성 시각 기준 — DB 는 마이크로초까지 두는데 커서(JS Date/ISO)는 밀리초라,
// 그대로 비교하면 같은 밀리초 안의 글이 경계에서 빠지거나 두 번 나온다. id 를 두 번째 열쇠로 둬 동률을 가른다.
const msTrunc = (col: any) => sql`date_trunc('milliseconds', ${col})`;
// 커서가 없으면 조건 없음. ISO('...Z')를 timestamp(시간대 없음)로 캐스팅하면 Z 가 무시돼 UTC 벽시계 그대로 비교된다 —
// 이 표의 시각은 UTC 벽시계로 저장돼 있다(Date 를 파라미터로 넘기면 드라이버가 서버 시간대로 바꿀 수 있어 문자열로 넘긴다).
const cursorBefore = (createdCol: any, idCol: any, cursor?: CrewCursor | null) =>
    cursor ? sql`(${msTrunc(createdCol)}, ${idCol}) < (${cursor.createdAt}::timestamp, ${cursor.id}::uuid)` : sql`true`;

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

        // 2. Get Base Store — 파트너 매장 우선, 없으면 디렉토리(storeListings) 베이스
        let baseStore = null;
        if (crew.baseStoreId) {
            [baseStore] = await db.select().from(hiqStores).where(eq(hiqStores.id, crew.baseStoreId));
        }
        let baseListing: { code: string; name: string; address: string } | null = null;
        if (!baseStore && (crew as any).baseListingCode) {
            const { storeListings } = await import("../../shared/schema.js");
            [baseListing = null] = await db.select({
                code: storeListings.code, name: storeListings.name, address: storeListings.address,
            }).from(storeListings).where(eq(storeListings.code, (crew as any).baseListingCode));
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

        return { crew, baseStore, baseListing, members: enrichedMembers };
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
            if (!crew) throw notFound(msg("err.crewRepo.notFound"));

            // Check if already joined
            const [existing] = await tx.select().from(hiqCrewMembers)
                .where(and(eq(hiqCrewMembers.crewId, crewId), eq(hiqCrewMembers.memberId, memberId)));

            if (existing) {
                if (existing.role === 'pending') throw conflict(msg("err.crewRepo.pendingApproval"));
                throw conflict(msg("err.crewRepo.alreadyMember"));
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
                if (Number(row?.count || 0) >= limit) throw conflict(msg("err.crewRepo.full"));
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

    // 크루명 중복 검사 — 대소문자·양끝 공백 무시. excludeId는 자기 자신 이름 유지용(PATCH).
    async findCrewByName(name: string, excludeId?: string) {
        const conds: any[] = [sql`lower(trim(${hiqCrews.name})) = lower(trim(${name}))`];
        if (excludeId) conds.push(ne(hiqCrews.id, excludeId));
        const [row] = await db.select({ id: hiqCrews.id }).from(hiqCrews).where(and(...conds)).limit(1);
        return row;
    }

    // 승인제 → 자동 전환 시 기존 대기자 일괄 승격 — 신청(joinedAt) 순서대로 정원
    // 잔여만큼만 pending → member. 초과분은 pending 유지. 승격된 memberId 목록을 반환.
    async promotePendingMembers(crewId: string): Promise<string[]> {
        return await db.transaction(async (tx) => {
            const [crew] = await tx.select().from(hiqCrews)
                .where(eq(hiqCrews.id, crewId))
                .for('update');
            if (!crew) return [];

            const pending = await tx.select().from(hiqCrewMembers)
                .where(and(eq(hiqCrewMembers.crewId, crewId), eq(hiqCrewMembers.role, 'pending')))
                .orderBy(asc(hiqCrewMembers.joinedAt));
            if (!pending.length) return [];

            const limit = crew.maxMembers ?? 0;
            let room = pending.length;
            if (limit > 0) {
                const [row] = await tx.select({ count: sql<number>`count(*)` })
                    .from(hiqCrewMembers)
                    .where(and(eq(hiqCrewMembers.crewId, crewId), ne(hiqCrewMembers.role, 'pending')));
                room = Math.max(0, limit - Number(row?.count || 0));
            }

            const toPromote = pending.slice(0, room);
            if (!toPromote.length) return [];
            await tx.update(hiqCrewMembers)
                .set({ role: 'member' })
                .where(inArray(hiqCrewMembers.id, toPromote.map(p => p.id)));
            return toPromote.map(p => p.memberId);
        });
    }

    // 가입 승인 — joinCrew와 동일하게 크루 행을 FOR UPDATE로 잠그고 정원을 센다.
    // 라우트에서 조회-후-갱신하면 동시 승인 두 건이 같은 잔여 정원을 보고 초과 승인된다.
    async approveCrewMember(crewId: string, memberId: string) {
        return await db.transaction(async (tx) => {
            const [crew] = await tx.select().from(hiqCrews)
                .where(eq(hiqCrews.id, crewId))
                .for('update');
            if (!crew) throw notFound(msg("err.crewRepo.notFound"));

            const [target] = await tx.select().from(hiqCrewMembers)
                .where(and(eq(hiqCrewMembers.crewId, crewId), eq(hiqCrewMembers.memberId, memberId)));
            if (!target) throw notFound(msg("err.crewRepo.targetNotFound"));
            if (target.role !== 'pending') throw conflict(msg("err.crewRepo.alreadyApproved"));

            const limit = crew.maxMembers ?? 0;
            if (limit > 0) {
                const [row] = await tx.select({ count: sql<number>`count(*)` })
                    .from(hiqCrewMembers)
                    .where(and(eq(hiqCrewMembers.crewId, crewId), ne(hiqCrewMembers.role, 'pending')));
                if (Number(row?.count || 0) >= limit) throw conflict(msg("err.crewRepo.full"));
            }

            await tx.update(hiqCrewMembers)
                .set({ role: 'member' })
                .where(eq(hiqCrewMembers.id, target.id));
        });
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
            // 2026-09-21 부터 크루 채팅은 hiq_chat_messages("crew:<id>") 에 있다 — 여기서 안 지우면 크루가 없어져도 대화가 남는다.
            await tx.execute(sql`DELETE FROM hiq_chat_messages WHERE room_key = ${`crew:${crewId}`}`);
            await tx.execute(sql`DELETE FROM hiq_chat_reads WHERE room_key = ${`crew:${crewId}`}`);

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

    async searchCrews(query?: string, sportCategory?: string, userLat?: number, userLng?: number, viewerCountry?: string) {
        // TODO: For high-performance search on large datasets, consider using
        // PostgreSQL Full Text Search (GIN Index) instead of LIKE '%query%'.
        const leaderMember = alias(hiqMembers, "leader_member");
        const crewsWithCount = await db.select({
            crew: hiqCrews,
            memberCount: sql<number>`count(${hiqCrewMembers.id})`,
            storeLat: hiqStores.latitude,
            storeLng: hiqStores.longitude,
            // 디렉토리(수집 1,195곳) 베이스 매장 좌표. 파트너 매장(hiqStores)만 조인하고
            // 있어서 거리 계산이 늘 비어 있었다 — 실제 크루는 전부 디렉토리를 베이스로 잡는다.
            listingLat: storeListings.latitude,
            listingLng: storeListings.longitude,
            // 크루의 국가 = 리더의 국가. 미기록(국가 저장 도입 전 가입자)은 KR 로 본다 —
            // 기존 크루는 전부 한국 크루다.
            leaderCountry: profiles.countryCode,
        })
            .from(hiqCrews)
            .leftJoin(hiqCrewMembers, eq(hiqCrews.id, hiqCrewMembers.crewId))
            .leftJoin(hiqStores, eq(hiqCrews.baseStoreId, hiqStores.id))
            .leftJoin(storeListings, eq(hiqCrews.baseListingCode, storeListings.code))
            .leftJoin(leaderMember, eq(leaderMember.id, hiqCrews.leaderId))
            .leftJoin(profiles, eq(profiles.id, leaderMember.profileId))
            .where(
                and(
                    query ? or(
                        like(hiqCrews.name, `%${query}%`),
                        like(hiqCrews.region, `%${query}%`)
                    ) : undefined,
                    sportCategory ? eq(hiqCrews.sportCategory, sportCategory as any) : undefined
                )
            )
            .groupBy(hiqCrews.id, hiqStores.latitude, hiqStores.longitude, storeListings.latitude, storeListings.longitude, profiles.countryCode)
            .limit(50) // Increased limit for location sorting
            .orderBy(desc(hiqCrews.createdAt));

        let results = crewsWithCount.map(r => {
            // 우선순위: 크루 자체 좌표 → 파트너 매장 → 디렉토리 매장
            let lat = r.crew.latitude || r.storeLat || r.listingLat;
            let lng = r.crew.longitude || r.storeLng || r.listingLng;
            let distance: number | undefined;

            if (userLat && userLng && lat && lng) {
                distance = getDistanceFromLatLonInKm(userLat, userLng, lat, lng);
            }

            return {
                ...r.crew,
                memberCount: Number(r.memberCount),
                countryCode: r.leaderCountry || "KR",
                distance
            };
        });

        // 같은 나라 크루 우선 — 멕시코 유저에게 한국 크루 50개보다 멕시코 크루 1개가 먼저다.
        // 그 안에서는 기존 규칙(거리 → 최신) 유지.
        const sameCountry = (c: { countryCode: string }) =>
            viewerCountry && c.countryCode === viewerCountry ? 0 : 1;
        results.sort((a, b) => {
            if (viewerCountry) {
                const d = sameCountry(a) - sameCountry(b);
                if (d !== 0) return d;
            }
            if (userLat && userLng) {
                if (a.distance !== undefined && b.distance !== undefined) return a.distance - b.distance;
                if (a.distance !== undefined) return -1;
                if (b.distance !== undefined) return 1;
            }
            return 0;
        });

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

    /**
     * 어드민 크루 현황 — **전부**. 예전 어드민 탭은 위 getAllCrews 의 기본값(1쪽 20개)을 그대로 불러
     * 최근 20개 크루만 보였다. 인원은 가입 대기(pending)를 빼고 센다.
     */
    async getAllCrewsForAdmin() {
        const rows = (await db.execute(sql`
            select c.id, c.name, c.description, c.short_intro, c.sport_category, c.region, c.join_type,
                   coalesce(c.max_members, 50)::int as max_members, c.base_listing_code,
                   to_char(c.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
                   (select count(*)::int from hiq_crew_members cm where cm.crew_id = c.id and cm.role != 'pending') as member_count,
                   (select count(*)::int from hiq_crew_members cm where cm.crew_id = c.id and cm.role = 'pending') as pending_count,
                   lm.name as leader_name, st.name as store_name, sl.name as listing_name
            from hiq_crews c
            left join hiq_members lm on lm.id = c.leader_id
            left join hiq_stores st on st.id = c.base_store_id
            left join store_listings sl on sl.code = c.base_listing_code
            order by c.created_at desc`)).rows as Record<string, unknown>[];
        return rows.map((r) => ({
            id: String(r.id),
            name: String(r.name ?? ""),
            description: (r.description as string | null) ?? (r.short_intro as string | null) ?? "",
            sportCategory: String(r.sport_category ?? "BILLIARDS") as "BILLIARDS" | "GOLF" | "MIXED",
            region: (r.region as string | null) ?? null,
            joinType: String(r.join_type ?? "auto"),
            maxMembers: Number(r.max_members ?? 50),
            memberCount: Number(r.member_count ?? 0),
            pendingCount: Number(r.pending_count ?? 0),
            leaderName: (r.leader_name as string | null) || "알 수 없음",
            // 활동 장소 — 디렉토리 매장 이름이 우선, 없으면 제휴 매장, 둘 다 없으면 지역 모임
            storeName: (r.listing_name as string | null) || (r.store_name as string | null) || "지역 모임",
            createdAt: String(r.created_at ?? ""),
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

    /**
     * 다가오는 정모. 예전엔 activity_date >= now 로 5개만 줘서 ① 6번째 정모부터 안 보였고 ② 시작하는 순간 목록에서
     * 사라졌다(모이는 중에 장소를 다시 볼 수 없었다). 시작 뒤 몇 시간(ACTIVITY_ONGOING_HOURS)은 '진행 중' 으로 남기고,
     * 상한은 넉넉히 둔다 — 크루 정모가 한 번에 수십 개 잡히는 일은 없다.
     */
    async getUpcomingCrewActivities(crewId: string, limit = 30) {
        const activities = await db.select().from(hiqCrewActivities)
            .where(and(eq(hiqCrewActivities.crewId, crewId), gte(hiqCrewActivities.activityDate, upcomingActivityCutoff())))
            .orderBy(asc(hiqCrewActivities.activityDate), asc(hiqCrewActivities.id))
            .limit(limit);
        return this.withActivityParticipants(activities);
    }

    /**
     * 지난 정모(최근 것부터). cursor((시작 시각, id))보다 앞선 것만 — '더 보기' 가 이어 붙인다.
     * 진행 중 창 안의 정모는 다가오는 목록에 있으므로 여기선 뺀다(두 번 보이지 않게).
     */
    async getPastCrewActivities(crewId: string, opts: { cursor?: CrewCursor | null; limit?: number } = {}) {
        const activities = await db.select().from(hiqCrewActivities)
            .where(and(
                eq(hiqCrewActivities.crewId, crewId),
                lt(hiqCrewActivities.activityDate, upcomingActivityCutoff()),
                cursorBefore(hiqCrewActivities.activityDate, hiqCrewActivities.id, opts.cursor),
            ))
            .orderBy(desc(msTrunc(hiqCrewActivities.activityDate)), desc(hiqCrewActivities.id))
            .limit(Math.min(Math.max(opts.limit ?? 20, 1), 50));
        return this.withActivityParticipants(activities);
    }

    // 참가자를 한 번에 붙인다(N+1 방지). 참가자 행의 gender 는 회원 정보에서 온다 — 팀 편성의 남녀 구분이 이걸 쓴다.
    private async withActivityParticipants<T extends { id: string }>(activities: T[]) {
        if (activities.length === 0) return [] as (T & { participants: any[] })[];
        const activityIds = activities.map(a => a.id);
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
            .where(inArray(hiqCrewActivityParticipants.activityId, activityIds))
            .orderBy(asc(hiqCrewActivityParticipants.joinedAt));

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

            if (!activity) throw notFound(msg("err.crewRepo.activityNotFound"));

            const participants = await tx.select().from(hiqCrewActivityParticipants).where(eq(hiqCrewActivityParticipants.activityId, activityId));

            // Only count active participants ('joined')
            const activeParticipants = participants.filter(p => p.status === 'joined');
            if (activeParticipants.length >= (activity.maxParticipants || 999)) {
                throw conflict(msg("err.crewRepo.activityFull"));
            }

            // Check if already joined
            const existing = participants.find(p => p.memberId === memberId);
            if (existing) throw conflict(msg("err.crewRepo.alreadyJoined"));

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
    /**
     * 글 목록. 예전엔 크루 글 전체를 한 번에 내려줬다 → 쪽 나누기.
     *  - page 없음(첫 쪽): 고정 공지(최대 CREW_NOTICES_MAX) + 일반 글 limit 개. 응답 모양(배열·필드)은 예전과 같다.
     *  - page.cursor: 그 글보다 오래된 일반 글만. 공지는 첫 쪽에만 붙는다.
     *  - page 자체가 없으면(서버 내부 호출: 크루 삭제 때 Blob 모으기) 예전처럼 전부 — 잘라 주면 파일이 고아로 남는다.
     * 좋아요·댓글 수는 ::int — count(*) 는 bigint 라 Neon 드라이버가 문자열("3")로 돌려줘서 화면의 +1 이 "31" 이 됐다.
     */
    async getCrewPosts(crewId: string, currentMemberId?: string, page?: { cursor?: CrewCursor | null; limit: number }) {
        const limit = page ? page.limit : 100000;
        const base = () => db.select({
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
            likeCount: sql<number>`(SELECT count(*)::int FROM ${hiqCrewLikes} WHERE ${hiqCrewLikes.postId} = ${hiqCrewPosts.id})`,
            commentCount: sql<number>`(SELECT count(*)::int FROM ${hiqCrewComments} WHERE ${hiqCrewComments.postId} = ${hiqCrewPosts.id} AND ${notBlockedBy(currentMemberId, hiqCrewComments.authorId)})`,
            isLiked: currentMemberId ? sql<boolean>`EXISTS(SELECT 1 FROM ${hiqCrewLikes} WHERE ${hiqCrewLikes.postId} = ${hiqCrewPosts.id} AND ${hiqCrewLikes.memberId} = ${currentMemberId})` : sql<boolean>`false`
        })
            .from(hiqCrewPosts)
            .innerJoin(hiqMembers, eq(hiqCrewPosts.authorId, hiqMembers.id))
            .leftJoin(profiles, eq(hiqMembers.profileId, profiles.id))
            .leftJoin(hiqCrewMembers, and(
                eq(hiqCrewPosts.crewId, hiqCrewMembers.crewId),
                eq(hiqCrewPosts.authorId, hiqCrewMembers.memberId)
            ));
        const visible = and(eq(hiqCrewPosts.crewId, crewId), notBlockedBy(currentMemberId, hiqCrewPosts.authorId));

        const regular = await base()
            .where(and(visible, eq(hiqCrewPosts.isNotice, false), cursorBefore(hiqCrewPosts.createdAt, hiqCrewPosts.id, page?.cursor)))
            .orderBy(desc(msTrunc(hiqCrewPosts.createdAt)), desc(hiqCrewPosts.id))
            .limit(limit);
        const notices = page?.cursor ? [] : await base()
            .where(and(visible, eq(hiqCrewPosts.isNotice, true)))
            .orderBy(desc(msTrunc(hiqCrewPosts.createdAt)), desc(hiqCrewPosts.id))
            .limit(page ? CREW_NOTICES_MAX : 100000);

        return [...notices, ...regular].map(r => ({
            ...r,
            likeCount: Number(r.likeCount) || 0,
            commentCount: Number(r.commentCount) || 0,
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

    /**
     * 글 삭제. 글 사진은 올릴 때 사진첩에도 같은 URL 로 복사된다(createCrewPost) — 글을 지우면 그 복사본 행도 같이 지운다.
     * 예전엔 글만 지우고 파일(Blob)을 지워서 사진첩 타일이 깨진 채 남았다. 파일 삭제는 라우트가 참조 확인 뒤에 한다.
     * 복사본은 (크루, 올린 사람=글쓴이, URL)로 찾는다 — 스키마에 글 id 칸이 없어서(칸을 늘리지 않으려고) 이 셋으로 맞춘다.
     */
    async deleteCrewPost(postId: string) {
        // Child rows (likes, comments) have no ON DELETE CASCADE, so remove them first
        // inside a transaction — otherwise deleting an engaged post throws an FK violation.
        await db.transaction(async (tx) => {
            const [post] = await tx.select().from(hiqCrewPosts).where(eq(hiqCrewPosts.id, postId));
            await tx.delete(hiqCrewLikes).where(eq(hiqCrewLikes.postId, postId));
            await tx.delete(hiqCrewComments).where(eq(hiqCrewComments.postId, postId));
            await tx.delete(hiqCrewPosts).where(eq(hiqCrewPosts.id, postId));
            const urls = imageUrlList(post?.images);
            if (post && urls.length > 0) {
                // 사진 좋아요·댓글은 FK 가 ON DELETE CASCADE 라 사진 행만 지우면 따라 지워진다.
                await tx.delete(hiqCrewPhotos).where(and(
                    eq(hiqCrewPhotos.crewId, post.crewId),
                    eq(hiqCrewPhotos.uploaderId, post.authorId),
                    inArray(hiqCrewPhotos.url, urls),
                ));
            }
        });
    }

    async createCrewPost(data: InsertHiqCrewPost) {
        return await db.transaction(async (tx) => {
            const [post] = await tx.insert(hiqCrewPosts).values(data).returning();

            // Sync to Photo Album
            for (const url of imageUrlList(data.images)) {
                await tx.insert(hiqCrewPhotos).values({
                    crewId: post.crewId,
                    uploaderId: post.authorId,
                    url: url,
                    caption: post.title
                });
            }
            return post;
        });
    }

    /**
     * 글 고치기(글쓴이·운영진) / 공지 고정(운영진). 사진이 바뀌면 사진첩 복사본도 맞춘다 — 새 사진은 사진첩에 넣고,
     * 뺀 사진은 사진첩 복사본을 지운다. 뺀 URL 을 돌려주면 라우트가 참조 확인 뒤 파일을 지운다.
     */
    async updateCrewPost(postId: string, data: Partial<{ title: string; content: string; category: string; images: string[] | null; isNotice: boolean }>) {
        return await db.transaction(async (tx) => {
            const [before] = await tx.select().from(hiqCrewPosts).where(eq(hiqCrewPosts.id, postId)).for('update');
            if (!before) return { post: null, removedUrls: [] as string[] };
            const [post] = await tx.update(hiqCrewPosts).set(data).where(eq(hiqCrewPosts.id, postId)).returning();
            let removedUrls: string[] = [];
            if (data.images !== undefined) {
                const oldUrls = imageUrlList(before.images);
                const newUrls = imageUrlList(data.images);
                removedUrls = oldUrls.filter(u => !newUrls.includes(u));
                const added = newUrls.filter(u => !oldUrls.includes(u));
                if (removedUrls.length > 0) {
                    await tx.delete(hiqCrewPhotos).where(and(
                        eq(hiqCrewPhotos.crewId, before.crewId),
                        eq(hiqCrewPhotos.uploaderId, before.authorId),
                        inArray(hiqCrewPhotos.url, removedUrls),
                    ));
                }
                for (const url of added) {
                    await tx.insert(hiqCrewPhotos).values({ crewId: before.crewId, uploaderId: before.authorId, url, caption: post.title });
                }
            }
            return { post, removedUrls };
        });
    }

    /**
     * 아직 어느 글·사진첩 행이 쓰고 있는 URL. 파일(Blob)을 지우기 직전에 부른다 — 글과 사진첩이 같은 URL 을 나눠 쓰므로
     * 한쪽을 지웠다고 파일까지 지우면 다른 쪽이 깨진다. 크루를 가리지 않는다(같은 파일을 다른 크루가 쓸 수도 있다).
     */
    async findReferencedImageUrls(urls: string[]): Promise<Set<string>> {
        const list = imageUrlList(urls);
        if (list.length === 0) return new Set();
        const inPhotos = await db.select({ url: hiqCrewPhotos.url }).from(hiqCrewPhotos).where(inArray(hiqCrewPhotos.url, list));
        const arr = sql.join(list.map(u => sql`${u}`), sql`, `);
        // images 는 jsonb 배열 — ?| 는 배열의 최상위 문자열 원소 중 하나라도 겹치면 참. 배열이 아닌 옛 값은 건너뛴다.
        const inPosts = await db.select({ images: hiqCrewPosts.images }).from(hiqCrewPosts)
            .where(sql`jsonb_typeof(${hiqCrewPosts.images}) = 'array' AND ${hiqCrewPosts.images} ?| array[${arr}]::text[]`);
        const found = new Set<string>(inPhotos.map(r => r.url));
        for (const r of inPosts) for (const u of imageUrlList(r.images)) if (list.includes(u)) found.add(u);
        return found;
    }

    async getCrewPostComments(postId: string, viewerId?: string) {
        const rows = await db.select({
            comment: hiqCrewComments,
            authorName: hiqMembers.name,
            authorProfileImage: profiles.profileImageUrl
        })
            .from(hiqCrewComments)
            .innerJoin(hiqMembers, eq(hiqCrewComments.authorId, hiqMembers.id))
            .leftJoin(profiles, eq(hiqMembers.profileId, profiles.id))
            .where(and(eq(hiqCrewComments.postId, postId), notBlockedBy(viewerId, hiqCrewComments.authorId)))
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
    /**
     * 사진첩. 글 목록과 같은 커서 쪽 나누기 + 캡션(예전엔 select 에서 빠져 캡션이 화면에 못 갔다) + ::int 수.
     * page 가 없으면(서버 내부 호출) 전부 — 크루 삭제가 이걸로 지울 파일을 모은다.
     */
    async getCrewPhotos(crewId: string, currentMemberId?: string, page?: { cursor?: CrewCursor | null; limit: number }) {
        const results = await db.select({
            id: hiqCrewPhotos.id,
            crewId: hiqCrewPhotos.crewId,
            uploaderId: hiqCrewPhotos.uploaderId,
            url: hiqCrewPhotos.url,
            caption: hiqCrewPhotos.caption,
            createdAt: hiqCrewPhotos.createdAt,
            uploaderName: hiqMembers.name,
            uploaderProfileImage: profiles.profileImageUrl,
            likeCount: sql<number>`(SELECT count(*)::int FROM ${hiqCrewPhotoLikes} WHERE ${hiqCrewPhotoLikes.photoId} = ${hiqCrewPhotos.id})`,
            commentCount: sql<number>`(SELECT count(*)::int FROM ${hiqCrewPhotoComments} WHERE ${hiqCrewPhotoComments.photoId} = ${hiqCrewPhotos.id} AND ${notBlockedBy(currentMemberId, hiqCrewPhotoComments.authorId)})`,
            isLiked: currentMemberId ? sql<boolean>`EXISTS(SELECT 1 FROM ${hiqCrewPhotoLikes} WHERE ${hiqCrewPhotoLikes.photoId} = ${hiqCrewPhotos.id} AND ${hiqCrewPhotoLikes.memberId} = ${currentMemberId})` : sql<boolean>`false`
        })
            .from(hiqCrewPhotos)
            .innerJoin(hiqMembers, eq(hiqCrewPhotos.uploaderId, hiqMembers.id))
            .leftJoin(profiles, eq(hiqMembers.profileId, profiles.id))
            .where(and(
                eq(hiqCrewPhotos.crewId, crewId),
                notBlockedBy(currentMemberId, hiqCrewPhotos.uploaderId),
                cursorBefore(hiqCrewPhotos.createdAt, hiqCrewPhotos.id, page?.cursor),
            ))
            .orderBy(desc(msTrunc(hiqCrewPhotos.createdAt)), desc(hiqCrewPhotos.id))
            .limit(page ? page.limit : 100000);

        return results.map(r => ({
            ...r,
            likeCount: Number(r.likeCount) || 0,
            commentCount: Number(r.commentCount) || 0,
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

    async getCrewPhotoComments(photoId: string, viewerId?: string) {
        const rows = await db.select({
            comment: hiqCrewPhotoComments,
            authorName: hiqMembers.name,
            authorProfileImage: profiles.profileImageUrl
        })
            .from(hiqCrewPhotoComments)
            .innerJoin(hiqMembers, eq(hiqCrewPhotoComments.authorId, hiqMembers.id))
            .leftJoin(profiles, eq(hiqMembers.profileId, profiles.id))
            .where(and(eq(hiqCrewPhotoComments.photoId, photoId), notBlockedBy(viewerId, hiqCrewPhotoComments.authorId)))
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
                joinedAt ? gte(hiqCrewChats.createdAt, joinedAt) : undefined,
                notBlockedBy(memberId, hiqCrewChats.senderId)
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

    // blocker 가 blocked 를 차단했는가 — 차단한 사람에게 차단당한 사람의 댓글 알림이 가지 않게 한다.
    async hasBlocked(blockerId: string, blockedId: string): Promise<boolean> {
        const [row] = await db.select({ id: hiqBlocks.id }).from(hiqBlocks)
            .where(and(eq(hiqBlocks.blockerId, blockerId), eq(hiqBlocks.blockedId, blockedId)))
            .limit(1);
        return !!row;
    }
    /**
     * memberId 를 차단한 사람들 — 크루 전체에 보내는 알림(채팅·정모·투표·대회·정산)에서 뺀다.
     * 받는 사람마다 hasBlocked 를 부르지 않고 한 번에 읽는다(큰 크루에서 쿼리 N번 방지).
     */
    async getBlockerIds(memberId: string): Promise<Set<string>> {
        const rows = await db.select({ blockerId: hiqBlocks.blockerId }).from(hiqBlocks)
            .where(eq(hiqBlocks.blockedId, memberId));
        return new Set(rows.map((r) => r.blockerId));
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
        if (!poll) throw notFound(msg("err.crewRepo.pollNotFound"));
        if (poll.status === 'closed') throw conflict(msg("err.crewRepo.pollClosed"));
        // Enforce the deadline server-side — 'status' is never flipped to 'closed' anywhere,
        // so endTime is the real source of truth for whether voting is open.
        if (poll.endTime && poll.endTime < new Date()) throw conflict(msg("err.crewRepo.pollClosed"));

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
