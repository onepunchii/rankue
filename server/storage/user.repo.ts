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
    suggestions
} from "../../shared/schema.js";
import type {
    Profile,
    InsertHiqMember,
    HiqMember
} from "../../shared/schema.js";
import { eq, desc, asc, and, or, ne, sql, gt, gte, inArray } from "drizzle-orm";

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
    async getProfileBySocialSub(provider: "google" | "apple", sub: string): Promise<Profile | undefined> {
        const col = provider === "google" ? profiles.googleSub : profiles.appleSub;
        const [profile] = await db.select().from(profiles).where(eq(col, sub));
        return profile;
    }

    // 프로필에 연결된 멤버 조회(글로벌 스토어 우선) — 소셜 로그인 세션 발급용
    async getMemberByProfileId(profileId: string): Promise<HiqMember | undefined> {
        const [member] = await db.select().from(hiqMembers)
            .where(eq(hiqMembers.profileId, profileId))
            .orderBy(asc(hiqMembers.createdAt))
            .limit(1);
        return member;
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

        // Only increment if last visit was not today
        const isSameDay = lastVisit &&
            lastVisit.getFullYear() === now.getFullYear() &&
            lastVisit.getMonth() === now.getMonth() &&
            lastVisit.getDate() === now.getDate();

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
    async getTopRankings(storeId?: string, limit: number = 20, type: '3c' | '4c' = '4c', countryCode?: string): Promise<any[]> {
        const field = type === '3c' ? hiqMembers.rating3c : hiqMembers.rating4c;

        const conditions: any[] = [
            // 탈퇴 회원은 익명화만 하고 행을 남기므로(전적 보존) 명시적으로 걸러야 한다.
            ne(hiqMembers.name, "탈퇴회원"),
            // 0 RP(=한 판도 안 친 신규 가입자)는 랭킹에서 뺀다. 단 이 엔드포인트는 골프 랭킹 화면도
            // 같이 쓰는데 골퍼는 당구 RP가 0일 수 있어, 골프 활동이 있으면 남긴다.
            or(gt(field, 0), gt(hiqMembers.totalGolfGames, 0), gt(hiqMembers.golfHandicap, 0)),
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
            .orderBy(desc(field))
            .limit(limit);

        const members = rows.map((r) => ({ ...r.member, handle: r.handle, countryCode: r.countryCode } as any));

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

    async getStoreMembersWithStats(storeId: string) {
        const members = await this.getAllMembers(storeId);
        if (members.length === 0) return [];

        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const gameCounts = await db.select({
            memberId: hiqGameHistory.memberId,
            count: sql<number>`count(*)`
        })
            .from(hiqGameHistory)
            .where(and(
                inArray(hiqGameHistory.memberId, members.map(m => m.id)),
                gte(hiqGameHistory.createdAt, startOfMonth)
            ))
            .groupBy(hiqGameHistory.memberId);

        const countMap = new Map(gameCounts.map(c => [c.memberId, Number(c.count)]));

        return members.map(m => ({
            ...m,
            monthlyGameCount: countMap.get(m.id) || 0
        }));
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

    async updatePushToken(memberId: string, token: string): Promise<void> {
        const [member] = await db.select().from(hiqMembers).where(eq(hiqMembers.id, memberId));
        if (member && member.profileId) {
            await db.update(profiles)
                .set({ pushToken: token, updatedAt: new Date() })
                .where(eq(profiles.id, member.profileId));
        }
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
