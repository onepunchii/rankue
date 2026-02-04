import { db } from "../db.js";
import { hiqStores, hiqMembers, hiqGames, hiqVisitLogs, hiqGameHistory, hiqFriendships, hiqInvites, hiqSuccessfulShots, profiles, hiqTournaments, hiqCrews, hiqCrewMembers, hiqCrewActivities, hiqCrewActivityParticipants, hiqCrewPosts, hiqCrewComments, hiqCrewLikes, hiqCrewPhotos, hiqCrewChats, partnerLeads, notices, hiqCrewPhotoLikes, hiqCrewPhotoComments, hiqSettlements, hiqSettlementItems, hiqSettlementParticipants, golfBookings, golfJoins, hiqCourseHoleInfo, golfMatchSessions, hiqNotifications } from "../../shared/schema.js";
import type {
    HiqStore, InsertHiqStore, HiqMember, InsertHiqMember, HiqGame, InsertHiqGame, HiqGameHistory, InsertHiqGameHistory,
    HiqFriendship, InsertHiqSuccessfulShot, HiqSuccessfulShot, Profile, HiqTournament, InsertHiqTournament, InsertHiqCrew, HiqCrew,
    InsertHiqCrewActivity, InsertHiqCrewActivityParticipant, InsertPartnerLead, PartnerLead, Notice, InsertNotice,
    InsertHiqCrewPost, HiqCrewPhotoLike, HiqCrewPhotoComment, InsertHiqCrewPhotoLike, InsertHiqCrewPhotoComment,
    InsertHiqSettlement, InsertHiqSettlementItem, InsertHiqSettlementParticipant,
    GolfBooking, InsertGolfBooking,
    GolfJoin, InsertGolfJoin,
    HiqCourseHoleInfo, InsertHiqCourseHoleInfo,
    GolfMatchSession, InsertGolfMatchSession,
    HiqNotification, InsertHiqNotification
} from "../../shared/schema.js";
import { eq, desc, asc, and, or, sql, gt, gte, isNull, inArray, like, lte } from "drizzle-orm";
import { IStorage } from "./storage_interface.js";

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

export const GOLF_GRADES = [
    { id: 'ALBATROSS', label: 'Albatross', minHandi: -Infinity, maxHandi: 0, icon: '🏆', color: '#c0c0c0' },
    { id: 'EAGLE', label: 'Eagle', minHandi: 1, maxHandi: 9, icon: '🦅', color: '#FFD700' },
    { id: 'BIRDIE', label: 'Birdie', minHandi: 10, maxHandi: 18, icon: '🐦', color: '#10b981' },
    { id: 'PAR', label: 'Par', minHandi: 19, maxHandi: 27, icon: '⭕', color: '#3b82f6' },
    { id: 'BOGEY', label: 'Bogey', minHandi: 28, maxHandi: 36, icon: '⬜', color: '#94a3b8' },
    { id: 'ROOKIE', label: 'Rookie', minHandi: 37, maxHandi: Infinity, icon: '🐣', color: '#CD7F32' },
];

export class HiqStorage implements IStorage {
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

    // --- Store Management ---
    async getStoreBySlug(slug: string): Promise<HiqStore | undefined> {
        const [store] = await db.select().from(hiqStores).where(eq(hiqStores.slug, slug));
        return store;
    }

    async getStoreById(id: string): Promise<HiqStore | undefined> {
        const [store] = await db.select().from(hiqStores).where(eq(hiqStores.id, id));
        return store;
    }

    async updateStore(id: string, data: Partial<HiqStore>): Promise<HiqStore> {
        const [updated] = await db.update(hiqStores)
            .set({ ...data, updatedAt: new Date() })
            .where(eq(hiqStores.id, id))
            .returning();
        return updated;
    }

    async createPartnerLead(data: InsertPartnerLead): Promise<void> {
        await db.insert(partnerLeads).values(data);
    }

    async getPartnerLeads(): Promise<PartnerLead[]> {
        return await db.select().from(partnerLeads).orderBy(desc(partnerLeads.createdAt));
    }

    async updatePartnerLeadStatus(id: string, status: "NEW" | "CONTACTED" | "REGISTERED"): Promise<void> {
        await db.update(partnerLeads).set({ status }).where(eq(partnerLeads.id, id));
    }

    async getGlobalStats() {
        // Quick aggregated stats
        const usersCount = await db.select({ count: sql<number>`count(*)` }).from(profiles).where(eq(profiles.role, 'user'));
        const storesCount = await db.select({ count: sql<number>`count(*)` }).from(hiqStores);
        const leadsCount = await db.select({ count: sql<number>`count(*)` }).from(partnerLeads).where(eq(partnerLeads.status, 'NEW'));

        // Today's visit log count
        // Assuming simple count of all visit logs for today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const visitsCount = await db.select({ count: sql<number>`count(*)` }).from(hiqVisitLogs).where(gte(hiqVisitLogs.visitedAt, today));

        return {
            totalUsers: Number(usersCount[0].count),
            totalStores: Number(storesCount[0].count),
            newLeads: Number(leadsCount[0].count),
            totalVisitsToday: Number(visitsCount[0].count)
        };
    }

    async getAllStores() {
        const results = await db.select({
            id: hiqStores.id,
            name: hiqStores.name,
            region: hiqStores.region,
            slug: hiqStores.slug,
            plan: hiqStores.plan,
            subscriptionStatus: hiqStores.subscriptionStatus,
            nextBillingDate: hiqStores.nextBillingDate,
            ownerName: profiles.nickname
        })
            .from(hiqStores)
            .leftJoin(profiles, eq(hiqStores.ownerId, profiles.id));

        return results.map(r => ({
            ...r,
            ownerName: r.ownerName || "Unknown"
        }));
    }

    // --- Notices ---
    async getNotices(): Promise<Notice[]> {
        return await db.select().from(notices).orderBy(desc(notices.createdAt));
    }

    async createNotice(data: InsertNotice): Promise<Notice> {
        const [notice] = await db.insert(notices).values(data).returning();
        return notice;
    }

    // --- User Management (Moderation) ---
    async getReportedUsers() {
        // MOCK: In real app, we would join reported_content tables.
        // For now, return random users with a 'reportCount'
        const users = await db.select().from(profiles).where(eq(profiles.role, 'user')).limit(5);

        return users.map(u => ({
            ...u,
            reportCount: Math.floor(Math.random() * 5) + 1, // Mock count
            reason: "비매너 채팅 신고" // Mock reason
        }));
    }

    async banUser(userId: string): Promise<void> {
        await db.update(profiles).set({ status: 'banned' }).where(eq(profiles.id, userId));
    }

    // --- Admin: Crews ---
    async getAllCrews() {
        const crews = await db.select({
            id: hiqCrews.id,
            name: hiqCrews.name,
            description: hiqCrews.description,
            leaderId: hiqCrews.leaderId,
            baseStoreId: hiqCrews.baseStoreId,
            createdAt: hiqCrews.createdAt,
            memberCount: sql<number>`(SELECT count(*) FROM ${hiqCrewMembers} WHERE ${hiqCrewMembers.crewId} = ${hiqCrews.id})`
        }).from(hiqCrews);

        // Enhance with Leader Name and Store Name
        // Doing loop for simplicity in this prototype phase, or join if possible.
        // Let's do simple fetches.
        const enhanced = await Promise.all(crews.map(async (c) => {
            let leaderName = "Unknown";
            let storeName = "지역 모임";

            if (c.leaderId) {
                const member = await db.select().from(hiqMembers).where(eq(hiqMembers.id, c.leaderId));
                if (member[0]) leaderName = member[0].name;
            }
            if (c.baseStoreId) {
                const store = await db.select().from(hiqStores).where(eq(hiqStores.id, c.baseStoreId));
                if (store[0]) storeName = store[0].name;
            }

            return { ...c, leaderName, storeName };
        }));

        return enhanced;
    }

    async searchStores(query: string): Promise<HiqStore[]> {
        if (!query || query.length < 2) return [];
        return await db.select().from(hiqStores)
            .where(or(
                like(hiqStores.name, `%${query}%`),
                like(hiqStores.address, `%${query}%`)
            ))
            .limit(10);
    }

    async createStore(data: InsertHiqStore): Promise<HiqStore> {
        const [store] = await db.insert(hiqStores).values(data).returning();
        return store;
    }

    async createTournament(data: InsertHiqTournament): Promise<HiqTournament> {
        const [tournament] = await db.insert(hiqTournaments).values(data).returning();
        return tournament;
    }

    // --- Crew Management ---
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

        // 3. Get Members with Role and Profile
        const membersData = await db.select({
            member: hiqMembers,
            profileNickname: profiles.nickname,
            profileImageUrl: profiles.profileImageUrl,
            role: hiqCrewMembers.role,
            joinedAt: hiqCrewMembers.joinedAt,
        })
            .from(hiqCrewMembers)
            .innerJoin(hiqMembers, eq(hiqCrewMembers.memberId, hiqMembers.id))
            .leftJoin(profiles, eq(hiqMembers.profileId, profiles.id))
            .where(eq(hiqCrewMembers.crewId, id));

        // Add profile fields to member object
        const members = membersData.map(data => ({
            member: {
                ...data.member,
                nickname: data.profileNickname || data.member.name,
                profileImageUrl: data.profileImageUrl,
            },
            role: data.role,
            joinedAt: data.joinedAt,
        }));

        return { crew, baseStore, members };
    }

    async joinCrew(crewId: string, memberId: string, role?: string) {
        // Check if already joined
        const [existing] = await db.select().from(hiqCrewMembers)
            .where(and(eq(hiqCrewMembers.crewId, crewId), eq(hiqCrewMembers.memberId, memberId)));

        if (existing) {
            if (existing.role === 'pending') throw new Error("가입 승인 대기 중입니다");
            throw new Error("이미 활동 중인 멤버입니다");
        }

        // Determine Role if not provided
        if (!role) {
            const [crew] = await db.select().from(hiqCrews).where(eq(hiqCrews.id, crewId));
            if (!crew) throw new Error("Crew not found");
            role = crew.joinType === 'approval' ? 'pending' : 'member';
        }

        await db.insert(hiqCrewMembers).values({
            crewId,
            memberId,
            role,
        });

        return role;
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
        await db.delete(hiqCrews).where(eq(hiqCrews.id, crewId));
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

    async searchCrews(query?: string, sportCategory?: string) {
        const crewsWithCount = await db.select({
            crew: hiqCrews,
            memberCount: sql<number>`count(${hiqCrewMembers.id})`
        })
            .from(hiqCrews)
            .leftJoin(hiqCrewMembers, eq(hiqCrews.id, hiqCrewMembers.crewId))
            .where(
                and(
                    query ? or(
                        like(hiqCrews.name, `%${query}%`),
                        like(hiqCrews.region, `%${query}%`)
                    ) : undefined,
                    sportCategory ? eq(hiqCrews.sportCategory, sportCategory as any) : undefined
                )
            )
            .groupBy(hiqCrews.id)
            .limit(20)
            .orderBy(desc(hiqCrews.createdAt));

        return crewsWithCount.map(r => ({
            ...r.crew,
            memberCount: Number(r.memberCount)
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

        // Fetch participants for each activity
        return await Promise.all(activities.map(async (activity) => {
            const participants = await db.select({
                memberId: hiqCrewActivityParticipants.memberId,
                member: {
                    name: hiqMembers.name,
                    profileImageUrl: profiles.profileImageUrl
                }
            })
                .from(hiqCrewActivityParticipants)
                .innerJoin(hiqMembers, eq(hiqCrewActivityParticipants.memberId, hiqMembers.id))
                .leftJoin(profiles, eq(hiqMembers.profileId, profiles.id))
                .where(eq(hiqCrewActivityParticipants.activityId, activity.id));

            return {
                ...activity,
                participants
            };
        }));
    }

    async joinCrewActivity(activityId: string, memberId: string) {
        return await db.transaction(async (tx) => {
            const [activity] = await tx.select().from(hiqCrewActivities).where(eq(hiqCrewActivities.id, activityId));
            if (!activity) throw new Error("Activity not found");

            const participants = await tx.select().from(hiqCrewActivityParticipants).where(eq(hiqCrewActivityParticipants.activityId, activityId));
            if (participants.length >= (activity.maxParticipants || 999)) {
                throw new Error("정원 초과입니다");
            }

            // Check if already joined
            const existing = participants.find(p => p.memberId === memberId);
            if (existing) throw new Error("이미 참여 중입니다");

            await tx.insert(hiqCrewActivityParticipants).values({
                activityId, memberId, status: 'joined'
            });
        });
    }

    async getStoreByOwnerProfileId(profileId: string): Promise<HiqStore | undefined> {
        const [store] = await db.select().from(hiqStores).where(eq(hiqStores.ownerId, profileId));
        return store;
    }

    async getMembersByPhone(phone: string): Promise<HiqMember[]> {
        return await db.select().from(hiqMembers).where(eq(hiqMembers.phone, phone));
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

    async getStoreMembersWithStats(storeId: string) {
        const members = await this.getAllMembers(storeId);
        if (members.length === 0) return [];

        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        // Get game counts for this month
        // Note: This relies on member IDs being relatively limited per store (e.g. < 1000) for the IN clause.
        // If it grows huge, a JOIN approach is better.
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
            opponentName: game.player2Name || "상대방",
            sportCategory: game.sportCategory
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

        // Update Cached Averages for Method B (Fast Profile Loading)
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
        const currentMember = await this.getMemberById(memberId);
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
        // Filter strictly by gameType and "Official Match" criteria for analysis
        const filtered = history.filter(h => h.gameType === type && h.gameMode === 'match' && h.isRanked);

        // Calculate Stats for "Summary"
        const wins = filtered.filter(h => h.isWinner).length;
        const losses = filtered.length - wins;
        const totalGames = filtered.length;

        let overallAvg = 0;
        let recentAvg = 0;
        let highRunMax = 0;

        if (totalGames > 0) {
            overallAvg = filtered.reduce((acc, h) => acc + parseFloat(h.average), 0) / totalGames;
            highRunMax = Math.max(...filtered.map(h => h.highRun || 0));

            // Recent 5 games avg
            const recent = filtered.slice(0, 5);
            if (recent.length > 0) {
                recentAvg = recent.reduce((acc, h) => acc + parseFloat(h.average), 0) / recent.length;
            }
        }

        const winRate = totalGames > 0 ? (wins / totalGames) * 100 : 0;

        // Mental: Based on consistency of average in last 5 games
        // Simple mock: if recent avg is close to overall avg, mental is good
        const mentalScore = Math.abs(recentAvg - overallAvg) < 0.1 ? 80 : 50;

        return {
            // Radar Data
            power: Math.min(100, 40 + (highRunMax * 5)),
            technique: Math.min(100, 30 + (overallAvg * 50)),
            mental: mentalScore,
            experience: Math.min(100, 20 + totalGames),
            trend: 50 + (filtered[0]?.isWinner ? 10 : -10),

            // Legacy / Flat return (for backward compat if any)
            winRate: Math.round(winRate),
            avgAverage: overallAvg.toFixed(2),
            totalGames: totalGames,

            // New structured Summary for Dashboard
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
            friendWins: total - myWins, // Simple loss calculation
            winRate: total > 0 ? Math.round((myWins / total) * 100) : 0
        };
    }

    async getHeadToHeadGames(myId: string, friendId: string, sport: string = "BILLIARDS") {
        // Returns last 10 games between two players in specific sport
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

    async createInvite(hostId: string): Promise<string> {
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        await db.insert(hiqInvites).values({
            code,
            hostId,
            status: 'pending',
            expiresAt: new Date(Date.now() + 30 * 60 * 1000) // 30 mins
        });
        return code;
    }

    async getInviteByCode(code: string): Promise<any> {
        const [invite] = await db.select().from(hiqInvites).where(
            and(
                eq(hiqInvites.code, code),
                eq(hiqInvites.status, 'pending'),
                gt(hiqInvites.expiresAt, new Date())
            )
        );
        return invite;
    }

    async joinInvite(code: string, guestId: string): Promise<boolean> {
        // 1. Find ANY valid invite for this code (Pending OR Accepted)
        // We need at least one valid record to verify the code exists and hasn't expired
        const invites = await db.select().from(hiqInvites).where(
            and(
                eq(hiqInvites.code, code),
                gt(hiqInvites.expiresAt, new Date())
            )
        );

        if (invites.length === 0) return false;

        // 2. Check if already joined
        const alreadyJoined = invites.some(inv => inv.guestId === guestId);
        if (alreadyJoined) return true;

        // 3. Logic:
        // - If there is a 'pending' slot, take it.
        // - If all are 'accepted', create a new slot (Clone the first invite's host/store info)
        const pendingInvite = invites.find(inv => inv.status === 'pending');

        if (pendingInvite) {
            await db.update(hiqInvites)
                .set({ guestId, status: 'accepted' })
                .where(eq(hiqInvites.id, pendingInvite.id));
        } else {
            // Clone info from the first valid invite to create a new slot
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

    async getInviteStatus(code: string): Promise<any> {
        // Fetch ALL invites with this code
        const invites = await db.select().from(hiqInvites).where(eq(hiqInvites.code, code));

        if (invites.length === 0) return null;

        // Use the first one as the "Base" for metadata
        const base = invites[0];
        const result: any = { ...base, guests: [] };

        // Collect all guests
        const guestIds = invites.map(inv => inv.guestId).filter(id => id !== null) as string[];

        // Fetch guest profiles
        // Optimization: Could use 'inArray' if guestIds > 0
        if (guestIds.length > 0) {
            const guests = await db.select().from(hiqMembers).where(inArray(hiqMembers.id, guestIds));
            result.guests = guests;
        }

        return result;
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
        // In real app: vector search or pattern matching.
        // For prototype: return recent shots of same type.
        return await db.select().from(hiqSuccessfulShots)
            .where(eq(hiqSuccessfulShots.gameType, gameType))
            .limit(limit)
            .orderBy(desc(hiqSuccessfulShots.createdAt));
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

    async getActiveTournaments(storeId?: string) {
        let query = db.select().from(hiqTournaments);
        if (storeId) {
            return await query.where(and(eq(hiqTournaments.storeId, storeId), eq(hiqTournaments.status, 'ongoing'))).orderBy(desc(hiqTournaments.startDate));
        }
        return await query.where(eq(hiqTournaments.status, 'ongoing')).orderBy(desc(hiqTournaments.startDate));
    }

    async getTournamentById(id: string) {
        const [t] = await db.select().from(hiqTournaments).where(eq(hiqTournaments.id, id));
        return t;
    }

    // --- Crew Community ---
    async getCrewPosts(crewId: string, currentMemberId?: string) {
        const results = await db.select({
            id: hiqCrewPosts.id,
            crewId: hiqCrewPosts.crewId,
            authorId: hiqCrewPosts.authorId,
            title: hiqCrewPosts.title,
            content: hiqCrewPosts.content,
            category: hiqCrewPosts.category,
            isNotice: hiqCrewPosts.isNotice,
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
        await db.delete(hiqCrewPosts).where(eq(hiqCrewPosts.id, postId));
    }

    async createCrewPost(data: InsertHiqCrewPost) {
        const [post] = await db.insert(hiqCrewPosts).values(data).returning();
        return post;
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

    async createCrewPostComment(data: any) {
        const [comment] = await db.insert(hiqCrewComments).values(data).returning();
        return comment;
    }

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

    async createCrewPhoto(data: any) {
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

    async createCrewPhotoComment(data: any) {
        const [comment] = await db.insert(hiqCrewPhotoComments).values(data).returning();
        return comment;
    }

    async getCrewChats(crewId: string) {
        const rows = await db.select({
            chat: hiqCrewChats,
            senderName: hiqMembers.name,
            senderProfileImage: profiles.profileImageUrl
        })
            .from(hiqCrewChats)
            .innerJoin(hiqMembers, eq(hiqCrewChats.senderId, hiqMembers.id))
            .leftJoin(profiles, eq(hiqMembers.profileId, profiles.id))
            .where(eq(hiqCrewChats.crewId, crewId))
            .orderBy(hiqCrewChats.createdAt)
            .limit(100);

        return rows.map(row => ({
            ...row.chat,
            sender: {
                name: row.senderName,
                profileImageUrl: row.senderProfileImage
            }
        }));
    }

    async getCrewChat(chatId: string) {
        const [chat] = await db.select().from(hiqCrewChats).where(eq(hiqCrewChats.id, chatId));
        return chat;
    }

    async deleteCrewChat(chatId: string) {
        await db.delete(hiqCrewChats).where(eq(hiqCrewChats.id, chatId));
    }

    async createCrewChat(data: any) {
        const [chat] = await db.insert(hiqCrewChats).values(data).returning();
        return chat;
    }

    // --- Settlement ---
    async createSettlement(data: any, items: any[], participants: any[]) {
        return await db.transaction(async (tx) => {
            if (!data.crewId) {
                // Not in a crew context? Just for groups.
                // For simplicity, always require crewId or handle null.
            }

            const [settlement] = await tx.insert(hiqSettlements).values(data).returning();

            for (const item of items) {
                const { roundOrder, ...itemFields } = item;

                const [createdItem] = await tx.insert(hiqSettlementItems).values({
                    ...itemFields,
                    roundOrder: roundOrder,
                    settlementId: settlement.id
                }).returning();

                const itemParticipants = participants
                    .filter((p: any) => p.roundOrder === roundOrder)
                    .map((p: any) => ({
                        itemId: createdItem.id,
                        memberId: p.memberId
                    }));

                if (itemParticipants.length > 0) {
                    await tx.insert(hiqSettlementParticipants).values(itemParticipants);
                }
            }
            return settlement;
        });
    }

    async getSettlement(id: string) {
        const settlement = await db.query.hiqSettlements.findFirst({
            where: eq(hiqSettlements.id, id),
            with: {
                items: {
                    with: {
                        payer: true,
                        participants: {
                            with: {
                                member: true
                            }
                        }
                    }
                }
            }
        });
        return settlement;
    }

    async getAllMembersGlobal() {
        return await db.select().from(hiqMembers);
    }

    async checkAndUpdateGolfGrade(userId: string): Promise<any> {
        // Logic to update golf grade based on best score
        const member = await db.query.hiqMembers.findFirst({
            where: eq(hiqMembers.id, userId)
        });

        if (!member) return null;

        const bestScore = member.golfBestScore || 0;
        let newGrade = '🐣 ROOKIE';

        if (bestScore > 0) {
            if (bestScore <= 72) newGrade = '🏆 ALBATROSS';
            else if (bestScore <= 79) newGrade = '🦅 EAGLE';
            else if (bestScore <= 89) newGrade = '🐦 BIRDIE';
            else if (bestScore <= 99) newGrade = '⭕ PAR';
            else if (bestScore <= 109) newGrade = '⬜ BOGEY';
        }

        if (member.golfGrade !== newGrade) {
            await db.update(hiqMembers)
                .set({ golfGrade: newGrade, updatedAt: new Date() })
                .where(eq(hiqMembers.id, userId));
            return { old: member.golfGrade, new: newGrade };
        }

        return null;
    }

    // --- Golf Booking ---
    async createGolfBooking(data: InsertGolfBooking): Promise<GolfBooking> {
        const [booking] = await db.insert(golfBookings).values(data).returning();
        return booking;
    }

    async getGolfBookings(date?: string, filters?: any): Promise<GolfBooking[]> {
        const conditions: any[] = [];
        if (date) {
            const start = new Date(date);
            start.setHours(0, 0, 0, 0);
            const end = new Date(date);
            end.setHours(23, 59, 59, 999);
            conditions.push(and(gte(golfBookings.datetime, start), lte(golfBookings.datetime, end)));
        } else if (filters?.startDate && filters?.endDate) {
            const start = new Date(filters.startDate);
            start.setHours(0, 0, 0, 0);
            const end = new Date(filters.endDate);
            end.setHours(23, 59, 59, 999);
            conditions.push(and(gte(golfBookings.datetime, start), lte(golfBookings.datetime, end)));
        }

        if (filters) {
            if (filters.region && filters.region !== "") {
                const regionIds = filters.region.split(',');
                const regionMap: Record<string, string | string[]> = {
                    'kyunggi_south': ['경기', '서울', '남부'],
                    'kyunggi_north': '경기',
                    'kyunggi_east': '경기',
                    'incheon_west': ['인천', '서부'],
                    'gangwon': '강원',
                    'chungcheong': ['충북', '충남', '대전', '세종', '충청'],
                    'jeolla': ['전북', '전남', '광주', '전라'],
                    'gyeongsang': ['경북', '경남', '대구', '부산', '울산', '경상'],
                    'jeju': ['제주']
                };

                const flatMappedRegions: string[] = [];
                regionIds.forEach((id: string) => {
                    const mapped = (regionMap as any)[id];
                    if (Array.isArray(mapped)) {
                        flatMappedRegions.push(...mapped);
                    } else if (typeof mapped === 'string') {
                        flatMappedRegions.push(mapped);
                    }
                });

                if (flatMappedRegions.length > 0) {
                    conditions.push(or(...flatMappedRegions.map(r => like(golfBookings.region, `%${r}%`))));
                }
            }

            if (filters.courseName && filters.courseName !== "") {
                conditions.push(
                    or(
                        like(golfBookings.courseName, `%${filters.courseName}%`),
                        like(golfBookings.blindName, `%${filters.courseName}%`)
                    )
                );
            }

            if (filters.listingType && filters.listingType !== 'ALL') {
                if (filters.listingType === 'BOOKING') {
                    conditions.push(or(eq(golfBookings.listingType, 'BOOKING'), isNull(golfBookings.listingType)));
                } else {
                    conditions.push(eq(golfBookings.listingType, filters.listingType));
                }
            }
        }

        const filteredConditions = conditions.filter((c): c is NonNullable<typeof c> => c !== undefined);

        return await db.select().from(golfBookings)
            .where(filteredConditions.length > 0 ? and(...filteredConditions) : undefined)
            .orderBy(asc(golfBookings.datetime));
    }

    async getGolfBookingCounts(startDate: string, endDate: string, viewType: string = 'ALL'): Promise<any> {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        // Build WHERE conditions based on viewType
        let whereCondition;

        if (viewType === 'JOIN') {
            whereCondition = and(
                gte(golfBookings.datetime, start),
                lte(golfBookings.datetime, end),
                eq(golfBookings.listingType, 'JOIN')
            );
        } else if (viewType === 'BOOKING') {
            whereCondition = and(
                gte(golfBookings.datetime, start),
                lte(golfBookings.datetime, end),
                or(
                    eq(golfBookings.listingType, 'BOOKING'),
                    isNull(golfBookings.listingType)
                )
            );
        } else {
            // viewType === 'ALL'
            whereCondition = and(
                gte(golfBookings.datetime, start),
                lte(golfBookings.datetime, end)
            );
        }

        return await db.select({
            date: sql<string>`to_char(${golfBookings.datetime} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD')`,
            count: sql<number>`count(*)::int`
        })
            .from(golfBookings)
            .where(whereCondition)
            .groupBy(sql`to_char(${golfBookings.datetime} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD')`);
    }

    async deleteGolfBooking(id: string): Promise<void> {
        await db.delete(golfBookings).where(eq(golfBookings.id, id));
    }

    // --- Golf Joins ---
    async createGolfJoin(data: InsertGolfJoin): Promise<GolfJoin> {
        const [join] = await db.insert(golfJoins).values(data).returning();
        return join;
    }

    async getGolfJoins(filters?: any): Promise<GolfJoin[]> {
        const conditions: any[] = [];

        // Always filter by listingType = 'JOIN'
        conditions.push(eq(golfBookings.listingType, 'JOIN'));

        if (filters?.date) {
            const start = new Date(filters.date);
            start.setHours(0, 0, 0, 0);
            const end = new Date(filters.date);
            end.setHours(23, 59, 59, 999);
            conditions.push(and(gte(golfBookings.datetime, start), lte(golfBookings.datetime, end)));
        }

        // Region Filter for Joins
        if (filters?.region && filters.region !== "") {
            const regionIds = filters.region.split(',');
            const regionMap: Record<string, string | string[]> = {
                'kyunggi_south': ['경기', '서울', '남부'],
                'kyunggi_north': '경기',
                'kyunggi_east': '경기',
                'incheon_west': ['인천', '서부'],
                'gangwon': '강원',
                'chungcheong': ['충북', '충남', '대전', '세종', '충청'],
                'jeolla': ['전북', '전남', '광주', '전라'],
                'gyeongsang': ['경북', '경남', '대구', '부산', '울산', '경상'],
                'jeju': ['제주']
            };

            const flatMappedRegions: string[] = [];
            regionIds.forEach((id: string) => {
                const mapped = (regionMap as any)[id];
                if (Array.isArray(mapped)) {
                    flatMappedRegions.push(...mapped);
                } else if (typeof mapped === 'string') {
                    flatMappedRegions.push(mapped);
                }
            });

            if (flatMappedRegions.length > 0) {
                conditions.push(or(...flatMappedRegions.map(r => like(golfBookings.region, `%${r}%`))));
            }
        }

        const filteredConditions = conditions.filter((c): c is NonNullable<typeof c> => c !== undefined);

        return await db.select().from(golfBookings)
            .where(filteredConditions.length > 0 ? and(...filteredConditions) : undefined)
            .orderBy(asc(golfBookings.datetime));
    }

    async deleteGolfJoin(id: string): Promise<void> {
        await db.delete(golfJoins).where(eq(golfJoins.id, id));
    }

    // --- Golf Match Session (PIN based) ---
    async createGolfMatchSession(data: any): Promise<any> {
        // Generate random 4-digit PIN
        const pinCode = Math.floor(1000 + Math.random() * 9000).toString();

        const host = await this.getMemberById(data.hostId);
        const [session] = await db.insert(golfMatchSessions).values({
            ...data,
            pinCode,
            players: [{
                memberId: data.hostId,
                name: host?.name || "Host",
                scores: new Array(18).fill(0),
                penalties: Array.from({ length: 18 }, () => ({ ob: false, hz: false, bunk: false, putt3: false }))
            }]
        }).returning();
        return session;
    }

    async getGolfMatchSession(id: string): Promise<any> {
        const [session] = await db.select().from(golfMatchSessions).where(eq(golfMatchSessions.id, id));
        return session;
    }

    async getGolfMatchSessionByPin(pin: string): Promise<any> {
        const [session] = await db.select().from(golfMatchSessions).where(and(eq(golfMatchSessions.pinCode, pin), eq(golfMatchSessions.status, 'waiting')));
        return session;
    }

    async joinGolfMatchSession(pin: string, memberId: string, name: string): Promise<any> {
        const session = await this.getGolfMatchSessionByPin(pin);
        if (!session) throw new Error("게임을 찾을 수 없거나 이미 시작되었습니다.");

        if (session.players.length >= 4) throw new Error("방이 꽉 찼습니다.");
        if (session.players.some((p: any) => p.memberId === memberId)) return session;

        const updatedPlayers = [...session.players, {
            memberId,
            name,
            scores: new Array(18).fill(0),
            penalties: Array.from({ length: 18 }, () => ({ ob: false, hz: false, bunk: false, putt3: false }))
        }];

        const [updated] = await db.update(golfMatchSessions)
            .set({ players: updatedPlayers })
            .where(eq(golfMatchSessions.id, session.id))
            .returning();
        return updated;
    }

    async updateGolfMatchScore(id: string, holeNo: number, playersData: any[]): Promise<any> {
        const [updated] = await db.update(golfMatchSessions)
            .set({
                players: playersData,
                currentHole: Math.min(18, holeNo),
                status: 'playing',
                updatedAt: new Date()
            })
            .where(eq(golfMatchSessions.id, id))
            .returning();
        return updated;
    }

    async finishGolfMatchSession(id: string): Promise<any> {
        const [session] = await db.update(golfMatchSessions)
            .set({ status: 'finished', updatedAt: new Date() })
            .where(eq(golfMatchSessions.id, id))
            .returning();

        if (session) {
            for (const player of session.players) {
                const totalScore = player.scores.reduce((a: number, b: number) => a + (b || 0), 0);
                await db.insert(hiqGameHistory).values({
                    memberId: player.memberId,
                    gameId: session.id,
                    gameMode: 'match',
                    gameType: 'golf',
                    score: totalScore,
                    innings: 18,
                    average: (totalScore / 18).toFixed(2),
                    isWinner: false,
                    isRanked: true,
                    locationName: session.courseName || "알 수 없는 구장",
                    sportCategory: 'GOLF' as any,
                    scoreJson: player.scores
                });

                // Update member's golf stats
                await this.checkAndUpdateGolfGrade(player.memberId);
            }
        }

        return session;
    }

    async getGolfPassportStats(memberId: string) {
        const history = await db.select().from(hiqGameHistory)
            .where(and(
                eq(hiqGameHistory.memberId, memberId),
                eq(hiqGameHistory.sportCategory, 'GOLF' as any)
            ));

        const uniqueCourses = new Set(history.map(h => h.locationName).filter(Boolean));
        const starsCollected = history.filter(h => h.score !== null && h.score < 85).length;

        // Calculate level based on conquered courses
        let level = "골프 입문자";
        let levelNum = 1;
        if (uniqueCourses.size >= 30) { level = "골프 매니아"; levelNum = 4; }
        else if (uniqueCourses.size >= 10) { level = "골프 탐험가"; levelNum = 3; }
        else if (uniqueCourses.size >= 3) { level = "골프 비기너"; levelNum = 2; }

        return {
            conquered: uniqueCourses.size,
            starsCollected,
            rankPercent: Math.max(1, 15 - Math.floor(uniqueCourses.size / 2)),
            level,
            levelNum,
            totalCourses: 520 // Standard total
        };
    }

    async seedGolfSampleData(memberId: string) {
        const history = await this.getMemberGameHistory(memberId, 'GOLF');
        if (history.length > 0) return; // Already has data

        const samples = [
            { locationName: "남서울 CC", region: "경기", score: 82, subType: "Membership" },
            { locationName: "스카이72(하늘)", region: "인천", score: 85, subType: "Public" },
            { locationName: "안양 CC", region: "경기", score: 79, subType: "Membership" },
            { locationName: "설해원", region: "강원", score: 88, subType: "Public" },
            { locationName: "나인브릿지", region: "제주", score: 81, subType: "Membership" },
            { locationName: "해슬리 나인브릿지", region: "경기", score: 83, subType: "Membership" }
        ];

        for (const s of samples) {
            await db.insert(hiqGameHistory).values({
                memberId,
                gameId: '00000000-0000-0000-0000-000000000000', // Dummy
                gameMode: 'practice',
                gameType: 'golf',
                score: s.score,
                innings: 18,
                average: (s.score / 18).toFixed(2),
                isWinner: true,
                isRanked: false,
                locationName: s.locationName,
                sportCategory: 'GOLF' as any,
                createdAt: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000)
            });
        }
    }

    async updateCourseHoleInfo(data: { courseId: string, courseName: string, subPathName?: string, holeNo: number, par: number }) {
        const [existing] = await db.select().from(hiqCourseHoleInfo)
            .where(and(
                eq(hiqCourseHoleInfo.courseId, data.courseId),
                eq(hiqCourseHoleInfo.subPathName, data.subPathName || ""),
                eq(hiqCourseHoleInfo.holeNo, data.holeNo)
            ));

        if (existing) {
            if (existing.par === data.par) {
                await db.update(hiqCourseHoleInfo)
                    .set({ voteCount: existing.voteCount + 1, isVerified: existing.voteCount + 1 >= 5 })
                    .where(eq(hiqCourseHoleInfo.id, existing.id));
            } else {
                console.warn(`PAR Mismatch for ${data.courseName} H${data.holeNo}: DB ${existing.par} vs Extracted ${data.par}`);
            }
        } else {
            await db.insert(hiqCourseHoleInfo).values({
                courseId: data.courseId,
                courseName: data.courseName,
                subPathName: data.subPathName || "",
                holeNo: data.holeNo,
                par: data.par,
                voteCount: 1,
                isVerified: false
            });
        }
    }

    async processScorecardOCR(ocrData: any) {
        const items = ocrData.textAnnotations || [];
        if (items.length <= 1) return null;

        const words = items.slice(1).map((ann: any) => ({
            text: ann.description,
            bounds: ann.boundingPoly.vertices,
            center: {
                x: (ann.boundingPoly.vertices[0].x + ann.boundingPoly.vertices[2].x) / 2,
                y: (ann.boundingPoly.vertices[0].y + ann.boundingPoly.vertices[2].y) / 2
            }
        }));

        const rows: any[][] = [];
        words.sort((a: any, b: any) => a.center.y - b.center.y);

        let currentRow: any[] = [];
        let lastY = -1;

        words.forEach((w: any) => {
            if (lastY === -1 || Math.abs(w.center.y - lastY) < 15) {
                currentRow.push(w);
            } else {
                rows.push(currentRow.sort((a, b) => a.center.x - b.center.x));
                currentRow = [w];
            }
            lastY = w.center.y;
        });
        if (currentRow.length > 0) rows.push(currentRow.sort((a, b) => a.center.x - b.center.x));

        const parsed = {
            meta: { source_type: "SMART_SCORE_IMAGE", course_name_raw: "Auto Detected", date: new Date().toISOString().split('T')[0] },
            courses: [] as any[]
        };

        let currentCourse: any = { course_name: "Out Course", pars: [], players: [] };

        rows.forEach(row => {
            const rowText = row.map(w => w.text).join(' ');
            if (rowText.includes('PAR') || rowText.match(/[345]\s[345]\s[345]/)) {
                currentCourse.pars = row.filter(w => w.text.match(/^\d$/)).map(w => parseInt(w.text));
            } else if (row.length >= 10 && row[0].text.length >= 2) {
                const scores = row.slice(1, 10).map(w => parseInt(w.text) || 0);
                const total = parseInt(row[10]?.text) || scores.reduce((a, b) => a + b, 0);
                currentCourse.players.push({ name: row[0].text, scores, total });
            }
        });

        if (currentCourse.pars.length > 0) parsed.courses.push(currentCourse);

        return parsed;
    }

    // --- Notification Inbox ---
    async getNotifications(memberId: string): Promise<HiqNotification[]> {
        return await db.select()
            .from(hiqNotifications)
            .where(eq(hiqNotifications.memberId, memberId))
            .orderBy(desc(hiqNotifications.createdAt))
            .limit(50);
    }

    async createNotification(data: InsertHiqNotification): Promise<HiqNotification> {
        const [notification] = await db.insert(hiqNotifications).values(data).returning();
        return notification;
    }

    async markNotificationAsRead(id: string, memberId: string): Promise<void> {
        await db.update(hiqNotifications)
            .set({ isRead: true })
            .where(and(eq(hiqNotifications.id, id), eq(hiqNotifications.memberId, memberId)));
    }

    async deleteNotification(id: string, memberId: string): Promise<void> {
        await db.delete(hiqNotifications)
            .where(and(eq(hiqNotifications.id, id), eq(hiqNotifications.memberId, memberId)));
    }
}
