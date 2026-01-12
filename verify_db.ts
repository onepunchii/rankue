
import * as dotenv from "dotenv";
dotenv.config();

async function verifyMigration() {
    console.log("Verifying migration...");

    // Dynamic import to ensure process.env.DATABASE_URL is available
    const { db } = await import("./server/db");
    const { sql } = await import("drizzle-orm");

    try {
        // Check news_articles table structure
        const newsColumns = await db.execute(sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'news_articles'
    `);
        console.log("news_articles columns:", newsColumns.rows);

        // Check lottery_tickets table structure
        const lotteryColumns = await db.execute(sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'lottery_tickets'
    `);
        console.log("lottery_tickets columns:", lotteryColumns.rows);

        const hasCategory = newsColumns.rows.some((c: any) => c.column_name === 'category');
        const hasIsAiGenerated = newsColumns.rows.some((c: any) => c.column_name === 'is_ai_generated');
        const hasRoundId = lotteryColumns.rows.some((c: any) => c.column_name === 'round_id');

        if (hasCategory && hasIsAiGenerated && hasRoundId) {
            console.log("SUCCESS: All columns found in database.");
        } else {
            console.log("FAILURE: Some columns are missing.");
            if (!hasCategory) console.log("- news_articles.category is missing");
            if (!hasIsAiGenerated) console.log("- news_articles.is_ai_generated is missing");
            if (!hasRoundId) console.log("- lottery_tickets.round_id is missing");
        }

    } catch (error) {
        console.error("Verification failed:", error);
    } finally {
        process.exit();
    }
}

verifyMigration();
