
import { db } from '../server/db';
import { hiqGameHistory, hiqMembers } from '../shared/schema';
import { eq, and } from 'drizzle-orm';

const DEFAULT_PAR = [4, 4, 3, 4, 5, 4, 3, 4, 4, 4, 4, 3, 4, 5, 4, 3, 4, 4];

async function migrate() {
    console.log("Starting golf score migration...");

    // Select all golf history records
    const history = await db.select().from(hiqGameHistory).where(eq(hiqGameHistory.gameType, 'golf'));
    console.log(`Found ${history.length} golf records to process.`);

    for (const record of history) {
        let scores: number[] | null = null;

        if (typeof record.scoreJson === 'string') {
            try {
                scores = JSON.parse(record.scoreJson);
            } catch (e) {
                console.error(`Failed to parse scoreJson for record ${record.id}`);
            }
        } else {
            scores = record.scoreJson as number[] | null;
        }

        if (!scores || !Array.isArray(scores)) {
            console.log(`Skipping record ${record.id}: invalid scoreJson`);
            continue;
        }

        // Batch Update Fix: Treat 0 or null as Par for total calculation
        let totalScore = 0;
        for (let i = 0; i < 18; i++) {
            const s = scores[i];
            totalScore += (s !== null && s > 0) ? s : DEFAULT_PAR[i];
        }

        const average = (totalScore / 18).toFixed(2);

        if (totalScore !== record.score) {
            console.log(`Updating record ${record.id} (${record.locationName}): ${record.score} -> ${totalScore}`);
            await db.update(hiqGameHistory)
                .set({ score: totalScore, average })
                .where(eq(hiqGameHistory.id, record.id));
        } else {
            console.log(`Record ${record.id} already correct (${totalScore}타)`);
        }
    }

    console.log("\nUpdating member average scores...");
    const uniqueMemberIds = Array.from(new Set(history.map(h => h.memberId)));

    for (const memberId of uniqueMemberIds) {
        const memberGames = await db.select()
            .from(hiqGameHistory)
            .where(and(eq(hiqGameHistory.memberId, memberId), eq(hiqGameHistory.gameType, 'golf')));

        if (memberGames.length > 0) {
            const sumScores = memberGames.reduce((sum, g) => sum + (g.score || 0), 0);
            const avgScore = sumScores / memberGames.length;

            console.log(`Member ${memberId}: New Avg Score = ${avgScore.toFixed(2)}`);
            await db.update(hiqMembers)
                .set({ golfAvgScore: avgScore })
                .where(eq(hiqMembers.id, memberId));
        }
    }

    console.log("\n✅ Migration finished successfully.");
}

migrate().catch(err => {
    console.error("❌ Migration failed:");
    console.error(err);
}).finally(() => process.exit());
