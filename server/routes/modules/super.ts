import { Router } from "express";
import { db } from "../../db.js";
import {
    profiles,
    hiqStores,
    hiqMembers,
    hiqVisitLogs,
    partnerLeads,
    suggestions,
    errorLogs
} from "../../../shared/schema.js";
import { desc, eq, sql } from "drizzle-orm";

const router = Router();

// 개별 카운트 쿼리 실행 헬퍼
// (하나가 실패해도 전체 응답이 500으로 죽지 않도록 null 반환 — 부분 실패 허용)
async function safeCount(label: string, query: Promise<{ count: number }[]>): Promise<number | null> {
    try {
        const [row] = await query;
        return Number(row.count);
    } catch (error) {
        console.error(`[SuperSummary] '${label}' 카운트 실패:`, error);
        return null;
    }
}

// 개인 식별정보 마스킹 — 건의 내용에 이메일·전화번호가 섞여 들어오는 경우 대비
// (통합 대시보드로 나가는 응답이므로 식별정보는 내보내지 않는다)
function redactPII(text: string): string {
    return text
        .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "(이메일)")
        .replace(/01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/g, "(전화번호)");
}

// --- 슈퍼관리자 요약 ---
// GET /api/super-summary            → 카운트 요약
// GET /api/super-summary?detail=1   → 요약 + 건의함·에러함 최근 10건 목록
// 인증: Authorization: Bearer <SUPER_ADMIN_SECRET> (외부 모니터링용이라 쿠키 세션 대신 시크릿 헤더 사용)
router.get("/super-summary", async (req, res) => {
    const secret = process.env.SUPER_ADMIN_SECRET;
    if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
        return res.status(401).json({ error: "unauthorized" });
    }

    // 요약 데이터는 항상 실시간이어야 하므로 캐시 금지
    res.set("Cache-Control", "no-store");

    // "오늘/24h" 기준 통일: now() - interval '1 day'
    const [
        membersTotal,
        membersToday,
        storesTotal,
        storeMembersTotal,
        visits24h,
        newLeads,
        unreadSuggestions,
        errors24h
    ] = await Promise.all([
        safeCount("회원 전체", db.select({ count: sql<number>`count(*)` })
            .from(profiles).where(eq(profiles.role, 'user'))),
        safeCount("회원 24h 신규", db.select({ count: sql<number>`count(*)` })
            .from(profiles)
            .where(sql`${profiles.role} = 'user' AND ${profiles.createdAt} >= now() - interval '1 day'`)),
        safeCount("매장", db.select({ count: sql<number>`count(*)` }).from(hiqStores)),
        safeCount("매장회원", db.select({ count: sql<number>`count(*)` }).from(hiqMembers)),
        safeCount("방문 24h", db.select({ count: sql<number>`count(*)` })
            .from(hiqVisitLogs)
            .where(sql`${hiqVisitLogs.visitedAt} >= now() - interval '1 day'`)),
        safeCount("신규 파트너 문의", db.select({ count: sql<number>`count(*)` })
            .from(partnerLeads).where(eq(partnerLeads.status, 'NEW'))),
        safeCount("미확인 건의", db.select({ count: sql<number>`count(*)` })
            .from(suggestions).where(eq(suggestions.isRead, false))),
        safeCount("에러 24h", db.select({ count: sql<number>`count(*)` })
            .from(errorLogs)
            .where(sql`${errorLogs.createdAt} >= now() - interval '1 day'`))
    ]);

    // 서비스 특성 지표 (쿼리 실패분은 제외)
    const metrics = [
        { label: "매장", value: storesTotal },
        { label: "매장회원", value: storeMembersTotal },
        { label: "방문(24시간)", value: visits24h }
    ].filter((m): m is { label: string; value: number } => m.value !== null);

    // 사람 눈길이 필요한 미처리 항목 (0건이거나 쿼리 실패면 제외)
    const pending = [
        { label: "신규 파트너 문의", count: newLeads },
        { label: "미확인 건의", count: unreadSuggestions }
    ].filter((p): p is { label: string; count: number } => p.count !== null && p.count > 0);

    const body: Record<string, unknown> = {
        ts: new Date().toISOString(),
        members: {
            total: membersTotal ?? 0,
            today: membersToday ?? 0
        },
        metrics,
        pending,
        errors24h: errors24h ?? 0
    };

    // detail=1 — 통합 대시보드 드로어용 건의함·에러함 최근 목록 (실패해도 요약은 살린다)
    if (req.query.detail === "1") {
        try {
            const rows = await db.select({
                when: suggestions.createdAt,
                text: suggestions.content,
                done: suggestions.isRead
            }).from(suggestions)
                .orderBy(desc(suggestions.createdAt))
                .limit(10);
            body.feedbackRecent = rows.map((r) => ({
                when: r.when.toISOString(),
                text: redactPII(r.text).slice(0, 120),
                done: r.done
            }));
        } catch (error) {
            console.error("[SuperSummary] 건의 목록 조회 실패:", error);
            body.feedbackRecent = [];
        }

        try {
            // 같은 메시지(앞 120자 기준)는 그룹핑해서 발생 횟수와 최근 발생 시각만 노출
            const rows = await db.select({
                when: sql<string>`to_char(max(${errorLogs.createdAt}), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
                message: sql<string>`left(${errorLogs.message}, 120)`,
                count: sql<number>`count(*)::int`
            }).from(errorLogs)
                .groupBy(sql`left(${errorLogs.message}, 120)`)
                .orderBy(sql`max(${errorLogs.createdAt}) desc`)
                .limit(10);
            body.errorRecent = rows.map((r) => ({
                when: r.when,
                message: redactPII(r.message),
                count: Number(r.count)
            }));
        } catch (error) {
            console.error("[SuperSummary] 에러 목록 조회 실패:", error);
            body.errorRecent = [];
        }
    }

    return res.json(body);
});

export default router;
