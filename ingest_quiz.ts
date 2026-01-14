
import "dotenv/config";
import fs from "fs";
import path from "path";
import { db } from "./server/db";
import { brainQuestions } from "./shared/schema";
import { sql } from "drizzle-orm";

async function ingestQuiz() {
    console.log("🧠 Brain Quiz Questions Ingest Started...");

    const filePath = path.resolve(process.cwd(), 'quiz', 'brain_rank_questions_final.json');

    if (!fs.existsSync(filePath)) {
        console.error("❌ File not found:", filePath);
        process.exit(1);
    }

    try {
        // Clear existing questions and logs
        console.log("🧹 Clearing existing questions and logs...");
        const { brainGameLogs } = await import("./shared/schema");
        await db.delete(brainGameLogs).execute();
        await db.delete(brainQuestions).execute();
        console.log("✅ Tables cleared.");

        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const questions = JSON.parse(fileContent);

        console.log(`📂 Loaded ${questions.length} questions from file.`);

        // transform
        console.log("🔄 Transforming data...");
        const toInsert = questions.map((q: any) => {
            const answerString = q.options[q.answer_index];
            return {
                category: q.category,
                level: q.level,
                eloRating: 1200 + (q.level * 100), // Updated level-based ELO
                isActive: true,
                content: {
                    q: q.question,
                    options: q.options,
                    answer: answerString,
                    explanation: q.explanation
                }
            };
        });

        // Batch insert in chunks of 50 (smaller batches for safety)
        const batchSize = 50;
        let insertedCount = 0;

        console.log("🚀 Starting upload to Supabase...");

        for (let i = 0; i < toInsert.length; i += batchSize) {
            const batch = toInsert.slice(i, i + batchSize);
            await db.insert(brainQuestions).values(batch);
            insertedCount += batch.length;
            process.stdout.write(`\r✅ Progress: ${insertedCount} / ${toInsert.length} questions uploaded`);
        }

        console.log("\n🎉 Brain Quiz Questions Uploaded Successfully!");

        // Final count verification
        const [finalCount] = await db.select({ count: sql<number>`count(*)` }).from(brainQuestions);
        console.log(`📊 Final DB Count: ${finalCount.count}`);

        process.exit(0);
    } catch (err) {
        console.error("\n❌ Error during ingestion:", err);
        process.exit(1);
    }
}

ingestQuiz();
