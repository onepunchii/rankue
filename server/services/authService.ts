import { storage } from "../storage/index.js";
import { supabaseAdmin } from "../supabase.js";

// DTO compatible with frontend AuthUser
export interface AuthUser {
    id: string;
    isGuest: boolean;
    isAuthenticated: boolean;
    userType: "guest" | "verified" | "admin";
    isVerified: boolean;
    email?: string | null;
    name?: string | null;
    phone?: string | null;
    nickname?: string | null;
    profileImageUrl?: string | null;
    level: number;
    experience: number;
    personalPoints: number;
    availableLotteryTickets: number;
    ageGroup?: string | null;
    gender?: string | null;
    region?: string | null;
    cityProvince?: string | null;
    district?: string | null;
    jobCategory?: string | null;
    educationLevel?: string | null;
    incomeLevel?: string | null;
    maritalStatus?: string | null;
    isPetOwner?: boolean;
}

const GUEST_COMMON_ID = "guest_common";

export class AuthService {
    /**
     * Fetch user profile and map to AuthUser DTO
     */
    async getUser(authId: string): Promise<AuthUser | null> {
        try {
            const profile = await storage.users.getUser(authId);

            if (!profile) return null;

            // Type safety for userType check
            const isAdmin = false; // TODO: Implement admin check logic
            const userType = isAdmin ? 'admin' : 'verified';

            return {
                id: profile.id,
                isGuest: false,
                isAuthenticated: true,
                userType: userType,
                isVerified: !!(profile.ageGroup && profile.gender && profile.region),
                email: profile.email,
                name: profile.fullName || profile.nickname,
                phone: profile.phone,
                nickname: profile.nickname,
                profileImageUrl: profile.profileImageUrl,
                level: profile.level || 1,
                experience: profile.experience || 0,
                personalPoints: profile.personalPoints || 0,
                availableLotteryTickets: profile.availableLotteryTickets || 0,
                ageGroup: profile.ageGroup,
                gender: profile.gender,
                region: profile.region,
                cityProvince: profile.region, // Map region to cityProvince for frontend compatibility
                district: profile.city,       // Map 'city' column to 'district' field (schema logic)
                jobCategory: profile.jobCategory,
                educationLevel: profile.educationLevel,
                incomeLevel: profile.incomeLevel,
                maritalStatus: profile.maritalStatus,
                isPetOwner: profile.isPetOwner || false
            };
        } catch (error) {
            console.error("[AuthService] getUser error:", error);
            return null;
        }
    }

    async getGuestUser(): Promise<AuthUser> {
        return {
            id: GUEST_COMMON_ID,
            isGuest: true,
            isAuthenticated: false,
            userType: "guest",
            isVerified: false,
            level: 1,
            experience: 0,
            personalPoints: 0,
            availableLotteryTickets: 0
        };
    }

    /**
     * Handle experience update logic
     */
    async updateExperience(authId: string, experienceGained: number): Promise<void> {
        // We can use storage direct method for this since logically it belongs there, 
        // but the calculation logic could be here if we want to separate it strictly.
        // For now, let's delegate to storage which encapsulates this update logic nicely,
        // OR we pull the calculation here. 
        // Let's pull calculation here to keep Service pure.

        const profile = await storage.users.getUser(authId);
        if (!profile) return;

        const newExperience = (profile.experience || 0) + experienceGained;
        const newLevel = Math.min(100, Math.floor(newExperience / 100) + 1);
        const bonusTickets = newLevel > (profile.level || 1) ? (newLevel - (profile.level || 1)) : 0;

        // We can just use the storage method UpdateUserGameStats which handles this,
        // but to be strictly Service-Layer-y, we might want to update via updateFields.
        // However, UserStorage.updateUserGameStats exists. Let's use it for now as it's efficient.
        await storage.users.updateUserGameStats(authId, experienceGained);
    }

    /**
     * Update user profile handling various field mappings
     */
    async updateUser(authId: string, updates: any): Promise<any> {
        console.log('[AuthService] updateUser called with:', { authId, updates });

        const dbUpdates: any = {};

        // 1. Map generic fields
        if (updates.name !== undefined && updates.name !== null) dbUpdates.fullName = updates.name;
        if (updates.fullName !== undefined && updates.fullName !== null) dbUpdates.fullName = updates.fullName;
        if (updates.nickname !== undefined && updates.nickname !== null) dbUpdates.nickname = updates.nickname;
        if (updates.profileImageUrl !== undefined) dbUpdates.profileImageUrl = updates.profileImageUrl;
        if (updates.points !== undefined) dbUpdates.personalPoints = updates.points;
        if (updates.level !== undefined) dbUpdates.level = updates.level;

        // 2. Map demographic fields (snake_case & camelCase support)
        const ageGroup = updates.ageGroup || updates.age_group;
        if (ageGroup !== undefined) dbUpdates.ageGroup = ageGroup;

        const gender = updates.gender;
        if (gender !== undefined) dbUpdates.gender = gender;

        // Location fields
        const region = updates.region || updates.cityProvince || updates.city_province;
        if (region !== undefined) dbUpdates.region = region;

        const city = updates.city || updates.district || updates.city_province;
        if (updates.city !== undefined) dbUpdates.city = updates.city;
        if (updates.district !== undefined) dbUpdates.city = updates.district;

        const constituency = updates.constituency || updates.district;
        if (constituency !== undefined) dbUpdates.constituency = constituency;

        // Contact info
        const phone = updates.phone || updates.phoneNumber || updates.phone_number;
        if (phone !== undefined && phone !== null) dbUpdates.phone = phone;

        // Additional Demographics
        const jobCategory = updates.jobCategory || updates.job_category;
        if (jobCategory !== undefined && jobCategory !== null) dbUpdates.jobCategory = jobCategory;

        const educationLevel = updates.educationLevel || updates.education_level;
        if (educationLevel !== undefined && educationLevel !== null) dbUpdates.educationLevel = educationLevel;

        const incomeLevel = updates.incomeLevel || updates.income_level;
        if (incomeLevel !== undefined && incomeLevel !== null) dbUpdates.incomeLevel = incomeLevel;

        const maritalStatus = updates.maritalStatus || updates.marital_status;
        if (maritalStatus !== undefined && maritalStatus !== null) dbUpdates.maritalStatus = maritalStatus;

        const isPetOwner = updates.isPetOwner !== undefined ? updates.isPetOwner : updates.is_pet_owner;
        if (isPetOwner !== undefined) {
            if (typeof isPetOwner === 'string') {
                dbUpdates.isPetOwner = isPetOwner === 'yes' || isPetOwner === 'true';
            } else {
                dbUpdates.isPetOwner = !!isPetOwner;
            }
        }

        if (Object.keys(dbUpdates).length > 0) {
            // Use upsertUser from storage layer logic
            // Note: UserStorage.upsertUser handles the DB operation
            return await storage.users.upsertUser({ id: authId, ...dbUpdates });
        }

        return {};
    }

    async ensureProfileExists(supabaseUser: any): Promise<AuthUser | null> {
        let authUser = await this.getUser(supabaseUser.id);

        if (!authUser) {
            try {
                console.log('🆕 [AuthService] Creating new profile for:', supabaseUser.id);

                await storage.users.upsertUser({
                    id: supabaseUser.id,
                    email: supabaseUser.email,
                    fullName: supabaseUser.user_metadata?.full_name || supabaseUser.email?.split('@')[0],
                    profileImageUrl: supabaseUser.user_metadata?.avatar_url,
                    availableLotteryTickets: 0,
                    personalPoints: 0,
                    level: 1,
                    experience: 0,
                    participationCount: 0,
                    politicalAnalysis: { economic: 50, social: 50, keywords: [] },
                    aiPersona: {},
                });

                authUser = await this.getUser(supabaseUser.id);
            } catch (insertError: any) {
                console.error('🚨 [AuthService] Profile creation failed:', insertError);
                // Retry fetch if it was a race condition
                authUser = await this.getUser(supabaseUser.id);
            }
        }

        // Welcome Gift Logic
        if (authUser && authUser.level === 1 && authUser.experience === 0 && authUser.availableLotteryTickets === 0) {
            console.log('🎁 [AuthService] Granting welcome gift (5 tickets)');
            try {
                await storage.users.updateUser(authUser.id, { availableLotteryTickets: 5 });
                authUser.availableLotteryTickets = 5;
            } catch (e) {
                console.error('❌ [AuthService] Failed to grant welcome gift:', e);
            }
        }

        return authUser;
    }

    async verifyToken(token: string): Promise<AuthUser | null> {
        try {
            const { data: { user: supabaseUser }, error } = await supabaseAdmin.auth.getUser(token);
            if (error || !supabaseUser) return null;
            return await this.getUser(supabaseUser.id);
        } catch {
            return null;
        }
    }

    // Permission Checks
    canParticipate(user: AuthUser): boolean {
        return !user.isGuest && user.isAuthenticated && !!(user.ageGroup && user.gender && (user.region || user.cityProvince));
    }

    canEarnRewards(user: AuthUser): boolean { return this.canParticipate(user); }

    canCreateSurveys(user: AuthUser): boolean { return !user.isGuest && user.isAuthenticated; }

    canViewResults(user: AuthUser): boolean { return this.canParticipate(user); }

    canUseLottery(user: AuthUser): boolean { return this.canParticipate(user); }

    canUseAdvancedFeatures(user: AuthUser): boolean { return this.canParticipate(user); }

    canChangePassword(user: AuthUser): boolean { return !user.isGuest && user.isAuthenticated; }
}

export const authService = new AuthService();
