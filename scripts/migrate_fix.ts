
import { db } from '../server/db';
import { sql } from 'drizzle-orm';

async function migrate() {
    console.log('Starting migration...');
    try {
        await db.execute(sql`ALTER TABLE surveys ADD COLUMN IF NOT EXISTS experience_reward INTEGER DEFAULT 10`);
        console.log('Added experience_reward column.');

        await db.execute(sql`ALTER TABLE surveys ADD COLUMN IF NOT EXISTS personal_points_reward INTEGER DEFAULT 0`);
        console.log('Added personal_points_reward column.');

        console.log('Migration completed successfully.');
    } catch (error) {
        console.error('Migration failed:', error);
    }
    process.exit(0);
}

migrate();
