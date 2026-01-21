import { pool } from '../server/db.js';

async function listTables() {
    try {
        const res = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
        console.log("Tables in DB:", res.rows.map(r => r.table_name));
    } catch (e) {
        console.error("Error listing tables:", e);
    } finally {
        await pool.end();
    }
}

listTables();
