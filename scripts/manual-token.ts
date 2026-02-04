import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { profiles } from "../shared/schema.ts";
import { eq } from "drizzle-orm";
import dotenv from "dotenv";

dotenv.config();

const connectionString = process.env.DATABASE_URL!;
const pool = new pg.Pool({ connectionString });
const db = drizzle(pool);

async function setToken() {
    try {
        const userId = "6a769db3-6807-4cb2-bf7c-fe0da84fa7cf"; // 최정환
        const token = "ExponentPushToken[v33_iULS8MX89yxmzM3Ufy]";

        await db.update(profiles)
            .set({ pushToken: token })
            .where(eq(profiles.id, userId));

        console.log(`✅ Token set for user ${userId}`);

    } catch (e) {
        console.error("Error:", e);
    }
    process.exit(0);
}

setToken();
