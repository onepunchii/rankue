
import { db } from "./db.js";
import { hiqMembers } from "../shared/schema.js";
import { eq } from "drizzle-orm";

async function checkUserStats() {
    const userId = "7de3b4b4-8c98-4fb0-a88d-e615a3442ebd"; // Choe Jeong Hwan
    const [member] = await db.select().from(hiqMembers).where(eq(hiqMembers.id, userId));

    console.log("User:", member.name);
    console.log("Golf Avg Score:", member.golfAvgScore);
    console.log("Golf Handicap:", member.golfHandicap);

    process.exit(0);
}

checkUserStats();
