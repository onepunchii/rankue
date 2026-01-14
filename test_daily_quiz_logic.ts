
import "dotenv/config";
import { storage } from "./server/storage";
import { db } from "./server/db";
import { profiles } from "./shared/schema";
import { eq } from "drizzle-orm";

async function testDailyQuiz() {
    console.log("🧪 Testing storage.getDailyQuestions...");

    try {
        // 1. Get a test user or create a temporary one context
        // Let's just pass a level directly if the function allows, 
        // but storage.getDailyQuestions takes (userLevel: number).

        const testLevel = 2;
        console.log(`Input Level: ${testLevel}`);

        const questions = await storage.getBrainDailyQuestions(testLevel);

        console.log(`✅ Success! Received ${questions.length} questions.`);
        questions.forEach((q, i) => {
            console.log(`[${i + 1}] Category: ${q.category}, Level: ${q.level}`);
        });

        if (questions.length === 0) {
            console.warn("⚠️ Warning: Received 0 questions!");
        }

        process.exit(0);
    } catch (err) {
        console.error("❌ Error in getDailyQuestions:", err);
        process.exit(1);
    }
}

testDailyQuiz();
