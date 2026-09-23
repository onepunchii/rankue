import { db } from "../db.js";
import { hiqNotifications, hiqMembers, profiles } from "../../shared/schema.js";
import { eq, and, or, ne, isNull, desc, sql, getTableColumns, type SQL } from "drizzle-orm";
import type { HiqNotification, InsertHiqNotification, InsertHiqCrewNotificationSetting } from "../../shared/schema.js";
import { NOTIF_GROUPS, NOTIF_GROUP_TYPES, type NotifGroup } from "../../shared/notificationGroup.js";

export type NotifSport = "BILLIARDS" | "GOLF";

/**
 * 종목 조건. 한 벌만 둔다 — 목록·읽음처리·개수가 서로 다른 조건을 쓰면
 * "당구에서 모두 읽음을 눌렀는데 골프 알림까지 읽혔다"(2026-09-23 이전의 실제 버그)가 난다.
 * category 가 비어 있는 옛 알림은 당구로 본다(골프가 열린 적이 없으니 전부 당구다).
 */
function sportWhere(sport: NotifSport): SQL {
    return sport === "GOLF"
        ? eq(hiqNotifications.category, "GOLF")
        : or(isNull(hiqNotifications.category), ne(hiqNotifications.category, "GOLF"))!;
}

/** 저장된 type 을 shared/notificationGroup 의 notifGroup 과 같은 방식으로 정규화(trim + 대문자, NULL 은 ''). */
const TYPE_KEY = sql`upper(trim(coalesce(${hiqNotifications.type}, '')))`;

/**
 * params 에서 url. jsonb 가 객체면 ->>'url', 통째로 문자열이면 그 문자열 자체 —
 * 화면의 urlOf() 와 같은 방어를 SQL 에서도 한다(한쪽만 보면 "칩엔 3건, 열면 1건" 이 난다).
 */
const PARAMS_URL = sql`coalesce(
    ${hiqNotifications.params}->>'url',
    case when jsonb_typeof(${hiqNotifications.params}) = 'string' then ${hiqNotifications.params}#>>'{}' end
)`;

/**
 * '멀티방이 열렸어요' 전체 방송인가 — isRoomBroadcast 의 SQL 판.
 * `like '%rooms=1%'` 은 `mushrooms=1` 을 물기에 쿼리 경계를 정규식으로 본다.
 */
const IS_BROADCAST = sql`(${TYPE_KEY} in ('MATCH', 'SIM_MATCH') and ${PARAMS_URL} ~ '[?&]rooms=1(&|$|#)')`;

const typeList = (g: NotifGroup) => sql.join(
    NOTIF_GROUP_TYPES[g].map((t) => sql`${t.toUpperCase()}`),
    sql`, `,
);

/**
 * 이 행의 묶음('turn'|'chat'|'crew'|'notice')을 내는 **한 개의** SQL 식.
 * 목록 필터와 byGroup 집계가 이걸 같이 쓴다 — 묶음마다 조건을 따로 쓰면 언젠가 갈라진다.
 *
 * shared 의 notifGroup 과 판정 순서까지 같다:
 *  1. MATCH/SIM_MATCH 이면서 rooms=1 → notice (옛 방송 2,023행. 7일 크론이 걷어갈 때까지 필요하다)
 *  2. turn/chat/crew 목록에 있으면 그 묶음
 *  3. 그 밖은 전부 notice ← notice 를 `in (목록)` 으로 쓰면 **안 되는** 이유.
 *     notice 는 "명시된 것 + 모르는 전부"라 나머지 셋의 여집합이다(여기서는 else 가 그 역할).
 */
const GROUP_EXPR = sql`case
    when ${IS_BROADCAST} then 'notice'
    when ${TYPE_KEY} in (${typeList("turn")}) then 'turn'
    when ${TYPE_KEY} in (${typeList("chat")}) then 'chat'
    when ${TYPE_KEY} in (${typeList("crew")}) then 'crew'
    else 'notice'
end`;

const groupWhere = (group: NotifGroup): SQL => sql`${GROUP_EXPR} = ${group}`;

/** 목록 한 페이지 크기. 화면은 30을 쓰고, 손으로 부른 limit 이 커도 50에서 자른다. */
export const NOTIF_PAGE_DEFAULT = 30;
export const NOTIF_PAGE_MAX = 50;

export function clampNotifLimit(raw: unknown): number {
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n) || n <= 0) return NOTIF_PAGE_DEFAULT;
    return Math.min(n, NOTIF_PAGE_MAX);
}

/* ── 목록 커서 ──────────────────────────────────────────────────────────────
 * 커서는 "마이크로초까지의 시각|마지막 행 id" 한 덩어리다. 화면은 이걸 뜯어보지 않고 그대로 돌려준다.
 *
 * ISO 문자열 하나로는 왜 안 되나(2026-09-23 실측):
 *  · created_at 은 마이크로초(6자리)인데 운영 4,559행 중 4,557행이 밀리초 아래 자리를 갖고 있다.
 *    JS Date 를 한 번 거치면 그 자리가 **내림**으로 잘려, 잘린 폭(최대 1ms) 안의 다음 행이 영영 안 보인다.
 *  · 시각이 똑같은 행이 둘이면 `<` 가 그 둘을 통째로 건너뛴다
 *    (동시각 3행 · limit=2 → 2건만 보이고 1건이 사라지는 걸 실측했다).
 * 그래서 시각은 **DB 가 만든 문자열 그대로**(to_char, US) 들고 다니고, 동점은 id 로 가른다.
 * 덤으로 이 경로에서 JS Date 가 사라진다 — raw sql 에 Date 를 끼웠을 때의 9시간 어긋남 함정 자체가 없다.
 */
const CURSOR_SEP = "|";
/** to_char 와 짝이다. 마이크로초 6자리까지 그대로 싣는다. */
const CURSOR_TS_EXPR = sql`to_char(${hiqNotifications.createdAt}, 'YYYY-MM-DD"T"HH24:MI:SS.US')`;
const TS_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 모양만 맞는 게 아니라 **실제로 있는 날짜**인가. `2026-13-99T99:99:99` 은 자릿수만 보면 통과하지만
 * `::timestamp` 로 가면 Postgres 가 던져 목록이 통째로 500 이 된다(달력 넘침은 여기서 막는다).
 * 여기 Date 는 달력 검사기일 뿐 질의에 들어가지 않는다 — 커서 값은 끝까지 문자열이다.
 */
function isRealTimestamp(ts: string): boolean {
    const m = TS_RE.exec(ts);
    if (!m) return false;
    const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
    const dt = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d
        && dt.getUTCHours() === h && dt.getUTCMinutes() === mi && dt.getUTCSeconds() === s;
}

type NotifCursor = { ts: string; id?: string };

/**
 * 받은 커서를 읽는다. 못 읽으면 undefined — 커서 없이(최신부터) 준다.
 * 옛 화면이 보내던 밀리초 ISO(`...126Z`)도 받는다. 그때는 id 없이 시각만으로 자른다(옛 동작 그대로).
 */
export function parseNotifCursor(raw: unknown): NotifCursor | undefined {
    if (typeof raw !== "string" || !raw) return undefined;
    const cut = raw.indexOf(CURSOR_SEP);
    const tsPart = (cut < 0 ? raw : raw.slice(0, cut)).trim();
    const idPart = cut < 0 ? "" : raw.slice(cut + 1).trim();
    // 옛 ISO 는 UTC 표시 Z 가 붙어 온다. 열이 timestamp(시간대 없음)라 값은 그대로 쓰고 꼬리표만 뗀다.
    const ts = tsPart.endsWith("Z") ? tsPart.slice(0, -1) : tsPart;
    if (!isRealTimestamp(ts)) return undefined;
    return UUID_RE.test(idPart) ? { ts, id: idPart } : { ts };
}

/**
 * 이 커서보다 "뒤"(더 오래된) 행. 같은 시각이면 id 가 작은 쪽이 뒤다 — 정렬과 같은 순서여야 한다.
 * `created_at <= ts` 를 앞에 두는 건 일부러다: 이건 인덱스가 바로 받는 조건이고,
 * 동점 가리기는 그 안에서 거른다(행 하나짜리 필터).
 */
function cursorWhere(c: NotifCursor): SQL {
    return c.id
        ? sql`(${hiqNotifications.createdAt} <= ${c.ts}::timestamp and (${hiqNotifications.createdAt} < ${c.ts}::timestamp or ${hiqNotifications.id} < ${c.id}::uuid))`
        : sql`${hiqNotifications.createdAt} < ${c.ts}::timestamp`;
}

export type NotifUnreadCounts = { unread: number; byGroup: Record<NotifGroup, number> };

export class NotificationRepository {
    /**
     * 지금 기기 알림을 받을 수 있는 회원(푸시 토큰 보유). 멀티방 알림 같은 "지금 오세요" 방송용 —
     * 토큰 없는 회원은 알림함에만 쌓여 방이 닫힌 뒤에 읽히므로 제외한다.
     */
    async listPushableMembers(excludeIds: readonly string[], limit = 300): Promise<string[]> {
        const rows = await db.select({ id: hiqMembers.id })
            .from(hiqMembers)
            .innerJoin(profiles, eq(profiles.id, hiqMembers.profileId))
            .where(and(
                sql`${profiles.pushToken} is not null`,
                excludeIds.length ? sql`${hiqMembers.id} not in ${excludeIds}` : sql`true`,
            ))
            .limit(limit);
        return rows.map((r) => r.id);
    }

    /**
     * 골프 긴급 조인(당일 떨이) 전체 방송을 받을 회원 — 기기 알림을 받을 수 있고 **골프에 흔적이 있는** 사람만.
     * 당구만 쓰는 회원에게 "오늘 그린피 만원" 푸시가 가면 그건 안내가 아니라 스팸이다(2026-09-23 오너).
     * 흔적: 핸디캡을 적었거나 · 골프 글을 올렸거나 · 조인을 신청했거나 · 골프 기록이 있거나 · 골프 크루에 있거나.
     * ⚠️ golf_handicap 은 기본값이 0 이라 "is not null" 로 세면 전 회원이 걸린다 — 실제로 적은 사람(> 0)만 본다.
     */
    async listGolfPushMembers(excludeIds: readonly string[], limit = 300): Promise<string[]> {
        const rows = await db.select({ id: hiqMembers.id })
            .from(hiqMembers)
            .innerJoin(profiles, eq(profiles.id, hiqMembers.profileId))
            .where(and(
                sql`${profiles.pushToken} is not null`,
                excludeIds.length ? sql`${hiqMembers.id} not in ${excludeIds}` : sql`true`,
                sql`(
                    coalesce(${hiqMembers.golfHandicap}, 0) > 0
                    or exists (select 1 from golf_bookings gb where gb.owner_id = ${hiqMembers.id})
                    or exists (select 1 from golf_join_requests gjr where gjr.member_id = ${hiqMembers.id})
                    or exists (select 1 from hiq_game_history gh where gh.member_id = ${hiqMembers.id} and gh.sport_category = 'GOLF')
                    or exists (select 1 from hiq_crew_members cm join hiq_crews c on c.id = cm.crew_id where cm.member_id = ${hiqMembers.id} and c.sport_category = 'GOLF')
                )`,
            ))
            .limit(limit);
        return rows.map((r) => r.id);
    }

    /**
     * 이 회원이 최근 hours 시간 안에 긴급 조인 방송을 했나(도배 방지).
     * 제목이 아니라 **올린 사람** 기준이다 — 남이 방송했다고 내 떨이가 통째로 막히면 안 된다(멀티방 방송과 같은 교훈).
     */
    async hasRecentGolfUrgent(ownerId: string, hours: number): Promise<boolean> {
        // 한 번 방송하면 수백 행이 쌓이는 표라 세지 않고 **한 행만** 찾는다(count(*) 는 그 수백 행을 전부 훑는다).
        const rows = await db.select({ id: hiqNotifications.id })
            .from(hiqNotifications)
            .where(and(
                eq(hiqNotifications.type, "GOLF_URGENT"),
                sql`${hiqNotifications.params}->>'ownerId' = ${ownerId}`,
                sql`${hiqNotifications.createdAt} > now() - make_interval(hours => ${hours})`,
            ))
            .limit(1);
        return rows.length > 0;
    }

    /** 같은 제목의 알림이 최근 minutes 분 안에 있었나(방송 도배 방지). */
    async hasRecentTitle(title: string, minutes: number): Promise<boolean> {
        const [row] = await db.select({ n: sql<number>`count(*)::int` })
            .from(hiqNotifications)
            .where(and(
                eq(hiqNotifications.title, title),
                sql`${hiqNotifications.createdAt} > now() - make_interval(mins => ${minutes})`,
            ));
        return (row?.n ?? 0) > 0;
    }

    /**
     * 알림함. **종목별로 가른다** — 예전엔 안 갈라서 당구 알림함에 골프 알림이, 골프 알림함에 당구 알림이
     * 그대로 섞였다(2026-09-09 검토).
     * category 가 비어 있는 옛 알림은 당구로 본다(골프가 열린 적이 없으니 전부 당구다).
     */
    async getNotifications(
        memberId: string,
        sport: NotifSport = "BILLIARDS",
        opts: { group?: NotifGroup; before?: string; limit?: number } = {},
    ): Promise<{ items: HiqNotification[]; nextBefore: string | null }> {
        const limit = clampNotifLimit(opts.limit ?? NOTIF_PAGE_DEFAULT);
        const cursor = parseNotifCursor(opts.before);
        // 커서로 쓸 시각을 DB 문자열 그대로 한 칸 더 받는다(JS Date 로 옮기면 마이크로초가 잘린다).
        const rows = await db.select({
            ...getTableColumns(hiqNotifications),
            cursorTs: sql<string>`${CURSOR_TS_EXPR}`,
        })
            .from(hiqNotifications)
            .where(and(
                eq(hiqNotifications.memberId, memberId),
                sportWhere(sport),
                opts.group ? groupWhere(opts.group) : undefined,
                cursor ? cursorWhere(cursor) : undefined,
            ))
            // id 까지 정렬해야 커서의 동점 가리기와 순서가 같다. 안 맞으면 같은 행이 두 쪽에 겹치거나 사라진다.
            .orderBy(desc(hiqNotifications.createdAt), desc(hiqNotifications.id))
            .limit(limit);
        const items = rows.map(({ cursorTs, ...n }) => n as HiqNotification);
        // 꽉 찼을 때만 다음 커서를 준다. 덜 찼으면 마지막 장이다(한 번 더 부르는 헛걸음을 막는다).
        const last = rows.length === limit ? rows[rows.length - 1] : null;
        return { items, nextBefore: last ? `${last.cursorTs}${CURSOR_SEP}${last.id}` : null };
    }

    /**
     * 안 읽은 수 — 전체와 묶음별을 **질의 한 번**에. 배지가 목록 330KB 를 받아 세던 것을 대신한다.
     * 묶음마다 따로 세면 왕복 넷 + 같은 행을 네 번 훑는다.
     */
    async countUnread(memberId: string, sport: NotifSport = "BILLIARDS"): Promise<NotifUnreadCounts> {
        const [row] = await db.select({
            unread: sql<number>`count(*)::int`,
            turn: sql<number>`count(*) filter (where ${GROUP_EXPR} = 'turn')::int`,
            chat: sql<number>`count(*) filter (where ${GROUP_EXPR} = 'chat')::int`,
            crew: sql<number>`count(*) filter (where ${GROUP_EXPR} = 'crew')::int`,
            notice: sql<number>`count(*) filter (where ${GROUP_EXPR} = 'notice')::int`,
        })
            .from(hiqNotifications)
            .where(and(
                eq(hiqNotifications.memberId, memberId),
                sportWhere(sport),
                eq(hiqNotifications.isRead, false),
            ));
        const byGroup = Object.fromEntries(
            NOTIF_GROUPS.map((g) => [g, Number((row as Record<string, unknown>)?.[g] ?? 0)]),
        ) as Record<NotifGroup, number>;
        return { unread: Number(row?.unread ?? 0), byGroup };
    }

    /**
     * 오래된 알림 청소(오너 결정 2026-09-23: 7일). **읽은 것도 안 읽은 것도** 같이 지운다 —
     * 안 읽은 것을 남기면 546건 중 388건이 안 읽음인 계정은 알림함이 영원히 줄지 않는다.
     * 날짜 계산은 DB 안에서(now() - interval). JS Date 를 넘기면 시간대가 어긋난다.
     */
    async deleteOlderThan(days: number): Promise<number> {
        const d = Math.max(1, Math.floor(days));
        const res = await db.delete(hiqNotifications)
            .where(sql`${hiqNotifications.createdAt} < now() - make_interval(days => ${d})`);
        return (res as { rowCount?: number | null })?.rowCount ?? 0;
    }

    async createNotification(data: InsertHiqNotification): Promise<HiqNotification> {
        const [notif] = await db.insert(hiqNotifications).values(data).returning();
        return notif;
    }

    async markNotificationAsRead(id: string, memberId: string): Promise<void> {
        await db.update(hiqNotifications)
            .set({ isRead: true })
            .where(and(eq(hiqNotifications.id, id), eq(hiqNotifications.memberId, memberId)));
    }

    /**
     * 내 알림 전부 읽음 처리. 이미 읽은 건 건드리지 않는다(쓰기 행 수를 줄이고 "몇 건이 새로 읽혔는지"를 준다).
     * **지금 보고 있는 종목만** — 예전엔 종목을 안 봐서 당구 알림함에서 누르면 골프 알림까지 읽혔다.
     * 개수만 필요하니 .returning() 대신 rowCount 를 쓴다(388건이면 388행이 그대로 돌아왔다).
     */
    async markAllNotificationsAsRead(memberId: string, sport: NotifSport = "BILLIARDS"): Promise<number> {
        const res = await db.update(hiqNotifications)
            .set({ isRead: true })
            .where(and(
                eq(hiqNotifications.memberId, memberId),
                sportWhere(sport),
                eq(hiqNotifications.isRead, false),
            ));
        return (res as { rowCount?: number | null })?.rowCount ?? 0;
    }

    async deleteNotification(id: string, memberId: string): Promise<void> {
        await db.delete(hiqNotifications)
            .where(and(eq(hiqNotifications.id, id), eq(hiqNotifications.memberId, memberId)));
    }

    // Crew notification settings
    async getCrewNotificationSetting(crewId: string, memberId: string): Promise<{ chatEnabled: boolean; activityEnabled: boolean; settlementEnabled: boolean; postCommentEnabled: boolean; pollEnabled: boolean }> {
      const { eq, and } = await import("drizzle-orm");
      const { hiqCrewNotificationSettings } = await import("../../shared/schema.js");
      const [row] = await db.select().from(hiqCrewNotificationSettings)
        .where(and(eq(hiqCrewNotificationSettings.crewId, crewId), eq(hiqCrewNotificationSettings.memberId, memberId)));
      if (!row) return { chatEnabled: true, activityEnabled: true, settlementEnabled: true, postCommentEnabled: true, pollEnabled: true };
      return row;
    }

    async upsertCrewNotificationSetting(data: InsertHiqCrewNotificationSetting): Promise<void> {
      const { hiqCrewNotificationSettings } = await import("../../shared/schema.js");
      await db.insert(hiqCrewNotificationSettings).values(data as any)
        .onConflictDoUpdate({ target: [hiqCrewNotificationSettings.crewId, hiqCrewNotificationSettings.memberId], set: { chatEnabled: data.chatEnabled, activityEnabled: data.activityEnabled, settlementEnabled: data.settlementEnabled, postCommentEnabled: data.postCommentEnabled, pollEnabled: data.pollEnabled, updatedAt: new Date() } });
    }
}
