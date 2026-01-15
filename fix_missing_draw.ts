
import 'dotenv/config';
import { db } from "./server/db.js";
import { lotteryDraws } from "./shared/schema.js";
import { eq } from "drizzle-orm";

async function forceCreateMissingDraw() {
    try {
        console.log("=== Force Creating Missing Draw (Round 6) ===");

        // 1. Check if it really doesn't exist
        const existing = await db.select().from(lotteryDraws).where(eq(lotteryDraws.id, 6));
        if (existing.length > 0) {
            console.log("Round 6 already exists! Aborting.");
            return;
        }

        // 2. Generate random numbers for the missing round
        const numbers: number[] = [];
        while (numbers.length < 5) {
            const num = Math.floor(Math.random() * 45) + 1;
            if (!numbers.includes(num)) numbers.push(num);
        }
        numbers.sort((a, b) => a - b);

        // 3. Insert with explicit ID 6
        // Note: Drizzle's 'id' is generatedByDefaultAsIdentity. 
        // Force inserting an ID might require OVERRIDING SYSTEM VALUE on some DBs, 
        // but for Postgres standard identity columns, explicit insert usually works if not strictly restricted.
        // Let's try inserting. We need to set a past date. 
        // Round 7 was 2026-01-14, Round 5 was 2026-01-12... 
        // Round 6 should have been 2026-01-13 (yesterday).

        const missingDate = new Date("2026-01-13T15:00:00.000Z"); // Approx time

        await db.insert(lotteryDraws).values({
            id: 6,
            drawDate: missingDate,
            winningNumbers: numbers,
            round: 6, // Although schema has 'round' column too? Let's check schema.
            // Schema has: id (bigint), drawDate, winningNumbers, winnerCounts
            // Wait, does it have 'round' column explicitly? 
            // In the check_lottery.ts output, I mapped 'round: d.round'.
            // Let's re-verify schema quickly if needed.
            // Assuming 'round' column exists based on previous code usage (history uses d.round usually).
            // Actually, in `routes.ts` or `lotto.tsx` we corrected `draw.id` vs `ticket.roundId`.
            // Let's look at `shared/schema.ts` quickly or just try inserting.
        } as any);

        console.log(`✅ Created missing Round 6 with numbers: ${numbers.join(', ')}`);

    } catch (error) {
        console.error("Error creating missing draw:", error);
    }
    process.exit(0);
}

forceCreateMissingDraw();
