import {
    pointTransactions,
    rewardItems,
    rewardOrders,
    providerLogs,
    profiles,
    type PointTransaction,
    type RewardItem,
    type InsertRewardItem,
    type RewardOrder,
    type InsertRewardOrder,
    type ProviderLog,
    type InsertProviderLog
} from "../../shared/schema.js";
import { db } from "../db.js";
import { eq, desc, and, sql, lt, gt } from "drizzle-orm";
import { giftishowAdapter } from "../giftishowAdapter.js";

export class PointStorage {
    // --- Point Operations ---

    async addPersonalPoints(userId: string, amount: number, description: string): Promise<void> {
        await db.update(profiles).set({
            personalPoints: sql`${profiles.personalPoints} + ${amount}`,
            updatedAt: new Date()
        }).where(eq(profiles.id, userId));

        await db.insert(pointTransactions).values({
            userId,
            type: "earn",
            amount,
            description,
            status: "completed"
        });
    }

    async sendPointsToFriend(senderId: string, receiverId: string, amount: number): Promise<void> {
        await db.update(profiles).set({ personalPoints: sql`${profiles.personalPoints} - ${amount}`, updatedAt: new Date() }).where(eq(profiles.id, senderId));
        await db.update(profiles).set({ personalPoints: sql`${profiles.personalPoints} + ${amount}`, updatedAt: new Date() }).where(eq(profiles.id, receiverId));

        await db.insert(pointTransactions).values({
            userId: senderId, type: "send", amount: -amount, description: "친구에게 포인트 전송", relatedUserId: receiverId, status: "completed"
        });
        await db.insert(pointTransactions).values({
            userId: receiverId, type: "receive", amount: amount, description: "친구로부터 포인트 받음", relatedUserId: senderId, status: "completed"
        });
    }

    async getPointTransactions(userId: string): Promise<PointTransaction[]> {
        return await db.select().from(pointTransactions).where(eq(pointTransactions.userId, userId)).orderBy(desc(pointTransactions.createdAt)).limit(50);
    }

    async holdPoints(userId: string, amount: number, type: string, referenceId: string | number, description: string): Promise<number> {
        // Simple implementation: deduct immediately with specific type
        // In a real hold system, we might use a separate 'holds' table or status, but for now we treat it as a spend with context
        const user = await db.query.profiles.findFirst({
            where: eq(profiles.id, userId)
        });

        if (!user || user.personalPoints < amount) {
            throw new Error("포인트가 부족합니다.");
        }

        await db.update(profiles).set({
            personalPoints: sql`${profiles.personalPoints} - ${amount}`,
            updatedAt: new Date()
        }).where(eq(profiles.id, userId));

        const [txn] = await db.insert(pointTransactions).values({
            userId,
            type: "spend", // normalized to spend
            amount: -amount,
            description: description,
            referenceId: referenceId.toString(),
            status: "completed" // or "held" if we supported it
        }).returning();

        return txn.id;
    }

    async updatePointTransactionReference(transactionId: number, newReferenceId: string): Promise<void> {
        await db.update(pointTransactions)
            .set({ referenceId: newReferenceId })
            .where(eq(pointTransactions.id, transactionId));
    }

    // --- Reward Product Management ---

    async getRewardItems(): Promise<RewardItem[]> {
        return await db.select().from(rewardItems).where(eq(rewardItems.isActive, true));
    }

    // Alias for routes compatibility
    async getRewardProducts(categoryId?: string): Promise<RewardItem[]> {
        if (categoryId) {
            return await db.select().from(rewardItems)
                .where(and(eq(rewardItems.isActive, true), eq(rewardItems.category, categoryId)));
        }
        return await db.select().from(rewardItems).orderBy(desc(rewardItems.createdAt));
    }

    async getRewardProduct(id: number): Promise<RewardItem | undefined> {
        const [item] = await db.select().from(rewardItems).where(eq(rewardItems.id, id));
        return item;
    }

    async createRewardProduct(data: InsertRewardItem): Promise<RewardItem> {
        const [item] = await db.insert(rewardItems).values(data).returning();
        return item;
    }

    async updateRewardProduct(id: number, data: Partial<InsertRewardItem>): Promise<RewardItem> {
        const [item] = await db.update(rewardItems).set({ ...data, updatedAt: new Date() })
            .where(eq(rewardItems.id, id)).returning();
        return item;
    }

    async deleteRewardProduct(id: number): Promise<void> {
        await db.delete(rewardItems).where(eq(rewardItems.id, id));
    }

    // --- Reward Orders ---

    // Legacy method mostly replaced by createRewardOrder
    async purchaseReward(userId: string, rewardId: number): Promise<void> {
        const product = await this.getRewardProduct(rewardId);
        if (!product) throw new Error("Product not found");

        await this.holdPoints(userId, product.pointCost, "spend", 0, `${product.name} 구매`);
    }

    async createRewardOrder(data: InsertRewardOrder): Promise<RewardOrder> {
        const [order] = await db.insert(rewardOrders).values(data).returning();
        return order;
    }

    async getRewardOrders(status?: string, limit: number = 50, offset: number = 0): Promise<RewardOrder[]> {
        let query = db.select().from(rewardOrders);
        if (status) {
            // @ts-ignore - dynamic query building helper
            query = query.where(eq(rewardOrders.status, status));
        }
        return await query.orderBy(desc(rewardOrders.createdAt)).limit(limit).offset(offset);
    }

    async getRewardOrder(id: number): Promise<RewardOrder | undefined> {
        const [order] = await db.select().from(rewardOrders).where(eq(rewardOrders.id, id));
        return order;
    }

    async getUserRewardOrders(userId: string): Promise<RewardOrder[]> {
        return await db.select().from(rewardOrders)
            .where(eq(rewardOrders.userId, userId))
            .orderBy(desc(rewardOrders.createdAt));
    }

    async approveRewardOrder(id: number, approverId: string): Promise<void> {
        await db.update(rewardOrders).set({
            status: "approved",
            approvedBy: approverId,
            approvedAt: new Date(),
            updatedAt: new Date()
        }).where(eq(rewardOrders.id, id));
    }

    async rejectRewardOrder(id: number, rejecterId: string, reason: string): Promise<void> {
        const order = await this.getRewardOrder(id);
        if (!order) throw new Error("Order not found");

        // Refund points
        await this.addPersonalPoints(order.userId, order.pointCost, `주문 취소 및 환불: ${order.productName}`);

        await db.update(rewardOrders).set({
            status: "rejected",
            rejectedBy: rejecterId,
            rejectedReason: reason,
            updatedAt: new Date()
        }).where(eq(rewardOrders.id, id));
    }

    async processRewardOrder(id: number): Promise<{ success: boolean, message?: string }> {
        const order = await this.getRewardOrder(id);
        if (!order) throw new Error("Order not found");

        // Find user specific info (e.g. phone) might be needed, but assume order has everything or profile does
        const user = await db.query.profiles.findFirst({ where: eq(profiles.id, order.userId) });
        if (!user || !user.phone) {
            // For now invoke without phone or use dummy if testing, real impl needs phone
            // Assuming giftishow requires phone
        }

        // Call Giftishow Adapter
        // Note: In real app, we need to pass actual recipient phone number.
        // For this implementation, we assume the user profile has it or we mock it.
        const phone = user?.phone || "01000000000";

        // For product SKU, we assume productId or description maps to it. 
        // In real app, rewardItems should have 'externalDetails' or 'sku'.
        // We'll use product name or ID as SKU placeholder.
        const sku = order.productId.toString();

        const result = await giftishowAdapter.issueCoupon(order.id, sku, phone, user?.fullName || undefined);

        // Log the provider interaction
        if (result.logEntry) {
            await db.insert(providerLogs).values({
                ...result.logEntry,
                orderId: order.id
            });
        }

        if (result.success && result.data) {
            await db.update(rewardOrders).set({
                status: "completed",
                couponCode: result.data.giftCode,
                updatedAt: new Date()
            }).where(eq(rewardOrders.id, id));
            return { success: true };
        } else {
            // If failed, we might keep it as approved/pending or mark failed?
            // Depends on retry logic. Let's keep approved but log error.
            return { success: false, message: result.error };
        }
    }

    async getProviderLogs(orderId?: number, provider?: string, limit: number = 100): Promise<ProviderLog[]> {
        let conditions = [];
        if (orderId) conditions.push(eq(providerLogs.orderId, orderId));
        if (provider) conditions.push(eq(providerLogs.provider, provider));

        if (conditions.length > 0) {
            return await db.select().from(providerLogs)
                .where(and(...conditions))
                .orderBy(desc(providerLogs.createdAt))
                .limit(limit);
        }

        return await db.select().from(providerLogs)
            .orderBy(desc(providerLogs.createdAt))
            .limit(limit);
    }

    // Alias for compatibility
    async getUserPointBalance(userId: string): Promise<{ points: number }> {
        const user = await db.query.profiles.findFirst({
            where: eq(profiles.id, userId)
        });
        return { points: user?.personalPoints || 0 };
    }
}
