import {
    lotteryTickets,
    lotteryDraws,
    profiles,
    pointTransactions,
    type LotteryTicket,
    type LotteryDraw
} from "../../shared/schema.js";
import { db } from "../db.js";
import { eq, desc, sql, inArray } from "drizzle-orm";

export class LotteryStorage {
    async getUserLotteryTickets(userId: string): Promise<LotteryTicket[]> {
        return await db.select().from(lotteryTickets)
            .where(eq(lotteryTickets.userId, userId))
            .orderBy(desc(lotteryTickets.createdAt));
    }

    /**
     * Get lottery history with winner statistics (1st, 2nd, 3rd place counts)
     */
    async getLotteryHistoryWithStats(limit: number = 30): Promise<any[]> {
        // 1. Get recent finalized draws (those with winning numbers)
        const draws = await db.select()
            .from(lotteryDraws)
            .where(sql`${lotteryDraws.winningNumbers} IS NOT NULL`)
            .orderBy(desc(lotteryDraws.drawDate))
            .limit(limit);

        if (!draws.length) return [];

        // Filter out draws that have empty winning numbers (just in case)
        const validDraws = draws.filter(d => d.winningNumbers && Array.isArray(d.winningNumbers) && d.winningNumbers.length > 0);
        if (!validDraws.length) return [];

        const drawIds = validDraws.map(d => d.id);

        // 2. Get winner stats for these draws
        const stats = await db.select({
            roundId: lotteryTickets.roundId,
            prize: lotteryTickets.prizeAmount,
            count: sql<number>`count(*)::int`
        })
            .from(lotteryTickets)
            .where(inArray(lotteryTickets.roundId, drawIds))
            .groupBy(lotteryTickets.roundId, lotteryTickets.prizeAmount);

        // 3. Merge stats into draws
        return validDraws.map(draw => {
            const drawStats = stats.filter(s => s.roundId === draw.id);
            const winnerCounts = {
                first: drawStats.find(s => s.prize === 50000)?.count || 0,
                second: drawStats.find(s => s.prize === 5000)?.count || 0,
                third: drawStats.find(s => s.prize === 500)?.count || 0,
            };
            return {
                ...draw,
                winnerCounts
            };
        });
    }

    /**
     * Finds the current active lottery draw or creates one for the next midnight
     */
    async getTodayLotteryDraw(): Promise<LotteryDraw> {
        const now = new Date();
        const nextMidnight = new Date(now);
        nextMidnight.setDate(nextMidnight.getDate() + 1);
        nextMidnight.setHours(0, 0, 0, 0);

        // Find a draw that is scheduled for the future (the next draw)
        const [nextDraw] = await db.select()
            .from(lotteryDraws)
            .where(sql`${lotteryDraws.drawDate} >= ${now.toISOString()}`)
            .orderBy(lotteryDraws.drawDate)
            .limit(1);

        if (nextDraw) return nextDraw;

        // If no future draw exists, create one for the next midnight
        const [newDraw] = await db.insert(lotteryDraws)
            .values({
                drawDate: nextMidnight,
                winningNumbers: [], // TBD
                totalParticipants: 0,
                totalPrizePool: 0,
                createdAt: new Date()
            })
            .returning();

        return newDraw;
    }

    /**
     * Executes the lottery draw:
     * 1. Picks the draw for "now" (scheduled for today or past)
     * 2. Generates winning numbers
     * 3. Processes matching tickets
     * 4. Updates profiles atomically
     */
    async runDailyLotteryDraw(): Promise<LotteryDraw | null> {
        return await db.transaction(async (tx: any) => {
            const now = new Date();

            // 1. Find the oldest "pending" draw (one where winning numbers are empty or hasn't been processed)
            const [draw] = await tx.select()
                .from(lotteryDraws)
                .where(sql`${lotteryDraws.drawDate} <= ${now.toISOString()} AND (cardinality(${lotteryDraws.winningNumbers}) = 0 OR ${lotteryDraws.winningNumbers} IS NULL)`)
                .orderBy(lotteryDraws.drawDate)
                .limit(1);

            if (!draw) {
                console.log("[LotteryStorage] No pending draws to process.");
                return null;
            }

            // 2. Generate Winning Numbers
            const winningNumbers: number[] = [];
            while (winningNumbers.length < 5) {
                const num = Math.floor(Math.random() * 40) + 1;
                if (!winningNumbers.includes(num)) {
                    winningNumbers.push(num);
                }
            }
            winningNumbers.sort((a, b) => a - b);

            // 3. Process matching tickets
            const ticketsToProcess = await tx.select()
                .from(lotteryTickets)
                .where(eq(lotteryTickets.roundId, draw.id));

            let totalPrizePool = 0;
            let participantsCount = ticketsToProcess.length;

            for (const ticket of ticketsToProcess) {
                const matchedCount = (ticket.numbers as number[]).filter(n => winningNumbers.includes(n)).length;
                let prize = 0;

                if (matchedCount === 5) prize = 50000;
                else if (matchedCount === 4) prize = 5000;
                else if (matchedCount === 3) prize = 500;

                if (prize > 0) {
                    totalPrizePool += prize;
                    await tx.update(lotteryTickets)
                        .set({ isWinner: true, prizeAmount: prize })
                        .where(eq(lotteryTickets.id, ticket.id));

                    const [profile] = await tx.select().from(profiles).where(eq(profiles.id, ticket.userId)).limit(1);
                    if (profile) {
                        await tx.update(profiles)
                            .set({ points: (profile.points || 0) + prize })
                            .where(eq(profiles.id, ticket.userId));

                        await tx.insert(pointTransactions)
                            .values({
                                userId: ticket.userId,
                                type: 'earn',
                                amount: prize,
                                description: `로또 당첨금 지급 (${matchedCount}개 일치)`,
                                status: 'completed',
                                createdAt: new Date()
                            });
                    }
                } else {
                    await tx.update(lotteryTickets)
                        .set({ isWinner: false, prizeAmount: 0 })
                        .where(eq(lotteryTickets.id, ticket.id));
                }
            }

            // 4. Update Draw record
            const [updatedDraw] = await tx.update(lotteryDraws)
                .set({
                    winningNumbers,
                    totalParticipants: participantsCount,
                    totalPrizePool: totalPrizePool
                })
                .where(eq(lotteryDraws.id, draw.id))
                .returning();

            return updatedDraw;
        });
    }

    async createTicket(userId: string, roundId: number, numbers: number[]): Promise<LotteryTicket> {
        console.log("[LotteryStorage] Attempting to create ticket for user: " + userId + " round: " + roundId);

        // Use a simpler approach without local transaction first to debug
        const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
        if (!profile) {
            console.error("[LotteryStorage] User profile not found: " + userId);
            throw new Error("사용자를 찾을 수 없습니다.");
        }

        const tickets = profile.availableLotteryTickets || 0;
        console.log("[LotteryStorage] User has " + tickets + " tickets available.");

        if (tickets <= 0) {
            throw new Error("사용 가능한 로또 티켓이 없습니다.");
        }

        // Execute sequentially without transaction to avoid potential locking issues
        console.log("[LotteryStorage] Transaction skipped. Executing updates sequentially.");

        // 1. Deduct ticket
        await db.update(profiles)
            .set({ availableLotteryTickets: (profile.availableLotteryTickets || 0) - 1 })
            .where(eq(profiles.id, userId));

        console.log("[LotteryStorage] Profile updated. Inserting ticket record...");

        // 2. Insert ticket
        const [ticket] = await db.insert(lotteryTickets)
            .values({
                userId,
                roundId,
                numbers,
                isWinner: null,
                prizeAmount: 0,
                createdAt: new Date()
            })
            .returning();

        console.log("[LotteryStorage] Ticket created successfully. ID: " + ticket.id);
        return ticket;
    }
}
