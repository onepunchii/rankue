import { randomInt } from "node:crypto";
import { db } from "../db.js";
import { golfArcadeRooms, golfArcadePlayers, type GolfArcadeRoom, type GolfArcadePlayer } from "../../shared/schema.js";
import { and, eq, inArray, sql } from "drizzle-orm";
import { courseById } from "../../shared/golf/courses.js";

/**
 * 골프 온라인게임(미니골프) 방 저장소(2026-09-14). 당구 멀티방과 달리 공이 서로 안 부딪히므로
 * 서버는 "누가 몇 홀을 몇 타에 끝냈나"만 모은다. 화면은 2초마다 방 상태를 폴링한다.
 */
export const ROOM_MAX_PLAYERS = 6;

export interface RoomView {
    room: GolfArcadeRoom;
    players: Array<Pick<GolfArcadePlayer, "memberId" | "name" | "strokes" | "finishedAt" | "joinedAt">>;
}

function randomCode(): string { return String(randomInt(100000, 1000000)); }

export class GolfArcadeRepository {
    async createRoom(hostId: string, name: string, courseId = "rankue-park"): Promise<RoomView> {
        if (!courseById(courseId)) throw new Error("없는 코스");
        // 코드는 대기·진행 중인 방 사이에서만 유일하면 된다
        let code = randomCode();
        for (let i = 0; i < 5; i++) {
            const [dup] = await db.select({ id: golfArcadeRooms.id }).from(golfArcadeRooms)
                .where(and(eq(golfArcadeRooms.code, code), inArray(golfArcadeRooms.status, ["waiting", "playing"]))).limit(1);
            if (!dup) break;
            code = randomCode();
        }
        const [room] = await db.insert(golfArcadeRooms).values({ code, hostId, courseId }).returning();
        await db.insert(golfArcadePlayers).values({ roomId: room.id, memberId: hostId, name });
        return (await this.getRoom(room.id))!;
    }

    async getRoom(id: string): Promise<RoomView | null> {
        const [room] = await db.select().from(golfArcadeRooms).where(eq(golfArcadeRooms.id, id)).limit(1);
        if (!room) return null;
        const players = await db.select({ memberId: golfArcadePlayers.memberId, name: golfArcadePlayers.name, strokes: golfArcadePlayers.strokes, finishedAt: golfArcadePlayers.finishedAt, joinedAt: golfArcadePlayers.joinedAt })
            .from(golfArcadePlayers).where(eq(golfArcadePlayers.roomId, id)).orderBy(golfArcadePlayers.joinedAt);
        return { room, players };
    }

    /** 코드로 참가. 대기 중인 방만. 이미 들어와 있으면 그 방을 돌려준다(새로고침 복구). */
    async joinByCode(code: string, memberId: string, name: string): Promise<{ view: RoomView } | { error: string }> {
        const [room] = await db.select().from(golfArcadeRooms)
            .where(and(eq(golfArcadeRooms.code, code), inArray(golfArcadeRooms.status, ["waiting", "playing"])))
            .orderBy(sql`${golfArcadeRooms.createdAt} desc`).limit(1);
        if (!room) return { error: "그 코드의 방이 없어요" };
        const view = (await this.getRoom(room.id))!;
        if (view.players.some((p) => p.memberId === memberId)) return { view };
        if (room.status !== "waiting") return { error: "이미 시작한 방이에요" };
        if (view.players.length >= ROOM_MAX_PLAYERS) return { error: `${ROOM_MAX_PLAYERS}명이 다 찼어요` };
        await db.insert(golfArcadePlayers).values({ roomId: room.id, memberId, name }).onConflictDoNothing();
        return { view: (await this.getRoom(room.id))! };
    }

    async start(roomId: string, hostId: string): Promise<boolean> {
        const r = await db.update(golfArcadeRooms).set({ status: "playing", startedAt: new Date() })
            .where(and(eq(golfArcadeRooms.id, roomId), eq(golfArcadeRooms.hostId, hostId), eq(golfArcadeRooms.status, "waiting"))).returning({ id: golfArcadeRooms.id });
        return r.length > 0;
    }

    /**
     * 홀 결과 보고: strokes[hole] = n. 이미 적힌 홀은 다시 안 바꾼다(멱등). 마지막 홀이면 finishedAt.
     * 전원이 끝나면 방도 finished.
     */
    async reportHole(roomId: string, memberId: string, hole: number, strokes: number, holeCount: number): Promise<RoomView | null> {
        const [p] = await db.select().from(golfArcadePlayers).where(and(eq(golfArcadePlayers.roomId, roomId), eq(golfArcadePlayers.memberId, memberId))).limit(1);
        if (!p) return null;
        const arr = [...(p.strokes ?? [])];
        if (hole !== arr.length) return this.getRoom(roomId);   // 순서가 어긋나면(중복 보고) 무시
        arr.push(strokes);
        const done = arr.length >= holeCount;
        await db.update(golfArcadePlayers).set({ strokes: arr, finishedAt: done ? new Date() : null }).where(eq(golfArcadePlayers.id, p.id));
        if (done) {
            const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(golfArcadePlayers)
                .where(and(eq(golfArcadePlayers.roomId, roomId), sql`${golfArcadePlayers.finishedAt} is null`));
            if (n === 0) await db.update(golfArcadeRooms).set({ status: "finished", finishedAt: new Date() }).where(eq(golfArcadeRooms.id, roomId));
        }
        return this.getRoom(roomId);
    }

    /** 내가 들어가 있는 대기·진행 중 방(새로고침·재진입 복구) */
    async myOpenRoom(memberId: string): Promise<RoomView | null> {
        const [row] = await db.select({ roomId: golfArcadePlayers.roomId }).from(golfArcadePlayers)
            .innerJoin(golfArcadeRooms, eq(golfArcadeRooms.id, golfArcadePlayers.roomId))
            .where(and(eq(golfArcadePlayers.memberId, memberId), inArray(golfArcadeRooms.status, ["waiting", "playing"])))
            .orderBy(sql`${golfArcadeRooms.createdAt} desc`).limit(1);
        return row ? this.getRoom(row.roomId) : null;
    }

    /** 방 나가기(대기 중일 때만). 방장이 나가면 방을 닫는다. */
    async leave(roomId: string, memberId: string): Promise<void> {
        const view = await this.getRoom(roomId);
        if (!view || view.room.status !== "waiting") return;
        if (view.room.hostId === memberId) {
            await db.update(golfArcadeRooms).set({ status: "finished", finishedAt: new Date() }).where(eq(golfArcadeRooms.id, roomId));
        } else {
            await db.delete(golfArcadePlayers).where(and(eq(golfArcadePlayers.roomId, roomId), eq(golfArcadePlayers.memberId, memberId)));
        }
    }
}
