
import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function fixMemberAverages() {
    console.log("Fixing Member Averages (Legacy 10-point scale)...");

    try {
        // Update average in hiq_members table where average is >= 4.0 (Safe threshold)
        // 4.0 is chosen because even the best 3-cushion players have averages < 3.0.
        // Old 4-ball averages (10-point scale) are typically > 10.0 (e.g., 150 points / 10 innings = 15.0).
        // New 4-ball averages (1-point scale) will be approx 1/10th of that (1.5).

        const result = await db.execute(sql`
            UPDATE hiq_members
            SET average = CAST(
                ROUND(
                    CAST(average AS NUMERIC) / 10.0, 
                    3
                ) AS TEXT
            )
            WHERE CAST(average AS NUMERIC) >= 4.0;
        `);

        console.log("Successfully normalized member averages.");
    } catch (error) {
        console.error("Error updating averages:", error);
    } finally {
        process.exit(0);
    }
}

fixMemberAverages();
