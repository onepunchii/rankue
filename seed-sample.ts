import { db } from "./server/db";
import { hiqGames, hiqGameHistory, hiqMembers } from "./shared/schema";
import { eq } from "drizzle-orm";

async function seed() {
    try {
        // 1. Get a member
        const member = (await db.select().from(hiqMembers).limit(1))[0];
        if (!member) {
            console.error("No members found to link sample record.");
            process.exit(1);
        }
        console.log(`Linking to member: ${member.name} (${member.id})`);

        // 2. Create a dummy game
        const [game] = await db.insert(hiqGames).values({
            storeId: member.storeId,
            gameMode: "match",
            gameType: "4c",
            player1Id: member.id,
            player1Name: member.name,
            player1Target: 250,
            player1Score: 250,
            player2Name: "봇_샘플상대",
            player2Target: 200,
            player2Score: 180,
            targetScore: 250,
            totalInnings: 15,
            isRanked: true,
            status: "finished",
            result: "Sample Win",
            player1HighRun: 50,
            player2HighRun: 30,
            player1Innings: [10, 20, 0, 50, 10, 0, 30, 40, 20, 10, 0, 0, 30, 20, 10],
            player2Innings: [0, 10, 20, 0, 40, 30, 0, 10, 20, 10, 10, 10, 0, 0, 0]
        }).returning();
        console.log(`Created sample game: ${game.id}`);

        // 3. Create a history record
        const [history] = await db.insert(hiqGameHistory).values({
            memberId: member.id,
            gameId: game.id,
            gameMode: "match",
            gameType: "4c",
            score: 250,
            innings: 15,
            average: "16.67",
            isRanked: true,
            isWinner: true,
            opponentName: "봇_샘플상대",
            highRun: 50,
            inningData: [10, 20, 0, 50, 10, 0, 30, 40, 20, 10, 0, 0, 30, 20, 10],
            earnedPoints: 100
        }).returning();
        console.log(`Created sample history record: ${history.id}`);

    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}

seed();
