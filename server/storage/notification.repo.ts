import { db } from "../db.js";
import { hiqNotifications, hiqMembers, profiles } from "../../shared/schema.js";
import { eq, and, or, ne, isNull, desc, sql } from "drizzle-orm";
import type { HiqNotification, InsertHiqNotification, InsertHiqCrewNotificationSetting } from "../../shared/schema.js";

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
    async getNotifications(memberId: string, sport: "BILLIARDS" | "GOLF" = "BILLIARDS"): Promise<HiqNotification[]> {
        return await db.select()
            .from(hiqNotifications)
            .where(and(
                eq(hiqNotifications.memberId, memberId),
                sport === "GOLF"
                    ? eq(hiqNotifications.category, "GOLF")
                    : or(isNull(hiqNotifications.category), ne(hiqNotifications.category, "GOLF"))!,
            ))
            .orderBy(desc(hiqNotifications.createdAt));
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
     * 내 알림 전부 읽음 처리. 이미 읽은 건 건드리지 않는다(updatedAt 이 있는 스키마가
     * 아니라 실익은 없지만, 쓰기 행 수를 줄이고 반환값으로 "몇 건이 새로 읽혔는지"를 준다).
     */
    async markAllNotificationsAsRead(memberId: string): Promise<number> {
        const rows = await db.update(hiqNotifications)
            .set({ isRead: true })
            .where(and(eq(hiqNotifications.memberId, memberId), eq(hiqNotifications.isRead, false)))
            .returning({ id: hiqNotifications.id });
        return rows.length;
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
