/**
 * 채팅 저장소 — 방 종류와 무관한 한 표(2026-09-21 오너: "채팅 탭 하나로, 친구·라이벌 1:1, 관리자 문의").
 *
 * 방 열쇠(room_key)로 모든 것을 한다. 종류별 **명단의 유래**만 다르다:
 *   crew:<crewId>       크루원(승인 대기 제외). 가입 전 메시지는 안 보인다(joinedAt 컷).
 *   listing:<bookingId> 올린 사람 + 확정된 신청자.
 *   dm:<roomId>         hiq_chat_room_members.
 *   support:<memberId>  그 회원 + 운영자(admin·super_admin). 운영자는 모든 문의 방을 본다.
 *
 * 속도: 메시지는 afterAt 뒤만(폴링), 방 목록의 마지막 메시지는 DISTINCT ON 한 문장, 안 읽은 수는 방 열쇠 배열로 한 문장.
 */
import { db } from "../db.js";
import {
    hiqChatMessages, hiqChatRooms, hiqChatRoomMembers, hiqChatReads, hiqCrewMembers, hiqCrews, hiqMembers, profiles,
    golfBookings, golfJoinRequests, hiqBlocks,
} from "../../shared/schema.js";
import { eq, and, or, asc, gt, sql, inArray } from "drizzle-orm";

export type RoomKind = "crew" | "listing" | "dm" | "support";
export interface RoomRef { kind: RoomKind; id: string; key: string }

export interface ChatRoomSummary {
    key: string;
    kind: RoomKind;
    id: string;
    title: string;
    subtitle: string;
    imageUrl: string | null;
    listing?: { listingType: string; joinType: string | null; datetime: Date; courseName: string; region: string; lat: number | null; lng: number | null; ownerId: string | null; isBlind: boolean };
    lastMessage: { text: string; at: Date; senderName: string | null } | null;
    unread: number;
    memberCount: number;
}

export function parseRoomKey(key: string): RoomRef | null {
    const m = /^(crew|listing|dm|support):([0-9a-f-]{36})$/i.exec(key);
    return m ? { kind: m[1] as RoomKind, id: m[2], key: `${m[1]}:${m[2]}` } : null;
}

const ADMIN_ROLES: ("admin" | "super_admin")[] = ["admin", "super_admin"];

export class ChatRepository {
    /* ── 명단 ─────────────────────────────────────────── */
    async adminMemberIds(): Promise<string[]> {
        const rows = await db.select({ id: hiqMembers.id }).from(hiqMembers)
            .innerJoin(profiles, eq(profiles.id, hiqMembers.profileId))
            .where(inArray(profiles.role, ADMIN_ROLES));
        return rows.map((r) => String(r.id));
    }

    async isAdmin(memberId: string): Promise<boolean> {
        const [row] = await db.select({ role: profiles.role }).from(hiqMembers)
            .innerJoin(profiles, eq(profiles.id, hiqMembers.profileId)).where(eq(hiqMembers.id, memberId)).limit(1);
        return !!row && (ADMIN_ROLES as string[]).includes(String(row.role));
    }

    async roomMembers(ref: RoomRef): Promise<string[]> {
        if (ref.kind === "crew") {
            const rows = await db.select({ id: hiqCrewMembers.memberId }).from(hiqCrewMembers)
                .where(and(eq(hiqCrewMembers.crewId, ref.id), sql`${hiqCrewMembers.role} <> 'pending'`));
            return rows.map((r) => String(r.id));
        }
        if (ref.kind === "listing") {
            const [b] = await db.select({ ownerId: golfBookings.ownerId }).from(golfBookings).where(eq(golfBookings.id, ref.id)).limit(1);
            if (!b) return [];
            const accepted = await db.select({ memberId: golfJoinRequests.memberId }).from(golfJoinRequests)
                .where(and(eq(golfJoinRequests.bookingId, ref.id), inArray(golfJoinRequests.status, ["accepted", "noshow"])));
            const ids = new Set<string>(accepted.map((r) => String(r.memberId)));
            if (b.ownerId) ids.add(String(b.ownerId));
            return [...ids];
        }
        if (ref.kind === "dm") {
            const rows = await db.select({ id: hiqChatRoomMembers.memberId }).from(hiqChatRoomMembers).where(eq(hiqChatRoomMembers.roomId, ref.id));
            return rows.map((r) => String(r.id));
        }
        // support: 그 회원 + 운영자
        return [ref.id, ...(await this.adminMemberIds())];
    }

    async canAccess(ref: RoomRef, memberId: string): Promise<boolean> {
        if (ref.kind === "support") return ref.id === memberId || (await this.isAdmin(memberId));
        return (await this.roomMembers(ref)).includes(memberId);
    }

    /* ── 메시지 ─────────────────────────────────────────── */
    async messages(ref: RoomRef, viewerId: string, afterAt?: Date, limit = 200) {
        // 크루: 가입 뒤 메시지만. 차단한 사람의 글은 어느 방이든 안 보인다.
        let since: Date | undefined;
        if (ref.kind === "crew") {
            const [m] = await db.select({ joinedAt: hiqCrewMembers.joinedAt }).from(hiqCrewMembers)
                .where(and(eq(hiqCrewMembers.crewId, ref.id), eq(hiqCrewMembers.memberId, viewerId))).limit(1);
            since = m?.joinedAt;
        }
        const from = [since, afterAt].filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0];
        const rows = await db.select({ chat: hiqChatMessages, senderName: hiqMembers.name, senderProfileImage: profiles.profileImageUrl })
            .from(hiqChatMessages)
            .leftJoin(hiqMembers, eq(hiqChatMessages.senderId, hiqMembers.id))
            .leftJoin(profiles, eq(hiqMembers.profileId, profiles.id))
            .where(and(
                eq(hiqChatMessages.roomKey, ref.key),
                from ? (afterAt && from === afterAt ? gt(hiqChatMessages.createdAt, from) : sql`${hiqChatMessages.createdAt} >= ${from}`) : undefined,
                sql`NOT EXISTS (SELECT 1 FROM ${hiqBlocks} WHERE ${hiqBlocks.blockerId} = ${viewerId} AND ${hiqBlocks.blockedId} = ${hiqChatMessages.senderId})`,
            ))
            .orderBy(asc(hiqChatMessages.createdAt))
            .limit(limit);
        return rows.map((r) => ({ ...r.chat, sender: r.senderName ? { name: r.senderName, profileImageUrl: r.senderProfileImage } : null }));
    }

    async getMessage(id: string) {
        const [row] = await db.select().from(hiqChatMessages).where(eq(hiqChatMessages.id, id)).limit(1);
        return row;
    }

    async addMessage(data: { key: string; senderId: string | null; message: string; type?: string; metadata?: unknown }) {
        const [row] = await db.insert(hiqChatMessages).values({
            roomKey: data.key, senderId: data.senderId, message: data.message, type: data.type ?? "text", metadata: (data.metadata ?? null) as any,
        }).returning();
        return row;
    }

    async deleteMessage(id: string): Promise<void> {
        await db.delete(hiqChatMessages).where(eq(hiqChatMessages.id, id));
    }

    async markRead(key: string, memberId: string): Promise<void> {
        await db.insert(hiqChatReads).values({ roomKey: key, memberId, lastReadAt: new Date() })
            .onConflictDoUpdate({ target: [hiqChatReads.roomKey, hiqChatReads.memberId], set: { lastReadAt: new Date() } });
    }

    /* ── 1:1 · 소그룹 ───────────────────────────────────── */
    /** 같은 두 사람의 1:1 방이 있으면 그것을, 없으면 새로. 셋 이상은 늘 새 방. */
    async getOrCreateDm(creatorId: string, memberIds: string[]): Promise<{ id: string; created: boolean }> {
        const ids = [...new Set([creatorId, ...memberIds])];
        if (ids.length === 2) {
            const found = await db.execute(sql`
                SELECT r.id FROM hiq_chat_rooms r
                WHERE r.kind = 'dm'
                  AND (SELECT count(*) FROM hiq_chat_room_members m WHERE m.room_id = r.id) = 2
                  AND (SELECT count(*) FROM hiq_chat_room_members m WHERE m.room_id = r.id AND m.member_id IN (${ids[0]}::uuid, ${ids[1]}::uuid)) = 2
                LIMIT 1`);
            const row = (found.rows as any[])[0];
            if (row) return { id: String(row.id), created: false };
        }
        const [room] = await db.insert(hiqChatRooms).values({ kind: "dm", createdBy: creatorId }).returning();
        await db.insert(hiqChatRoomMembers).values(ids.map((memberId) => ({ roomId: room.id, memberId })));
        return { id: room.id, created: true };
    }

    /* ── 방 정보(머리줄·고정 카드) ───────────────────────── */
    async roomInfo(ref: RoomRef, viewerId: string): Promise<{ title: string; subtitle: string; members: { id: string; name: string; profileImageUrl: string | null }[]; canManage: boolean; crewId?: string; booking?: any }> {
        const memberIds = await this.roomMembers(ref);
        // 남의 메시지를 지울 수 있나 — 크루 운영진·앱 운영자. 화면이 삭제 단추를 보일지 정하는 데만 쓴다(서버 검사는 따로).
        let canManage = await this.isAdmin(viewerId);
        if (!canManage && ref.kind === "crew") {
            const [m] = await db.select({ role: hiqCrewMembers.role }).from(hiqCrewMembers).where(and(eq(hiqCrewMembers.crewId, ref.id), eq(hiqCrewMembers.memberId, viewerId))).limit(1);
            canManage = m?.role === "leader" || m?.role === "manage";
        }
        const people = memberIds.length > 0 ? await db.select({ id: hiqMembers.id, name: hiqMembers.name, profileImageUrl: profiles.profileImageUrl })
            .from(hiqMembers).leftJoin(profiles, eq(profiles.id, hiqMembers.profileId)).where(inArray(hiqMembers.id, memberIds)) : [];
        const members = people.map((p) => ({ id: String(p.id), name: p.name, profileImageUrl: p.profileImageUrl ?? null }));
        if (ref.kind === "crew") {
            const [c] = await db.select({ name: hiqCrews.name }).from(hiqCrews).where(eq(hiqCrews.id, ref.id)).limit(1);
            return { title: c?.name ?? "크루", subtitle: `크루 · ${members.length}명`, members, canManage, crewId: ref.id };
        }
        if (ref.kind === "listing") {
            const [b] = await db.select().from(golfBookings).where(eq(golfBookings.id, ref.id)).limit(1);
            const title = b ? (b.isBlind ? b.blindName ?? b.courseName : b.courseName) : "대화방";
            return { title, subtitle: `${b?.listingType === "JOIN" ? "조인" : "부킹"} · 확정된 분들만`, members, canManage, booking: b };
        }
        if (ref.kind === "dm") {
            const others = members.filter((m) => m.id !== viewerId);
            return { title: others.map((m) => m.name).join(", ") || "나", subtitle: members.length > 2 ? `${members.length}명` : "1:1", members, canManage };
        }
        const isAdmin = await this.isAdmin(viewerId);
        const owner = members.find((m) => m.id === ref.id);
        return { title: isAdmin ? `${owner?.name ?? "회원"} · 문의` : "랭큐 운영자", subtitle: isAdmin ? "관리자 문의 방" : "빠르게 답해 드릴게요", members, canManage };
    }

    /* ── 내 방 목록 ─────────────────────────────────────── */
    async myRooms(memberId: string, sport: "BILLIARDS" | "GOLF"): Promise<ChatRoomSummary[]> {
        const rooms: ChatRoomSummary[] = [];
        // 크루(종목별)
        const crews = await db.select({ crew: hiqCrews }).from(hiqCrewMembers)
            .innerJoin(hiqCrews, eq(hiqCrews.id, hiqCrewMembers.crewId))
            .where(and(eq(hiqCrewMembers.memberId, memberId), sql`${hiqCrewMembers.role} <> 'pending'`, eq(hiqCrews.sportCategory, sport)));
        const crewIds = crews.map((c) => c.crew.id);
        const crewCounts = crewIds.length ? await db.select({ crewId: hiqCrewMembers.crewId, n: sql<number>`count(*)::int` }).from(hiqCrewMembers)
            .where(and(inArray(hiqCrewMembers.crewId, crewIds), sql`${hiqCrewMembers.role} <> 'pending'`)).groupBy(hiqCrewMembers.crewId) : [];
        const crewCount = new Map<string, number>(crewCounts.map((c) => [String(c.crewId), Number(c.n)] as [string, number]));
        for (const c of crews) rooms.push({ key: `crew:${c.crew.id}`, kind: "crew", id: c.crew.id, title: c.crew.name, subtitle: `크루 · ${crewCount.get(c.crew.id) ?? 0}명`, imageUrl: (c.crew as any).emblem ?? null, lastMessage: null, unread: 0, memberCount: crewCount.get(c.crew.id) ?? 0 });

        // 조인·부킹(골프)
        if (sport === "GOLF") {
            const mine = await db.select({ b: golfBookings }).from(golfBookings).where(and(eq(golfBookings.ownerId, memberId), sql`${golfBookings.datetime} > now() - interval '2 days'`));
            const joined = await db.select({ b: golfBookings }).from(golfJoinRequests).innerJoin(golfBookings, eq(golfBookings.id, golfJoinRequests.bookingId))
                .where(and(eq(golfJoinRequests.memberId, memberId), inArray(golfJoinRequests.status, ["accepted", "noshow"]), sql`${golfBookings.datetime} > now() - interval '2 days'`));
            const byId = new Map<string, typeof golfBookings.$inferSelect>();
            for (const r of [...mine, ...joined]) byId.set(r.b.id, r.b);
            const ids = [...byId.keys()];
            const acc = ids.length ? await db.select({ bookingId: golfJoinRequests.bookingId, n: sql<number>`count(*)::int` }).from(golfJoinRequests)
                .where(and(inArray(golfJoinRequests.bookingId, ids), inArray(golfJoinRequests.status, ["accepted", "noshow"]))).groupBy(golfJoinRequests.bookingId) : [];
            const accBy = new Map<string, number>(acc.map((a) => [String(a.bookingId), Number(a.n)] as [string, number]));
            for (const b of byId.values()) {
                const n = (accBy.get(b.id) ?? 0) + (b.ownerId ? 1 : 0);
                rooms.push({
                    key: `listing:${b.id}`, kind: "listing", id: b.id, title: b.isBlind ? (b.blindName ?? b.courseName) : b.courseName,
                    subtitle: `${b.listingType === "JOIN" ? "조인" : "부킹"} · ${n}명`, imageUrl: null,
                    listing: { listingType: b.listingType, joinType: b.joinType ?? null, datetime: b.datetime, courseName: b.courseName, region: b.region, lat: b.lat ?? null, lng: b.lng ?? null, ownerId: b.ownerId ?? null, isBlind: b.isBlind },
                    lastMessage: null, unread: 0, memberCount: n,
                });
            }
        }

        // 1:1 · 소그룹(종목 무관 — 사람 사이의 대화다)
        const dms = await db.select({ roomId: hiqChatRoomMembers.roomId }).from(hiqChatRoomMembers).where(eq(hiqChatRoomMembers.memberId, memberId));
        if (dms.length > 0) {
            const roomIds = dms.map((d) => d.roomId);
            const mem = await db.select({ roomId: hiqChatRoomMembers.roomId, id: hiqMembers.id, name: hiqMembers.name, img: profiles.profileImageUrl })
                .from(hiqChatRoomMembers).innerJoin(hiqMembers, eq(hiqMembers.id, hiqChatRoomMembers.memberId)).leftJoin(profiles, eq(profiles.id, hiqMembers.profileId))
                .where(inArray(hiqChatRoomMembers.roomId, roomIds));
            const byRoom = new Map<string, { id: string; name: string; img: string | null }[]>();
            for (const m of mem) { const a = byRoom.get(m.roomId) ?? []; a.push({ id: String(m.id), name: m.name, img: m.img ?? null }); byRoom.set(m.roomId, a); }
            for (const rid of roomIds) {
                const all = byRoom.get(rid) ?? [];
                const others = all.filter((m) => m.id !== memberId);
                rooms.push({ key: `dm:${rid}`, kind: "dm", id: rid, title: others.map((m) => m.name).join(", ") || "나", subtitle: all.length > 2 ? `${all.length}명` : "1:1", imageUrl: others[0]?.img ?? null, lastMessage: null, unread: 0, memberCount: all.length });
            }
        }

        // 관리자 문의: 내 방(메시지가 있을 때만) · 운영자는 모든 문의 방
        const isAdmin = await this.isAdmin(memberId);
        if (isAdmin) {
            const sup = await db.execute(sql`SELECT DISTINCT room_key FROM hiq_chat_messages WHERE room_key LIKE 'support:%'`);
            const keys = (sup.rows as any[]).map((r) => String(r.room_key));
            const ownerIds = keys.map((k) => k.slice("support:".length));
            const owners = ownerIds.length ? await db.select({ id: hiqMembers.id, name: hiqMembers.name, img: profiles.profileImageUrl }).from(hiqMembers).leftJoin(profiles, eq(profiles.id, hiqMembers.profileId)).where(inArray(hiqMembers.id, ownerIds)) : [];
            const nameBy = new Map<string, { id: string; name: string; img: string | null }>(owners.map((o) => [String(o.id), { id: String(o.id), name: o.name, img: o.img ?? null }] as [string, { id: string; name: string; img: string | null }]));
            for (const k of keys) { const oid = k.slice("support:".length); const o = nameBy.get(oid); rooms.push({ key: k, kind: "support", id: oid, title: `${o?.name ?? "회원"} · 문의`, subtitle: "관리자 문의", imageUrl: o?.img ?? null, lastMessage: null, unread: 0, memberCount: 2 }); }
        } else {
            const [has] = await db.select({ n: sql<number>`count(*)::int` }).from(hiqChatMessages).where(eq(hiqChatMessages.roomKey, `support:${memberId}`));
            if (Number(has?.n ?? 0) > 0) rooms.push({ key: `support:${memberId}`, kind: "support", id: memberId, title: "랭큐 운영자", subtitle: "관리자 문의", imageUrl: null, lastMessage: null, unread: 0, memberCount: 2 });
        }

        if (rooms.length === 0) return rooms;

        // 마지막 메시지 · 안 읽은 수 — 방 열쇠 배열로 한 번에
        const keys = rooms.map((r) => r.key);
        const last = await db.execute(sql`
            SELECT DISTINCT ON (c.room_key) c.room_key, c.message, c.type, c.created_at, m.name AS sender_name
            FROM hiq_chat_messages c LEFT JOIN hiq_members m ON m.id = c.sender_id
            WHERE c.room_key IN (${sql.join(keys.map((k) => sql`${k}`), sql`, `)})
            ORDER BY c.room_key, c.created_at DESC`);
        const lastBy = new Map<string, any>((last.rows as any[]).map((r) => [String(r.room_key), r]));
        const reads = await db.select({ roomKey: hiqChatReads.roomKey, lastReadAt: hiqChatReads.lastReadAt }).from(hiqChatReads).where(eq(hiqChatReads.memberId, memberId));
        const readAt = new Map<string, Date>(reads.map((r) => [r.roomKey, r.lastReadAt] as [string, Date]));
        // 크루는 읽음 행이 생기기 전 메시지를 전부 '안 읽음'으로 세지 않는다(표가 새로 생겼다). 다른 방은 처음부터 센다.
        const unread = await db.execute(sql`
            SELECT c.room_key, count(*)::int AS n FROM hiq_chat_messages c
            LEFT JOIN hiq_chat_reads r ON r.room_key = c.room_key AND r.member_id = ${memberId}::uuid
            WHERE c.room_key IN (${sql.join(keys.map((k) => sql`${k}`), sql`, `)})
              AND (c.sender_id IS NULL OR c.sender_id <> ${memberId}::uuid)
              AND c.created_at > COALESCE(r.last_read_at, CASE WHEN c.room_key LIKE 'crew:%' THEN now() ELSE to_timestamp(0) END)
            GROUP BY c.room_key`);
        const unreadBy = new Map<string, number>((unread.rows as any[]).map((r) => [String(r.room_key), Number(r.n)] as [string, number]));
        for (const r of rooms) {
            const l = lastBy.get(r.key);
            r.lastMessage = l ? { text: l.type === "text" || l.type === "system" ? String(l.message) : "카드를 공유했어요", at: new Date(l.created_at), senderName: l.type === "system" ? null : (l.sender_name ?? null) } : null;
            r.unread = unreadBy.get(r.key) ?? 0;
        }
        void readAt;
        rooms.sort((a, b) => {
            const ta = a.lastMessage?.at.getTime() ?? 0, tb = b.lastMessage?.at.getTime() ?? 0;
            if (ta !== tb) return tb - ta;
            return (a.listing?.datetime.getTime() ?? Infinity) - (b.listing?.datetime.getTime() ?? Infinity);
        });
        return rooms;
    }
}
