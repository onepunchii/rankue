import "dotenv/config";
import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function checkSchema() {
    try {
        console.log("🔍 Checking assembly_members table schema...");

        const assemblyColumns = await db.execute(sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'assembly_members' 
      ORDER BY ordinal_position;
    `);

        console.log("\n📊 assembly_members columns:");
        console.table(assemblyColumns.rows);

        const hasAiPersona = assemblyColumns.rows.some((col: any) => col.column_name === 'ai_persona');
        console.log(`\n✅ assembly_members has ai_persona column: ${hasAiPersona}`);

        console.log("\n🔍 Checking local_council_members table schema...");

        const localColumns = await db.execute(sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'local_council_members' 
      ORDER BY ordinal_position;
    `);

        console.log("\n📊 local_council_members columns:");
        console.table(localColumns.rows);

        const hasLocalAiPersona = localColumns.rows.some((col: any) => col.column_name === 'ai_persona');
        console.log(`\n✅ local_council_members has ai_persona column: ${hasLocalAiPersona}`);

        if (hasAiPersona && hasLocalAiPersona) {
            console.log("\n🎉 Migration successful! Both tables have ai_persona column.");
        } else {
            console.log("\n⚠️ Migration incomplete. ai_persona column missing.");
        }

        process.exit(0);
    } catch (error) {
        console.error("❌ Error checking schema:", error);
        process.exit(1);
    }
}

checkSchema();
