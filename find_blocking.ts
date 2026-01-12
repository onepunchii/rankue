
import { db } from './server/db';
import { surveys } from '@shared/schema';
import { eq, and, gte, lte } from 'drizzle-orm';

async function findBlockingSurvey() {
    const today = new Date();
    const currentDay = today.getDay(); // 0: Sun, 1: Mon ... (Today is Mon=1)
    const diffToMon = currentDay === 0 ? -6 : 1 - currentDay; // 1-1=0

    const monday = new Date(today);
    monday.setDate(today.getDate() + diffToMon);
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    console.log('Searching between:', monday.toISOString(), 'and', sunday.toISOString());

    const existing = await db.select().from(surveys).where(
        and(
            eq(surveys.category, 'politics'),
            gte(surveys.createdAt, monday),
            lte(surveys.createdAt, sunday)
        )
    );

    console.log('Found surveys:', JSON.stringify(existing, null, 2));
    process.exit(0);
}

findBlockingSurvey();
