import bcrypt from "bcrypt";
import { randomUUID } from "node:crypto";
import { storage } from "../storage/index.js";
import { HiqStore, HiqMember, InsertHiqMember } from "../../shared/schema.js";
import { unauthorized, notFound, badRequest } from "../utils/errors.js";
import { msg } from "../lib/i18n.js";
import type { SocialIdentity } from "../lib/socialAuth.js";
import { generateHandle } from "../lib/handle.js";

// 글로벌(비매장) 유저의 소속 스토어 — 마이그레이션에서 시드됨. 소셜 가입 유저는 여기 속한다.
// 공유 상수 사용 — 슬러그가 여러 파일에 흩어지면 하나만 바뀌었을 때 소셜 가입이 조용히 깨진다.
import { GLOBAL_STORE_SLUG, DEFAULT_STORE_SLUG } from "../../shared/systemStores.js";
import { KAKAO_DEFAULT_NAME } from "../../shared/kakaoLogin.js";
import { isLoginPhone, isKakaoSignupPhone, kakaoPhonePlaceholder, SOCIAL_PHONE_PREFIX } from "../../shared/loginPhone.js";
import { isReservedMemberName } from "../utils/crewModeration.js";

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

        // 관리자는 매장 없이도 로그인 허용 — 로그인 후 /admin/dashboard 로 착지한다.
        // (기존엔 매장 미보유 admin 이 파트너 로그인 자체가 막혀 관리자 진입점이 없었다)
        const isAdmin = profile.role === "admin" || profile.role === "super_admin";
        if (!store && !isAdmin) {
            return { success: false, message: "매장 정보가 연결되지 않은 계정입니다. 입점 신청을 해주세요." };
        }

        return {
            success: true,
            storeName: store?.name ?? "관리자",
            profileId,
            storeId: store?.id ?? null,
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
        // 전화번호 자리에 소셜·탈퇴 자리표시자(`social:…`·`del-…`)를 보내면 DB 를 보기 전에 끊는다(2026-10-05 검토).
        // 소셜로 가입한 프로필에는 PIN 이 없어, 이 검사가 없으면 자리표시자만 알면 PIN 없이 그 계정으로 들어갔다.
        // 라우트(POST /login)도 같은 검사를 먼저 하지만 뿌리는 여기서 막는다 — 다른 길이 이 함수를 불러도 안전하게.
        if (!isLoginPhone(phone)) throw badRequest(msg("err.auth.phoneInvalid"));

        const store = await storage.getStoreBySlug(storeSlug);
        if (!store) throw notFound(msg("err.hiq.storeNotFound"));

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
                } else if (profile && (profile.googleSub || profile.appleSub || profile.kakaoSub)) {
                    // PIN 없는 **소셜 계정**은 전화번호 길로 들이지 않는다 — 'PIN 없으면 통과'는 매장에서 번호만으로 등록한
                    // 옛 회원을 위한 것이지 소셜 가입자를 위한 것이 아니다. 자리표시자 꼴이 바뀌어도 여기서 걸린다.
                    throw unauthorized(msg("err.auth.socialAccountOnly"));
                }
            }

            await storage.incrementVisitCount(member.id);
            return { member, isNew: false, redirectTo: '/dashboard' };
        } else {
            return { phone, storeId: store.id, isNew: true, redirectTo: `/register?phone=${phone}&store=${store.id}` };
        }
    }

    // 소셜 로그인(구글·애플·카카오) — 검증된 identity로 프로필·멤버 find-or-create.
    // 전화번호 로그인과 완전 분리된 경로: 기존 매장 멤버 흐름은 건드리지 않는다.
    // 2026-10-05 카카오 추가(오너: "카카오도 오픈 — 한국은 카카오·구글, 다른 나라는 구글·애플"). 구글·애플의 동작은 그대로다.
    //  - 카카오의 sub 는 회원번호, 닉네임은 동의 항목이라 없을 수 있다 → 기본 이름은 "Player" 대신 "랭큐회원".
    //  - 전화번호 회원이 설정에서 카카오를 **연결**해 뒀으면(linkKakao) 여기서 그 프로필이 잡혀 같은 계정으로 들어온다.
    async socialLogin(provider: "google" | "apple" | "kakao", identity: SocialIdentity, displayName?: string, countryCode?: string) {
        const fallbackName = provider === "kakao" ? KAKAO_DEFAULT_NAME : "Player";
        // 1) 프로필(신원) find-or-create — sub가 유일키
        // (storage.users 를 바로 부른다 — storage/index.ts 의 얇은 대리 함수는 아직 "google" | "apple" 만 받는다)
        let profile = await storage.users.getProfileBySocialSub(provider, identity.sub);
        let isNew = false;
        if (!profile) {
            isNew = true;
            // 운영 주체로 보이는 이름('랭큐'·'운영팀'·'운영자'·'관리자')은 후보에서 뺀다(2026-10-06 검토 — '랭큐 운영팀' 사칭).
            // 구글·애플의 표시 이름은 **화면이 보내는 글자**라 가입(POST /register)·프로필 수정(PATCH /me)의 이름 필터를 거치지 않는다 —
            // 여기서 안 막으면 그 규칙을 소셜 가입으로 돌아간다. 가입은 막지 않는다: 다음 후보로 넘어가고, 다 걸리면 기본 이름으로 시작한다.
            const usable = (s: string | null | undefined) => (s && !isReservedMemberName(s) ? s : undefined);
            const nickname = usable(displayName) || usable(identity.name) || usable(identity.email?.split("@")[0]) || fallbackName;
            profile = await storage.createProfile({
                nickname,
                email: identity.email ?? undefined,
                role: "user",
                // 글로벌 신원 — 유니크 @핸들 자동 생성 + IP 기반 국가(국가 랭킹 축)
                handle: await generateHandle(identity.email ?? nickname),
                countryCode: countryCode || undefined,
                ...(provider === "google" ? { googleSub: identity.sub }
                    : provider === "apple" ? { appleSub: identity.sub }
                    : { kakaoSub: identity.sub }),
            } as any);
        }

        // 2) 멤버 find-or-create — 글로벌 스토어 소속(매장 무관 개인 유저)
        // 한 프로필에 회원 행이 여럿이면(전화번호 회원이 카카오를 연결한 경우) 본 사이트(hiq) 행이 먼저다 — lib/loginMember.
        // 소셜로 가입한 프로필은 글로벌 행 하나뿐이라 예전과 같은 행이 잡힌다.
        let member = await storage.users.getLoginMemberByProfileId(profile.id);
        if (!member) {
            const globalStore = await storage.getStoreBySlug(GLOBAL_STORE_SLUG);
            if (!globalStore) throw notFound("GLOBAL_STORE_NOT_SEEDED");
            member = await storage.createMember({
                storeId: globalStore.id,
                // phone은 notNull+unique(storeId,phone) — 소셜 유저는 플레이스홀더(실전화 아님).
                // 구글·애플은 예전 그대로 sub 를 붙인다(길고 추측하기 어렵다). 카카오는 **난수**를 붙인다(2026-10-05 검토):
                // 카카오 회원번호는 짧은 숫자라 훑을 수 있고, 이 칸은 로그인 응답과 /me 에 그대로 실린다.
                // 어느 쪽이든 전화번호 로그인은 이 꼴을 받지 않는다(shared/loginPhone).
                phone: provider === "kakao" ? kakaoPhonePlaceholder(randomUUID()) : `social:${provider}:${identity.sub}`,
                name: profile.nickname || fallbackName,
                profileId: profile.id,
            } as any);
        }

        await storage.incrementVisitCount(member.id);
        return { member, isNew, redirectTo: "/dashboard" };
    }

    /**
     * 로그인한 회원의 프로필에 카카오를 붙인다(설정 '연결된 로그인' → 카카오 연결, 2026-10-05).
     * 전화번호로 가입한 회원이 카카오로 들어오면 계정이 둘로 갈린다 — 미리 붙여 두면 카카오로 들어와도 같은 계정이다.
     *
     *  - "no-profile": 프로필이 없는 회원(매장에서 전화번호만으로 등록 — profileId 가 null). 붙일 곳이 없다.
     *  - "no-pin": 프로필에 PIN 이 없다. 연결은 **PIN 으로 본인임을 확인한 계정에만** 한다(2026-10-05 검토) —
     *    PIN 없는 계정은 번호만 알면 들어올 수 있어, 거기에 카카오를 붙이게 두면 남이 영구적인 로그인 수단을 심을 수 있다.
     *    PIN 이 맞는지는 라우트가 카카오를 부르기 **전에** checkKakaoPin 으로 본다(틀려도 인가 코드를 쓰지 않게).
     *  - "ok": 붙였다. 이미 같은 카카오가 붙어 있어도 ok(두 번 눌러도 된다).
     *  - "taken": 그 카카오 계정이 이미 **다른** 프로필에 있다(카카오로 따로 가입해 둔 경우 포함). 계정 합치기는 하지 않는다.
     *  - "other-linked": 내 프로필에 이미 **다른** 카카오 계정이 붙어 있다. 덮어쓰지 않는다 — 바꾸려면 먼저 해제(unlinkKakao)한다.
     */
    async linkKakao(memberId: string, identity: SocialIdentity): Promise<"ok" | "taken" | "no-profile" | "no-pin" | "other-linked"> {
        const member = await storage.getMemberById(memberId);
        if (!member?.profileId) return "no-profile";
        const profile = await storage.getProfile(member.profileId);
        if (!profile) return "no-profile";

        if (profile.kakaoSub) return profile.kakaoSub === identity.sub ? "ok" : "other-linked";
        if (!profile.password) return "no-pin";

        const owner = await storage.users.getProfileBySocialSub("kakao", identity.sub);
        if (owner) return owner.id === profile.id ? "ok" : "taken";

        try {
            const written = await storage.users.linkProfileKakaoSub(profile.id, identity.sub);
            if (written) return "ok";
        } catch (e: any) {
            // 확인과 쓰기 사이에 다른 프로필이 같은 카카오를 먼저 가져갔다 — 유니크 제약이 막아 준다
            if ((e?.code ?? e?.cause?.code) === "23505") return "taken";
            throw e;
        }
        // 비어 있을 때만 쓰는 UPDATE 가 0줄 — 그 사이 내 프로필에 무언가 적혔다. 다시 읽어 판정한다.
        const again = await storage.getProfile(profile.id);
        if (!again) return "no-profile";
        return again.kakaoSub === identity.sub ? "ok" : "other-linked";
    }

    /**
     * 카카오 연결·해제 전의 본인 확인(2026-10-05 검토) — 쿠키만으로는 부족하다. 30일짜리 로그인 쿠키를 쥔 사람이
     * (빌린 폰, PIN 없는 계정에 번호만으로 들어온 사람) 영구적인 로그인 수단을 심거나 떼지 못하게 **로그인 PIN** 을 다시 받는다.
     *
     *  - "no-profile": 프로필이 없는 회원.
     *  - "no-pin": 프로필에 PIN 이 없다 — 확인할 방법이 없으므로 연결·해제를 열지 않는다(구글·애플 전용 계정 포함).
     *  - "wrong-pin": PIN 이 틀렸다(라우트가 실패 횟수에 센다).
     */
    async checkKakaoPin(memberId: string, pin: unknown): Promise<"ok" | "no-profile" | "no-pin" | "wrong-pin"> {
        const member = await storage.getMemberById(memberId);
        if (!member?.profileId) return "no-profile";
        const profile = await storage.getProfile(member.profileId);
        if (!profile) return "no-profile";
        if (!profile.password) return "no-pin";
        if (typeof pin !== "string" || !pin) return "wrong-pin";
        return (await verifyPassword(pin, profile)) ? "ok" : "wrong-pin";
    }

    /**
     * 내 프로필에서 카카오를 뗀다(설정 '연결된 로그인' → 해제, 2026-10-05 검토: 연결만 있고 되돌릴 길이 없었다 —
     * 가족 카카오가 로그인된 브라우저에서 잘못 붙였거나 남이 붙여 둔 카카오를 주인이 스스로 뗄 수 있어야 한다).
     * PIN 확인은 checkKakaoPin 과 같은 규칙이고, 이 함수가 직접 한다(해제는 카카오를 부르지 않아 순서를 나눌 이유가 없다).
     *
     *  - "ok": 뗐다. 이미 떼어져 있어도 ok.
     *  - "signup-account": 카카오로 **가입한** 계정이다(회원 행 phone 이 `social:kakao:…`). 떼면 들어올 길이 없어져 거절한다.
     *  - "no-profile" · "no-pin" · "wrong-pin": checkKakaoPin 과 같다. PIN 이 있다는 것은 전화번호+PIN 이라는 다른 길이 남는다는 뜻이다.
     */
    async unlinkKakao(memberId: string, pin: unknown): Promise<"ok" | "signup-account" | "no-profile" | "no-pin" | "wrong-pin"> {
        const member = await storage.getMemberById(memberId);
        if (!member?.profileId) return "no-profile";
        const profile = await storage.getProfile(member.profileId);
        if (!profile) return "no-profile";
        if (isKakaoSignupPhone(member.phone)) return "signup-account";
        if (!profile.password) return "no-pin";
        if (typeof pin !== "string" || !pin || !(await verifyPassword(pin, profile))) return "wrong-pin";
        if (!profile.kakaoSub) return "ok";
        await storage.users.unlinkProfileKakaoSub(profile.id, profile.kakaoSub);
        return "ok";
    }

    /* ── 통합 로그인(2026-10-07 오너: "휴대폰 로그인 사용자를 카카오나 구글 로그인으로 통합") ─────────────────────────
     * 계정은 하나, 들어오는 문이 여럿. 카카오 연결(linkKakao)과 같은 규칙을 구글에도 연다 — 그리고 반대 방향
     * (소셜로 방금 만든 빈 계정을 기존 전화번호 계정에 잇기)을 더한다. 계정 두 개의 **기록을 합치는 일은 하지 않는다**. */

    /**
     * 로그인한 회원의 프로필에 구글을 붙인다(설정 '연결된 로그인' → Google 연결). linkKakao 와 같은 판정이다:
     * "no-profile" · "no-pin"(PIN 으로 본인을 확인한 계정에만) · "ok"(이미 같은 구글이어도) · "taken"(그 구글이 다른 프로필에 있다) ·
     * "other-linked"(내 프로필에 다른 구글이 이미 있다 — 덮어쓰지 않는다). PIN 대조는 라우트가 토큰 검증 **전에** checkKakaoPin 으로 한다.
     */
    async linkSocial(memberId: string, provider: "google", identity: SocialIdentity): Promise<"ok" | "taken" | "no-profile" | "no-pin" | "other-linked"> {
        const member = await storage.getMemberById(memberId);
        if (!member?.profileId) return "no-profile";
        const profile = await storage.getProfile(member.profileId);
        if (!profile) return "no-profile";

        if (profile.googleSub) return profile.googleSub === identity.sub ? "ok" : "other-linked";
        if (!profile.password) return "no-pin";

        const owner = await storage.users.getProfileBySocialSub(provider, identity.sub);
        if (owner) return owner.id === profile.id ? "ok" : "taken";

        try {
            if (await storage.users.linkProfileSocialSub(provider, profile.id, identity.sub)) return "ok";
        } catch (e: any) {
            if ((e?.code ?? e?.cause?.code) === "23505") return "taken";
            throw e;
        }
        const again = await storage.getProfile(profile.id);
        if (!again) return "no-profile";
        return again.googleSub === identity.sub ? "ok" : "other-linked";
    }

    /**
     * 내 프로필에서 구글을 뗀다. unlinkKakao 와 같은 규칙: 구글로 **가입한** 계정(회원 행 phone 이 `social:google:…`)은 떼면
     * 들어올 길이 없어져 거절하고, PIN 으로 본인을 확인한다(PIN 이 있다는 것은 전화번호+PIN 이라는 다른 길이 남는다는 뜻이다).
     */
    async unlinkSocial(memberId: string, provider: "google", pin: unknown): Promise<"ok" | "signup-account" | "no-profile" | "no-pin" | "wrong-pin"> {
        const member = await storage.getMemberById(memberId);
        if (!member?.profileId) return "no-profile";
        const profile = await storage.getProfile(member.profileId);
        if (!profile) return "no-profile";
        if (String(member.phone ?? "").startsWith(`${SOCIAL_PHONE_PREFIX}${provider}:`)) return "signup-account";
        if (!profile.password) return "no-pin";
        if (typeof pin !== "string" || !pin || !(await verifyPassword(pin, profile))) return "wrong-pin";
        if (!profile.googleSub) return "ok";
        await storage.users.unlinkProfileSocialSub(provider, profile.id, profile.googleSub);
        return "ok";
    }

    /**
     * 소셜(카카오·구글·애플)로 **방금 만든 빈 계정**을 기존 전화번호 계정에 잇는다 — "전에 전화번호로 쓰셨나요?"의 답.
     * 전화번호 회원이 연결 없이 '카카오로 시작하기'를 누르면 빈 새 계정이 생겨 기록이 갈린다. 그 자리에서 번호와 PIN 을 받아
     * 지금 들고 온 로그인 수단을 기존 계정으로 옮기고, 빈 계정은 지운다. 다음부터는 그 소셜로 들어와도 기존 계정이다.
     *
     * 지금 계정(잇는 쪽)의 조건 — 하나라도 어긋나면 옮기지 않는다:
     *  - "not-social": 소셜로 가입한 계정이 아니다(회원 행 phone 이 `social:…` 이 아니거나 PIN 이 있다). 전화번호 계정끼리는 잇지 않는다.
     *  - "not-empty": 남긴 것이 있다(경기·크루·채팅·글·온라인 게임). **기록이 있는 계정은 지우지 않는다** — 합치기는 하지 않으므로 거절한다.
     * 기존 계정(받는 쪽)의 조건:
     *  - "no-account": 그 번호의 회원이 없다(본 사이트 hiq 매장 기준 — 전화번호 로그인과 같은 자리).
     *  - "no-pin": 프로필·PIN 이 없는 계정(매장에서 번호만으로 등록) — 본인임을 확인할 방법이 없어 잇지 않는다.
     *  - "wrong-pin": PIN 이 틀렸다(라우트가 로그인과 같은 잠금에 센다).
     *  - "other-linked": 그 계정에 같은 종류의 다른 소셜이 이미 붙어 있다 — 덮어쓰지 않는다.
     * "ok" 면 받는 쪽 회원 행을 돌려준다 — 라우트가 그 회원으로 쿠키를 바꾼다.
     */
    async attachSocialToPhone(currentMemberId: string, phone: unknown, pin: unknown): Promise<
        { kind: "ok"; member: HiqMember; provider: "google" | "apple" | "kakao" }
        | { kind: "not-social" | "not-empty" | "no-account" | "no-pin" | "wrong-pin" | "other-linked" }
    > {
        const current = await storage.getMemberById(currentMemberId);
        if (!current?.profileId || !String(current.phone ?? "").startsWith(SOCIAL_PHONE_PREFIX)) return { kind: "not-social" };
        const fresh = await storage.getProfile(current.profileId);
        if (!fresh || fresh.password) return { kind: "not-social" };
        const held = ([["kakao", fresh.kakaoSub], ["google", fresh.googleSub], ["apple", fresh.appleSub]] as const).filter(([, sub]) => !!sub);
        // 수단이 정확히 하나일 때만 — 둘 이상 붙은 계정은 '방금 만든 계정'이 아니다
        if (held.length !== 1) return { kind: "not-social" };
        const [provider, sub] = held[0] as ["google" | "apple" | "kakao", string];

        if (!isLoginPhone(phone)) return { kind: "no-account" };
        const store = await storage.getStoreBySlug(DEFAULT_STORE_SLUG);
        const target = store ? await storage.getMemberByPhone(store.id, phone) : undefined;
        if (!target || target.id === current.id) return { kind: "no-account" };
        if (!target.profileId) return { kind: "no-pin" };
        const profile = await storage.getProfile(target.profileId);
        if (!profile || !profile.password) return { kind: "no-pin" };
        if (typeof pin !== "string" || !pin || !(await verifyPassword(pin, profile))) return { kind: "wrong-pin" };

        // PIN 이 맞은 뒤에만 아래를 말한다 — 남의 번호로 '그 계정에 무엇이 붙어 있는지' 떠보지 못하게
        const taken = provider === "google" ? profile.googleSub : provider === "apple" ? profile.appleSub : profile.kakaoSub;
        if (taken) return { kind: "other-linked" };
        if (await storage.users.memberHasFootprint(current.id)) return { kind: "not-empty" };

        if (!(await storage.users.moveProfileSocialSub(provider, fresh.id, profile.id, sub))) return { kind: "other-linked" };
        // 수단은 옮겨졌다 — 빈 계정을 지운다. 지우기가 실패해도 로그인은 이미 기존 계정으로 이어진다(남은 빈 계정에는 들어올 길이 없다).
        try { await storage.users.deleteAccount(current.id); } catch (e) { console.error("[attach] 빈 계정 지우기 실패:", e); }
        return { kind: "ok", member: target, provider };
    }

    /** countryCode: 전화 가입 경로도 국가를 채운다(2026-09-17) — 예전엔 소셜 경로에만 있어 전화 가입자가 전부 비어 있었다. */
    async register(data: InsertHiqMember, countryCode?: string) {
        // 자리표시자(`social:…`·`del-…`)를 전화번호로 가입시키지 않는다(2026-10-05 검토) — 로그인과 같은 검사(shared/loginPhone).
        // 받아 주면 소셜 회원이 쓸 자리표시자를 남이 먼저 차지해 그 사람의 가입이 (store_id, phone) 유니크로 계속 실패한다.
        if (!isLoginPhone(data.phone)) throw badRequest(msg("err.auth.phoneInvalid"));

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
                    countryCode: countryCode || undefined,
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
