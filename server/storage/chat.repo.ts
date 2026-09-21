/**
 * 채팅 허브 저장소(2026-09-21 오너: "전체 → 메시지, 크루 메시지를 개선해서 기가막힌 채팅").
 *
 * 방은 두 종류다. 크루 방(hiq_crew_chats — 그대로)과 조인·부킹 방(hiq_listing_chats — 새로). 이 저장소는
 * 두 방을 **한 목록**으로 내놓고(마지막 메시지·안 읽은 수), 읽은 시각을 적고, 조인·부킹 방의 메시지를 다룬다.
 *
 * 응답 속도의 핵심은 두 가지다. ① 메시지 폴링은 `after`(마지막으로 받은 id 의 시각) 뒤만 준다 — 새 게 없으면 빈 배열이라
 * 2초 폴링도 부담이 없다. ② 방 목록의 마지막 메시지·안 읽은 수는 방마다 질의하지 않고 한 문장(DISTINCT ON / count filter)으로 뽑는다.
 */
import { db } from "../db.js";
import { hiqListingChats, hiqChatReads, hiqCrewChats, hiqCrewMembers, hiqCrews, hiqMembers, profiles, golfBookings, golfJoinRequests } from "../../shared/schema.js";
import { eq, and, or, desc, asc, gt, sql, inArray } from "drizzle-orm";

export type RoomKind = "crew" | "listing";
export interface ChatRoomSummary {
    key: string;                 // "crew:<id>" | "listing:<id>"
    kind: RoomKind;
    id: string;
    title: string;
    subtitle: string;
    sport: "BILLIARDS" | "GOLF";
    imageUrl: string | null;
    /** 조인/부킹 방: 글의 종류·시각 (카드 그리기용) */
    listing?: { listingType: string; joinType: string | null; datetime: Date; courseName: string; region: string; lat: number | null; lng: number | null; ownerId: string | null };
    lastMessage: { text: string; at: Date; senderName: string | null } | null;
    unread: number;
    memberCount: number;
}

const roomKey = (kind: RoomKind, id: string) => `${kind}:${id}`;

export class ChatRepository {
    /** 조인·부킹 방의 명단: 올린 사람 + 확정된 신청자. */
    async listingRoomMembers(bookingId: string): Promise<string[]> {
        const [b] = await db.select({ ownerId: golfBookings.ownerId }).from(golfBookings).where(eq(golfBookings.id, bookingId)).limit(1);
        if (!b) return [];
        const accepted = await db.select({ memberId: golfJoinRequests.memberId }).from(golfJoinRequests)
            .where(and(eq(golfJoinRequests.bookingId, bookingId), inArray(golfJoinRequests.status, ["accepted", "noshow"])));
        const ids = new Set<string>(accepted.map((r) => String(r.memberId)));
        if (b.ownerId) ids.add(String(b.ownerId));
        return [...ids];
    }

    async isListingRoomMember(bookingId: string, memberId: string): Promise<boolean> {
        return (await this.listingRoomMembers(bookingId)).includes(memberId);
    }

    /** 메시지(오래된 것부터). afterAt 을 주면 그 뒤 것만 — 폴링용. */
    async listingChats(bookingId: string, afterAt?: Date, limit = 200) {
        const rows = await db.select({
            chat: hiqListingChats,
            senderName: hiqMembers.name,
            senderProfileImage: profiles.profileImageUrl,
        })
            .from(hiqListingChats)
            .leftJoin(hiqMembers, eq(hiqListingChats.senderId, hiqMembers.id))
            .leftJoin(profiles, eq(hiqMembers.profileId, profiles.id))
            .where(and(eq(hiqListingChats.bookingId, bookingId), afterAt ? gt(hiqListingChats.createdAt, afterAt) : undefined))
            .orderBy(asc(hiqListingChats.createdAt))
            .limit(limit);
        return rows.map((r) => ({ ...r.chat, sender: r.senderName ? { name: r.senderName, profileImageUrl: r.senderProfileImage } : null }));
    }

    async addListingChat(data: { bookingId: string; senderId: string | null; message: string; type?: "text" | "system"; metadata?: unknown }) {
        const [row] = await db.insert(hiqListingChats).values({
            bookingId: data.bookingId, senderId: data.senderId, message: data.message, type: data.type ?? "text", metadata: (data.metadata ?? null) as any,
        }).returning();
        return row;
    }

    async markRead(key: string, memberId: string): Promise<void> {
        await db.insert(hiqChatReads).values({ roomKey: key, memberId, lastReadAt: new Date() })
            .onConflictDoUpdate({ target: [hiqChatReads.roomKey, hiqChatReads.memberId], set: { lastReadAt: new Date() } });
    }

    /**
     * 내 방 목록 — 크루 방 + 조인·부킹 방, 마지막 메시지 순. 종목으로 가른다(하단 탭이 종목별이라).
     * 조인·부킹 방은 골프에만 있다. 티타임이 이틀 넘게 지난 글의 방은 목록에서 뺀다(글은 남는다).
     */
    async myRooms(memberId: string, sport: "BILLIARDS" | "GOLF"): Promise<ChatRoomSummary[]> {
        const reads = await db.select({ roomKey: hiqChatReads.roomKey, lastReadAt: hiqChatReads.lastReadAt })
            .from(hiqChatReads).where(eq(hiqChatReads.memberId, memberId));
        const readAt = new Map<string, Date>(reads.map((r) => [r.roomKey, r.lastReadAt] as [string, Date]));
        const out: ChatRoomSummary[] = [];

        // ── 크루 방 ──
        const crews = await db.select({ crew: hiqCrews, joinedAt: hiqCrewMembers.joinedAt })
            .from(hiqCrewMembers)
            .innerJoin(hiqCrews, eq(hiqCrews.id, hiqCrewMembers.crewId))
            .where(and(eq(hiqCrewMembers.memberId, memberId), sql`${hiqCrewMembers.role} <> 'pending'`, eq(hiqCrews.sportCategory, sport)));
        if (crews.length > 0) {
            const ids = crews.map((c) => c.crew.id);
            const last = await db.execute(sql`
                SELECT DISTINCT ON (c.crew_id) c.crew_id, c.message, c.type, c.created_at, m.name AS sender_name
                FROM hiq_crew_chats c LEFT JOIN hiq_members m ON m.id = c.sender_id
                WHERE c.crew_id IN (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})
                ORDER BY c.crew_id, c.created_at DESC`);
            const lastBy = new Map<string, any>((last.rows as any[]).map((r) => [String(r.crew_id), r]));
            const counts = await db.select({ crewId: hiqCrewMembers.crewId, n: sql<number>`count(*)::int` }).from(hiqCrewMembers)
                .where(and(inArray(hiqCrewMembers.crewId, ids), sql`${hiqCrewMembers.role} <> 'pending'`)).groupBy(hiqCrewMembers.crewId);
            const countBy = new Map<string, number>(counts.map((c) => [String(c.crewId), Number(c.n)] as [string, number]));
            // 안 읽은 수: 읽은 시각(없으면 지금 — 표가 생기기 전 메시지를 전부 안 읽음으로 세지 않게) 뒤, 내 가입 뒤, 남이 보낸 것
            for (const c of crews) {
                const key = roomKey("crew", c.crew.id);
                const since = readAt.get(key) ?? new Date();
                const from = since > c.joinedAt ? since : c.joinedAt;
                const [u] = await db.select({ n: sql<number>`count(*)::int` }).from(hiqCrewChats)
                    .where(and(eq(hiqCrewChats.crewId, c.crew.id), gt(hiqCrewChats.createdAt, from), sql`${hiqCrewChats.senderId} <> ${memberId}::uuid`));
                const l = lastBy.get(c.crew.id);
                out.push({
                    key, kind: "crew", id: c.crew.id, title: c.crew.name, subtitle: `크루 · ${countBy.get(c.crew.id) ?? 0}명`,
                    sport, imageUrl: (c.crew as any).emblem ?? null,
                    lastMessage: l ? { text: l.type === "text" ? String(l.message) : "카드를 공유했어요", at: new Date(l.created_at), senderName: l.sender_name ?? null } : null,
                    unread: readAt.has(key) ? Number(u?.n ?? 0) : 0,
                    memberCount: countBy.get(c.crew.id) ?? 0,
                });
            }
        }

        // ── 조인·부킹 방(골프) ──
        if (sport === "GOLF") {
            const mine = await db.select({ b: golfBookings }).from(golfBookings)
                .where(and(eq(golfBookings.ownerId, memberId), sql`${golfBookings.datetime} > now() - interval '2 days'`));
            const joined = await db.select({ b: golfBookings }).from(golfJoinRequests)
                .innerJoin(golfBookings, eq(golfBookings.id, golfJoinRequests.bookingId))
                .where(and(eq(golfJoinRequests.memberId, memberId), inArray(golfJoinRequests.status, ["accepted", "noshow"]), sql`${golfBookings.datetime} > now() - interval '2 days'`));
            const byId = new Map<string, typeof golfBookings.$inferSelect>();
            for (const r of [...mine, ...joined]) byId.set(r.b.id, r.b);
            const bookings = [...byId.values()];
            if (bookings.length > 0) {
                const ids = bookings.map((b) => b.id);
                const last = await db.execute(sql`
                    SELECT DISTINCT ON (c.booking_id) c.booking_id, c.message, c.type, c.created_at, m.name AS sender_name
                    FROM hiq_listing_chats c LEFT JOIN hiq_members m ON m.id = c.sender_id
                    WHERE c.booking_id IN (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})
                    ORDER BY c.booking_id, c.created_at DESC`);
                const lastBy = new Map<string, any>((last.rows as any[]).map((r) => [String(r.booking_id), r]));
                const acc = await db.select({ bookingId: golfJoinRequests.bookingId, n: sql<number>`count(*)::int` }).from(golfJoinRequests)
                    .where(and(inArray(golfJoinRequests.bookingId, ids), inArray(golfJoinRequests.status, ["accepted", "noshow"]))).groupBy(golfJoinRequests.bookingId);
                const accBy = new Map<string, number>(acc.map((a) => [String(a.bookingId), Number(a.n)] as [string, number]));
                for (const b of bookings) {
                    const key = roomKey("listing", b.id);
                    const since = readAt.get(key) ?? new Date(0);
                    const [u] = await db.select({ n: sql<number>`count(*)::int` }).from(hiqListingChats)
                        .where(and(eq(hiqListingChats.bookingId, b.id), gt(hiqListingChats.createdAt, since), or(sql`${hiqListingChats.senderId} is null`, sql`${hiqListingChats.senderId} <> ${memberId}::uuid`)));
                    const l = lastBy.get(b.id);
                    const isJoin = b.listingType === "JOIN";
                    out.push({
                        key, kind: "listing", id: b.id,
                        title: b.isBlind ? (b.blindName ?? b.courseName) : b.courseName,
                        subtitle: `${isJoin ? "조인" : "부킹"} · ${(accBy.get(b.id) ?? 0) + (b.ownerId ? 1 : 0)}명`,
                        sport: "GOLF", imageUrl: null,
                        listing: { listingType: b.listingType, joinType: b.joinType ?? null, datetime: b.datetime, courseName: b.courseName, region: b.region, lat: b.lat ?? null, lng: b.lng ?? null, ownerId: b.ownerId ?? null },
                        lastMessage: l ? { text: String(l.message), at: new Date(l.created_at), senderName: l.sender_name ?? null } : null,
                        unread: Number(u?.n ?? 0),
                        memberCount: (accBy.get(b.id) ?? 0) + (b.ownerId ? 1 : 0),
                    });
                }
            }
        }

        // 마지막 메시지 순(없는 방은 뒤로, 조인·부킹 방끼리는 티타임 가까운 순)
        out.sort((a, b) => {
            const ta = a.lastMessage?.at.getTime() ?? 0, tb = b.lastMessage?.at.getTime() ?? 0;
            if (ta !== tb) return tb - ta;
            return (a.listing?.datetime.getTime() ?? Infinity) - (b.listing?.datetime.getTime() ?? Infinity);
        });
        return out;
    }
}
