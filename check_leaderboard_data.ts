
import 'dotenv/config';
import { db } from "./server/db.js";
import { profiles } from "./shared/schema.js";
import { sql } from "drizzle-orm";

async function checkLeaderboard() {
    try {
        console.log("Checking profiles table for brain ratings...");

        const count = await db.select({ count: sql<number>`count(*)` }).from(profiles);
        console.log(`Total profiles: ${count[0].count}`);

        const result = await db.select({
            id: profiles.id,
            nickname: profiles.nickname,
            logic: profiles.brainRatingLogic,
            math: profiles.brainRatingMath,
            verbal: profiles.brainRatingVerbal,
            economy: profiles.brainRatingEconomy,
            trivia: profiles.brainRatingTrivia,
            total: sql<number>`(brain_rating_logic + brain_rating_math + brain_rating_verbal + brain_rating_economy + brain_rating_trivia)`
        })
            .from(profiles)
            .limit(10);

        console.log("Sample profiles:");
        console.table(result);

    } catch (error) {
        console.error("Error checking leaderboard:", error);
    }
    process.exit(0);
}

checkLeaderboard();
