
import {
    lotteryTickets,
    lotteryDraws,
    type LotteryTicket,
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
        const draws = await db.select()
            .from(lotteryDraws)
            .where(sql`${lotteryDraws.winningNumbers} IS NOT NULL`)
            .orderBy(desc(lotteryDraws.drawDate))
            .limit(limit);

        if (!draws.length) return [];

        const validDraws = draws.filter((d: any) => d.winningNumbers && Array.isArray(d.winningNumbers) && d.winningNumbers.length > 0);
        if (!validDraws.length) return [];

        const drawIds = validDraws.map((d: any) => d.id);

        const stats = await db.select({
            roundId: lotteryTickets.roundId,
            prize: lotteryTickets.prizeAmount,
            count: sql<number>`count(*)::int`
        })
            .from(lotteryTickets)
            .where(inArray(lotteryTickets.roundId, drawIds))
            .groupBy(lotteryTickets.roundId, lotteryTickets.prizeAmount);

        return validDraws.map((draw: any) => {
            const drawStats = stats.filter((s: any) => s.roundId === draw.id);
            const winnerCounts = {
                first: drawStats.find((s: any) => s.prize === 50000)?.count || 0,
                second: drawStats.find((s: any) => s.prize === 5000)?.count || 0,
                third: drawStats.find((s: any) => s.prize === 500)?.count || 0,
            };
            return {
                ...draw,
                winnerCounts
            };
        });
    }
}
