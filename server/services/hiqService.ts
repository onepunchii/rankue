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

    async partnerLogin(phone: string, password?: string) {
        // 1. Try to find Profile directly first
        let profile = await storage.getProfileByPhone(phone);
        let profileId = profile?.id;

        // 2. If no direct profile, check legacy member link
        if (!profileId) {
            const members = await storage.getMembersByPhone(phone);
            const member = members[0];
            if (member?.profileId) {
                profile = await storage.getProfile(member.profileId);
                profileId = profile?.id;
            }
        }

        // Verify Password if profile exists
        if (profile) {
            if (profile.password && password && password !== profile.password) {
                return { success: false, message: "비밀번호가 일치하지 않습니다." };
            }
        } else {
            // No profile found for this phone
            return { success: false, message: "등록되지 않은 파트너 계정입니다." };
        }

        // 4. Find Store owned by this Profile
        const store = await storage.getStoreByOwnerProfileId(profile.id);

        if (!store) {
            return { success: false, message: "매장 정보가 연결되지 않은 계정입니다. 입점 신청을 해주세요." };
        }

        return {
            success: true,
            storeName: store.name,
            profileId,
            storeId: store.id,
            role: profile?.role // Return role
        };
    }

    async getPartnerStore(profileId: string) {
        return await storage.getStoreByOwnerProfileId(profileId);
    }

    async updateStore(storeId: string, data: any) {
        return await storage.updateStore(storeId, data);
    }

    async createTournament(storeId: string, data: any) {
        return await storage.createTournament({ ...data, storeId });
    }

    async login(phone: string, storeSlug: string, password?: string) {
        const store = await storage.getStoreBySlug(storeSlug);
        if (!store) throw new Error("STORE_NOT_FOUND");

        const member = await storage.getMemberByPhone(store.id, phone);
        if (member) {
            // Check if this member has a linked profile with a password
            if (member.profileId) {
                const profile = await storage.getProfile(member.profileId);
                if (profile && profile.password) {
                    // Password required but not provided
                    if (!password) {
                        return { isNew: false, requiresPassword: true, phone, memberName: member.name };
                    }
                    // Password provided but incorrect
                    if (password !== profile.password) {
                        throw new Error("INVALID_PASSWORD");
                    }
                }
            }

            await storage.incrementVisitCount(member.id);
            return { member, isNew: false, redirectTo: '/dashboard' };
        } else {
            return { phone, storeId: store.id, isNew: true, redirectTo: `/register?phone=${phone}&store=${store.id}` };
        }
    }

    async register(data: InsertHiqMember) {
        // 1. Create Profile (Identity) first if password provided
        let profileId: string | undefined;

        if (data.password) {
            // Check if profile exists by phone
            let profile = await storage.getProfileByPhone(data.phone);
            if (!profile) {
                profile = await storage.createProfile({
                    phone: data.phone,
                    password: data.password,
                    role: 'user',
                    nickname: data.name
                });
            } else if (!profile.password) {
                // If profile exists but has no password (e.g. legacy), set it
                profile = await storage.updateProfile(profile.id, { password: data.password });
            }
            profileId = profile.id;
        }

        // 2. Create HiqMember linked to Profile
        const memberData = { ...data, profileId };
        // Remove password field from memberData as it's not in hiqMembers table
        delete (memberData as any).password;

        const newMember = await storage.createMember(memberData as any);
        await storage.incrementVisitCount(newMember.id);
        return { member: newMember, redirectTo: '/dashboard' };
    }
}

export const hiqService = new HiqService();
