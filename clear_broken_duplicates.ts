
import { db } from "./server/db";
import { politicians } from "./shared/schema";
import { eq, isNull, and } from "drizzle-orm";

async function clearBrokenDuplicates() {
    console.log("🧹 Clearing broken duplicate politicians...");

    // Delete politicians where level is NULL and type is 'national'
    // These are likely the residues from previous incorrect seeding or duplicate ingestion issues
    const result = await db.delete(politicians)
        .where(
            and(
                eq(politicians.type, 'national'),
                isNull(politicians.level)
            )
        );

    console.log("✅ Broken national politicians deleted.");
}

clearBrokenDuplicates().catch(console.error);
