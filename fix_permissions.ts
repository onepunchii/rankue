import 'dotenv/config';
import { pool } from "./server/db";

async function fixPermissions() {
    if (!process.env.DATABASE_URL) {
        console.error("DATABASE_URL not set");
        process.exit(1);
    }

    console.log("Fixing permissions...");
    const client = await pool.connect();
    try {
        // Grant permissions to the tables created
        await client.query(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;`);
        await client.query(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;`);
        // Specifically ensuring the ratings tables are covered if they were somehow missed or owner issues
        await client.query(`GRANT ALL ON TABLE assembly_ratings TO postgres, anon, authenticated, service_role;`);
        await client.query(`GRANT ALL ON TABLE local_council_ratings TO postgres, anon, authenticated, service_role;`);
        console.log("Permissions granted successfully.");
    } catch (err) {
        console.error("Error granting permissions:", err);
    } finally {
        client.release();
        pool.end();
    }
}

fixPermissions();
