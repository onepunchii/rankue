/**
 * 채팅 금지(2026-10-26 — 표 hiq_chat_moderation, migrations/hiq_chat_moderation.sql). 규칙은 shared/chatBan.ts.
 * 시각 비교는 DB 의 now() 로만 한다 — JS Date 를 raw sql 에 넣으면 KST 기기에서 9시간 어긋난다(timestamp 열 함정과 같은 뿌리).
 * 표가 없으면(마이그레이션 전) 금지가 없는 것으로 본다 — 채팅이 통째로 멈추면 안 된다.
 */
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { CHAT_AUTO_BAN_HITS, CHAT_AUTO_BAN_HOURS, CHAT_HIT_WINDOW_MIN, type ChatBan } from "../../shared/chatBan.js";

const rowsOf = (r: any) => (r?.rows ?? r ?? []) as any[];
const missing = (e: any) => ["42P01", "42703"].includes(e?.code ?? e?.cause?.code);
const toBan = (r: any): ChatBan | null => (r?.ban_until ? { until: new Date(r.ban_until).toISOString(), reason: r.ban_reason ?? null, by: r.ban_by ?? null } : null);

/** 지금 채팅 금지 중이면 그 내용, 아니면 null */
export async function chatBanOf(memberId: string): Promise<ChatBan | null> {
    try {
        const [r] = rowsOf(await db.execute(sql`select ban_until, ban_reason, ban_by from hiq_chat_moderation where member_id = ${memberId}::uuid and ban_until > now()`));
        return toBan(r);
    } catch (e) {
        if (missing(e)) return null;
        throw e;
    }
}

/** 운영자의 채팅 금지 · 풀기(hours 가 null 이면 푼다). 더 짧게 덮어쓸 수 있다 — 운영자가 정한 값이 맞다 */
export async function setChatBan(memberId: string, hours: number | null, reason: string | null, by: string | null): Promise<ChatBan | null> {
    const until = hours == null ? sql`null` : sql`now() + make_interval(hours => ${hours})`;
    const [r] = rowsOf(await db.execute(sql`
        insert into hiq_chat_moderation (member_id, ban_until, ban_reason, ban_by, updated_at)
        values (${memberId}::uuid, ${until}, ${reason}, ${by}, now())
        on conflict (member_id) do update set ban_until = excluded.ban_until, ban_reason = excluded.ban_reason, ban_by = excluded.ban_by, hits = 0, updated_at = now()
        returning ban_until, ban_reason, ban_by`));
    return hours == null ? null : toBan(r);
}

/**
 * 막힌 말을 하나 센다 — CHAT_HIT_WINDOW_MIN 분 안에 CHAT_AUTO_BAN_HITS 번이면 CHAT_AUTO_BAN_HOURS 시간 자동 금지(이미 더 긴 금지면 그대로).
 * 막 금지됐으면 그 내용을 돌려준다. 표가 없거나 실패하면 null — 거른 말이 막히는 것은 그대로다.
 */
export async function countChatFilterHit(memberId: string): Promise<ChatBan | null> {
    try {
        const [r] = rowsOf(await db.execute(sql`
            insert into hiq_chat_moderation (member_id, hits, hits_at, updated_at) values (${memberId}::uuid, 1, now(), now())
            on conflict (member_id) do update set
                hits = case when hiq_chat_moderation.hits_at > now() - make_interval(mins => ${CHAT_HIT_WINDOW_MIN}) then hiq_chat_moderation.hits + 1 else 1 end,
                hits_at = now(), updated_at = now()
            returning hits`));
        if (Number(r?.hits ?? 0) < CHAT_AUTO_BAN_HITS) return null;
        const [b] = rowsOf(await db.execute(sql`
            update hiq_chat_moderation set
                ban_until = greatest(coalesce(ban_until, now()), now() + make_interval(hours => ${CHAT_AUTO_BAN_HOURS})),
                ban_reason = case when ban_until > now() + make_interval(hours => ${CHAT_AUTO_BAN_HOURS}) then ban_reason else ${`자동: 막힌 말 ${CHAT_AUTO_BAN_HITS}번(${CHAT_HIT_WINDOW_MIN}분 안)`} end,
                ban_by = case when ban_until > now() + make_interval(hours => ${CHAT_AUTO_BAN_HOURS}) then ban_by else 'auto' end,
                hits = 0, updated_at = now()
            where member_id = ${memberId}::uuid
            returning ban_until, ban_reason, ban_by`));
        return toBan(b);
    } catch (e) {
        if (!missing(e)) console.warn("[chatBan] count", (e as Error)?.message);
        return null;
    }
}
