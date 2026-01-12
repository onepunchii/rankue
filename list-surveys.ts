
import { db } from "./server/db";
import { surveys } from "./shared/schema";

async function listSurveys() {
    const allSurveys = await db.select().from(surveys);
    console.log("Found Surveys:", allSurveys.length);
    allSurveys.forEach(s => {
        console.log(`[${s.id}] [${s.category}] ${s.title}`);
    });
    process.exit(0);
}

listSurveys().catch(console.error);
