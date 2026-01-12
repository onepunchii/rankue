import 'dotenv/config';
import { db } from './server/db';
import { surveyResponses } from './shared/schema';
import { eq } from 'drizzle-orm';

async function deleteOldResponses() {
    console.log('=== Deleting Old Political Survey Responses ===\n');

    // Survey ID 3 (2026년 1월 2주차)
    const surveyId = 3;

    try {
        const result = await db.delete(surveyResponses)
            .where(eq(surveyResponses.surveyId, surveyId));

        console.log(`✓ Deleted all responses for survey ${surveyId}`);
        console.log('Now run: npx tsx seed-political-responses.ts');
    } catch (error) {
        console.error('❌ Error deleting responses:', error);
    }
}

deleteOldResponses()
    .then(() => {
        console.log('\n✓ Complete');
        process.exit(0);
    })
    .catch(err => {
        console.error('Error:', err);
        process.exit(1);
    });
