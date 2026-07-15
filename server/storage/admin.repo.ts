import { db } from "../db.js";
import {
    hiqStores,
    profiles,
    partnerLeads,
    notices,
    hiqVisitLogs,
    hiqMembers,
    hiqTournaments,
    hiqSettlements,
    hiqSettlementItems,
    hiqSettlementParticipants,
    suggestions
} from "../../shared/schema.js";
import type {
    HiqStore,
    InsertHiqStore,
    InsertPartnerLead,
    PartnerLead,
    Notice,
    InsertNotice,
    HiqTournament,
    InsertHiqTournament,
    Suggestion,
    InsertSuggestion
} from "../../shared/schema.js";
import { eq, desc, asc, and, or, sql, gt, gte, like } from "drizzle-orm";

export class AdminRepository {
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

    async createStore(data: InsertHiqStore): Promise<HiqStore> {
        const [store] = await db.insert(hiqStores).values(data).returning();
        return store;
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

    async searchStores(query: string): Promise<HiqStore[]> {
        if (!query || query.length < 2) return [];
        return await db.select().from(hiqStores)
            .where(or(
                like(hiqStores.name, `%${query}%`),
                like(hiqStores.address, `%${query}%`)
            ))
            .limit(10);
    }

    async getStoreByOwnerProfileId(profileId: string): Promise<HiqStore | undefined> {
        const [store] = await db.select().from(hiqStores).where(eq(hiqStores.ownerId, profileId));
        return store;
    }

    // --- Partner Leads ---
    async createPartnerLead(data: InsertPartnerLead): Promise<void> {
        await db.insert(partnerLeads).values(data);
    }

    async getPartnerLeads(): Promise<PartnerLead[]> {
        return await db.select().from(partnerLeads).orderBy(desc(partnerLeads.createdAt));
    }

    async updatePartnerLeadStatus(id: string, status: "NEW" | "CONTACTED" | "REGISTERED"): Promise<void> {
        await db.update(partnerLeads).set({ status }).where(eq(partnerLeads.id, id));
    }

    // --- Stats ---
    async getGlobalStats() {
        const usersCount = await db.select({ count: sql<number>`count(*)` }).from(profiles).where(eq(profiles.role, 'user'));
        const storesCount = await db.select({ count: sql<number>`count(*)` }).from(hiqStores);
        const leadsCount = await db.select({ count: sql<number>`count(*)` }).from(partnerLeads).where(eq(partnerLeads.status, 'NEW'));

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

    // 전역 회원 목록 (관리자 전용) — 매장 무관 전체 hiqMembers, 최신 가입순.
    // 계좌번호 등 민감 필드는 제외하고 관리 화면에 필요한 표시용 컬럼만 선택.
    async getAllMembersForAdmin() {
        return await db.select({
            id: hiqMembers.id,
            name: hiqMembers.name,
            phone: hiqMembers.phone,
            storeId: hiqMembers.storeId,
            gender: hiqMembers.gender,
            birthYear: hiqMembers.birthYear,
            rating3c: hiqMembers.rating3c,
            rating4c: hiqMembers.rating4c,
            avg3c: hiqMembers.avg3c,
            avg4c: hiqMembers.avg4c,
            visitCount: hiqMembers.visitCount,
            lastVisitedAt: hiqMembers.lastVisitedAt,
            createdAt: hiqMembers.createdAt,
            profileId: hiqMembers.profileId,
        }).from(hiqMembers).orderBy(sql`${hiqMembers.createdAt} DESC`);
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

    // --- Notices ---
    async getNotices(): Promise<Notice[]> {
        return await db.select().from(notices).orderBy(desc(notices.createdAt));
    }

    async createNotice(data: InsertNotice): Promise<Notice> {
        const [notice] = await db.insert(notices).values(data).returning();
        return notice;
    }

    // --- User Moderation ---
    async getReportedUsers(): Promise<Array<{ id: string; nickname: string | null; reportCount: number; reason: string }>> {
        // No real reports table exists yet. The previous implementation was a MOCK that
        // (a) selected full `profiles` rows — leaking plaintext password, securityAnswer,
        //     phone, email and pushToken into the admin API response and its localStorage cache, and
        // (b) fabricated random reportCounts for innocent users while the UI's Ban button
        //     fires the REAL, irreversible POST /admin/users/:id/ban.
        // Pairing mock data with a destructive real mutation is unsafe, so return no rows
        // until a genuine reports/moderation table is available. The moderation UI already
        // renders a clean empty state.
        return [];
    }

    async banUser(userId: string): Promise<void> {
        await db.update(profiles).set({ status: 'banned' }).where(eq(profiles.id, userId));
    }

    // --- Tournaments ---
    async createTournament(data: InsertHiqTournament): Promise<HiqTournament> {
        const [tournament] = await db.insert(hiqTournaments).values(data).returning();
        return tournament;
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

    // --- Settlement ---
    async createSettlement(data: any, items: any[], participants: any[]) {
        return await db.transaction(async (tx) => {
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
        // Using drizzle query builder style if possible, or manual joins
        // The monolith used `db.query.hiqSettlements.findFirst`.
        // If `db.query` is available (Requires schema to be passed to drizzle instance), we can use it.
        // Assuming `db` export has the query builder enabled.
        const settlement = await db.query.hiqSettlements.findFirst({
            where: eq(hiqSettlements.id, id),
            with: {
                items: {
                    with: {
                        // SECURITY: narrow member rows to non-sensitive fields only —
                        // never expose phone / default account numbers via the settlement detail.
                        payer: { columns: { id: true, name: true } },
                        participants: {
                            with: {
                                member: { columns: { id: true, name: true } }
                            }
                        }
                    }
                }
            }
        });
        return settlement;
    }

    // --- Suggestions ---
    async createSuggestion(data: InsertSuggestion): Promise<Suggestion> {
        const [suggestion] = await db.insert(suggestions).values(data).returning();
        return suggestion;
    }

    async getSuggestions(): Promise<Suggestion[]> {
        return await db.select().from(suggestions).orderBy(desc(suggestions.createdAt));
    }

    async markSuggestionRead(id: string, isRead: boolean): Promise<Suggestion> {
        const [updated] = await db.update(suggestions)
            .set({ isRead })
            .where(eq(suggestions.id, id))
            .returning();
        return updated;
    }
}
