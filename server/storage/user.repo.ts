import { db } from "../db.js";
import {
    profiles,
    hiqMembers,
    hiqGameHistory,
    hiqFriendships,
    hiqVisitLogs,
    hiqGames,
    hiqInvites,
    hiqNotifications,
    hiqCrews,
    hiqCrewMembers,
    hiqStores,
    suggestions,
    golfBookings
} from "../../shared/schema.js";
import type {
    Profile,
    InsertHiqMember,
    HiqMember
} from "../../shared/schema.js";
import { eq, desc, asc, and, or, ne, sql, gt, gte, inArray, isNull } from "drizzle-orm";
import { pushTokenVariants } from "../services/pushNative.js";
import { pickLoginMember } from "../lib/loginMember.js";
import { isLoginPhone } from "../../shared/loginPhone.js";

/** 탈퇴로 가려진 조인·부킹 글에 남기는 사유(blind_reason) — 어드민 '가린 이유' 칸에만 보인다. */
const WITHDRAWN_LISTING_REASON = "탈퇴한 회원의 글";

// SECURITY: 남에게 보이는 응답(랭킹·상대목록·검색·타인 프로필)은 반드시 이 화이트리스트로만 셀렉트한다.
// hiqMembers를 통째로 select하면 phone과 정산 계좌(defaultAccount*)까지 API로 새어 나간다.
// crew.repo.ts와 같은 규칙: phone, profileId, storeId, marketingAgree, visitCount/lastVisitedAt,
// defaultAccountBank/Number/Holder는 절대 포함하지 않는다.
export const PUBLIC_MEMBER_COLUMNS = {
    id: hiqMembers.id,
    name: hiqMembers.name,
    birthYear: hiqMembers.birthYear,
    gender: hiqMembers.gender,
    handi3c: hiqMembers.handi3c,
    handi4c: hiqMembers.handi4c,
    average: hiqMembers.average,
    rating3c: hiqMembers.rating3c,
    rating4c: hiqMembers.rating4c,
    avg3c: hiqMembers.avg3c,
    avg4c: hiqMembers.avg4c,
    golfHandicap: hiqMembers.golfHandicap,
    golfBestScore: hiqMembers.golfBestScore,
    golfAvgScore: hiqMembers.golfAvgScore,
    golfGrade: hiqMembers.golfGrade,
    golfGradeVerified: hiqMembers.golfGradeVerified,
    totalGolfGames: hiqMembers.totalGolfGames,
    totalSimPoints: hiqMembers.totalSimPoints,
    introduction: hiqMembers.introduction,
    createdAt: hiqMembers.createdAt,
};

export class UserRepository {
    async createProfile(data: Partial<Profile>): Promise<Profile> {
        const [profile] = await db.insert(profiles).values({
            id: crypto.randomUUID(),
            ...data
        } as any).returning();
        return profile;
    }

    // 소셜 로그인 식별자(sub)로 프로필 조회 — 글로벌 유저(비한국) 가입 경로
    // 2026-10-05 카카오 추가(오너: "카카오도 오픈 — 한국은 카카오·구글, 다른 나라는 구글·애플"). sub = 카카오 회원번호.
    async getProfileBySocialSub(provider: "google" | "apple" | "kakao", sub: string): Promise<Profile | undefined> {
        const col = provider === "google" ? profiles.googleSub : provider === "apple" ? profiles.appleSub : profiles.kakaoSub;
        const [profile] = await db.select().from(profiles).where(eq(col, sub));
        return profile;
    }

    /**
     * 내 프로필에 카카오 회원번호를 적는다(설정 '연결된 로그인' → 카카오 연결, 2026-10-05).
     * **비어 있을 때만** 적는 조건부 UPDATE 한 문장 — 그 사이 다른 요청이 먼저 적었으면 덮지 않고 false 를 돌려준다.
     * 같은 번호가 다른 프로필에 이미 있으면 DB 의 유니크 제약(23505)이 던진다 — 부르는 쪽(hiqService.linkKakao)이 '이미 연결됨'으로 바꾼다.
     */
    async linkProfileKakaoSub(profileId: string, kakaoSub: string): Promise<boolean> {
        const rows = await db.update(profiles)
            .set({ kakaoSub, updatedAt: new Date() })
            .where(and(eq(profiles.id, profileId), isNull(profiles.kakaoSub)))
            .returning({ id: profiles.id });
        return rows.length > 0;
    }

    /**
     * 내 프로필에서 카카오를 뗀다(설정 '연결된 로그인' → 해제, 2026-10-05 검토: 연결만 있고 해제가 없어 잘못 붙은 카카오를 되돌릴 길이 없었다).
     * **지금 붙어 있는 그 번호일 때만** 지우는 조건부 UPDATE — 그 사이 다른 값으로 바뀌었으면 건드리지 않고 false.
     * 떼도 되는 계정인지(다른 로그인 수단이 남는지·PIN 확인)는 부르는 쪽(hiqService.unlinkKakao)이 본다.
     */
    async unlinkProfileKakaoSub(profileId: string, kakaoSub: string): Promise<boolean> {
        const rows = await db.update(profiles)
            .set({ kakaoSub: null, updatedAt: new Date() })
            .where(and(eq(profiles.id, profileId), eq(profiles.kakaoSub, kakaoSub)))
            .returning({ id: profiles.id });
        return rows.length > 0;
    }

    /**
     * 구글·애플·카카오 공통(2026-10-07 통합 로그인 — 오너: "휴대폰 로그인 사용자를 카카오나 구글 로그인으로 통합").
     * 카카오 전용 두 함수와 같은 규칙이다: 붙이기는 **비어 있을 때만**, 떼기는 **지금 붙어 있는 그 값일 때만**.
     */
    async linkProfileSocialSub(provider: "google" | "apple" | "kakao", profileId: string, sub: string): Promise<boolean> {
        const col = provider === "google" ? profiles.googleSub : provider === "apple" ? profiles.appleSub : profiles.kakaoSub;
        const set = provider === "google" ? { googleSub: sub } : provider === "apple" ? { appleSub: sub } : { kakaoSub: sub };
        const rows = await db.update(profiles)
            .set({ ...set, updatedAt: new Date() })
            .where(and(eq(profiles.id, profileId), isNull(col)))
            .returning({ id: profiles.id });
        return rows.length > 0;
    }
    async unlinkProfileSocialSub(provider: "google" | "apple" | "kakao", profileId: string, sub: string): Promise<boolean> {
        const col = provider === "google" ? profiles.googleSub : provider === "apple" ? profiles.appleSub : profiles.kakaoSub;
        const set = provider === "google" ? { googleSub: null } : provider === "apple" ? { appleSub: null } : { kakaoSub: null };
        const rows = await db.update(profiles)
            .set({ ...set, updatedAt: new Date() })
            .where(and(eq(profiles.id, profileId), eq(col, sub)))
            .returning({ id: profiles.id });
        return rows.length > 0;
    }

    /**
     * 소셜 로그인 수단을 한 프로필에서 다른 프로필로 옮긴다(소셜로 방금 만든 빈 계정 → 기존 전화번호 계정, hiqService.attachSocialToPhone).
     * 한 트랜잭션: 옛 자리에서 **그 값일 때만** 떼고, 새 자리에 **비어 있을 때만** 붙인다. 둘 중 하나라도 0줄이면 전부 되돌린다(false).
     * 같은 값이 두 프로필에 동시에 있을 수 없어(유니크) 떼기가 먼저다.
     */
    async moveProfileSocialSub(provider: "google" | "apple" | "kakao", fromProfileId: string, toProfileId: string, sub: string): Promise<boolean> {
        const col = provider === "google" ? profiles.googleSub : provider === "apple" ? profiles.appleSub : profiles.kakaoSub;
        const clear = provider === "google" ? { googleSub: null } : provider === "apple" ? { appleSub: null } : { kakaoSub: null };
        const put = provider === "google" ? { googleSub: sub } : provider === "apple" ? { appleSub: sub } : { kakaoSub: sub };
        class Abort extends Error {}
        try {
            await db.transaction(async (tx) => {
                const off = await tx.update(profiles).set({ ...clear, updatedAt: new Date() })
                    .where(and(eq(profiles.id, fromProfileId), eq(col, sub))).returning({ id: profiles.id });
                if (off.length === 0) throw new Abort();
                const on = await tx.update(profiles).set({ ...put, updatedAt: new Date() })
                    .where(and(eq(profiles.id, toProfileId), isNull(col))).returning({ id: profiles.id });
                if (on.length === 0) throw new Abort();
            });
            return true;
        } catch (e) {
            if (e instanceof Abort) return false;
            throw e;
        }
    }

    /**
     * 이 회원이 남긴 것이 있는가 — 경기 기록·진행 중 경기·크루·채팅·커뮤니티 글·온라인 게임. 하나라도 있으면 true.
     * '방금 만든 빈 계정'만 기존 계정에 이어 붙이고 지우기 위한 확인이다(attachSocialToPhone) — 기록이 있는 계정은 지우지 않는다.
     */
    async memberHasFootprint(memberId: string): Promise<boolean> {
        const r = await db.execute(sql`
            select (
                exists (select 1 from hiq_game_history where member_id = ${memberId})
                or exists (select 1 from hiq_games where player1_id = ${memberId} or player2_id = ${memberId} or player3_id = ${memberId} or player4_id = ${memberId})
                or exists (select 1 from hiq_crew_members where member_id = ${memberId})
                or exists (select 1 from hiq_chat_messages where sender_id = ${memberId})
                or exists (select 1 from hiq_community_posts where author_id = ${memberId})
                or exists (select 1 from hiq_sim_matches where host_id = ${memberId} or guest_id = ${memberId})
                or exists (select 1 from hiq_sim_sessions where member_id = ${memberId})
                or exists (select 1 from hiq_listing_chats where sender_id = ${memberId})
                or exists (select 1 from golf_bookings where owner_id = ${memberId})
                or exists (select 1 from golf_joins where host_id = ${memberId})
                or exists (select 1 from golf_join_requests where member_id = ${memberId})
                or exists (select 1 from golf_match_sessions where host_id = ${memberId})
                or exists (select 1 from golf_players where player_id = ${memberId})
                or exists (select 1 from golf_round_checkins where member_id = ${memberId})
                or exists (select 1 from golf_round_photos where member_id = ${memberId})
            ) as has`);
        const row = ((r as any).rows ?? r)[0];
        return row?.has === true;
    }

    // 프로필에 연결된 멤버 조회 — **가장 먼저 만든 행 하나**(매장을 가리지 않는다). 운영자 알림 대상(admin.ts)이 쓰고,
    // admin.repo getStaffMemberIds 가 같은 기준에 맞춰져 있다 — 정렬을 바꾸지 말 것. 로그인은 아래 getLoginMemberByProfileId 를 쓴다.
    async getMemberByProfileId(profileId: string): Promise<HiqMember | undefined> {
        const [member] = await db.select().from(hiqMembers)
            .where(eq(hiqMembers.profileId, profileId))
            .orderBy(asc(hiqMembers.createdAt))
            .limit(1);
        return member;
    }

    /**
     * 소셜 로그인이 들어갈 회원 행(2026-10-05 검토). 한 프로필에 회원 행이 여럿이면 본 사이트(hiq) → 글로벌 → 가장 오래된 것 순.
     * 전화번호 회원이 hiq 행에서 카카오를 연결해 뒀는데 카카오 로그인이 더 오래된 제휴 매장 행으로 들어가던 것을 막는다
     * (규칙과 이유는 lib/loginMember). 위 getMemberByProfileId 는 다른 곳이 같은 기준에 기대고 있어 건드리지 않고 따로 뒀다.
     * 한 사람의 회원 행은 몇 줄뿐이라 다 읽어 고른다.
     */
    async getLoginMemberByProfileId(profileId: string): Promise<HiqMember | undefined> {
        const rows = await db.select({ member: hiqMembers, storeSlug: hiqStores.slug })
            .from(hiqMembers)
            .leftJoin(hiqStores, eq(hiqMembers.storeId, hiqStores.id))
            .where(eq(hiqMembers.profileId, profileId))
            .orderBy(asc(hiqMembers.createdAt));
        return pickLoginMember(rows.map((r) => ({ member: r.member, storeSlug: r.storeSlug, createdAt: r.member.createdAt })));
    }

    async getProfileByPhone(phone: string): Promise<Profile | undefined> {
        const [profile] = await db.select().from(profiles).where(eq(profiles.phone, phone));
        return profile;
    }

    async getProfile(id: string): Promise<Profile | undefined> {
        const [profile] = await db.select().from(profiles).where(eq(profiles.id, id));
        return profile;
    }

    async updateProfile(id: string, data: Partial<Profile>): Promise<Profile> {
        const [updated] = await db.update(profiles)
            .set({ ...data, updatedAt: new Date() })
            .where(eq(profiles.id, id))
            .returning();
        return updated;
    }

    /**
     * 국가를 **비어 있을 때만** 채운다(2026-09-17). 국가는 유저가 입력하지 않고 Vercel 의 IP 헤더로만 잡는데,
     * 예전에는 소셜 가입 경로에서만 넣어서 전화번호로 가입한 사람은 전부 비어 있었다(실측: 전화 41명 중 0명).
     * 그래서 다음 로그인 때 한 번 채운다.
     *
     * **이미 값이 있으면 절대 덮지 않는다** — 여행이나 VPN 으로 접속할 때마다 국적이 바뀌면 안 된다.
     * 조건부 UPDATE 한 문장이라 읽기가 없고, 이미 채워진 사람에게는 행이 안 바뀐다.
     */
    async fillProfileCountryIfEmpty(profileId: string, countryCode: string): Promise<void> {
        await db.update(profiles)
            .set({ countryCode })
            .where(and(eq(profiles.id, profileId), isNull(profiles.countryCode)));
    }

    // --- Member Management ---
    async getMemberByPhone(storeId: string, phone: string): Promise<HiqMember | undefined> {
        const [member] = await db.select().from(hiqMembers).where(
            and(
                eq(hiqMembers.storeId, storeId),
                eq(hiqMembers.phone, phone)
            )
        );
        return member;
    }

    // 내부 전용 — 전 컬럼(phone·계좌·profileId 포함). 알림 발송·본인 조회 등 서버 내부에서만 쓴다.
    // 남의 정보를 응답으로 내보낼 때는 절대 쓰지 말고 getMemberPublicById를 쓸 것.
    /** 앱 언어 — 푸시를 받는 사람 언어로 만들 때 쓴다(GET /me 가 바뀔 때만 부른다). */
    async setMemberLocale(id: string, locale: string): Promise<void> {
        await db.update(hiqMembers).set({ locale }).where(eq(hiqMembers.id, id));
    }

    async getMemberById(id: string): Promise<HiqMember | undefined> {
        const [member] = await db.select().from(hiqMembers).where(eq(hiqMembers.id, id));
        return member;
    }

    // 타인 프로필 조회용 — 민감 컬럼 제외
    async getMemberPublicById(id: string): Promise<any | undefined> {
        const [member] = await db.select(PUBLIC_MEMBER_COLUMNS).from(hiqMembers).where(eq(hiqMembers.id, id));
        return member;
    }

    async createMember(memberData: InsertHiqMember): Promise<HiqMember> {
        const [member] = await db
            .insert(hiqMembers)
            .values(memberData)
            .returning();
        return member;
    }

    async updateMember(id: string, data: Partial<HiqMember>): Promise<HiqMember> {
        const [member] = await db
            .update(hiqMembers)
            .set(data)
            .where(eq(hiqMembers.id, id))
            .returning();
        return member;
    }

    async incrementVisitCount(id: string): Promise<void> {
        const [member] = await db.select().from(hiqMembers).where(eq(hiqMembers.id, id));
        if (!member) return;

        const now = new Date();
        const lastVisit = member.lastVisitedAt;

        // 하루 한 번만 — "하루"는 한국 날짜. 서버(UTC)의 getDate() 로 비교하면 한국 오전 9시에 날이 바뀌어
        // 전날 밤 10시와 다음 날 아침 8시 방문이 같은 날로 묶여 한 번이 빠졌다.
        const kstDay = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
        const isSameDay = !!lastVisit && kstDay(lastVisit) === kstDay(now);

        if (!isSameDay) {
            await db
                .update(hiqMembers)
                .set({
                    visitCount: sql`${hiqMembers.visitCount} + 1`,
                    lastVisitedAt: now,
                    updatedAt: now
                })
                .where(eq(hiqMembers.id, id));

            // Log the visit for stats
            await db.insert(hiqVisitLogs).values({ memberId: id });
        }
    }

    // 랭킹 — 매장(하이퍼로컬)·국가·글로벌을 같은 쿼리 축으로. countryCode 지정 시 국가 랭킹.
    /**
     * 랭킹 상위 N명. **종목마다 줄 세우는 축이 다르다** — 당구는 RP 내림차순, 골프는 평균 타수 오름차순.
     *
     * 2026-09-09 이전엔 sport 인자가 아예 없었다. 골프 랭킹 화면도 이 함수를 썼는데 정렬축이 당구 RP 라,
     * "당구 RP 상위 20명 중 골프 기록이 있는 사람"이 골프 랭킹으로 나왔다. 당구를 안 치는 순수 골퍼는
     * RP 0 이라 꼬리로 밀려 잘렸고, 반대로 당구 고수가 골프 랭킹 위에 앉았다. 반대 방향 오염도 있었다 —
     * 골프만 하는 사람이 당구 랭킹 20칸을 잠식했다.
     */
    async getTopRankings(storeId?: string, limit: number = 20, type: '3c' | '4c' = '4c', countryCode?: string, sport: 'BILLIARDS' | 'GOLF' = 'BILLIARDS'): Promise<any[]> {
        const isGolf = sport === 'GOLF';
        const field = type === '3c' ? hiqMembers.rating3c : hiqMembers.rating4c;

        const conditions: any[] = [
            // 탈퇴 회원은 익명화만 하고 행을 남기므로(전적 보존) 명시적으로 걸러야 한다.
            ne(hiqMembers.name, "탈퇴회원"),
            // 한 판도 안 친 사람은 뺀다. 기준은 그 종목의 기록이다.
            isGolf
                ? or(gt(hiqMembers.totalGolfGames, 0), gt(hiqMembers.golfHandicap, 0))
                : gt(field, 0),
        ];
        if (storeId) {
            conditions.push(eq(hiqMembers.storeId, storeId));
        } else if (countryCode) {
            conditions.push(eq(profiles.countryCode, countryCode));
        }

        const rows = await db.select({
            // 랭킹 카드는 Lv. 표기에 visitCount를 쓰므로 공개 컬럼에 그것만 더한다.
            member: { ...PUBLIC_MEMBER_COLUMNS, visitCount: hiqMembers.visitCount },
            handle: profiles.handle,
            countryCode: profiles.countryCode,
        })
            .from(hiqMembers)
            .leftJoin(profiles, eq(hiqMembers.profileId, profiles.id))
            .where(and(...conditions))
            // 골프는 타수가 낮을수록 잘 친 것 — 평균이 없으면 핸디캡으로 어림잡는다(파 72 기준).
            .orderBy(isGolf
                ? asc(sql`COALESCE(NULLIF(${hiqMembers.golfAvgScore}, 0), ${hiqMembers.golfHandicap} + 72)`)
                : desc(field))
            .limit(limit);

        const members = rows.map((r) => ({ ...r.member, handle: r.handle, countryCode: r.countryCode } as any));

        // 아래 에버리지 보정은 당구 전용(3쿠션·4구 경기 기록을 센다) — 골프는 그대로 돌려준다.
        if (isGolf) return members;

        // Calculate Official AVG for each member based on Game History
        const enhancedMembers = await Promise.all(members.map(async (member) => {
            const stats = await db.select({
                totalScore: sql<number>`sum(${hiqGameHistory.score})`,
                totalInnings: sql<number>`sum(${hiqGameHistory.innings})`
            })
                .from(hiqGameHistory)
                .where(and(
                    eq(hiqGameHistory.memberId, member.id),
                    eq(hiqGameHistory.gameType, type),
                    eq(hiqGameHistory.gameMode, 'match'),
                    eq(hiqGameHistory.isRanked, true)
                ));

            const totalScore = Number(stats[0]?.totalScore || 0);
            const totalInnings = Number(stats[0]?.totalInnings || 0);
            const officialAvg = totalInnings > 0
                ? (totalScore / totalInnings).toFixed(3)
                : "0.000";

            return {
                ...member,
                average: officialAvg // Override with official calculated average
            };
        }));

        return enhancedMembers;
    }

    /**
     * 초대 목록용 **이름만** — 온라인 대전(simMatch)이 쓴다.
     * getAvailableOpponents 는 실전 다마수·에버리지·레이팅 칸을 통째로 실어 오는데, 시뮬레이터는 그 값을 읽지도 쓰지도
     * 않는다는 게 규칙이다(sim.guard.test, 2026-08-30 오염 사고). 그래서 여기서는 id·이름만 뽑는다.
     */
    async listStoreMemberNames(storeId: string, excludeId: string, limit = 200): Promise<{ id: string; name: string }[]> {
        const rows = await db.select({ id: hiqMembers.id, name: hiqMembers.name, updatedAt: hiqMembers.updatedAt })
            .from(hiqMembers)
            .where(and(eq(hiqMembers.storeId, storeId), ne(hiqMembers.id, excludeId)))
            .orderBy(desc(hiqMembers.updatedAt), hiqMembers.name)
            .limit(limit);
        return rows.map((r) => ({ id: String(r.id), name: r.name }));
    }

    /** 초대 목록용 이름 — 다른 매장 친구·최근 대전 상대처럼 id 만 아는 사람들. 순서는 ids 순서를 지킨다. */
    async listMemberNamesByIds(ids: readonly string[]): Promise<{ id: string; name: string }[]> {
        if (ids.length === 0) return [];
        const rows = await db.select({ id: hiqMembers.id, name: hiqMembers.name })
            .from(hiqMembers)
            .where(inArray(hiqMembers.id, ids as string[]));
        const byId = new Map<string, string>(rows.map((r) => [String(r.id), String(r.name)]));
        return ids.filter((id) => byId.has(id)).map((id) => ({ id, name: byId.get(id)! }));
    }

    /** 친구 id 만 — getFriends 는 친구마다 상대전적을 계산한다(N+1). 목록 정렬에만 쓸 때는 이걸 쓴다. */
    async listFriendIds(memberId: string, sport: "BILLIARDS" | "GOLF" = "BILLIARDS"): Promise<string[]> {
        const rows = await db.select({ a: hiqFriendships.requesterId, b: hiqFriendships.receiverId })
            .from(hiqFriendships)
            .where(and(
                eq(hiqFriendships.sportCategory, sport),
                eq(hiqFriendships.status, "accepted"),
                or(eq(hiqFriendships.requesterId, memberId), eq(hiqFriendships.receiverId, memberId)),
            ));
        return rows.map((r) => (String(r.a) === memberId ? String(r.b) : String(r.a)));
    }

    async getAvailableOpponents(storeId: string, currentUserId: string, sport: "BILLIARDS" | "GOLF" = "BILLIARDS"): Promise<any[]> {
        const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);

        const members = await db
            // 상대 선택 화면은 '최근 방문' 뱃지에 updatedAt을 쓴다(정렬 축이기도 하다).
            .select({ ...PUBLIC_MEMBER_COLUMNS, updatedAt: hiqMembers.updatedAt })
            .from(hiqMembers)
            .where(
                and(
                    eq(hiqMembers.storeId, storeId),
                    sql`${hiqMembers.id} != ${currentUserId}`
                )
            )
            .orderBy(
                sql`CASE WHEN ${hiqMembers.updatedAt} >= ${threeHoursAgo} THEN 0 ELSE 1 END`,
                desc(hiqMembers.updatedAt),
                hiqMembers.name
            );

        if (sport === 'GOLF') {
            // Filter for Golf players and map stats
            return members
                .filter(m => (m.totalGolfGames > 0 || m.golfBestScore > 0)) // Only show golfers
                .map(m => ({
                    ...m,
                    average: m.golfAvgScore ? m.golfAvgScore.toFixed(1) : "0.0", // Show Golf Avg
                    handi4c: m.golfHandicap || 0, // Reuse handi field for display if needed
                }));
        }

        return members;
    }

    async getAllMembers(storeId: string): Promise<HiqMember[]> {
        return await db
            .select()
            .from(hiqMembers)
            .where(eq(hiqMembers.storeId, storeId))
            .orderBy(sql`${hiqMembers.createdAt} DESC`);
    }

    /**
     * 사장님 대시보드 회원 목록. **보여 줄 칸만** 고른다 — 예전엔 hiq_members 전체 행을 그대로 내려
     * 정산 계좌번호·알림 설정·약관 동의 같은 사장님이 볼 이유가 없는 값까지 매장 화면으로 나갔다.
     * memo 는 사장님 메모(hiq_club_members.memo), 이번 달은 한국 기준 1일 0시부터.
     */
    async getStoreMembersWithStats(storeId: string) {
        const rows = (await db.execute(sql`
            select m.id, m.name, m.phone, m.gender, m.birth_year,
                   m.handi_3c, m.handi_4c, m.rating_3c, m.rating_4c, m.avg_3c, m.avg_4c,
                   coalesce(m.visit_count, 0)::int as visit_count,
                   to_char(m.last_visited_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as last_visited_at,
                   to_char(m.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
                   m.marketing_agree,
                   cm.memo,
                   (select count(*)::int from hiq_game_history h
                      where h.member_id = m.id
                        and h.created_at >= date_trunc('month', now() at time zone 'Asia/Seoul') - interval '9 hours') as monthly_game_count
            from hiq_members m
            left join hiq_club_members cm on cm.store_id = m.store_id and cm.member_id = m.id
            where m.store_id = ${storeId}
            order by m.created_at desc`)).rows as Record<string, unknown>[];
        const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
        return rows.map((r) => ({
            id: String(r.id),
            name: String(r.name ?? ""),
            phone: String(r.phone ?? ""),
            gender: (r.gender as "male" | "female" | null) ?? null,
            birthYear: num(r.birth_year),
            handi3c: num(r.handi_3c),
            handi4c: num(r.handi_4c),
            rating3c: Number(r.rating_3c ?? 0),
            rating4c: Number(r.rating_4c ?? 0),
            avg3c: Number(r.avg_3c ?? 0),
            avg4c: Number(r.avg_4c ?? 0),
            visitCount: Number(r.visit_count ?? 0),
            lastVisitedAt: (r.last_visited_at as string | null) ?? null,
            createdAt: String(r.created_at ?? ""),
            marketingAgree: r.marketing_agree === true,
            memo: (r.memo as string | null) ?? null,
            monthlyGameCount: Number(r.monthly_game_count ?? 0),
        }));
    }

    /** 사장님 메모 저장 — 그 매장으로 가입한 회원에게만. 없으면 false. */
    async setStoreMemberMemo(storeId: string, memberId: string, memo: string | null): Promise<boolean> {
        const [m] = await db.select({ id: hiqMembers.id }).from(hiqMembers)
            .where(and(eq(hiqMembers.id, memberId), eq(hiqMembers.storeId, storeId)));
        if (!m) return false;
        await db.execute(sql`
            insert into hiq_club_members (store_id, member_id, memo) values (${storeId}, ${memberId}, ${memo})
            on conflict (store_id, member_id) do update set memo = excluded.memo`);
        return true;
    }

    async getMembersByPhone(phone: string): Promise<HiqMember[]> {
        return await db.select().from(hiqMembers).where(eq(hiqMembers.phone, phone));
    }

    async getFriends(memberId: string, sport: string = "BILLIARDS"): Promise<any[]> {
        const friends = await db.select({
            friend: PUBLIC_MEMBER_COLUMNS,
            profile: profiles,
            status: hiqFriendships.status
        })
            .from(hiqFriendships)
            .innerJoin(hiqMembers, or(
                eq(hiqFriendships.receiverId, hiqMembers.id),
                eq(hiqFriendships.requesterId, hiqMembers.id)
            ))
            .leftJoin(profiles, eq(hiqMembers.profileId, profiles.id))
            .where(
                and(
                    or(
                        eq(hiqFriendships.requesterId, memberId),
                        eq(hiqFriendships.receiverId, memberId)
                    ),
                    eq(hiqFriendships.sportCategory, sport as "BILLIARDS" | "GOLF"),
                    sql`${hiqMembers.id} != ${memberId}`
                )
            );

        // A→B, B→A 양방향 행이 다 있으면 같은 상대가 두 번 나온다 — 상대 id로 접는다.
        // 상태가 갈리면 accepted 우선(한쪽만 수락된 레거시 행 대비).
        const uniqueFriends = new Map<string, any>();
        for (const f of friends) {
            const prev = uniqueFriends.get(f.friend.id);
            if (!prev || (prev.status !== "accepted" && f.status === "accepted")) {
                uniqueFriends.set(f.friend.id, f);
            }
        }

        const result: any[] = [];
        for (const f of uniqueFriends.values()) {
            const h2h = await this.getHeadToHeadStats(memberId, f.friend.id, sport);
            result.push({
                ...f.friend,
                status: f.status,
                profileImageUrl: f.profile?.profileImageUrl,
                nickname: f.profile?.nickname || f.friend.name,
                h2h: {
                    wins: h2h.myWins,
                    losses: h2h.friendWins,
                    draws: h2h.draws
                }
            });
        }
        return result;
    }

    /**
     * 이미 라이벌(친구)인가 — 한 줄 확인용. getFriends 는 친구마다 상대전적을 한 번씩 더 읽으므로(N+1)
     * "버튼을 켤까 말까"만 알고 싶을 때는 쓰지 않는다. 방향은 둘 다 본다(누가 먼저 추가했든 관계는 하나다).
     */
    async isFriend(memberId: string, otherId: string, sport: "BILLIARDS" | "GOLF" = "BILLIARDS"): Promise<boolean> {
        const [row] = await db.select({ id: hiqFriendships.id }).from(hiqFriendships).where(and(
            eq(hiqFriendships.sportCategory, sport),
            eq(hiqFriendships.status, "accepted"), // 레거시 pending 행이 남아 있다 — 1:1 방 개설의 문지기로 쓰이므로 수락된 관계만
            or(
                and(eq(hiqFriendships.requesterId, memberId), eq(hiqFriendships.receiverId, otherId)),
                and(eq(hiqFriendships.requesterId, otherId), eq(hiqFriendships.receiverId, memberId)),
            ),
        )).limit(1);
        return !!row;
    }

    async createFriendship(requesterId: string, receiverId: string, sportCategory: "BILLIARDS" | "GOLF" = "BILLIARDS"): Promise<any> {
        const [friendship] = await db.insert(hiqFriendships).values({
            requesterId,
            receiverId,
            sportCategory,
            status: 'accepted'
        }).returning();
        return friendship;
    }

    async requestFriend(requesterId: string, receiverId: string, sportCategory: "BILLIARDS" | "GOLF" = "BILLIARDS"): Promise<any> {
        return this.createFriendship(requesterId, receiverId, sportCategory);
    }

    /**
     * 기기 푸시 토큰 저장. 한 기기(토큰)는 한 번에 한 계정에만 묶는다 — 공용 태블릿·가족 폰에서 B 로
     * 로그인했는데 A 의 크루 채팅 원문까지 계속 뜨던 문제(감사 P4). 그래서 같은 토큰을 쥔 다른 프로필을
     * 먼저 비운다(NULL). 옛 래퍼가 접두사 없이 저장한 표기도 같은 기기로 본다.
     */
    async updatePushToken(memberId: string, token: string): Promise<void> {
        const [member] = await db.select({ profileId: hiqMembers.profileId }).from(hiqMembers).where(eq(hiqMembers.id, memberId));
        if (!member?.profileId) return;
        if (!token) {
            await this.clearPushToken(memberId);
            return;
        }
        await db.update(profiles)
            .set({ pushToken: null })
            .where(and(inArray(profiles.pushToken, pushTokenVariants(token)), ne(profiles.id, member.profileId)));
        await db.update(profiles)
            .set({ pushToken: token, updatedAt: new Date() })
            .where(eq(profiles.id, member.profileId));
    }

    /**
     * 이 회원 프로필의 푸시 토큰을 비운다. expected 가 있으면 저장된 토큰이 바로 그 기기일 때만 —
     * 로그아웃한 기기가 아닌 다른 기기의 토큰이거나, 죽은 토큰을 지우는 사이 새 토큰이 들어왔으면 건드리지 않는다.
     * '' 가 아니라 NULL 로 쓴다: 푸시 가능 회원 조회(notification.repo listPushableMembers)는 NULL 만 걸러서
     * '' 는 방송 대상 300명 상한에 섞였다(감사 P14). 지웠으면 true.
     */
    async clearPushToken(memberId: string, expected?: string): Promise<boolean> {
        const [member] = await db.select({ profileId: hiqMembers.profileId }).from(hiqMembers).where(eq(hiqMembers.id, memberId));
        if (!member?.profileId) return false;
        const rows = await db.update(profiles)
            .set({ pushToken: null })
            .where(expected
                ? and(eq(profiles.id, member.profileId), inArray(profiles.pushToken, pushTokenVariants(expected)))
                : eq(profiles.id, member.profileId))
            .returning({ id: profiles.id });
        return rows.length > 0;
    }

    // --- Private / Shared Helpers ---
    private async getHeadToHeadStats(myId: string, friendId: string, sport: string = "BILLIARDS") {
        const games = await db.select()
            .from(hiqGameHistory)
            .innerJoin(hiqGames, eq(hiqGameHistory.gameId, hiqGames.id))
            .where(
                and(
                    eq(hiqGameHistory.memberId, myId),
                    eq(hiqGames.sportCategory, sport as "BILLIARDS" | "GOLF"),
                    or(
                        eq(hiqGames.player1Id, friendId),
                        eq(hiqGames.player2Id, friendId),
                        eq(hiqGames.player3Id, friendId),
                        eq(hiqGames.player4Id, friendId)
                    )
                )
            );

        // 승패는 hiqGames.winnerId로 판정한다. isWinner만 보고 friendWins = total - myWins로 빼면
        // 3~4인 경기에서 제3자가 이긴 판까지 상대 승으로 잡히고, 무승부(winnerId 없음)가 사라진다.
        let myWins = 0;
        let friendWins = 0;
        let draws = 0;
        for (const g of games) {
            const winnerId = g.hiq_games.winnerId;
            if (winnerId === myId) myWins++;
            else if (winnerId === friendId) friendWins++;
            else draws++; // 무승부이거나 제3자 승 — 둘 사이의 승패로는 치지 않는다
        }
        const total = games.length;

        return {
            total,
            myWins,
            friendWins,
            draws,
            winRate: total > 0 ? Math.round((myWins / total) * 100) : 0
        };
    }

    // 계정 삭제 (App Store 5.1.1(v) 인앱 계정 삭제) — 개인정보는 완전 삭제하고,
    // 상대방 전적 보존을 위해 경기 기록이 FK로 참조하는 hiqMembers 행만 "탈퇴회원"으로
    // 익명화해 남긴다. 반환된 프로필 이미지 URL의 Blob 정리는 호출부 책임.
    async deleteAccount(memberId: string): Promise<{ profileImageUrl: string | null }> {
        const [member] = await db.select().from(hiqMembers).where(eq(hiqMembers.id, memberId));
        if (!member) throw new Error("회원을 찾을 수 없습니다");

        let profileImageUrl: string | null = null;
        const profileId = member.profileId;
        if (profileId) {
            const [profile] = await db.select().from(profiles).where(eq(profiles.id, profileId));
            profileImageUrl = profile?.profileImageUrl ?? null;
        }

        await db.transaction(async (tx) => {
            // 0. 내가 리더인 크루는 리더를 넘기고 나간다. 안 그러면 leaderId가 탈퇴회원을 가리켜
            //    아무도 관리할 수 없는 좀비 크루가 된다.
            const ledCrews = await tx.select({ id: hiqCrews.id })
                .from(hiqCrews)
                .where(eq(hiqCrews.leaderId, memberId));

            for (const crew of ledCrews) {
                const candidates = await tx.select({
                    memberId: hiqCrewMembers.memberId,
                    role: hiqCrewMembers.role,
                })
                    .from(hiqCrewMembers)
                    .where(and(
                        eq(hiqCrewMembers.crewId, crew.id),
                        ne(hiqCrewMembers.memberId, memberId)
                    ))
                    .orderBy(asc(hiqCrewMembers.joinedAt));

                // 운영진 우선, 없으면 가장 오래된 멤버. pending은 아직 승인 전이라 제외.
                const successor = candidates.find(c => c.role === "manage")
                    ?? candidates.find(c => c.role === "member");

                // 남은 멤버가 아무도 없으면 크루는 그대로 둔다 — 자식 테이블(게시글·정산·투표…)이 많아
                // 여기서 삭제하는 건 위험하다.
                if (!successor) continue;

                await tx.update(hiqCrews).set({ leaderId: successor.memberId }).where(eq(hiqCrews.id, crew.id));
                await tx.update(hiqCrewMembers).set({ role: "leader" }).where(and(
                    eq(hiqCrewMembers.crewId, crew.id),
                    eq(hiqCrewMembers.memberId, successor.memberId)
                ));
            }

            // 1. 소셜/알림/초대/크루 멤버십 삭제
            await tx.delete(hiqFriendships).where(or(eq(hiqFriendships.requesterId, memberId), eq(hiqFriendships.receiverId, memberId)));
            await tx.delete(hiqInvites).where(or(eq(hiqInvites.hostId, memberId), eq(hiqInvites.guestId, memberId)));
            await tx.delete(hiqNotifications).where(eq(hiqNotifications.memberId, memberId));
            await tx.delete(hiqCrewMembers).where(eq(hiqCrewMembers.memberId, memberId));
            // 골프 관심 골프장·지역 알림 — 회원 행이 '탈퇴회원'으로 남아 FK cascade 가 돌지 않는다. 남겨 두면 떠난 사람에게 알림 행이 계속 쌓인다.
            await tx.execute(sql`delete from golf_course_watches where member_id = ${memberId}::uuid`);
            await tx.execute(sql`delete from golf_area_alerts where member_id = ${memberId}::uuid`);

            // 골프 조인·부킹 글(2026-10-06) — **가리고**(is_blinded) 글에 복사돼 있던 **내 번호를 비운다**(manager_phone).
            // 부킹 글을 올리면 계정 휴대폰이 글 행에 복사된다(golf.ts POST /bookings). 탈퇴는 회원 행의 번호만 `del-…` 로 바꿨고
            // 글은 그대로 남아, 떠난 사람의 번호가 목록(매장 글)·확정자 화면·채팅방 정보로 계속 나갔다 —
            // 탈퇴 안내(개인정보는 즉시 영구 삭제된다)와 실제가 달랐다.
            //  - 지우지 않고 가린다: 신청 행·채팅방 열쇠(listing:<id>)가 이 id 에 걸려 있고, 가린 글은 목록·상세·내 신청에서 이미 빠진다.
            //  - manager_phone 은 NOT NULL 이라 빈 문자열로 둔다(조인 글이 원래 "" 를 쓴다).
            //  - 옛 글(2026-09-09 이전, owner_id 가 비어 있다)은 번호로 되짚는다 — 아래에서 회원 행을 익명화하기 **전에 읽은** 번호다.
            //    소셜·탈퇴 자리표시자나 빈 값으로는 되짚지 않는다(빈 번호의 남의 옛 글까지 가려진다).
            //  - 신고·운영자 조치로 이미 가려져 사유가 적힌 글은 그 사유를 남긴다(되짚을 기록이다).
            const legacyPhone = isLoginPhone(member.phone) ? member.phone : null;
            await tx.update(golfBookings)
                .set({
                    managerPhone: "",
                    isBlinded: true,
                    blindReason: sql`case when ${golfBookings.isBlinded} and ${golfBookings.blindReason} is not null then ${golfBookings.blindReason} else ${WITHDRAWN_LISTING_REASON} end`,
                })
                .where(or(
                    eq(golfBookings.ownerId, memberId),
                    legacyPhone ? and(isNull(golfBookings.ownerId), eq(golfBookings.managerPhone, legacyPhone)) : undefined,
                ));

            // 2. 회원 행 익명화 — phone은 notNull+unique(storeId,phone)이라 고유 placeholder로 대체.
            //    레이팅/평균/방문 0 초기화로 랭킹·상대 검색에서 실질적으로 사라진다.
            await tx.update(hiqMembers).set({
                name: "탈퇴회원",
                phone: `del-${memberId.slice(0, 12)}`,
                birthYear: null,
                gender: null,
                average: null,
                introduction: null,
                marketingAgree: false,
                defaultAccountBank: null,
                defaultAccountNumber: null,
                defaultAccountHolder: null,
                rating3c: 0,
                rating4c: 0,
                avg3c: 0,
                avg4c: 0,
                visitCount: 0,
                profileId: null,
            }).where(eq(hiqMembers.id, memberId));

            // 3. 프로필(전화·비밀번호·이메일·푸시토큰) 하드 삭제 — nullable FK를 먼저 끊는다.
            if (profileId) {
                await tx.update(hiqStores).set({ ownerId: null }).where(eq(hiqStores.ownerId, profileId));
                await tx.update(hiqMembers).set({ profileId: null }).where(eq(hiqMembers.profileId, profileId));
                await tx.update(suggestions).set({ userId: null }).where(eq(suggestions.userId, profileId));
                await tx.delete(profiles).where(eq(profiles.id, profileId));
            }
        });

        return { profileImageUrl };
    }
}
