import pg from 'pg';
import 'dotenv/config';

async function testConnection() {
    const url = "postgresql://postgres:fuL40zLCQDdkSLN2@lepxydsyucyqrpmcqqpq.supabase.co:5432/postgres";
    console.log("Testing with URL:", url.replace(/:[^:@]+@/, ":****@"));
    const client = new pg.Client({
        connectionString: url,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log("Connection successful!");
        const res = await client.query("SELECT now()");
        console.log("Result:", res.rows[0]);
    } catch (e) {
        console.error("Connection failed:", e);
    } finally {
        await client.end();
    }
}

testConnection();
