import bcrypt from "bcrypt";
import { storage } from "../storage/index.js";
import { HiqStore, HiqMember, InsertHiqMember } from "../../shared/schema.js";
import { unauthorized, notFound, badRequest } from "../utils/errors.js";
import type { SocialIdentity } from "../lib/socialAuth.js";
import { generateHandle } from "../lib/handle.js";

// 글로벌(비매장) 유저의 소속 스토어 — 마이그레이션에서 시드됨. 소셜 가입 유저는 여기 속한다.
const GLOBAL_STORE_SLUG = "global";

// --- PIN 해싱 ---
// PIN은 예전에 평문으로 저장·비교됐다. DB가 새면 전 회원 PIN이 그대로 털리므로 bcrypt로 전환한다.
const BCRYPT_ROUNDS = 10;
// 저장값이 bcrypt 해시($2a/$2b/$2y$rounds$…)인지 — 평문 시절 데이터와 구분하는 유일한 단서.
const BCRYPT_HASH_RE = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

export function hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

// PIN 검증 + 점진 마이그레이션.
// 기존 회원 행에는 평문 PIN이 그대로 남아 있어서, 해시 검증만 하면 그 전원이 로그인 불가가 된다.
// 그래서 저장값이 해시면 bcrypt.compare, 평문이면 직접 비교하고 성공한 그 순간 해시로 재저장한다.
// 올바른 PIN을 서버가 알 수 있는 시점은 로그인 성공 순간뿐이라, 여기서 못 바꾸면 영영 평문으로 남는다.
async function verifyPassword(
    input: string | undefined | null,
    profile: { id: string; password?: string | null }
): Promise<boolean> {
    const stored = profile.password;
    if (!stored || !input) return false;

    if (BCRYPT_HASH_RE.test(stored)) return bcrypt.compare(input, stored);

    // 레거시 평문 경로
    if (input !== stored) return false;
    try {
        await storage.updateProfile(profile.id, { password: await hashPassword(input) });
    } catch (err) {
        // 재저장 실패가 로그인을 막아선 안 된다 — 다음 로그인에 다시 시도된다.
        console.error("[pin-migrate] 해시 전환 실패", err);
    }
    return true;
}

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
        // 하이픈·공백 입력 허용 — profiles.phone 은 digits-only 로 저장된다(클레임 승인 흐름 포함).
        // 정규화 없이는 '010-1234-5678' 입력이 계정을 못 찾아 로그인 불가였다.
        phone = String(phone || "").replace(/[^\d]/g, "");
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
            if (!(await verifyPassword(password, profile))) {
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
                    if (!(await verifyPassword(password, profile))) {
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
    async socialLogin(provider: "google" | "apple", identity: SocialIdentity, displayName?: string, countryCode?: string) {
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
                // 글로벌 신원 — 유니크 @핸들 자동 생성 + IP 기반 국가(국가 랭킹 축)
                handle: await generateHandle(identity.email ?? nickname),
                countryCode: countryCode || undefined,
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
                    password: await hashPassword(data.password),
                    role: 'user',
                    nickname: data.name,
                    // 전화 가입도 @핸들 자동 부여(한글 이름은 정규화에서 걸러져 player_#### 폴백)
                    handle: await generateHandle(data.name),
                    securityQuestion: data.securityQuestion,
                    securityAnswer: normalizedAnswer
                });
            } else if (!profile.password) {
                // SECURITY: /register is unauthenticated. Only backfill credentials for a legacy
                // passwordless profile. NEVER overwrite an existing account's password/security
                // Q&A here — otherwise anyone who knows a phone number could reset the PIN and
                // take over the account. An already-protected profile is reused as-is.
                profile = await storage.updateProfile(profile.id, {
                    password: await hashPassword(data.password),
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
                if (!(await verifyPassword(data.password, profile))) {
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

        await storage.updateProfile(profile.id, { password: await hashPassword(newPin) });
        return { success: true };
    }
}

export const hiqService = new HiqService();
