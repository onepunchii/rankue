import { db, pool } from '../server/db.js';
import { hiqStores } from '../shared/schema.js';
import { sql } from 'drizzle-orm';

async function initHiqStore() {
    try {
        console.log("Creating hiq_stores table if missing...");
        await db.execute(sql`
            CREATE TABLE IF NOT EXISTS hiq_stores (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                slug TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                logo_text TEXT,
                theme_color TEXT DEFAULT '#0e4d2a',
                neon_color TEXT DEFAULT '#ffd700',
                sub_text TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT now(),
                updated_at TIMESTAMP NOT NULL DEFAULT now()
            )
        `);

        console.log("Checking for default store 'hiq'...");
        const existing = await db.execute(sql`SELECT * FROM hiq_stores WHERE slug = 'hiq'`);

        if (existing.rows.length === 0) {
            console.log("Inserting default store 'hiq'...");
            await db.insert(hiqStores).values({
                slug: 'hiq',
                name: '하이큐 당구장',
                logoText: 'HiQ Billiards',
                themeColor: '#6366f1',
                neonColor: '#818cf8',
                subText: 'Global Billiards Solution'
            });
            console.log("Default store created!");
        } else {
            console.log("Default store 'hiq' already exists.");
        }
    } catch (e) {
        console.error("Initialization failed:", e);
    } finally {
        await pool.end();
    }
}

initHiqStore();
