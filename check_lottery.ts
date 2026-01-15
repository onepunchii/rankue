
import 'dotenv/config';
import { db } from "./server/db.js";
import { lotteryDraws, lotteryTickets } from "./shared/schema.js";
import { desc, eq } from "drizzle-orm";

import { storage } from "./server/storage.js";

async function checkLotteryData() {
    try {
        console.log("=== Checking Lottery API Response ===");

        // Simulate API call
        const history = await storage.getLotteryHistoryWithStats(5);
        console.log("History Data Sample:");
        if (history.length > 0) {
            console.log(JSON.stringify(history[0], null, 2));
        }
        console.table(history.map(h => ({
            id: h.id,
            round: h.round, // Check if this property exists
            drawDate: h.drawDate,
            winNums: h.winningNumbers
        })));

        // 2. Check my tickets (assuming we can't easily filter by user without ID, listing latest)
        // But for testing, let's just list recent tickets to see their roundId format
        const tickets = await db.select().from(lotteryTickets).limit(5).orderBy(desc(lotteryTickets.createdAt));
        console.log("Recent Tickets:");
        console.table(tickets.map(t => ({
            id: t.id,
            roundId: t.roundId,
            numbers: t.numbers,
            createdAt: t.createdAt
        })));

    } catch (error) {
        console.error("Error checking lottery data:", error);
    }
    process.exit(0);
}

checkLotteryData();
