import 'dotenv/config';
import { db } from './db';
import { surveys } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';
import { createWeeklyPoliticalSurvey } from './politicalScheduler';

async function run() {
    console.log('🔄 FORCE Resetting weekly political survey...');

    // Find the recent surveys and delete them
    const recent = await db.select().from(surveys)
        .where(eq(surveys.category, 'politics'))
        .orderBy(desc(surveys.createdAt))
        .limit(5);

    for (const s of recent) {
        console.log(`Found survey: ${s.title} (${s.id}) - CreatedAt: ${s.createdAt}`);
        // 무조건 최근 5개 삭제 (테스트용)
        await db.delete(surveys).where(eq(surveys.id, s.id));
        console.log(`🗑️ Deleted survey ${s.id}`);
    }

    console.log('Waiting for DB propagation...');
    await new Promise(r => setTimeout(r, 1000));

    await createWeeklyPoliticalSurvey();
    console.log('✅ Done! Check the app.');
    process.exit(0);
}

run();
