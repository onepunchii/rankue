
import { storage } from "./storage.js";

async function main() {
    const userId = "7de3b4b4-8c98-4fb0-a88d-e615a3442ebd";

    console.log("--- Fetching Member ---");
    const member = await storage.getMemberById(userId);
    console.log("Member:", member?.name);
    console.log("Member Avg Score:", member?.golfAvgScore);

    console.log("\n--- Fetching Game History (GOLF) ---");
    const history = await storage.getMemberGameHistory(userId, "GOLF");
    console.log(`Found ${history.length} records.`);

    if (history.length > 0) {
        history.forEach(h => {
            console.log(`ID: ${h.id}, Score: ${h.score}, Date: ${h.createdAt}, Mode: ${h.gameMode}`);
        });
    } else {
        console.log("No golf history found.");
    }

    process.exit(0);
}

main().catch(console.error);
