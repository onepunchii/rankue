
import { db, pool } from '../server/db.js';
import { hiqCrewActivities, hiqCrews } from '../shared/schema.js';
import { eq, isNull } from 'drizzle-orm';

async function migrate() {
    console.log("Starting activity category migration...");

    const activities = await db.select({
        id: hiqCrewActivities.id,
        title: hiqCrewActivities.title,
        crewId: hiqCrewActivities.crewId
    }).from(hiqCrewActivities).where(isNull(hiqCrewActivities.category));

    console.log(`Found ${activities.length} activities with null category.`);

    for (const act of activities) {
        const [crew] = await db.select({ sportCategory: hiqCrews.sportCategory })
            .from(hiqCrews)
            .where(eq(hiqCrews.id, act.crewId));

        let category = 'REGULAR_BILLIARDS';
        if (crew?.sportCategory === 'GOLF') {
            category = 'REGULAR_ROUNDING';
        }

        // Try to refine based on title
        const title = act.title || "";
        if (title.includes("대회") || title.includes("Tournament")) {
            category = crew?.sportCategory === 'GOLF' ? 'REGULAR_ROUNDING' : 'BILLIARDS_TOURNAMENT';
        } else if (title.includes("뒷풀이") || title.includes("밥") || title.includes("회식") || title.includes("Social")) {
            category = 'AFTER_PARTY';
        } else if (title.includes("번개") || title.includes("Blitz")) {
            category = crew?.sportCategory === 'GOLF' ? 'BLITZ_ROUNDING' : 'BLITZ_BILLIARDS';
        } else if (title.includes("스크린") || title.includes("Screen")) {
            category = 'REGULAR_SCREEN';
        }

        await db.update(hiqCrewActivities)
            .set({ category })
            .where(eq(hiqCrewActivities.id, act.id));

        console.log(`Updated activity "${act.title}" to category "${category}"`);
    }

    console.log("Migration complete!");
    await pool.end();
}

migrate();
