
import { db } from "./db.js";
import { golfMatchSessions, hiqMembers, hiqFriendships } from "../shared/schema.js";
import { desc, eq, gt, and, or } from "drizzle-orm";

async function run() {
    try {
        const myId = "7de3b4b4-8c98-4fb0-a88d-e615a3442ebd";
        const oppId = "53eac77c-f249-4cf4-aaa3-950209901cec";

        console.log("Checking User:", myId);
        console.log("Checking Opponent:", oppId);

        // 1. Check Member Existence
        const [oppMember] = await db.select().from(hiqMembers).where(eq(hiqMembers.id, oppId));
        console.log("Opponent in DB:", oppMember ? `Found (${oppMember.name})` : "NOT FOUND");

        // 2. Check Friendships
        const friendship = await db.select().from(hiqFriendships).where(
            and(
                or(
                    and(eq(hiqFriendships.requesterId, myId), eq(hiqFriendships.receiverId, oppId)),
                    and(eq(hiqFriendships.requesterId, oppId), eq(hiqFriendships.receiverId, myId))
                ),
                eq(hiqFriendships.sportCategory, 'GOLF')
            )
        );
        console.log("Friendship GOLF:", friendship.length > 0 ? "EXISTS" : "NONE");

        // 3. Re-check Session logic logic simulation
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const sessions = await db.select()
            .from(golfMatchSessions)
            .where(
                and(
                    eq(golfMatchSessions.status, 'finished'),
                    gt(golfMatchSessions.updatedAt, sevenDaysAgo)
                )
            );

        console.log(`Finished sessions last 7 days: ${sessions.length}`);

        // Filter manually like Helper
        for (const s of sessions) {
            const players = s.players as any[];
            const hasMe = players.some(p => p.memberId === myId);
            const hasOpp = players.some(p => p.memberId === oppId);

            if (hasMe && hasOpp) {
                console.log(`MATCH FOUND in Session ${s.id}`);
            }
        }

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

run();
