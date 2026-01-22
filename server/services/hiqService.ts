import { storage } from "../storage/index.js";
import { HiqStore, HiqMember, InsertHiqMember } from "../../shared/schema.js";

export class HiqService {
    async getBranding(slug: string) {
        let store = await storage.getStoreBySlug(slug);

        if (!store) {
            // Default branding
            return {
                slug: "default",
                name: "RANKUE",
                logoText: "RANKUE",
                themeColor: "#6366f1",
                neonColor: "#818cf8",
                subText: "Global Billiards Solution"
            };
        }
        return store;
    }

    async login(phone: string, storeSlug: string) {
        const store = await storage.getStoreBySlug(storeSlug);
        if (!store) throw new Error("STORE_NOT_FOUND");

        const member = await storage.getMemberByPhone(store.id, phone);
        if (member) {
            await storage.incrementVisitCount(member.id);
            return { member, isNew: false, redirectTo: '/dashboard' };
        } else {
            return { phone, storeId: store.id, isNew: true, redirectTo: `/register?phone=${phone}&store=${store.id}` };
        }
    }

    async register(data: InsertHiqMember) {
        const newMember = await storage.createMember(data);
        await storage.incrementVisitCount(newMember.id);
        return { member: newMember, redirectTo: '/dashboard' };
    }
}

export const hiqService = new HiqService();
