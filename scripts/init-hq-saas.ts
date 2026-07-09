import { db, pool } from '../server/db.js';
import { hiqStores } from '../shared/schema.js';
import { sql } from 'drizzle-orm';

async function initSaaS() {
    try {
        console.log("🚀 Initializing SaaS Database Structure...");

        // 1. Create Extensions
        await db.execute(sql`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

        // 2. Create hiq_stores
        await db.execute(sql`
            CREATE TABLE IF NOT EXISTS hiq_stores (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                slug TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                logo_text TEXT,
                theme_color TEXT DEFAULT '#6366f1',
                neon_color TEXT DEFAULT '#818cf8',
                sub_text TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT now(),
                updated_at TIMESTAMP NOT NULL DEFAULT now()
            )
        `);

        // 3. Create hiq_members
        await db.execute(sql`
            CREATE TABLE IF NOT EXISTS hiq_members (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                store_id UUID REFERENCES hiq_stores(id) NOT NULL,
                phone TEXT NOT NULL,
                name TEXT NOT NULL,
                birth_year INTEGER,
                handi_3c INTEGER,
                handi_4c INTEGER,
                average TEXT,
                marketing_agree BOOLEAN DEFAULT false,
                visit_count INTEGER DEFAULT 0,
                last_visited_at TIMESTAMP,
                created_at TIMESTAMP NOT NULL DEFAULT now(),
                updated_at TIMESTAMP NOT NULL DEFAULT now(),
                UNIQUE(store_id, phone)
            )
        `);

        // 4. Create hiq_games
        await db.execute(sql`
            CREATE TABLE IF NOT EXISTS hiq_games (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                store_id UUID REFERENCES hiq_stores(id) NOT NULL,
                game_mode TEXT NOT NULL,
                game_type TEXT NOT NULL,
                player1_id UUID REFERENCES hiq_members(id) NOT NULL,
                player2_id UUID REFERENCES hiq_members(id),
                player1_target INTEGER DEFAULT 0,
                player2_target INTEGER DEFAULT 0,
                player1_score INTEGER DEFAULT 0,
                player2_score INTEGER DEFAULT 0,
                status TEXT DEFAULT 'playing_base',
                played_at TIMESTAMP NOT NULL DEFAULT now()
            )
        `);

        // 5. Insert Default Data
        console.log("Checking for default store 'hiq'...");
        const existing = await db.execute(sql`SELECT * FROM hiq_stores WHERE slug = 'hiq'`);

        if (existing.rows.length === 0) {
            console.log("Inserting default store 'hiq'...");
            await db.insert(hiqStores).values({
                slug: 'hiq',
                name: '랭큐',
                logoText: 'RANKUE',
                themeColor: '#10B981',
                neonColor: '#34D399',
                subText: '당구 실력 랭킹 & 매칭'
            });
            console.log("✅ Default store created!");
        }

        console.log("✨ SaaS Database Initialization Complete!");
    } catch (e) {
        console.error("❌ Initialization failed:", e);
    } finally {
        await pool.end();
    }
}

initSaaS();
