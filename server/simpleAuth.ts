import { supabaseAdmin } from "./supabase.js";
import { db } from "./db.js";
import { profiles } from "../shared/schema.js";
import { eq } from "drizzle-orm";

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

export const simpleAuthStorage = {
  async getUser(authId: string): Promise<AuthUser | null> {
    try {
      console.log(`[DEBUG] getUser called for ${authId}`);
      // Drizzle을 사용하여 프로필 조회 (RLS 우회 - DATABASE_URL 접속 권한 사용)
      const profile = await db.query.profiles.findFirst({
        where: eq(profiles.id, authId)
      });
      console.log(`[DEBUG] Drizzle findFirst result:`, profile ? 'Found' : 'Null');

      if (!profile) return null;

      // Type safety for userType check
      const isAdmin = false;
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
        cityProvince: profile.region, // Map region to cityProvince
        district: profile.city, // Map 'city' column to 'district' field (as per schema comment)
        jobCategory: profile.jobCategory,
        educationLevel: profile.educationLevel,
        incomeLevel: profile.incomeLevel,
        maritalStatus: profile.maritalStatus,
        isPetOwner: profile.isPetOwner || false
      };
    } catch (error) {
      console.error("getUser error (Drizzle):", error);
      return null;
    }
  },

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
  },

  async updateExperience(authId: string, experienceGained: number): Promise<void> {
    const user = await this.getUser(authId);
    if (!user) return;

    const newExperience = user.experience + experienceGained;
    const newLevel = Math.min(100, Math.floor(newExperience / 100) + 1);
    const bonusTickets = newLevel > user.level ? (newLevel - user.level) : 0;
    const currentTickets = user.availableLotteryTickets || 0;

    await db.update(profiles)
      .set({
        experience: newExperience,
        level: newLevel,
        availableLotteryTickets: currentTickets + bonusTickets,
        updatedAt: new Date()
      })
      .where(eq(profiles.id, authId));
  },

  async updateUser(authId: string, updates: any): Promise<any> {
    console.log('[simpleAuth] updateUser called with:', { authId, updates });

    const dbUpdates: any = {};
    // Map Drizzle schema fields
    if (updates.name !== undefined && updates.name !== null) dbUpdates.fullName = updates.name;
    if (updates.fullName !== undefined && updates.fullName !== null) dbUpdates.fullName = updates.fullName;
    if (updates.nickname !== undefined && updates.nickname !== null) dbUpdates.nickname = updates.nickname;
    if (updates.profileImageUrl !== undefined) dbUpdates.profileImageUrl = updates.profileImageUrl;
    if (updates.points !== undefined) dbUpdates.personalPoints = updates.points;
    if (updates.level !== undefined) dbUpdates.level = updates.level;

    // Demographic fields
    const ageGroup = updates.ageGroup || updates.age_group;
    if (ageGroup !== undefined) dbUpdates.ageGroup = ageGroup;

    const gender = updates.gender;
    if (gender !== undefined) dbUpdates.gender = gender;

    // Location fields (Support both old and new naming)
    const region = updates.region || updates.cityProvince || updates.city_province;
    if (region !== undefined) dbUpdates.region = region;

    const city = updates.city || updates.district || updates.city_province; // fallback
    if (updates.city !== undefined) dbUpdates.city = updates.city;
    if (updates.district !== undefined) dbUpdates.city = updates.district;

    // Constituency
    const constituency = updates.constituency || updates.district; // district is often district/constitunecy
    if (constituency !== undefined) dbUpdates.constituency = constituency;

    // Contact info
    const phone = updates.phone || updates.phoneNumber || updates.phone_number;
    if (phone !== undefined && phone !== null) dbUpdates.phone = phone;

    // Additional Demographics (Support both camelCase and snake_case inputs)
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

    dbUpdates.updatedAt = new Date();

    console.log('[simpleAuth] FINAL dbUpdates to be saved:', JSON.stringify(dbUpdates, null, 2));
    console.log('[simpleAuth] Target authId:', authId);

    if (Object.keys(dbUpdates).length > 0) {
      try {
        // Use upsert logic to ensure the row exists
        const result = await db.insert(profiles)
          .values({ id: authId, ...dbUpdates })
          .onConflictDoUpdate({
            target: profiles.id,
            set: dbUpdates
          })
          .returning();

        console.log('[simpleAuth] Update/Upsert Database Result:', JSON.stringify(result, null, 2));

        if (result.length === 0) {
          console.error('[simpleAuth] ⚠️ No profile found for id:', authId);
        } else {
          console.log('[simpleAuth] ✅ Profile updated successfully for:', authId);
        }
        return result[0];
      } catch (dbError) {
        console.error('[simpleAuth] ❌ Database update error:', dbError);
        throw dbError;
      }
    }

    return {};
  },

  async verifyToken(token: string): Promise<AuthUser | null> {
    try {
      const { data: { user: supabaseUser }, error } = await supabaseAdmin.auth.getUser(token);
      if (error || !supabaseUser) return null;
      return await this.getUser(supabaseUser.id);
    } catch {
      return null;
    }
  },

  // Helper getters
  canParticipate(user: AuthUser): boolean {
    return !user.isGuest && user.isAuthenticated && !!(user.ageGroup && user.gender && (user.region || user.cityProvince));
  },
  canEarnRewards(user: AuthUser): boolean { return this.canParticipate(user); },
  canCreateSurveys(user: AuthUser): boolean { return !user.isGuest && user.isAuthenticated; }, // isVerified check removed for flexibility
  canViewResults(user: AuthUser): boolean { return this.canParticipate(user); },
  canUseLottery(user: AuthUser): boolean { return this.canParticipate(user); },
  canUseAdvancedFeatures(user: AuthUser): boolean { return this.canParticipate(user); },
  canChangePassword(user: AuthUser): boolean { return !user.isGuest && user.isAuthenticated; }
};

export async function authMiddleware(req: any, res: any, next: any) {
  const token = req.headers.authorization?.replace("Bearer ", "") || req.cookies?.['sb-access-token'];

  if (token) {
    try {
      // 1. Supabase Auth로 토큰 검증 (SupabaseAdmin 필요)
      const { data: { user: supabaseUser }, error } = await supabaseAdmin.auth.getUser(token);

      if (supabaseUser && !error) {
        // 2. 이후 DB 조회는 Drizzle로 수행 (ServiceRoleKey 오류 가능성 배제)
        let authUser = await simpleAuthStorage.getUser(supabaseUser.id);

        if (!authUser) {
          // Create a minimal profile via Drizzle
          try {
            console.log('🆕 Creating new profile via Drizzle for:', supabaseUser.id);
            await db.insert(profiles)
              .values({
                id: supabaseUser.id,
                email: supabaseUser.email,
                fullName: supabaseUser.user_metadata?.full_name || supabaseUser.email?.split('@')[0],
                profileImageUrl: supabaseUser.user_metadata?.avatar_url,
                availableLotteryTickets: 0, // 초기값 0, 이후 로직에서 5장 지급
                personalPoints: 0,
                level: 1,
                experience: 0,
                participationCount: 0,
                politicalAnalysis: { economic: 50, social: 50, keywords: [] },
                aiPersona: {},
              });

            // Fetch newly created user
            authUser = await simpleAuthStorage.getUser(supabaseUser.id);

          } catch (insertError: any) {
            console.error('🚨 프로필 생성 실패 (Drizzle):', insertError);

            // 중복 에러 등 발생 시, 이미 존재하는 프로필을 다시 시도하여 가져옴
            if (insertError.code === '23505' || insertError.toString().includes('unique constraint')) {
              console.log('ℹ️ 이미 존재하는 프로필입니다. 다시 조회를 시도합니다.');
              authUser = await simpleAuthStorage.getUser(supabaseUser.id);
            }
          }
        }

        if (authUser) {
          // [긴급 패치] 신규 가입자(레벨1, 경험치0)인데 티켓이 0장인 경우 5장 지급 (트리거 충돌 방지)
          if (authUser.level === 1 && authUser.experience === 0 && authUser.availableLotteryTickets === 0) {
            console.log('🎁 신규 가입자 웰컴 선물 지급 (티켓 5장) [Drizzle]');
            try {
              await db.update(profiles)
                .set({ availableLotteryTickets: 5 })
                .where(eq(profiles.id, authUser.id));

              authUser.availableLotteryTickets = 5;
            } catch (ticketError) {
              console.error('❌ 티켓 지급 실패:', ticketError);
            }
          }

          req.user = authUser;
          return next();
        }
      }
    } catch (error) {
      console.error('🔑 Auth middleware error:', error);
    }
  }

  req.user = await simpleAuthStorage.getGuestUser();
  next();
}

export function requireAuth(req: any, res: any, next: any) {
  if (!req.user || req.user.isGuest) {
    return res.status(401).json({ error: "로그인이 필요합니다." });
  }
  next();
}