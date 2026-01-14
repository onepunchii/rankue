
import { db } from "../db.js";
import { brainQuestions } from "../../shared/schema.js";
import { sql } from "drizzle-orm";

async function check() {
    try {
        const result = await db.select({ count: sql`count(*)` }).from(brainQuestions);
        console.log("Current count:", result[0].count);
    } catch (err) {
        console.error("Error checking count:", err);
    }
}

check();
