import { db } from "../db";
import { newsArticles, type NewsArticle, type InsertNewsArticle } from "@shared/schema";
import { eq, desc, or, ilike, and } from "drizzle-orm";

export class NewsStorage {
    async getNewsAnalysis(url: string) {
        const [result] = await db
            .select()
            .from(newsArticles)
            .where(eq(newsArticles.url, url));
        return result;
    }

    async saveNewsArticle(data: any) {
        const [existing] = await db
            .select()
            .from(newsArticles)
            .where(eq(newsArticles.url, data.url));

        if (existing) {
            const [updated] = await db
                .update(newsArticles)
                .set({
                    title: data.title || existing.title,
                    imageUrl: data.imageUrl || existing.imageUrl,
                    category: data.category || existing.category,
                    publishedAt: data.publishedAt || existing.publishedAt,
                    updatedAt: new Date()
                })
                .where(eq(newsArticles.url, data.url))
                .returning();
            return updated;
        }

        const [created] = await db
            .insert(newsArticles)
            .values({
                ...data,
                createdAt: new Date()
            })
            .returning();
        return created;
    }

    async saveNewsAnalysis(data: any) {
        const [existing] = await db
            .select()
            .from(newsArticles)
            .where(eq(newsArticles.url, data.url));

        if (existing) {
            const [updated] = await db
                .update(newsArticles)
                .set({
                    ...data,
                    title: data.title || existing.title, // 제목이 없으면 기존 제목 유지
                    updatedAt: new Date()
                })
                .where(eq(newsArticles.url, data.url))
                .returning();
            return updated;
        }

        const [created] = await db
            .insert(newsArticles)
            .values(data)
            .returning();
        return created;
    }

    async getLatestNewsArticles(limit: number = 20, category?: string, searchQuery?: string): Promise<NewsArticle[]> {
        let query = db.select().from(newsArticles);

        let conditions = [];

        if (category && category !== '전체') {
            // @ts-ignore - category filter
            conditions.push(eq(newsArticles.category, category));
        }

        if (searchQuery) {
            conditions.push(or(
                ilike(newsArticles.title, `%${searchQuery}%`),
                ilike(newsArticles.content, `%${searchQuery}%`)
            ));
        }

        if (conditions.length > 0) {
            // @ts-ignore - build query with conditions
            query = query.where(and(...conditions));
        }

        return await query
            .orderBy(desc(newsArticles.publishedAt), desc(newsArticles.createdAt))
            .limit(limit);
    }
}
