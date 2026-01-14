import {
    balanceGames, balanceGameVotes, profiles, balanceGameComments,
    type BalanceGame, type InsertBalanceGame,
    type BalanceGameVote, type InsertBalanceGameVote,
    type InsertBalanceGameComment
} from "../../shared/schema.js";
import { db } from "../db.js";
import { eq, desc, and, sql } from "drizzle-orm";

export class BalanceGameStorage {
    // Game Operations
    async createBalanceGame(game: InsertBalanceGame): Promise<BalanceGame> {
        const [newGame] = await db
            .insert(balanceGames)
            .values(game)
            .returning();
        return newGame;
    }

    async getBalanceGame(id: number): Promise<BalanceGame | undefined> {
        const [game] = await db
            .select()
            .from(balanceGames)
            .where(eq(balanceGames.id, id));
        return game;
    }

    async getBalanceGames(status: string = 'ACTIVE', limit = 10, category?: string): Promise<BalanceGame[]> {
        let query = db
            .select()
            .from(balanceGames)
            .where(eq(balanceGames.status, status))
            .orderBy(desc(balanceGames.createdAt))
            .limit(limit);

        if (category) {
            query = db
                .select()
                .from(balanceGames)
                .where(and(eq(balanceGames.status, status), eq(balanceGames.category, category)))
                .orderBy(desc(balanceGames.createdAt))
                .limit(limit);
        }

        return await query;
    }

    async updateBalanceGameStatus(id: number, status: string): Promise<BalanceGame | undefined> {
        const [updated] = await db
            .update(balanceGames)
            .set({ status })
            .where(eq(balanceGames.id, id))
            .returning();
        return updated;
    }

    async deleteBalanceGame(id: number): Promise<void> {
        await db.delete(balanceGames).where(eq(balanceGames.id, id));
    }

    // Vote Operations
    async voteBalanceGame(vote: InsertBalanceGameVote): Promise<BalanceGameVote> {
        return await db.transaction(async (tx: any) => {
            const [newVote] = await tx
                .insert(balanceGameVotes)
                .values(vote)
                .returning();

            if (vote.choice === 'A') {
                await tx.update(balanceGames)
                    .set({ countA: sql`${balanceGames.countA} + 1` })
                    .where(eq(balanceGames.id, vote.gameId!));
            } else {
                await tx.update(balanceGames)
                    .set({ countB: sql`${balanceGames.countB} + 1` })
                    .where(eq(balanceGames.id, vote.gameId!));
            }
            return newVote;
        });
    }

    async getUserVote(userId: string | undefined, deviceId: string | undefined, gameId: number): Promise<BalanceGameVote | undefined> {
        if (!userId && !deviceId) return undefined;

        if (userId) {
            const [vote] = await db
                .select()
                .from(balanceGameVotes)
                .where(and(eq(balanceGameVotes.userId, userId), eq(balanceGameVotes.gameId, gameId)));
            return vote;
        } else {
            const [vote] = await db
                .select()
                .from(balanceGameVotes)
                .where(and(eq(balanceGameVotes.deviceId, deviceId!), eq(balanceGameVotes.gameId, gameId)));
            return vote;
        }
    }

    async getUserBalanceGameVotes(userId: string): Promise<BalanceGameVote[]> {
        return await db
            .select()
            .from(balanceGameVotes)
            .where(eq(balanceGameVotes.userId, userId));
    }

    async getBalanceGameStats(gameId: number) {
        // Fetch specific game votes with user profiles
        const votes = await db
            .select({
                choice: balanceGameVotes.choice,
                gender: profiles.gender,
                ageGroup: profiles.ageGroup,
                politicalAnalysis: profiles.politicalAnalysis,
            })
            .from(balanceGameVotes)
            .leftJoin(profiles, eq(balanceGameVotes.userId, profiles.id))
            .where(eq(balanceGameVotes.gameId, gameId));

        // Aggregation Containers
        const genderStats = {
            "남성": { a: 0, b: 0, total: 0 },
            "여성": { a: 0, b: 0, total: 0 }
        };
        const ageStats: Record<string, { a: number, b: number, total: number }> = {
            "10대": { a: 0, b: 0, total: 0 },
            "20대": { a: 0, b: 0, total: 0 },
            "30대": { a: 0, b: 0, total: 0 },
            "40대": { a: 0, b: 0, total: 0 },
            "50대+": { a: 0, b: 0, total: 0 },
        };
        const politicsStats = {
            "진보": { a: 0, b: 0, total: 0 },
            "중도": { a: 0, b: 0, total: 0 },
            "보수": { a: 0, b: 0, total: 0 }
        };

        // Processing
        for (const vote of votes) {
            const choice = vote.choice as 'A' | 'B';
            if (!choice) continue;

            // 1. Gender
            const genderVal = vote.gender as string || '';
            let genderLabel: "남성" | "여성" | null = null;
            if (['male', 'Male', '남성', 'M', 'man'].includes(genderVal)) genderLabel = "남성";
            else if (['female', 'Female', '여성', 'F', 'woman'].includes(genderVal)) genderLabel = "여성";

            if (genderLabel) {
                genderStats[genderLabel].total++;
                if (choice === 'A') genderStats[genderLabel].a++;
                else genderStats[genderLabel].b++;
            }

            // 2. Age (Assuming ageGroup stored as '20s', '30s' or similar)
            // Map DB ageGroup to labels
            let ageLabel = null;
            if (vote.ageGroup) {
                if (vote.ageGroup.includes('10')) ageLabel = "10대";
                else if (vote.ageGroup.includes('20')) ageLabel = "20대";
                else if (vote.ageGroup.includes('30')) ageLabel = "30대";
                else if (vote.ageGroup.includes('40')) ageLabel = "40대";
                else if (vote.ageGroup.includes('50') || vote.ageGroup.includes('60')) ageLabel = "50대+";
            }
            if (ageLabel) {
                ageStats[ageLabel].total++;
                if (choice === 'A') ageStats[ageLabel].a++;
                else ageStats[ageLabel].b++;
            }

            // 3. Politics (Based on social score 0-100)
            // 0-33: Progressive, 34-66: Moderate, 67-100: Conservative
            if (vote.politicalAnalysis) {
                const analysis = vote.politicalAnalysis as any;
                const score = analysis.social !== undefined ? analysis.social : 50;
                let politicsLabel: "진보" | "중도" | "보수" = "중도";

                if (score <= 40) politicsLabel = "진보"; // Slightly wider range for 'Leaning'
                else if (score >= 60) politicsLabel = "보수";
                else politicsLabel = "중도";

                politicsStats[politicsLabel].total++;
                if (choice === 'A') politicsStats[politicsLabel].a++;
                else politicsStats[politicsLabel].b++;
            }
        }

        // Helper to formatting percentage
        const formatPerc = (item: { a: number, b: number, total: number }) => {
            if (item.total === 0) return { a: 0, b: 0 };
            return {
                a: Math.round((item.a / item.total) * 100),
                b: Math.round((item.b / item.total) * 100)
            };
        };

        return {
            gender: Object.entries(genderStats).map(([label, val]) => ({
                label, ...formatPerc(val)
            })),
            age: Object.entries(ageStats).map(([label, val]) => ({
                label, ...formatPerc(val)
            })),
            politics: Object.entries(politicsStats).map(([label, val]) => ({
                label, ...formatPerc(val)
            }))
        };
    }

    // Comment Operations
    async getBalanceGameComments(gameId: number) {
        return await db
            .select({
                id: balanceGameComments.id,
                content: balanceGameComments.content,
                createdAt: balanceGameComments.createdAt,
                userId: profiles.id,
                nickname: profiles.nickname,
                choice: balanceGameVotes.choice
            })
            .from(balanceGameComments)
            .leftJoin(profiles, eq(balanceGameComments.userId, profiles.id))
            .leftJoin(balanceGameVotes, and(
                eq(balanceGameVotes.userId, profiles.id),
                eq(balanceGameVotes.gameId, gameId)
            ))
            .where(eq(balanceGameComments.gameId, gameId))
            .orderBy(desc(balanceGameComments.createdAt));
    }

    async createBalanceGameComment(comment: InsertBalanceGameComment) {
        const [newComment] = await db
            .insert(balanceGameComments)
            .values(comment)
            .returning();
        return newComment;
    }
}
