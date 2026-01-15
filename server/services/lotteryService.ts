
import { storage } from "../storage.js";
import { db } from "../db.js";
import { lotteryDraws, lotteryTickets, profiles, pointTransactions, type LotteryDraw } from "../../shared/schema.js";
import { eq, sql, desc } from "drizzle-orm";

export class LotteryService {
    private PRIZE_AMOUNTS = {
        FIRST: 50000,
        SECOND: 5000,
        THIRD: 500
    };

    /**
     * Get or create today's active lottery draw
     */
    async getOrCreateTodayDraw(): Promise<LotteryDraw> {
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
                winningNumbers: [],
                totalParticipants: 0,
                totalPrizePool: 0,
                createdAt: new Date()
            })
            .returning();

        return newDraw;
    }

    /**
     * Buy a lottery ticket (Business logic: check balance -> deduct -> create)
     */
    async buyTicket(userId: string, roundId: number, numbers: number[]) {
        return await db.transaction(async (tx) => {
            const [profile] = await tx.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
            if (!profile) throw new Error("사용자를 찾을 수 없습니다.");

            const ticketsAvailable = profile.availableLotteryTickets || 0;
            if (ticketsAvailable <= 0) throw new Error("사용 가능한 로또 티켓이 없습니다.");

            // 1. Deduct ticket
            await tx.update(profiles)
                .set({ availableLotteryTickets: ticketsAvailable - 1 })
                .where(eq(profiles.id, userId));

            // 2. Insert ticket
            const [ticket] = await tx.insert(lotteryTickets)
                .values({
                    userId,
                    roundId,
                    numbers,
                    isWinner: null,
                    prizeAmount: 0,
                    createdAt: new Date()
                })
                .returning();

            return ticket;
        });
    }

    /**
     * Executes the daily lottery draw.
     */
    /**
     * Executes the daily lottery draw with retry logic.
     */
    async runDailyDraw(maxRetries = 3) {
        console.log("🎰 Starting daily lottery draw...");

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const now = new Date();

                const result = await db.transaction(async (tx) => {
                    const [draw] = await tx.select()
                        .from(lotteryDraws)
                        .where(sql`${lotteryDraws.drawDate} <= ${now.toISOString()} AND (cardinality(${lotteryDraws.winningNumbers}) = 0 OR ${lotteryDraws.winningNumbers} IS NULL)`)
                        .orderBy(lotteryDraws.drawDate)
                        .limit(1);

                    if (!draw) return null;

                    console.log(`🎰 Processing draw ID: ${draw.id}`);

                    const winningNumbers: number[] = [];
                    while (winningNumbers.length < 5) {
                        const num = Math.floor(Math.random() * 40) + 1;
                        if (!winningNumbers.includes(num)) winningNumbers.push(num);
                    }
                    winningNumbers.sort((a, b) => a - b);

                    const tickets = await tx.select()
                        .from(lotteryTickets)
                        .where(eq(lotteryTickets.roundId, draw.id));

                    let totalPrizePool = 0;
                    const participantsCount = tickets.length;

                    for (const ticket of tickets) {
                        const matchCount = (ticket.numbers as number[]).filter(n => winningNumbers.includes(n)).length;
                        let prize = 0;
                        if (matchCount === 5) prize = this.PRIZE_AMOUNTS.FIRST;
                        else if (matchCount === 4) prize = this.PRIZE_AMOUNTS.SECOND;
                        else if (matchCount === 3) prize = this.PRIZE_AMOUNTS.THIRD;

                        if (prize > 0) {
                            totalPrizePool += prize;
                            await tx.update(lotteryTickets).set({ isWinner: true, prizeAmount: prize }).where(eq(lotteryTickets.id, ticket.id));

                            const [profile] = await tx.select().from(profiles).where(eq(profiles.id, ticket.userId)).limit(1);
                            if (profile) {
                                await tx.update(profiles).set({ points: (profile.points || 0) + prize }).where(eq(profiles.id, ticket.userId));
                                await tx.insert(pointTransactions).values({
                                    userId: ticket.userId,
                                    type: 'earn',
                                    amount: prize,
                                    description: `로또 당첨금 지급 (${matchCount}개 일치 - ${draw.id}회차)`,
                                    status: 'completed',
                                    createdAt: new Date()
                                });
                            }
                        } else {
                            await tx.update(lotteryTickets).set({ isWinner: false, prizeAmount: 0 }).where(eq(lotteryTickets.id, ticket.id));
                        }
                    }

                    const [updatedDraw] = await tx.update(lotteryDraws)
                        .set({ winningNumbers, totalParticipants: participantsCount, totalPrizePool })
                        .where(eq(lotteryDraws.id, draw.id))
                        .returning();

                    return updatedDraw;
                });

                if (result) {
                    console.log(`✅ Daily lottery draw completed successfully (Attempt ${attempt}).`);
                } else {
                    console.log(`ℹ️ No pending draw found (Attempt ${attempt}).`);
                }

                return result;

            } catch (error) {
                console.error(`❌ Lottery draw failed (Attempt ${attempt}/${maxRetries}):`, error);

                if (attempt === maxRetries) {
                    console.error("🚨 CRITICAL: All lottery draw attempts failed. Immediate admin attention required.");
                    // TODO: Send alert to admin (e.g., Slack/Email)
                    throw error;
                }

                // Wait for 2 seconds before retrying
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    }

    async ensureDrawsAreUpToDate() {
        let processedAny = false;
        try {
            let lastDraw = await this.runDailyDraw();
            while (lastDraw) {
                processedAny = true;
                lastDraw = await this.runDailyDraw();
            }
        } catch (error) {
            console.error("❌ Failed while ensuring draws are up to date:", error);
        }
    }
}

export const lotteryService = new LotteryService();
