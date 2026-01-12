
import { db } from "./server/db";
import { politicians } from "./shared/schema";
import { eq, sql } from "drizzle-orm";

async function checkDuplicates() {
    console.log("Checking for National Assembly duplicates...");

    // Count total national
    const national = await db.select({
        count: sql<number>`count(*)`
    }).from(politicians).where(eq(politicians.level, '국회'));

    console.log(`Total '국회' politicians: ${national[0].count}`);

    // Check by name duplication
    const duplicates = await db.execute(sql`
        SELECT name, party, count(*) as c 
        FROM politicians 
        WHERE level = '국회' 
        GROUP BY name, party 
        HAVING count(*) > 1
        LIMIT 10
    `);

    console.log("Duplicate samples:", duplicates.rows);

    // Check all levels
    const levels = await db.select({
        level: politicians.level,
        type: politicians.type,
        count: sql<number>`count(*)`
    }).from(politicians).groupBy(politicians.level, politicians.type);
    console.log("Counts by level/type:", levels);
}

checkDuplicates().catch(console.error);
