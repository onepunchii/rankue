
import { pgTable, serial, text, varchar, timestamp, boolean, integer, uuid } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

async function main() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    });

    const db = drizzle(pool);

    console.log("Attempting to add winner_id column...");

    try {
        await pool.query(`
      ALTER TABLE hiq_games 
      ADD COLUMN IF NOT EXISTS winner_id UUID REFERENCES hiq_members(id);
    `);
        console.log("Successfully added winner_id column or it already exists.");
    } catch (e) {
        console.error("Error adding column:", e);
    } finally {
        await pool.end();
    }
}

main();
