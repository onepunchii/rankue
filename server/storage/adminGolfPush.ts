/**
 * 어드민 · 골프 푸시 발송 기록 — 2026-10-01 오너: "골프 부분이 어드민에 많이 빠져 있다 — 넣을 수 있는 거 다 넣자".
 *
 * 왜 따로 읽나: '골프 알림 받는 회원'에게 보낸 알림은 category 'GOLF' 로 저장한다. 알림함은 종목별로 갈린다
 * (notification.repo sportWhere — 골프 화면은 category 'GOLF' 만 보여 준다). 'admin' 으로 저장하면 골프 모드로 쓰는 사람의
 * 알림함에는 안 보이고 당구로 바꿔야 보인다. 그런데 기존 발송 기록(admin.repo getPushHistory)은 category 'admin' 만 센다 —
 * 그래서 골프 발송분을 같은 방식(같은 제목·내용·주소·분 단위로 묶어 받은 사람·읽은 사람)으로 여기서 읽어 라우트가 합친다.
 * 'broadcast' type 은 어드민 발송만 쓴다(긴급 조인은 GOLF_URGENT, 관심 알림은 다른 type).
 */
import { sql } from "drizzle-orm";
import { db } from "../db.js";

export interface GolfPushHistoryItem {
    title: string;
    body: string;
    url: string | null;
    sentAt: string;
    recipients: number;
    readCount: number;
    audience: "golf";
}

export async function getGolfPushHistory(limit = 20): Promise<GolfPushHistoryItem[]> {
    const rows = (await db.execute(sql`
        select title, body, params->>'url' as url,
               to_char(date_trunc('minute', min(created_at)), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as sent_at,
               count(*)::int as recipients,
               count(*) filter (where is_read)::int as read_count
        from hiq_notifications
        where category = 'GOLF' and type = 'broadcast' and created_at >= now() - interval '90 days'
        group by title, body, params->>'url', date_trunc('minute', created_at)
        order by min(created_at) desc
        limit ${limit}`)).rows as Record<string, unknown>[];
    return rows.map((r) => ({
        title: String(r.title ?? ""),
        body: String(r.body ?? ""),
        url: (r.url as string | null) ?? null,
        sentAt: String(r.sent_at ?? ""),
        recipients: Number(r.recipients ?? 0),
        readCount: Number(r.read_count ?? 0),
        audience: "golf" as const,
    }));
}
