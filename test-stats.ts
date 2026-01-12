import { db } from "./server/db";
import { userSurveyParticipation } from "./shared/schema";
import { sql, gte } from "drizzle-orm";

async function testCount() {
    try {
        const totalCount = await db.select({ count: sql<number>`count(*)` }).from(userSurveyParticipation);
        console.log("Total Participations:", totalCount[0].count);

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        console.log("Today start (local):", today.toLocaleString());
        console.log("Today start (ISO):", today.toISOString());

        const todayCount = await db.select({ count: sql<number>`count(*)` })
            .from(userSurveyParticipation)
            .where(gte(userSurveyParticipation.completedAt, today));

        console.log("Today Count (using gte):", todayCount[0].count);

        const rawCount = await db.select({ count: sql<number>`count(*)` })
            .from(userSurveyParticipation)
            .where(sql`completed_at >= ${today}`);

        console.log("Today Count (using raw sql):", rawCount[0].count);

    } catch (error) {
        console.error("Error:", error);
    } finally {
        process.exit();
    }
}

testCount();
