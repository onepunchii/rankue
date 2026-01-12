
import 'dotenv/config';
import { db } from "./server/db";
import { politicians } from "./shared/schema";
import { sql } from "drizzle-orm";

async function fixData() {
    console.log("🛠️ Fixing politician data types for compatibility...");

    try {
        // Update all politicians to have type='national' and is_active=true
        // This makes them visible to the server API which filters by type='national' and is_active=true
        await db.update(politicians)
            .set({
                type: 'national',
                isActive: true
            });

        console.log("✅ [Success] All politicians updated to type='national' and isActive=true.");
    } catch (e) {
        console.error("❌ Fix failed:", e);
    } finally {
        process.exit();
    }
}
fixData();
