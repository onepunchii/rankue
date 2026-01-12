
import { createClient } from '@supabase/supabase-js';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const dbUrl = process.env.DATABASE_URL;
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("Starting test...");
console.log("DB URL:", dbUrl ? "Set" : "Missing");

if (!dbUrl) process.exit(1);

const client = postgres(dbUrl);
const db = drizzle(client);

async function main() {
    try {
        console.log("Connecting to DB...");
        const result = await client`SELECT NOW()`;
        console.log("DB Connected:", result);

        console.log("Checking profiles...");
        const userId = "357f7a36-a71a-4051-aea2-bba267f88689";
        const users = await client`SELECT * FROM profiles WHERE id = ${userId}`;
        console.log("User found:", users.length);

        if (users.length > 0) {
            console.log("Tickets:", users[0].available_lottery_tickets);
        }

    } catch (e) {
        console.error("Error:", e);
    } finally {
        await client.end();
    }
}

main();
