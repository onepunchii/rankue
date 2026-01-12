
import 'dotenv/config';
import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function main() {
    try {
        console.log("Searching for surveys...");
        const result = await db.execute(sql`
      SELECT s.id, s.title, COUNT(q.id) as question_count
      FROM surveys s
      LEFT JOIN survey_questions q ON s.id = q.survey_id
      GROUP BY s.id
      ORDER BY question_count DESC
      LIMIT 20;
    `);
        console.log("Top surveys by question count:");
        console.log(result.rows);

        const specific = await db.execute(sql`
        SELECT * FROM surveys WHERE title LIKE '%정치%' OR title LIKE '%성향%';
    `);
        console.log("Surveys matching name 'Political' or 'Tendency':", specific.rows);

    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}
main();
