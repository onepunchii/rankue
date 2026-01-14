import "dotenv/config";
import fs from "fs";
import path from "path";
import { db } from "./server/db";
import { brainQuestions } from "./shared/schema";

async function ingestQuiz() {
    console.log("🧠 Brain Quiz Questions Ingest Started...");

    const filePath = path.resolve(process.cwd(), 'quiz', 'brain_rank_questions_final.json');

    if (!fs.existsSync(filePath)) {
        console.error("❌ File not found:", filePath);
        process.exit(1);
    }

    try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const questions = JSON.parse(fileContent);

        console.log(`📂 Loaded ${questions.length} questions`);

        // Check if DB is connected
        if (!process.env.DATABASE_URL) {
            console.error("❌ DATABASE_URL is missing. Please check .env file.");
            process.exit(1);
        }

        // transform
        console.log("🔄 Transforming data...");
        const toInsert = questions.map((q: any) => {
            const answerString = q.options[q.answer_index];
            return {
                category: q.category,
                level: q.level,
                eloRating: 1300, // default
                isActive: true,
                content: {
                    q: q.question,
                    options: q.options,
                    answer: answerString,
                    explanation: q.explanation
                }
            };
        });

        // Batch insert in chunks of 100
        const batchSize = 100;
        let insertedCount = 0;

        console.log("🚀 Starting upload to Supabase...");

        for (let i = 0; i < toInsert.length; i += batchSize) {
            const batch = toInsert.slice(i, i + batchSize);
            await db.insert(brainQuestions).values(batch);
            insertedCount += batch.length;
            process.stdout.write(`\r✅ Progress: ${insertedCount} / ${toInsert.length} questions uploaded`);
        }

        console.log("\n🎉 Brain Quiz Questions Uploaded Successfully!");
        process.exit(0);
    } catch (err) {
        console.error("\n❌ Error during ingestion:", err);
        process.exit(1);
    }
}

ingestQuiz();
