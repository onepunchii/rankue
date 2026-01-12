
import { db } from './server/db';
import { surveys } from '@shared/schema';
import { eq, like } from 'drizzle-orm';

function getWeekNumber(d: Date = new Date()): number {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

async function run() {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    const weekNumber = getWeekNumber(today);
    const title = `${year}년 ${month}월 ${weekNumber}주차 정기 여론조사`;

    console.log('Generated Title:', title);

    const result = await db.select().from(surveys).where(eq(surveys.title, title));
    console.log('Result for exact title:', JSON.stringify(result, null, 2));

    const likeResult = await db.select().from(surveys).where(like(surveys.title, '%정기 여론조사%'));
    console.log('Result for LIKE title:', JSON.stringify(likeResult, null, 2));

    process.exit(0);
}

run();
