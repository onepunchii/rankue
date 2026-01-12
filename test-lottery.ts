import { storage } from "./server/storage";
import { db } from "./server/db";
import { profiles } from "@shared/schema";
import { eq } from "drizzle-orm";

async function main() {
    console.error("DEBUG: Starting test-lottery...");
    const userId = "357f7a36-a71a-4051-aea2-bba267f88689";

    try {
        // 1. Check user status
        console.error("DEBUG: querying user...");
        const [user] = await db.select().from(profiles).where(eq(profiles.id, userId));
        if (!user) {
            console.error("❌ User not found in DB");
            return;
        }
        console.error(`👤 User found: ${user.name} (Tickets: ${user.availableLotteryTickets})`);

        // 2. Ensure user has tickets
        if ((user.availableLotteryTickets || 0) < 1) {
            console.error("⚠️ User has no tickets. Adding 1 ticket for testing...");
            await db.update(profiles).set({ availableLotteryTickets: 1 }).where(eq(profiles.id, userId));
            console.error("✅ Added 1 ticket.");
        }

        // 3. Attempt creation
        console.error("🎟️ Calling storage.createLotteryTicket...");
        const ticket = await storage.createLotteryTicket(userId, 2, [1, 2, 3, 4, 5]);
        console.error("✅ Ticket created successfully!");
        console.error(JSON.stringify(ticket, null, 2));

    } catch (e: any) {
        console.error("❌ Failed to create ticket:");
        console.error(e);
    }
}

main().then(() => console.error("Done")).catch(e => console.error("Fatal:", e));
