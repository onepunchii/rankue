
import "dotenv/config";
import { db } from "./server/db";
import { brainQuestions } from "./shared/schema";
import { sql } from "drizzle-orm";

async function checkQuizData() {
    console.log("🔍 Checking Quiz Data Distribution...");

    try {
        const result = await db
            .select({
                category: brainQuestions.category,
                level: brainQuestions.level,
                count: sql<number>`count(*)`
            })
            .from(brainQuestions)
            .groupBy(brainQuestions.category, brainQuestions.level)
            .orderBy(brainQuestions.category, brainQuestions.level);

        console.table(result);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkQuizData();
