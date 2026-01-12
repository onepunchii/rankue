import 'dotenv/config';
import { db } from './server/db';
import { surveys, surveyQuestions, surveyResponses } from './shared/schema';
import { eq, and, like, desc } from 'drizzle-orm';

async function checkPoliticalData() {
    console.log('=== Checking Political Survey Data ===\n');

    // 1. Check for political surveys
    const politicalSurveys = await db.select()
        .from(surveys)
        .where(and(
            eq(surveys.category, 'politics'),
            like(surveys.title, '%정기 여론조사%')
        ))
        .orderBy(desc(surveys.createdAt))
        .limit(5);

    console.log(`Found ${politicalSurveys.length} political surveys:`);
    politicalSurveys.forEach(s => {
        console.log(`  - ID: ${s.id}, Title: ${s.title}, Created: ${s.createdAt}`);
    });

    if (politicalSurveys.length === 0) {
        console.log('\n⚠️  NO POLITICAL SURVEYS FOUND!');
        console.log('This is why the graphs are empty.');
        console.log('You need to run the political survey scheduler to create them.\n');
        return;
    }

    // 2. Check questions for the latest survey
    const latestSurvey = politicalSurveys[0];
    console.log(`\n=== Latest Survey: ${latestSurvey.title} (ID: ${latestSurvey.id}) ===`);

    const questions = await db.select()
        .from(surveyQuestions)
        .where(eq(surveyQuestions.surveyId, latestSurvey.id))
        .orderBy(surveyQuestions.order);

    console.log(`\nQuestions (${questions.length}):`);
    questions.forEach(q => {
        console.log(`  Q${q.order}: ${q.question}`);
        console.log(`     Options: ${JSON.stringify(q.options)}`);
    });

    // 3. Check responses
    const responses = await db.select()
        .from(surveyResponses)
        .where(eq(surveyResponses.surveyId, latestSurvey.id));

    console.log(`\nTotal Responses: ${responses.length}`);

    if (responses.length === 0) {
        console.log('\n⚠️  NO RESPONSES FOUND!');
        console.log('The survey exists but has no responses yet.');
        console.log('This is why the graphs show 0%.\n');
    } else {
        // Count responses per question
        questions.forEach(q => {
            const qResponses = responses.filter(r => r.questionId === q.id);
            console.log(`  Q${q.order}: ${qResponses.length} responses`);
        });
    }

    console.log('\n=== Summary ===');
    console.log(`Surveys: ${politicalSurveys.length > 0 ? '✓' : '✗'}`);
    console.log(`Questions: ${questions.length > 0 ? '✓' : '✗'}`);
    console.log(`Responses: ${responses.length > 0 ? '✓' : '✗'}`);
}

checkPoliticalData()
    .then(() => {
        console.log('\n✓ Check complete');
        process.exit(0);
    })
    .catch(err => {
        console.error('Error:', err);
        process.exit(1);
    });
