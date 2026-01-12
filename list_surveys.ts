
import { db } from './server/db';
import { surveys } from '@shared/schema';
import { desc } from 'drizzle-orm';

async function listSurveys() {
  const result = await db.select().from(surveys).orderBy(desc(surveys.createdAt)).limit(5);
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

listSurveys();

