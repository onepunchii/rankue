import { storage } from "../storage/index.js";
import { HiqStore, HiqMember, InsertHiqMember } from "../../shared/schema.js";
import { unauthorized, notFound, badRequest } from "../utils/errors.js";
import type { SocialIdentity } from "../lib/socialAuth.js";

// 글로벌(비매장) 유저의 소속 스토어 — 마이그레이션에서 시드됨. 소셜 가입 유저는 여기 속한다.
const GLOBAL_STORE_SLUG = "global";

export class HiqService {
    async getBranding(slug: string) {
        let store = await storage.getStoreBySlug(slug);

        if (!store) {
            // Default branding
            return {
                slug: "default",
                name: "랭큐",
                logoText: "RANKUE",
                themeColor: "#10B981",
                neonColor: "#34D399",
                subText: "당구 실력 랭킹 & 매칭"
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

        // Verify password. A partner account MUST have a password and it MUST match — a
        // missing/omitted password is a hard reject (previously an omitted password
        // short-circuited the check and logged the caller in with phone number only).
        if (profile) {
            if (!profile.password) {
                return { success: false, message: "비밀번호가 설정되지 않은 계정입니다. 관리자에게 문의하세요." };
            }
            if (!password || password !== profile.password) {
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
        if (!store) throw notFound("STORE_NOT_FOUND");

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
                        throw unauthorized("INVALID_PASSWORD");
                    }
                }
            }

            await storage.incrementVisitCount(member.id);
            return { member, isNew: false, redirectTo: '/dashboard' };
        } else {
            return { phone, storeId: store.id, isNew: true, redirectTo: `/register?phone=${phone}&store=${store.id}` };
        }
    }

    // 소셜 로그인(구글·애플) — 검증된 identity로 프로필·멤버 find-or-create.
    // 전화번호 로그인과 완전 분리된 경로: 기존 매장 멤버 흐름은 건드리지 않는다.
    async socialLogin(provider: "google" | "apple", identity: SocialIdentity, displayName?: string) {
        // 1) 프로필(신원) find-or-create — sub가 유일키
        let profile = await storage.getProfileBySocialSub(provider, identity.sub);
        let isNew = false;
        if (!profile) {
            isNew = true;
            const nickname = displayName || identity.name || identity.email?.split("@")[0] || "Player";
            profile = await storage.createProfile({
                nickname,
                email: identity.email ?? undefined,
                role: "user",
                ...(provider === "google" ? { googleSub: identity.sub } : { appleSub: identity.sub }),
            } as any);
        }

        // 2) 멤버 find-or-create — 글로벌 스토어 소속(매장 무관 개인 유저)
        let member = await storage.getMemberByProfileId(profile.id);
        if (!member) {
            const globalStore = await storage.getStoreBySlug(GLOBAL_STORE_SLUG);
            if (!globalStore) throw notFound("GLOBAL_STORE_NOT_SEEDED");
            member = await storage.createMember({
                storeId: globalStore.id,
                // phone은 notNull+unique(storeId,phone) — 소셜 유저는 sub 기반 플레이스홀더(실전화 아님)
                phone: `social:${provider}:${identity.sub}`,
                name: profile.nickname || "Player",
                profileId: profile.id,
            } as any);
        }

        await storage.incrementVisitCount(member.id);
        return { member, isNew, redirectTo: "/dashboard" };
    }

    async register(data: InsertHiqMember) {
        // 1. Create Profile (Identity) first if password provided
        let profileId: string | undefined;

        if (data.password) {
            // Check if profile exists by phone
            let profile = await storage.getProfileByPhone(data.phone);

            // Normalize security answer if provided
            const normalizedAnswer = data.securityAnswer
                ? data.securityAnswer.trim().replace(/\s+/g, '').toLowerCase()
                : undefined;

            if (!profile) {
                profile = await storage.createProfile({
                    phone: data.phone,
                    password: data.password,
                    role: 'user',
                    nickname: data.name,
                    securityQuestion: data.securityQuestion,
                    securityAnswer: normalizedAnswer
                });
            } else if (!profile.password) {
                // SECURITY: /register is unauthenticated. Only backfill credentials for a legacy
                // passwordless profile. NEVER overwrite an existing account's password/security
                // Q&A here — otherwise anyone who knows a phone number could reset the PIN and
                // take over the account. An already-protected profile is reused as-is.
                profile = await storage.updateProfile(profile.id, {
                    password: data.password,
                    securityQuestion: data.securityQuestion,
                    securityAnswer: normalizedAnswer
                });
            } else {
                // SECURITY: the profile already exists AND is password-protected. /register is
                // unauthenticated, so before linking this new member row to that existing global
                // profile we MUST verify the supplied PIN matches (mirrors login() above).
                // Without this, anyone who knows a phone number could register it at any store
                // (store id is attacker-controlled) and hijack the victim's global profile —
                // reading and overwriting their nickname / image / role across every store.
                // A legitimate cross-store user supplying the correct PIN still links correctly.
                if (!data.password || data.password !== profile.password) {
                    throw unauthorized("INVALID_PASSWORD");
                }
            }
            profileId = profile.id;
        }

        // 2. Create HiqMember linked to Profile
        const memberData: any = { ...data, profileId };
        // Remove profile-specific fields (not in hiqMembers table)
        delete memberData.password;
        delete memberData.securityQuestion;
        delete memberData.securityAnswer;
        // SECURITY: never accept skill/rating fields from the client at registration —
        // otherwise a new user could self-assign a top rating and manipulate leaderboards.
        // These start at their DB defaults and are computed from real game history.
        for (const k of ['rating3c', 'rating4c', 'handi3c', 'handi4c', 'average',
            'golfAvgScore', 'golfHandicap', 'golfBestScore', 'totalGolfGames', 'visitCount', 'role']) {
            delete memberData[k];
        }

        const newMember = await storage.createMember(memberData as any);
        await storage.incrementVisitCount(newMember.id);
        return { member: newMember, redirectTo: '/dashboard' };
    }

    async getSecurityQuestion(phone: string) {
        const profile = await storage.getProfileByPhone(phone);
        if (!profile) throw notFound("USER_NOT_FOUND");
        if (!profile.securityQuestion) throw badRequest("NO_SECURITY_QUESTION");

        return { question: profile.securityQuestion };
    }

    async resetPinBySecurityAnswer(phone: string, answer: string, newPin: string) {
        const profile = await storage.getProfileByPhone(phone);
        if (!profile) throw notFound("USER_NOT_FOUND");
        if (!profile.securityAnswer) throw badRequest("NO_SECURITY_ANSWER");

        const normalizedInput = answer.trim().replace(/\s+/g, '').toLowerCase();
        const normalizedStored = profile.securityAnswer.trim().replace(/\s+/g, '').toLowerCase();

        if (normalizedInput !== normalizedStored) {
            throw unauthorized("INVALID_ANSWER");
        }

        await storage.updateProfile(profile.id, { password: newPin });
        return { success: true };
    }
}

export const hiqService = new HiqService();
