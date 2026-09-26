import { db } from "../db.js";
import {
    hiqStores,
    hiqCrews,
    profiles,
    partnerLeads,
    notices,
    hiqVisitLogs,
    hiqMembers,
    hiqTournaments,
    hiqSettlements,
    hiqSettlementItems,
    hiqSettlementParticipants,
    suggestions,
    suggestionReplies,
    storeListings,
    hiqReports,
    hiqModerationActions,
    hiqCommunityPosts,
    hiqCommunityComments,
    hiqCrewPosts,
    hiqCrewComments,
    hiqCrewPhotos,
    hiqCrewPhotoComments,
    hiqCrewChats,
    hiqChatMessages,
    hiqNotifications,
    golfBookings,
    hiqPlayerCheers} from "../../shared/schema.js";
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
    InsertSuggestion,
    SuggestionReply,
    HiqModerationAction
} from "../../shared/schema.js";
import { eq, desc, asc, and, or, sql, gt, gte, like, isNull, inArray } from "drizzle-orm";
import {
    TARGET_LABEL, ACTION_LABEL, REPORT_ALERT_TYPE, REPORT_ALERT_WINDOW_MIN,
    isReportTargetType, isModerationAction, reportKey, reasonLabel, previewText,
    summarizeReports, isAppealOpen, queueState, isOverdue, availableActions,
    type ReportTargetType, type ModerationAction, type QueueState, type ReportSummary,
} from "../lib/reportQueue.js";
import { SUGGESTION_ALERT_TYPE, SUGGESTION_ALERT_WINDOW_MIN, attachReplies, type SuggestionReplyView } from "../lib/suggestionBox.js";

// --- 신고 큐 타입(2026-09-11, SX1) ---
// 원문을 대상 종류마다 다른 테이블에서 읽어 한 모양으로 맞춘 것.
interface ResolvedTarget {
    exists: boolean;
    title: string | null;
    text: string | null;
    images: string[];
    isBlinded: boolean | null;
    blindReason: string | null;
    appealText: string | null;
    appealAt: Date | null;
    authorId: string | null;
    crewId: string | null;
    meta: string | null;
    link: string | null;
    createdAt: Date | null;
}
const MISSING_TARGET: ResolvedTarget = {
    exists: false, title: null, text: null, images: [], isBlinded: null, blindReason: null,
    appealText: null, appealAt: null, authorId: null, crewId: null, meta: null, link: null, createdAt: null,
};
const BOARD_LABEL: Record<string, string> = { brag: "한 큐 자랑", ask: "물어보기", store: "우리 매장", lesson: "레슨" };
const STAFF_ROLES: readonly string[] = ["admin", "super_admin"];
const crewLink = (crewId: string | null) => (crewId ? `/crew/${crewId}` : null);
/** 한국 날짜 0시를 UTC 벽시계로 — `컬럼 >= 이것` 이 한국 "오늘"이다(appSession.repo 와 같은 식). */
const KST_TODAY_START = sql`(date_trunc('day', now() at time zone 'Asia/Seoul') - interval '9 hours')`;
const fmtKst = (d: Date) => d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
const toHistory = (h: HiqModerationAction) => ({
    action: h.action,
    label: isModerationAction(h.action) ? ACTION_LABEL[h.action] : h.action,
    at: h.createdAt,
    note: h.note,
});

export interface ReportQueueItem {
    key: string;
    targetType: ReportTargetType;
    targetId: string;
    typeLabel: string;
    state: QueueState;
    /** 미처리인데 24시간을 넘겼다. */
    overdue: boolean;
    reportCount: number;
    reporterCount: number;
    pendingCount: number;
    reasons: ReportSummary["reasons"];
    firstReportedAt: Date | null;
    latestReportedAt: Date | null;
    oldestPendingAt: Date | null;
    /** 최근 20건. 신고자는 이름만(연락처 없음). */
    reports: Array<{ id: string; reporterName: string; reason: string; reasonLabel: string; detail: string | null; status: string; createdAt: Date }>;
    content: {
        exists: boolean; title: string | null; text: string | null; images: string[];
        isBlinded: boolean | null; blindReason: string | null; meta: string | null; link: string | null;
        crewName: string | null; createdAt: Date | null;
    };
    author: { memberId: string; name: string; banned: boolean; canBan: boolean; banBlock: "no_account" | "staff" | null } | null;
    appeal: { text: string | null; at: Date | null; open: boolean } | null;
    lastAction: { action: string; label: string; at: Date; note: string | null } | null;
    history: Array<{ action: string; label: string; at: Date; note: string | null }>;
    actions: ModerationAction[];
}

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

    // ── 사이트맵/공개 매장 조회 (인증 불필요, 민감필드 제외) ──
    async getCrewsForSitemap() {
        return db.select({ id: hiqCrews.id }).from(hiqCrews);
    }

    async getStoresForSitemap() {
        // 디렉토리에 연결된 매장은 제외 — /stores/:code 가 정본이고 /store/:slug 는 그리로
        // 301 리다이렉트되므로 둘 다 실으면 중복 URL 이다.
        return db.select({ slug: hiqStores.slug }).from(hiqStores)
            .leftJoin(storeListings, eq(storeListings.claimedStoreId, hiqStores.id))
            .where(isNull(storeListings.id));
    }

    async getPublicStores() {
        return db.select({
            slug: hiqStores.slug,
            name: hiqStores.name,
            region: hiqStores.region,
            address: hiqStores.address,
            phone: hiqStores.phone,
            description: hiqStores.description,
            latitude: hiqStores.latitude,
            longitude: hiqStores.longitude,
        }).from(hiqStores).orderBy(asc(hiqStores.name));
    }

    async getPublicStoreBySlug(slug: string) {
        const [s] = await db.select({
            slug: hiqStores.slug,
            name: hiqStores.name,
            region: hiqStores.region,
            address: hiqStores.address,
            phone: hiqStores.phone,
            description: hiqStores.description,
            notice: hiqStores.notice,
            latitude: hiqStores.latitude,
            longitude: hiqStores.longitude,
            // 디렉토리에 연결된 매장이면 그 코드 — /store/:slug(주소만 있는 구형 페이지)에서
            // /stores/:code(요금표·명예의전당이 있는 정본)로 보내기 위한 것.
            // 같은 매장에 페이지가 둘 뜨는 혼란의 근원 차단(2026-08-28 실사고).
            listingCode: storeListings.code,
        }).from(hiqStores)
            .leftJoin(storeListings, eq(storeListings.claimedStoreId, hiqStores.id))
            .where(eq(hiqStores.slug, slug));
        return s ?? null;
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
    // "오늘"은 한국 날짜다. 서버(Vercel)·DB 는 UTC 라 setHours(0)·CURRENT_DATE 로 자르면 한국 오전 9시에 하루가 바뀐다.
    // timestamp 컬럼은 UTC 벽시계로 저장된다(golf.repo 와 같은 전제) — 한국 0시를 UTC 로 바꿔 비교한다.
    async getGlobalStats() {
        const [row] = (await db.execute(sql`
            select
              (select count(*)::int from profiles where role = 'user') as total_users,
              (select count(*)::int from hiq_stores) as total_stores,
              (select count(*)::int from partner_leads where status = 'NEW') as new_leads,
              (select count(*)::int from hiq_visit_logs where visited_at >= ${KST_TODAY_START}) as visits_today,
              (select count(*)::int from hiq_members where created_at >= ${KST_TODAY_START}) as new_users_today`)).rows as Record<string, unknown>[];
        return {
            totalUsers: Number(row?.total_users ?? 0),
            totalStores: Number(row?.total_stores ?? 0),
            newLeads: Number(row?.new_leads ?? 0),
            totalVisitsToday: Number(row?.visits_today ?? 0),
            newUsersToday: Number(row?.new_users_today ?? 0),
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
            handi3c: hiqMembers.handi3c,
            handi4c: hiqMembers.handi4c,
            marketingAgree: hiqMembers.marketingAgree,
            locale: hiqMembers.locale,
            // 계정 상태·권한(정지 여부를 회원 관리에서 바로 보이게) — 프로필이 없으면 null
            status: profiles.status,
            role: profiles.role,
            // 가입 경로 매장 이름(시스템 매장이면 slug 로 구분)
            storeName: sql<string | null>`(select st.name from hiq_stores st where st.id = ${hiqMembers.storeId})`,
            storeSlug: sql<string | null>`(select st.slug from hiq_stores st where st.id = ${hiqMembers.storeId})`,
            // 국가 = 프로필의 IP 기반 자동 수집값(국가 랭킹 축과 동일).
            countryCode: profiles.countryCode,
            // 기기 = 푸시토큰 접두사로 판별. 'apns:'=애플, 'fcm:'=안드로이드.
            //   토큰 원문은 민감정보라 내려주지 않고, 접두사만으로 platform 을 만든다.
            platform: sql<string | null>`
                CASE
                    WHEN ${profiles.pushToken} LIKE 'apns:%' THEN 'ios'
                    WHEN ${profiles.pushToken} LIKE 'fcm:%' THEN 'android'
                    ELSE NULL
                END`,
            // 온라인게임(시뮬레이터) 이용: 연습 세션 수 · 대전 수(호스트/게스트) — 2026-09-08 오너
            simSessions: sql<number>`(select count(*)::int from hiq_sim_sessions s where s.member_id = ${hiqMembers.id})`,
            simMatches: sql<number>`(select count(*)::int from hiq_sim_matches x where x.host_id = ${hiqMembers.id} or x.guest_id = ${hiqMembers.id})`,
            // 앱 접속(2026-09-13 오너: 잔류 측정) — 마지막 접속 · 최근 7일 접속일수 · 최근 30일 평균 세션(분, 4시간 상한)
            // 'Z' 를 붙인 UTC 문자열로 — 시간대 없는 값을 브라우저가 기기 시각(한국)으로 읽으면 9시간 어긋난다.
            lastSeenAt: sql<string | null>`(select to_char(max(coalesce(closed_at, last_seen_at)), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') from hiq_app_sessions a where a.member_id = ${hiqMembers.id})`,
            activeDays7: sql<number>`(select count(distinct date(opened_at))::int from hiq_app_sessions a where a.member_id = ${hiqMembers.id} and opened_at >= now() - interval '7 days')`,
            avgSessionMin30: sql<number | null>`(select round(avg(least(extract(epoch from (coalesce(closed_at, last_seen_at) - opened_at)), 14400)) / 60)::int
                from hiq_app_sessions a where a.member_id = ${hiqMembers.id} and opened_at >= now() - interval '30 days')`,
        }).from(hiqMembers)
            .leftJoin(profiles, eq(hiqMembers.profileId, profiles.id))
            .orderBy(sql`${hiqMembers.createdAt} DESC`);
    }

    /**
     * 어드민 회원 정보 수정 — 허용한 칸만. 전화번호·RP 는 여기서 바꾸지 않는다
     * (전화번호는 로그인 열쇠라 프로필과 함께 움직여야 하고, RP 는 경기 기록에서 계산되는 값이다).
     */
    async updateMemberForAdmin(id: string, patch: {
        name?: string; gender?: "male" | "female" | null; birthYear?: number | null;
        handi3c?: number | null; handi4c?: number | null;
    }) {
        const set: Record<string, unknown> = {};
        if (patch.name !== undefined) set.name = patch.name;
        if (patch.gender !== undefined) set.gender = patch.gender;
        if (patch.birthYear !== undefined) set.birthYear = patch.birthYear;
        if (patch.handi3c !== undefined) set.handi3c = patch.handi3c;
        if (patch.handi4c !== undefined) set.handi4c = patch.handi4c;
        if (Object.keys(set).length === 0) return null;
        set.updatedAt = new Date();
        const [row] = await db.update(hiqMembers).set(set).where(eq(hiqMembers.id, id))
            .returning({ id: hiqMembers.id, name: hiqMembers.name, profileId: hiqMembers.profileId });
        return row ?? null;
    }

    /**
     * 사장님 대시보드 숫자. 방문 = 그 매장으로 가입한 회원이 앱을 연 날(hiq_visit_logs, 하루 한 번).
     * 날짜는 모두 한국 기준(위 getGlobalStats 주석).
     */
    async getAdminStats(storeId: string): Promise<{
        totalMembers: number;
        visitsToday: number;
        visitsYesterday: number;
        newToday: number;
        newThisMonth: number;
        active30: number;
        dormant30: number;
        visits7: { date: string; count: number }[];
    }> {
        const [row] = (await db.execute(sql`
            select
              (select count(*)::int from hiq_members where store_id = ${storeId}) as total,
              (select count(*)::int from hiq_members where store_id = ${storeId} and created_at >= ${KST_TODAY_START}) as new_today,
              (select count(*)::int from hiq_members where store_id = ${storeId}
                 and created_at >= date_trunc('month', now() at time zone 'Asia/Seoul') - interval '9 hours') as new_month,
              (select count(*)::int from hiq_members where store_id = ${storeId}
                 and last_visited_at >= now() at time zone 'UTC' - interval '30 days') as active30`)).rows as Record<string, unknown>[];
        // 최근 7일(오늘 포함) 날짜별 방문 회원 수 — 빈 날도 0 으로 채운다.
        const days = (await db.execute(sql`
            select to_char((v.visited_at at time zone 'UTC' at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD') as d,
                   count(distinct v.member_id)::int as n
            from hiq_visit_logs v join hiq_members m on m.id = v.member_id
            where m.store_id = ${storeId} and v.visited_at >= ${KST_TODAY_START} - interval '6 days'
            group by 1`)).rows as Record<string, unknown>[];
        const byDay = new Map(days.map((d) => [String(d.d), Number(d.n ?? 0)]));
        const visits7: { date: string; count: number }[] = [];
        const todayKst = new Date(Date.now() + 9 * 3600_000);
        for (let i = 6; i >= 0; i--) {
            const key = new Date(todayKst.getTime() - i * 86_400_000).toISOString().slice(0, 10);
            visits7.push({ date: key, count: byDay.get(key) ?? 0 });
        }
        const total = Number(row?.total ?? 0);
        const active30 = Number(row?.active30 ?? 0);
        return {
            totalMembers: total,
            visitsToday: visits7[6].count,
            visitsYesterday: visits7[5].count,
            newToday: Number(row?.new_today ?? 0),
            newThisMonth: Number(row?.new_month ?? 0),
            active30,
            dormant30: Math.max(0, total - active30),
            visits7,
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

    // --- 신고 큐 (2026-09-11, 스토어 심사 SX1 — Apple 1.2 / Play UGC) ---
    // 예전 getReportedUsers 는 "신고 테이블이 없다"며 늘 [] 를 돌려주는 자리표시였다. hiq_reports 는 이미
    // 신고를 받고 있었는데 읽는 곳이 없어서, 운영자 화면엔 늘 "클린합니다"만 떴다.
    // 이제 대상(종류·id)별로 묶고 원문 미리보기·작성자·이의제기·처리 기록을 붙인다.
    // 민감 칼럼(전화·비밀번호·토큰·계좌)은 SELECT 에 올리지 않는다 — 옛 목업이 profiles 전 칼럼을 내보내던 누출을 되살리지 않게.

    /** storage 호환용 이름. 신고 큐 첫 쪽(미처리 먼저)을 돌려준다. */
    async getReportedUsers() {
        return this.getReportQueue({ filter: "all" });
    }

    // 큐 SQL 의 공통 앞부분. is_open 은 lib/reportQueue 의 queueState·isAppealOpen 과 같은 식이어야 한다
    // (정렬·미처리 건수가 화면에 뜨는 상태와 어긋나지 않게).
    private reportQueueCte() {
        return sql`
            WITH g AS (
                SELECT r.target_type, r.target_id,
                       count(*) FILTER (WHERE r.status = 'pending')::int AS pending,
                       min(r.created_at) FILTER (WHERE r.status = 'pending') AS oldest_pending_at,
                       max(r.created_at) AS latest_at
                FROM ${hiqReports} r
                GROUP BY r.target_type, r.target_id
            ), x AS (
                SELECT g.*,
                       (SELECT max(a.created_at) FROM ${hiqModerationActions} a
                         WHERE a.target_type = g.target_type AND a.target_id = g.target_id) AS last_action_at,
                       CASE g.target_type
                           WHEN 'community_post' THEN (SELECT p.appeal_at FROM ${hiqCommunityPosts} p
                                                        WHERE p.id = g.target_id AND p.is_blinded)
                           WHEN 'community_comment' THEN (SELECT c.appeal_at FROM ${hiqCommunityComments} c
                                                           WHERE c.id = g.target_id AND c.is_blinded AND c.deleted_at IS NULL)
                       END AS appeal_at
                FROM g
            ), q AS (
                SELECT x.*,
                       (x.pending > 0 OR (x.appeal_at IS NOT NULL AND (x.last_action_at IS NULL OR x.appeal_at > x.last_action_at))) AS is_open
                FROM x
            )`;
    }

    /**
     * 신고 큐 한 쪽. filter: open=미처리만, handled=처리된 것만, all=전부(미처리 먼저).
     * 미처리는 가장 오래 기다린 것(안 닫힌 신고·이의제기)부터 — 24시간 기한이 급한 순. 처리된 것은 최근 신고 순.
     */
    async getReportQueue(opts: { filter?: "open" | "handled" | "all"; limit?: number; offset?: number } = {}) {
        const filter = opts.filter ?? "all";
        const limit = Math.min(Math.max(Math.floor(opts.limit ?? 30), 1), 100);
        const offset = Math.max(Math.floor(opts.offset ?? 0), 0);
        const where = filter === "open" ? sql`WHERE is_open` : filter === "handled" ? sql`WHERE NOT is_open` : sql``;
        const keyRows: Array<{ targetType: string; targetId: string }> = await db.execute(sql`${this.reportQueueCte()}
            SELECT target_type AS "targetType", target_id AS "targetId"
            FROM q ${where}
            ORDER BY is_open DESC,
                     CASE WHEN is_open THEN COALESCE(oldest_pending_at, appeal_at) END ASC NULLS LAST,
                     latest_at DESC, target_id
            LIMIT ${limit + 1} OFFSET ${offset}`).then((r: any) => r.rows ?? r);
        const [counts]: any[] = await db.execute(sql`${this.reportQueueCte()}
            SELECT count(*) FILTER (WHERE is_open)::int AS "openCount", count(*)::int AS "total" FROM q`).then((r: any) => r.rows ?? r);
        const items = await this.buildReportItems(keyRows.slice(0, limit));
        return {
            items,
            openCount: Number(counts?.openCount ?? 0),
            total: Number(counts?.total ?? 0),
            hasMore: keyRows.length > limit,
            offset,
            limit,
        };
    }

    /** 대상 하나의 최신 상태(조치 직전 대조용). 신고가 한 건도 없으면 null. */
    async getReportTarget(targetType: ReportTargetType, targetId: string): Promise<ReportQueueItem | null> {
        const [item] = await this.buildReportItems([{ targetType, targetId }]);
        return item && item.reportCount > 0 ? item : null;
    }

    private async buildReportItems(keys: Array<{ targetType: string; targetId: string }>): Promise<ReportQueueItem[]> {
        const valid = keys.filter((k) => isReportTargetType(k.targetType));
        if (!valid.length) return [];
        const ids = [...new Set(valid.map((k) => k.targetId))];

        const [reportRows, actionRows, targets] = await Promise.all([
            db.select({
                id: hiqReports.id,
                targetType: hiqReports.targetType,
                targetId: hiqReports.targetId,
                reporterId: hiqReports.reporterId,
                reason: hiqReports.reason,
                detail: hiqReports.detail,
                status: hiqReports.status,
                createdAt: hiqReports.createdAt,
                reporterName: hiqMembers.name,
            })
                .from(hiqReports)
                .leftJoin(hiqMembers, eq(hiqReports.reporterId, hiqMembers.id))
                .where(inArray(hiqReports.targetId, ids))
                .orderBy(desc(hiqReports.createdAt)),
            db.select().from(hiqModerationActions)
                .where(inArray(hiqModerationActions.targetId, ids))
                .orderBy(desc(hiqModerationActions.createdAt)),
            this.resolveReportTargets(valid),
        ]);

        const reportsByKey = new Map<string, typeof reportRows>();
        for (const r of reportRows) {
            const k = reportKey(r.targetType, r.targetId);
            reportsByKey.set(k, [...(reportsByKey.get(k) ?? []), r]);
        }
        const actionsByKey = new Map<string, HiqModerationAction[]>();
        for (const a of actionRows) {
            const k = reportKey(a.targetType, a.targetId);
            actionsByKey.set(k, [...(actionsByKey.get(k) ?? []), a]);
        }

        // 작성자 — 원문을 지운 뒤에도 정지할 수 있게, 원문이 없으면 처리 기록에 남긴 작성자로 되짚는다.
        const authorOf = new Map<string, string | null>();
        for (const k of valid) {
            const key = reportKey(k.targetType, k.targetId);
            authorOf.set(key, targets.get(key)?.authorId ?? actionsByKey.get(key)?.find((a) => a.authorMemberId)?.authorMemberId ?? null);
        }
        const authorIds = [...new Set([...authorOf.values()].filter((v): v is string => !!v))];
        const crewIds = [...new Set([...targets.values()].map((t) => t.crewId).filter((v): v is string => !!v))];
        const authors = new Map<string, { id: string; name: string; profileId: string | null; status: string | null; role: string | null }>();
        if (authorIds.length) {
            const rows = await db.select({
                id: hiqMembers.id,
                name: hiqMembers.name,
                profileId: hiqMembers.profileId,
                status: profiles.status,
                role: profiles.role,
            })
                .from(hiqMembers)
                .leftJoin(profiles, eq(hiqMembers.profileId, profiles.id))
                .where(inArray(hiqMembers.id, authorIds));
            for (const a of rows) authors.set(a.id, a);
        }
        const crewNames = new Map<string, string>();
        if (crewIds.length) {
            const rows = await db.select({ id: hiqCrews.id, name: hiqCrews.name }).from(hiqCrews).where(inArray(hiqCrews.id, crewIds));
            for (const c of rows) crewNames.set(c.id, c.name);
        }

        const now = new Date();
        return valid.map(({ targetType, targetId }) => {
            const type = targetType as ReportTargetType;
            const key = reportKey(type, targetId);
            const reports = reportsByKey.get(key) ?? [];
            const history = actionsByKey.get(key) ?? [];
            const t = targets.get(key) ?? MISSING_TARGET;
            const summary = summarizeReports(reports);
            const last = history[0] ?? null;
            const appealOpen = t.exists && isAppealOpen({ appealAt: t.appealAt, isBlinded: t.isBlinded, lastActionAt: last?.createdAt });
            const a = authors.get(authorOf.get(key) ?? "");
            const staff = !!a?.role && STAFF_ROLES.includes(a.role);
            // 운영자 계정은 정지 버튼을 만들지 않는다 — 운영자 글에 몰려든 보복 신고로 자기 계정을 잠그는 사고를 막는다.
            const author = a
                ? {
                    memberId: a.id,
                    name: a.name,
                    banned: a.status === "banned",
                    canBan: !!a.profileId && !staff,
                    banBlock: !a.profileId ? ("no_account" as const) : staff ? ("staff" as const) : null,
                }
                : null;
            const state = queueState({
                pendingCount: summary.pendingCount,
                actionedCount: summary.actionedCount,
                appealOpen,
                lastAction: last?.action ?? null,
            });
            return {
                key,
                targetType: type,
                targetId,
                typeLabel: TARGET_LABEL[type],
                state,
                overdue: state === "open" && isOverdue(summary.oldestPendingAt ?? (appealOpen ? t.appealAt : null), now),
                reportCount: summary.reportCount,
                reporterCount: summary.reporterCount,
                pendingCount: summary.pendingCount,
                reasons: summary.reasons,
                firstReportedAt: summary.firstReportedAt,
                latestReportedAt: summary.latestReportedAt,
                oldestPendingAt: summary.oldestPendingAt,
                reports: reports.slice(0, 20).map((r) => ({
                    id: r.id,
                    reporterName: r.reporterName ?? "(알 수 없는 회원)",
                    reason: r.reason,
                    reasonLabel: reasonLabel(r.reason),
                    detail: r.detail,
                    status: r.status,
                    createdAt: r.createdAt,
                })),
                content: {
                    exists: t.exists,
                    title: t.title,
                    text: t.text,
                    images: t.images,
                    isBlinded: t.isBlinded,
                    blindReason: t.blindReason,
                    meta: t.meta,
                    link: t.link,
                    crewName: t.crewId ? crewNames.get(t.crewId) ?? null : null,
                    createdAt: t.createdAt,
                },
                author,
                appeal: t.exists && (t.appealText || t.appealAt) ? { text: t.appealText, at: t.appealAt, open: appealOpen } : null,
                lastAction: last ? toHistory(last) : null,
                history: history.slice(0, 10).map(toHistory),
                actions: availableActions({
                    targetType: type,
                    exists: t.exists,
                    isBlinded: t.isBlinded,
                    appealOpen,
                    pendingCount: summary.pendingCount,
                    author,
                }),
            };
        });
    }

    // 신고 대상 원문을 종류별 테이블에서 한꺼번에 읽는다(종류마다 쿼리 한 번, N+1 없음).
    private async resolveReportTargets(keys: Array<{ targetType: string; targetId: string }>): Promise<Map<string, ResolvedTarget>> {
        const out = new Map<string, ResolvedTarget>();
        const put = (t: ReportTargetType, id: string, v: Partial<ResolvedTarget>) =>
            out.set(reportKey(t, id), { ...MISSING_TARGET, ...v, exists: v.exists ?? true });
        const jobs: Promise<void>[] = [];
        const job = (t: ReportTargetType, run: (ids: string[]) => Promise<void>) => {
            const ids = [...new Set(keys.filter((k) => k.targetType === t).map((k) => k.targetId))];
            if (ids.length) jobs.push(run(ids));
        };

        job("community_post", async (ids) => {
            const rows = await db.select({
                id: hiqCommunityPosts.id,
                authorId: hiqCommunityPosts.authorId,
                board: hiqCommunityPosts.board,
                title: hiqCommunityPosts.title,
                content: hiqCommunityPosts.content,
                images: hiqCommunityPosts.images,
                isBlinded: hiqCommunityPosts.isBlinded,
                blindReason: hiqCommunityPosts.blindReason,
                appealText: hiqCommunityPosts.appealText,
                appealAt: hiqCommunityPosts.appealAt,
                createdAt: hiqCommunityPosts.createdAt,
            }).from(hiqCommunityPosts).where(inArray(hiqCommunityPosts.id, ids));
            for (const r of rows) put("community_post", r.id, {
                title: r.title, text: previewText(r.content), images: r.images ?? [],
                isBlinded: r.isBlinded, blindReason: r.blindReason, appealText: r.appealText, appealAt: r.appealAt,
                authorId: r.authorId, meta: BOARD_LABEL[r.board] ?? r.board, link: `/community/${r.id}`, createdAt: r.createdAt,
            });
        });

        job("community_comment", async (ids) => {
            const rows = await db.select({
                id: hiqCommunityComments.id,
                postId: hiqCommunityComments.postId,
                authorId: hiqCommunityComments.authorId,
                content: hiqCommunityComments.content,
                isBlinded: hiqCommunityComments.isBlinded,
                blindReason: hiqCommunityComments.blindReason,
                appealText: hiqCommunityComments.appealText,
                appealAt: hiqCommunityComments.appealAt,
                parentId: hiqCommunityComments.parentId,
                deletedAt: hiqCommunityComments.deletedAt,
                createdAt: hiqCommunityComments.createdAt,
            }).from(hiqCommunityComments).where(inArray(hiqCommunityComments.id, ids));
            for (const r of rows) {
                // 답글이 달려 '삭제된 댓글' 자리로 남은 행은 원문이 없다 — 지운 것으로 보되 작성자는 남긴다(정지 판단용).
                if (r.deletedAt) { put("community_comment", r.id, { exists: false, authorId: r.authorId }); continue; }
                put("community_comment", r.id, {
                    text: previewText(r.content), isBlinded: r.isBlinded, blindReason: r.blindReason,
                    appealText: r.appealText, appealAt: r.appealAt, authorId: r.authorId,
                    meta: r.parentId ? "답글" : "댓글", link: `/community/${r.postId}`, createdAt: r.createdAt,
                });
            }
        });

        job("player_cheer", async (ids) => {
            const rows = await db.select().from(hiqPlayerCheers).where(inArray(hiqPlayerCheers.id, ids));
            for (const r of rows) {
                if (r.deletedAt) { put("player_cheer", r.id, { exists: false, authorId: r.authorId }); continue; }
                put("player_cheer", r.id, {
                    text: previewText(r.content), isBlinded: r.isBlinded, blindReason: r.blindReason,
                    appealText: null, appealAt: null, authorId: r.authorId,
                    meta: "응원글", link: ["owgr", "rolex", "kpga", "klpga"].includes(r.category) ? `/golfer/${r.category}/${r.playerUmbId}` : `/player/${r.category}/${r.playerUmbId}`, createdAt: r.createdAt,
                });
            }
        });

        job("crew_post", async (ids) => {
            const rows = await db.select({
                id: hiqCrewPosts.id,
                crewId: hiqCrewPosts.crewId,
                authorId: hiqCrewPosts.authorId,
                title: hiqCrewPosts.title,
                content: hiqCrewPosts.content,
                images: hiqCrewPosts.images,
                category: hiqCrewPosts.category,
                createdAt: hiqCrewPosts.createdAt,
            }).from(hiqCrewPosts).where(inArray(hiqCrewPosts.id, ids));
            for (const r of rows) put("crew_post", r.id, {
                title: r.title, text: previewText(r.content), images: r.images ?? [], authorId: r.authorId,
                crewId: r.crewId, meta: r.category || "게시글", link: crewLink(r.crewId), createdAt: r.createdAt,
            });
        });

        // crew_comment: crew_photo_comment 가 생기기 전(2026-09-11) 신고는 게시글 댓글과 사진 댓글을 함께 가리켰다 — 두 테이블을 다 본다.
        job("crew_comment", async (ids) => {
            const [postComments, photoComments] = await Promise.all([
                db.select({
                    id: hiqCrewComments.id,
                    authorId: hiqCrewComments.authorId,
                    content: hiqCrewComments.content,
                    createdAt: hiqCrewComments.createdAt,
                    crewId: hiqCrewPosts.crewId,
                    postTitle: hiqCrewPosts.title,
                })
                    .from(hiqCrewComments)
                    .leftJoin(hiqCrewPosts, eq(hiqCrewComments.postId, hiqCrewPosts.id))
                    .where(inArray(hiqCrewComments.id, ids)),
                db.select({
                    id: hiqCrewPhotoComments.id,
                    authorId: hiqCrewPhotoComments.authorId,
                    content: hiqCrewPhotoComments.content,
                    createdAt: hiqCrewPhotoComments.createdAt,
                    crewId: hiqCrewPhotos.crewId,
                })
                    .from(hiqCrewPhotoComments)
                    .leftJoin(hiqCrewPhotos, eq(hiqCrewPhotoComments.photoId, hiqCrewPhotos.id))
                    .where(inArray(hiqCrewPhotoComments.id, ids)),
            ]);
            for (const r of photoComments) put("crew_comment", r.id, {
                text: previewText(r.content), authorId: r.authorId, crewId: r.crewId,
                meta: "사진 댓글", link: crewLink(r.crewId), createdAt: r.createdAt,
            });
            for (const r of postComments) put("crew_comment", r.id, {
                text: previewText(r.content), authorId: r.authorId, crewId: r.crewId,
                meta: r.postTitle ? `게시글 댓글 · ${r.postTitle}` : "게시글 댓글", link: crewLink(r.crewId), createdAt: r.createdAt,
            });
        });

        job("crew_photo_comment", async (ids) => {
            const rows = await db.select({
                id: hiqCrewPhotoComments.id,
                authorId: hiqCrewPhotoComments.authorId,
                content: hiqCrewPhotoComments.content,
                createdAt: hiqCrewPhotoComments.createdAt,
                crewId: hiqCrewPhotos.crewId,
            })
                .from(hiqCrewPhotoComments)
                .leftJoin(hiqCrewPhotos, eq(hiqCrewPhotoComments.photoId, hiqCrewPhotos.id))
                .where(inArray(hiqCrewPhotoComments.id, ids));
            for (const r of rows) put("crew_photo_comment", r.id, {
                text: previewText(r.content), authorId: r.authorId, crewId: r.crewId,
                meta: "사진 댓글", link: crewLink(r.crewId), createdAt: r.createdAt,
            });
        });

        job("crew_photo", async (ids) => {
            const rows = await db.select({
                id: hiqCrewPhotos.id,
                crewId: hiqCrewPhotos.crewId,
                uploaderId: hiqCrewPhotos.uploaderId,
                url: hiqCrewPhotos.url,
                caption: hiqCrewPhotos.caption,
                createdAt: hiqCrewPhotos.createdAt,
            }).from(hiqCrewPhotos).where(inArray(hiqCrewPhotos.id, ids));
            for (const r of rows) put("crew_photo", r.id, {
                text: previewText(r.caption), images: [r.url], authorId: r.uploaderId, crewId: r.crewId,
                meta: "사진첩", link: crewLink(r.crewId), createdAt: r.createdAt,
            });
        });

        job("crew_chat", async (ids) => {
            // 크루 채팅은 2026-09-21 부터 hiq_chat_messages("crew:<id>") 에 있다(옛 행도 id 그대로 이관됨).
            // 옛 표를 보면 새 메시지의 신고가 '원문 없음'이 되어 삭제·정지 조치가 목록에서 빠졌다(2026-09-22 리뷰).
            const rows = await db.select({
                id: hiqChatMessages.id,
                roomKey: hiqChatMessages.roomKey,
                senderId: hiqChatMessages.senderId,
                message: hiqChatMessages.message,
                type: hiqChatMessages.type,
                createdAt: hiqChatMessages.createdAt,
            }).from(hiqChatMessages).where(inArray(hiqChatMessages.id, ids));
            for (const r of rows) {
                const crewId = r.roomKey.startsWith("crew:") ? r.roomKey.slice(5) : null;
                put("crew_chat", r.id, {
                    text: previewText(r.message), authorId: r.senderId, crewId,
                    meta: r.type === "text" ? "채팅" : `채팅 · ${r.type}`, link: crewId ? crewLink(crewId) : null, createdAt: r.createdAt,
                });
            }
        });

        job("member", async (ids) => {
            const rows = await db.select({
                id: hiqMembers.id,
                name: hiqMembers.name,
                introduction: hiqMembers.introduction,
                profileImageUrl: profiles.profileImageUrl,
                createdAt: hiqMembers.createdAt,
            })
                .from(hiqMembers)
                .leftJoin(profiles, eq(hiqMembers.profileId, profiles.id))
                .where(inArray(hiqMembers.id, ids));
            for (const r of rows) put("member", r.id, {
                title: r.name, text: previewText(r.introduction), images: r.profileImageUrl ? [r.profileImageUrl] : [],
                authorId: r.id, meta: "회원 프로필", createdAt: r.createdAt,
            });
        });

        // 골프 매물 — 읽기(와 가리기)만 한다. 골프 쪽 코드는 건드리지 않고, 매니저 전화번호는 싣지 않는다.
        job("golf_booking", async (ids) => {
            const rows = await db.select({
                id: golfBookings.id,
                ownerId: golfBookings.ownerId,
                courseName: golfBookings.courseName,
                region: golfBookings.region,
                datetime: golfBookings.datetime,
                greenFee: golfBookings.greenFee,
                comment: golfBookings.comment,
                listingType: golfBookings.listingType,
                isBlinded: golfBookings.isBlinded,
                blindReason: golfBookings.blindReason,
                createdAt: golfBookings.createdAt,
            }).from(golfBookings).where(inArray(golfBookings.id, ids));
            for (const r of rows) put("golf_booking", r.id, {
                title: r.courseName, text: previewText(r.comment), isBlinded: r.isBlinded, blindReason: r.blindReason,
                authorId: r.ownerId,
                meta: [r.listingType === "JOIN" ? "조인" : "부킹", r.region, fmtKst(r.datetime), `${r.greenFee.toLocaleString("ko-KR")}원`].join(" · "),
                createdAt: r.createdAt,
            });
        });

        await Promise.all(jobs);
        return out;
    }

    /**
     * 가리기/풀기(가릴 수 있는 대상만 — lib/reportQueue BLINDABLE_TARGETS). 바뀐 행이 있으면 true.
     * 자동 블라인드(community.repo report)와 같은 칸을 쓴다. 그쪽은 신고 흐름 안에 붙어 있어 따로 부를 함수가 없다.
     */
    async setReportTargetBlinded(targetType: ReportTargetType, targetId: string, blinded: boolean, reason: string | null): Promise<boolean> {
        const blindReason = blinded ? reason : null;
        switch (targetType) {
            case "community_post":
                return (await db.update(hiqCommunityPosts)
                    .set({ isBlinded: blinded, blindReason, updatedAt: new Date() })
                    .where(eq(hiqCommunityPosts.id, targetId))
                    .returning({ id: hiqCommunityPosts.id })).length > 0;
            case "community_comment":
                return (await db.update(hiqCommunityComments)
                    .set({ isBlinded: blinded, blindReason })
                    .where(eq(hiqCommunityComments.id, targetId))
                    .returning({ id: hiqCommunityComments.id })).length > 0;
            case "player_cheer":
                return (await db.update(hiqPlayerCheers)
                    .set({ isBlinded: blinded, blindReason })
                    .where(eq(hiqPlayerCheers.id, targetId))
                    .returning({ id: hiqPlayerCheers.id })).length > 0;
            case "golf_booking":
                return (await db.update(golfBookings)
                    .set({ isBlinded: blinded, blindReason })
                    .where(eq(golfBookings.id, targetId))
                    .returning({ id: golfBookings.id })).length > 0;
            default:
                return false;
        }
    }

    /** 이 대상의 안 닫힌 신고를 닫는다. 이미 닫힌 신고의 판단은 덮어쓰지 않는다(처리 이력은 hiq_moderation_actions 에 따로 쌓인다). */
    async closeReports(targetType: ReportTargetType, targetId: string, status: "actioned" | "dismissed"): Promise<number> {
        const rows = await db.update(hiqReports)
            .set({ status })
            .where(and(eq(hiqReports.targetType, targetType), eq(hiqReports.targetId, targetId), eq(hiqReports.status, "pending")))
            .returning({ id: hiqReports.id });
        return rows.length;
    }

    async logModerationAction(data: {
        targetType: ReportTargetType; targetId: string; action: ModerationAction;
        adminProfileId: string | null; authorMemberId: string | null; note: string | null;
    }): Promise<void> {
        await db.insert(hiqModerationActions).values(data);
    }

    /** 게시글 사진은 앨범에도 복사된다(crew.repo createCrewPost) — 위반 게시글을 지울 때 앨범에 남은 복사본 id. */
    async findCrewAlbumCopies(crewId: string, urls: string[]): Promise<string[]> {
        if (!urls.length) return [];
        const rows = await db.select({ id: hiqCrewPhotos.id })
            .from(hiqCrewPhotos)
            .where(and(eq(hiqCrewPhotos.crewId, crewId), inArray(hiqCrewPhotos.url, urls)));
        return rows.map((r) => r.id);
    }

    /**
     * 신고 알림을 받을 운영자 회원 id — 프로필 role 이 admin/super_admin 인 계정마다 하나.
     * 한 프로필에 회원 행이 여럿이면 가장 오래된 것(로그인이 고르는 행, user.repo getMemberByProfileId 와 같은 기준).
     */
    async getStaffMemberIds(): Promise<string[]> {
        const rows = await db.selectDistinctOn([hiqMembers.profileId], { id: hiqMembers.id })
            .from(hiqMembers)
            .innerJoin(profiles, eq(hiqMembers.profileId, profiles.id))
            .where(inArray(profiles.role, ["admin", "super_admin"]))
            .orderBy(hiqMembers.profileId, asc(hiqMembers.createdAt));
        return rows.map((r) => r.id);
    }

    /**
     * 운영자 알림 도배 방지 판단 재료(lib/reportQueue shouldAlertAdmins).
     * 시각 비교는 DB 의 now() 로 한다 — 앱 서버 시계·시간대와 무관하게, 저장할 때와 같은 기준으로.
     */
    async getReportAlertState(targetType: ReportTargetType, targetId: string, reporterId: string) {
        const key = reportKey(targetType, targetId);
        const [row]: any[] = await db.execute(sql`
            SELECT
                EXISTS (SELECT 1 FROM ${hiqReports}
                         WHERE target_type = ${targetType} AND target_id = ${targetId} AND reporter_id = ${reporterId}
                           AND created_at > now() - interval '2 minutes') AS "freshReport",
                (SELECT count(DISTINCT reporter_id)::int FROM ${hiqReports}
                  WHERE target_type = ${targetType} AND target_id = ${targetId}) AS "reporterCount",
                EXISTS (SELECT 1 FROM ${hiqNotifications}
                         WHERE type = ${REPORT_ALERT_TYPE} AND params->>'reportKey' = ${key}
                           AND created_at > now() - make_interval(mins => ${REPORT_ALERT_WINDOW_MIN}::int)) AS "alertedThisTarget",
                (SELECT count(DISTINCT params->>'reportKey')::int FROM ${hiqNotifications}
                  WHERE type = ${REPORT_ALERT_TYPE}
                    AND created_at > now() - make_interval(mins => ${REPORT_ALERT_WINDOW_MIN}::int)) AS "targetsAlerted",
                (SELECT count(DISTINCT params->>'reportKey')::int FROM ${hiqNotifications}
                  WHERE type = ${REPORT_ALERT_TYPE} AND params->>'reporterId' = ${reporterId}
                    AND created_at > now() - make_interval(mins => ${REPORT_ALERT_WINDOW_MIN}::int)) AS "reporterAlerts"
        `).then((r: any) => r.rows ?? r);
        return {
            freshReport: !!row?.freshReport,
            reporterCount: Number(row?.reporterCount ?? 0),
            alertedThisTarget: !!row?.alertedThisTarget,
            targetsAlerted: Number(row?.targetsAlerted ?? 0),
            reporterAlerts: Number(row?.reporterAlerts ?? 0),
        };
    }

    async banUser(userId: string): Promise<void> {
        await db.update(profiles).set({ status: 'banned' }).where(eq(profiles.id, userId));
    }

    /** 정지 해제 — 잘못 누른 정지를 되돌린다(신고 큐의 '정지 해제'). */
    async unbanUser(profileId: string): Promise<void> {
        await db.update(profiles).set({ status: 'active' }).where(eq(profiles.id, profileId));
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

    /**
     * 건의 목록(최신부터) + 건의마다 보낸 답장(오래된 것부터). 답장은 한 번에 다 읽어 붙인다 — 건의마다 읽으면 N+1.
     * 답장은 건의가 지워지면 함께 지워지므로(FK cascade) 전부 읽어도 목록 밖 건의의 몫은 없다.
     */
    async getSuggestions(): Promise<(Suggestion & { replies: SuggestionReplyView[] })[]> {
        const rows = await db.select().from(suggestions).orderBy(desc(suggestions.createdAt));
        if (!rows.length) return [];
        const replies = await db.select({
            id: suggestionReplies.id,
            suggestionId: suggestionReplies.suggestionId,
            message: suggestionReplies.message,
            createdAt: suggestionReplies.createdAt,
        }).from(suggestionReplies).orderBy(asc(suggestionReplies.createdAt));
        return attachReplies(rows, replies);
    }

    /** 운영자가 앱으로 보낸 답장을 건의에 남긴다(POST /admin/suggestions/:id/reply). */
    async createSuggestionReply(data: { suggestionId: string; message: string; adminProfileId: string | null }): Promise<SuggestionReply> {
        const [row] = await db.insert(suggestionReplies).values(data).returning();
        return row;
    }

    /**
     * 새 건의 운영자 알림 도배 방지 재료(lib/suggestionBox shouldAlertSuggestion) — 이 회원의 건의로 최근에 알렸나.
     * 시각 비교는 DB 의 now() 로 한다(getReportAlertState 와 같은 이유 — 저장할 때와 같은 시계).
     */
    async getSuggestionAlertState(submitterMemberId: string): Promise<{ alertedRecently: boolean; submittersAlerted: number }> {
        const [row]: any[] = await db.execute(sql`
            SELECT
                EXISTS (SELECT 1 FROM ${hiqNotifications}
                         WHERE type = ${SUGGESTION_ALERT_TYPE} AND params->>'submitterMemberId' = ${submitterMemberId}
                           AND created_at > now() - make_interval(mins => ${SUGGESTION_ALERT_WINDOW_MIN}::int)) AS "alertedRecently",
                (SELECT count(DISTINCT params->>'submitterMemberId')::int FROM ${hiqNotifications}
                  WHERE type = ${SUGGESTION_ALERT_TYPE}
                    AND created_at > now() - make_interval(mins => ${SUGGESTION_ALERT_WINDOW_MIN}::int)) AS "submittersAlerted"
        `).then((r: any) => r.rows ?? r);
        return { alertedRecently: !!row?.alertedRecently, submittersAlerted: Number(row?.submittersAlerted ?? 0) };
    }

    /** 안 읽은 건의 전부 읽음 처리. 어드민이 하나씩 누르던 걸 한 번에. */
    async markAllSuggestionsRead(): Promise<number> {
        const rows = await db.update(suggestions)
            .set({ isRead: true })
            .where(eq(suggestions.isRead, false))
            .returning({ id: suggestions.id });
        return rows.length;
    }

    async markSuggestionRead(id: string, isRead: boolean): Promise<Suggestion> {
        const [updated] = await db.update(suggestions)
            .set({ isRead })
            .where(eq(suggestions.id, id))
            .returning();
        return updated;
    }
}
