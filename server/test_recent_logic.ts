
import { getRecentOpponents } from "./storage/index.js";

async function test() {
    const userId = "7de3b4b4-8c98-4fb0-a88d-e615a3442ebd";
    console.log("Testing getRecentOpponents for user:", userId);

    try {
        const opponents = await getRecentOpponents(userId, "GOLF");
        console.log("Opponents found:", opponents.length);
        console.log(JSON.stringify(opponents, null, 2));
    } catch (e) {
        console.error("Error:", e);
    }
    process.exit(0);
}

test();
