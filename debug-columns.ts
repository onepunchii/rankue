import { db } from "./server/db";
import { hiqGameHistory } from "./shared/schema";
import { sql } from "drizzle-orm";

async function check() {
    try {
        const result = await db.execute(sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'hiq_game_history'
    `);
        console.log("Columns in hiq_game_history:");
        console.table(result.rows);
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}

check();
