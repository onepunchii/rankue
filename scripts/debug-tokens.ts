import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { profiles } from "../shared/schema.ts";
import dotenv from "dotenv";

dotenv.config();

const connectionString = process.env.DATABASE_URL!;
const pool = new pg.Pool({ connectionString });
const db = drizzle(pool);

async function checkTokens() {
    try {
        const users = await db.select({
            id: profiles.id,
            nickname: profiles.nickname,
            phone: profiles.phone,
            pushToken: profiles.pushToken
        }).from(profiles);

        console.log(`Total profiles: ${users.length}`);
        users.forEach(u => {
            console.log(`- [${u.id}] ${u.nickname} (${u.phone}): ${u.pushToken || 'NO_TOKEN'}`);
        });

    } catch (e) {
        console.error("Error:", e);
    }
    process.exit(0);
}

checkTokens();
