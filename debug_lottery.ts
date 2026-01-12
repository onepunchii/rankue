import 'dotenv/config';
import { db } from './server/db';
import { lotteryDraws, lotteryTickets } from './shared/schema';
import { desc, eq, sql } from 'drizzle-orm';

async function checkLotteryStatus() {
    console.log('=== Checking Lottery Status ===\n');

    const now = new Date();
    console.log(`Current Time: ${now.toISOString()}\n`);

    // Check recent draws
    const draws = await db.select().from(lotteryDraws).orderBy(desc(lotteryDraws.drawDate)).limit(5);
    console.log('--- Recent Draws ---');
    draws.forEach(d => {
        console.log(`ID: ${d.id}, Date: ${d.drawDate.toISOString()}, Numbers: ${JSON.stringify(d.winningNumbers)}, Participants: ${d.totalParticipants}`);
    });
    console.log('');

    // Check pending tickets
    const [pendingCount] = await db.select({ count: sql<number>`count(*)` }).from(lotteryTickets).where(sql`${lotteryTickets.isWinner} IS NULL`);
    console.log(`--- Pending Tickets Count: ${pendingCount.count} ---\n`);

    if (pendingCount.count > 0) {
        const samples = await db.select().from(lotteryTickets).where(sql`${lotteryTickets.isWinner} IS NULL`).limit(5);
        samples.forEach(t => {
            console.log(`Ticket ID: ${t.id}, Round ID: ${t.roundId}, Numbers: ${JSON.stringify(t.numbers)}, Created: ${t.createdAt.toISOString()}`);
        });
    }

    process.exit(0);
}

checkLotteryStatus().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
