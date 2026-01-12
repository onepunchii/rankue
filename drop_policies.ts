
import "dotenv/config";
import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function run() {
  console.log("Dropping ALL tables, policies, and sequences in public schema...");
  try {
    // Drop all tables with CASCADE
    await db.execute(sql`
      DO $$ 
      DECLARE 
        r RECORD; 
      BEGIN 
        FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP 
          EXECUTE 'DROP TABLE IF EXISTS "public"."' || r.tablename || '" CASCADE'; 
        END LOOP; 
      END $$;
    `);

    // Also drop sequences just in case others are left
    await db.execute(sql`
      DO $$ 
      DECLARE 
        r RECORD; 
      BEGIN 
        FOR r IN (SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind = 'S' AND n.nspname = 'public') LOOP 
          EXECUTE 'DROP SEQUENCE IF EXISTS "public"."' || r.relname || '" CASCADE'; 
        END LOOP; 
      END $$;
    `);

    console.log("Database cleared successfully.");
  } catch (err) {
    console.error("Error clearing database:", err);
  }
  process.exit(0);
}

run();
