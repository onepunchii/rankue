
import { createWeeklyPoliticalSurvey } from './server/politicalScheduler';

async function run() {
    console.log('Running manual creation...');
    try {
        await createWeeklyPoliticalSurvey();
        console.log('Manual creation finished.');
    } catch (e) {
        console.error('Manual creation failed:', e);
    }
    process.exit(0);
}

run();
