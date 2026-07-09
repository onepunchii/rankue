import { db } from "../db.js";
import {
    golfBookings,
    golfJoins,
    golfMatchSessions,
    hiqGameHistory,
    hiqCourseHoleInfo,
    hiqMembers,
    profiles,
    golfClubs,
    golfClubCourses,
    rankueGolfClubs,
    rankueGolfCourses,
    golfMembershipOrders
} from "../../shared/schema.js";
import type {
    InsertGolfBooking,
    GolfBooking,
    InsertGolfJoin,
    GolfJoin,
    HiqGameHistory,
    GolfClub,
    InsertGolfClub,
    GolfClubCourse,
    InsertGolfClubCourse,
    RankueGolfClub,
    RankueGolfCourse,
    InsertGolfMembershipOrder,
    GolfMembershipOrder
} from "../../shared/schema.js";
import { eq, ne, desc, asc, and, or, sql, gte, lte, isNull, like } from "drizzle-orm";
import { notFound, conflict } from "../utils/errors.js";

export const GOLF_GRADES = [
    { id: 'ALBATROSS', label: 'Albatross', minHandi: -Infinity, maxHandi: 0, icon: '🏆', color: '#c0c0c0' },
    { id: 'EAGLE', label: 'Eagle', minHandi: 1, maxHandi: 9, icon: '🦅', color: '#FFD700' },
    { id: 'BIRDIE', label: 'Birdie', minHandi: 10, maxHandi: 18, icon: '🐦', color: '#10b981' },
    { id: 'PAR', label: 'Par', minHandi: 19, maxHandi: 27, icon: '⭕', color: '#3b82f6' },
    { id: 'BOGEY', label: 'Bogey', minHandi: 28, maxHandi: 36, icon: '⬜', color: '#94a3b8' },
    { id: 'ROOKIE', label: 'Rookie', minHandi: 37, maxHandi: Infinity, icon: '🐣', color: '#CD7F32' },
];

export class GolfRepository {
    async createGolfBooking(data: InsertGolfBooking): Promise<GolfBooking> {
        const [booking] = await db.insert(golfBookings).values(data).returning();
        return booking;
    }

    // --- Golf Club & Course Management (Updated to use Rankue Official DB) ---
    async getGolfClubs(search?: string, userLat?: number, userLng?: number): Promise<any[]> {
        let clubs;
        if (search) {
            clubs = await db.select().from(rankueGolfClubs)
                .where(like(rankueGolfClubs.name, `%${search}%`))
                .orderBy(asc(rankueGolfClubs.name));
        } else {
            clubs = await db.select().from(rankueGolfClubs).orderBy(asc(rankueGolfClubs.name));
        }

        // Calculate distance and sort if user location is provided
        let result = clubs.map(c => ({
            ...c,
            totalHoles: 18, // Default
            imageUrl: "https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?auto=format&fit=crop&q=80&w=800",
            distance: (userLat && userLng && c.latitude && c.longitude)
                ? getDistanceFromLatLonInKm(userLat, userLng, c.latitude, c.longitude)
                : undefined
        }));

        if (userLat && userLng) {
            result.sort((a, b) => {
                if (a.distance !== undefined && b.distance !== undefined) {
                    return a.distance - b.distance;
                }
                return 0;
            });
        }

        return result;
    }

    async getGolfClubCourses(clubId: string): Promise<RankueGolfCourse[]> {
        return await db.select().from(rankueGolfCourses)
            .where(eq(rankueGolfCourses.clubId, clubId))
            .orderBy(asc(rankueGolfCourses.name));
    }

    async createGolfClub(data: InsertGolfClub): Promise<GolfClub> {
        const [club] = await db.insert(golfClubs).values(data).returning();
        return club;
    }

    async createGolfClubCourse(data: InsertGolfClubCourse): Promise<GolfClubCourse> {
        const [course] = await db.insert(golfClubCourses).values(data).returning();
        return course;
    }

    async getGolfBookings(date?: string, filters?: any): Promise<GolfBooking[]> {
        const conditions: any[] = [];
        if (date) {
            const targetDate = new Date(date);
            const start = new Date(targetDate);
            start.setUTCHours(start.getUTCHours() - 9);

            const end = new Date(start);
            end.setDate(end.getDate() + 1);
            end.setMilliseconds(-1);

            conditions.push(and(gte(golfBookings.datetime, start), lte(golfBookings.datetime, end)));
        } else if (filters?.startDate && filters?.endDate) {
            const start = new Date(filters.startDate);
            start.setUTCHours(start.getUTCHours() - 9);

            const end = new Date(filters.endDate);
            end.setUTCHours(end.getUTCHours() + 14, 59, 59, 999);

            conditions.push(and(gte(golfBookings.datetime, start), lte(golfBookings.datetime, end)));
        }

        if (filters) {
            if (filters.region && filters.region !== "") {
                const regionIds = filters.region.split(',');
                const regionMap: Record<string, string | string[]> = {
                    'kyunggi_south': ['경기', '서울', '남부'],
                    'kyunggi_north': '경기',
                    'kyunggi_east': '경기',
                    'incheon_west': ['인천', '서부'],
                    'gangwon': '강원',
                    'chungcheong': ['충북', '충남', '대전', '세종', '충청'],
                    'jeolla': ['전북', '전남', '광주', '전라'],
                    'gyeongsang': ['경북', '경남', '대구', '부산', '울산', '경상'],
                    'jeju': ['제주']
                };

                const flatMappedRegions: string[] = [];
                regionIds.forEach((id: string) => {
                    const mapped = (regionMap as any)[id];
                    if (Array.isArray(mapped)) {
                        flatMappedRegions.push(...mapped);
                    } else if (typeof mapped === 'string') {
                        flatMappedRegions.push(mapped);
                    }
                });

                if (flatMappedRegions.length > 0) {
                    conditions.push(or(...flatMappedRegions.map(r => like(golfBookings.region, `%${r}%`))));
                }
            }

            if (filters.courseName && filters.courseName !== "") {
                conditions.push(
                    or(
                        like(golfBookings.courseName, `%${filters.courseName}%`),
                        like(golfBookings.blindName, `%${filters.courseName}%`)
                    )
                );
            }

            if (filters.listingType && filters.listingType !== 'ALL') {
                if (filters.listingType === 'BOOKING') {
                    conditions.push(or(eq(golfBookings.listingType, 'BOOKING'), isNull(golfBookings.listingType)));
                } else {
                    conditions.push(eq(golfBookings.listingType, filters.listingType));
                }
            }
        }

        const filteredConditions = conditions.filter((c): c is NonNullable<typeof c> => c !== undefined);

        return await db.select().from(golfBookings)
            .where(filteredConditions.length > 0 ? and(...filteredConditions) : undefined)
            .orderBy(asc(golfBookings.datetime));
    }

    async getGolfBookingCounts(startDate: string, endDate: string, viewType: string = 'ALL'): Promise<any> {
        const start = new Date(startDate);
        start.setUTCHours(start.getUTCHours() - 9);

        const end = new Date(endDate);
        end.setUTCHours(end.getUTCHours() + 14, 59, 59, 999);

        let whereCondition;

        if (viewType === 'JOIN') {
            whereCondition = and(
                gte(golfBookings.datetime, start),
                lte(golfBookings.datetime, end),
                eq(golfBookings.listingType, 'JOIN')
            );
        } else if (viewType === 'BOOKING') {
            whereCondition = and(
                gte(golfBookings.datetime, start),
                lte(golfBookings.datetime, end),
                or(
                    eq(golfBookings.listingType, 'BOOKING'),
                    isNull(golfBookings.listingType)
                )
            );
        } else {
            whereCondition = and(
                gte(golfBookings.datetime, start),
                lte(golfBookings.datetime, end)
            );
        }

        return await db.select({
            date: sql<string>`to_char(${golfBookings.datetime} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD')`,
            count: sql<number>`count(*)::int`
        })
            .from(golfBookings)
            .where(whereCondition)
            .groupBy(sql`to_char(${golfBookings.datetime} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD')`);
    }

    async deleteGolfBooking(id: string, managerPhone?: string): Promise<boolean> {
        // When an owner phone is supplied, scope the delete to that owner so a user can't
        // delete someone else's booking by guessing the id (IDOR). Returns whether a row matched.
        const deleted = await db.delete(golfBookings)
            .where(managerPhone
                ? and(eq(golfBookings.id, id), eq(golfBookings.managerPhone, managerPhone))
                : eq(golfBookings.id, id))
            .returning({ id: golfBookings.id });
        return deleted.length > 0;
    }

    async createGolfJoin(data: InsertGolfJoin): Promise<GolfJoin> {
        const [join] = await db.insert(golfJoins).values(data).returning();
        return join;
    }

    async getGolfJoins(filters?: any): Promise<GolfJoin[]> {
        const conditions: any[] = [];
        conditions.push(eq(golfBookings.listingType, 'JOIN'));

        if (filters?.date) {
            const targetDate = new Date(filters.date);
            const start = new Date(targetDate);
            start.setUTCHours(start.getUTCHours() - 9);

            const end = new Date(start);
            end.setDate(end.getDate() + 1);
            end.setMilliseconds(-1);

            conditions.push(and(gte(golfBookings.datetime, start), lte(golfBookings.datetime, end)));
        }

        if (filters?.region && filters.region !== "") {
            const regionIds = filters.region.split(',');
            const regionMap: Record<string, string | string[]> = {
                'kyunggi_south': ['경기', '서울', '남부'],
                'kyunggi_north': '경기',
                'kyunggi_east': '경기',
                'incheon_west': ['인천', '서부'],
                'gangwon': '강원',
                'chungcheong': ['충북', '충남', '대전', '세종', '충청'],
                'jeolla': ['전북', '전남', '광주', '전라'],
                'gyeongsang': ['경북', '경남', '대구', '부산', '울산', '경상'],
                'jeju': ['제주']
            };

            const flatMappedRegions: string[] = [];
            regionIds.forEach((id: string) => {
                const mapped = (regionMap as any)[id];
                if (Array.isArray(mapped)) {
                    flatMappedRegions.push(...mapped);
                } else if (typeof mapped === 'string') {
                    flatMappedRegions.push(mapped);
                }
            });

            if (flatMappedRegions.length > 0) {
                conditions.push(or(...flatMappedRegions.map(r => like(golfBookings.region, `%${r}%`))));
            }
        }

        const filteredConditions = conditions.filter((c): c is NonNullable<typeof c> => c !== undefined);

        return await db.select().from(golfBookings)
            .where(filteredConditions.length > 0 ? and(...filteredConditions) : undefined)
            .orderBy(asc(golfBookings.datetime));
    }

    async deleteGolfJoin(id: string, hostId?: string): Promise<boolean> {
        // Scope to the host so a user can't delete another user's join post (IDOR).
        const deleted = await db.delete(golfJoins)
            .where(hostId
                ? and(eq(golfJoins.id, id), eq(golfJoins.hostId, hostId))
                : eq(golfJoins.id, id))
            .returning({ id: golfJoins.id });
        return deleted.length > 0;
    }

    async updateGolfStats(userId: string): Promise<any> {
        // 1. Get all golf history for this member
        const history = await db.select().from(hiqGameHistory)
            .where(and(
                eq(hiqGameHistory.memberId, userId),
                eq(hiqGameHistory.sportCategory, 'GOLF' as any)
            ));

        if (history.length === 0) return null;

        // 2. Calculate Average Score
        const validGames = history.filter(h => h.score > 0);
        if (validGames.length === 0) return null;

        const totalScore = validGames.reduce((sum, h) => sum + h.score, 0);
        const avgScore = totalScore / validGames.length;
        const bestScore = Math.min(...validGames.map(h => h.score));

        // 3. Determine Grade based on Average Score (Handicap)
        let newGrade = '🐣 ROOKIE';
        if (avgScore <= 72) newGrade = '🏆 ALBATROSS';
        else if (avgScore <= 79) newGrade = '🦅 EAGLE';
        else if (avgScore <= 89) newGrade = '🐦 BIRDIE';
        else if (avgScore <= 99) newGrade = '⭕ PAR';
        else if (avgScore <= 109) newGrade = '⬜ BOGEY';

        // 4. Update Member Table
        const [member] = await db.select().from(hiqMembers).where(eq(hiqMembers.id, userId));
        if (!member) return null;

        await db.update(hiqMembers)
            .set({
                golfAvgScore: avgScore,
                golfBestScore: bestScore,
                golfGrade: newGrade,
                totalGolfGames: validGames.length,
                updatedAt: new Date()
            })
            .where(eq(hiqMembers.id, userId));

        return {
            oldGrade: member.golfGrade,
            newGrade,
            avgScore: avgScore.toFixed(1),
            totalRounds: validGames.length
        };
    }

    async getGolfPassportStats(memberId: string) {
        const history = await db.select().from(hiqGameHistory)
            .where(and(
                eq(hiqGameHistory.memberId, memberId),
                eq(hiqGameHistory.sportCategory, 'GOLF' as any)
            ));

        const uniqueCourses = new Set(history.map(h => h.locationName).filter(Boolean));
        const starsCollected = history.filter(h => h.score !== null && h.score < 85).length;

        let level = "골프 입문자";
        let levelNum = 1;
        if (uniqueCourses.size >= 30) { level = "골프 매니아"; levelNum = 4; }
        else if (uniqueCourses.size >= 10) { level = "골프 탐험가"; levelNum = 3; }
        else if (uniqueCourses.size >= 3) { level = "골프 비기너"; levelNum = 2; }

        return {
            conquered: uniqueCourses.size,
            starsCollected,
            rankPercent: Math.max(1, 15 - Math.floor(uniqueCourses.size / 2)),
            level,
            levelNum,
            totalCourses: 520
        };
    }

    async seedGolfSampleData(memberId: string) {
        // Check if already has data
        const [existing] = await db.select().from(hiqGameHistory)
            .where(and(
                eq(hiqGameHistory.memberId, memberId),
                eq(hiqGameHistory.sportCategory, 'GOLF' as any)
            ))
            .limit(1);

        if (existing) return; // Already has data

        const samples = [
            { locationName: "남서울 CC", region: "경기", score: 82, subType: "Membership" },
            { locationName: "스카이72(하늘)", region: "인천", score: 85, subType: "Public" },
            { locationName: "안양 CC", region: "경기", score: 79, subType: "Membership" },
            { locationName: "설해원", region: "강원", score: 88, subType: "Public" },
            { locationName: "나인브릿지", region: "제주", score: 81, subType: "Membership" },
            { locationName: "해슬리 나인브릿지", region: "경기", score: 83, subType: "Membership" },
            { locationName: "88CC", region: "경기", score: 85, subType: "Membership" },
            { locationName: "세이지우드CC홍천", region: "강원", score: 87, subType: "Public" }
        ];

        for (const s of samples) {
            await db.insert(hiqGameHistory).values({
                memberId,
                gameId: '00000000-0000-0000-0000-000000000000', // Dummy
                gameMode: 'practice',
                gameType: 'golf',
                score: s.score,
                innings: 18,
                average: (s.score / 18).toFixed(2),
                isWinner: true,
                isRanked: false,
                locationName: s.locationName,
                sportCategory: 'GOLF' as any,
                createdAt: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000)
            });
        }

        // Update stats after seeding
        await this.updateGolfStats(memberId);
    }

    async processScorecardOCR(ocrData: any) {
        const items = ocrData.textAnnotations || [];
        if (items.length <= 1) return null;

        const words = items.slice(1).map((ann: any) => ({
            text: ann.description,
            bounds: ann.boundingPoly.vertices,
            center: {
                x: (ann.boundingPoly.vertices[0].x + ann.boundingPoly.vertices[2].x) / 2,
                y: (ann.boundingPoly.vertices[0].y + ann.boundingPoly.vertices[2].y) / 2
            }
        }));

        const rows: any[][] = [];
        words.sort((a: any, b: any) => a.center.y - b.center.y);

        let currentRow: any[] = [];
        let lastY = -1;

        words.forEach((w: any) => {
            if (lastY === -1 || Math.abs(w.center.y - lastY) < 15) {
                currentRow.push(w);
            } else {
                rows.push(currentRow.sort((a, b) => a.center.x - b.center.x));
                currentRow = [w];
            }
            lastY = w.center.y;
        });
        if (currentRow.length > 0) rows.push(currentRow.sort((a, b) => a.center.x - b.center.x));

        const parsed = {
            meta: { source_type: "SMART_SCORE_IMAGE", course_name_raw: "Auto Detected", date: new Date().toISOString().split('T')[0] },
            courses: [] as any[]
        };

        let currentCourse: any = { course_name: "Out Course", pars: [], players: [] };

        rows.forEach(row => {
            const rowText = row.map(w => w.text).join(' ');
            if (rowText.includes('PAR') || rowText.match(/[345]\s[345]\s[345]/)) {
                currentCourse.pars = row.filter(w => w.text.match(/^\d$/)).map(w => parseInt(w.text));
            } else if (row.length >= 10 && row[0].text.length >= 2) {
                const scores = row.slice(1, 10).map(w => parseInt(w.text) || 0);
                const total = parseInt(row[10]?.text) || scores.reduce((a, b) => a + b, 0);
                currentCourse.players.push({ name: row[0].text, scores, total });
            }
        });

        if (currentCourse.pars.length > 0) parsed.courses.push(currentCourse);

        return parsed;
    }

    async updateCourseHoleInfo(data: { courseId: string, courseName: string, subPathName?: string, holeNo: number, par: number }) {
        const [existing] = await db.select().from(hiqCourseHoleInfo)
            .where(and(
                eq(hiqCourseHoleInfo.courseId, data.courseId),
                eq(hiqCourseHoleInfo.subPathName, data.subPathName || ""),
                eq(hiqCourseHoleInfo.holeNo, data.holeNo)
            ));

        if (existing) {
            if (existing.par === data.par) {
                await db.update(hiqCourseHoleInfo)
                    .set({ voteCount: existing.voteCount + 1, isVerified: existing.voteCount + 1 >= 5 })
                    .where(eq(hiqCourseHoleInfo.id, existing.id));
            } else {
                console.warn(`PAR Mismatch for ${data.courseName} H${data.holeNo}: DB ${existing.par} vs Extracted ${data.par}`);
            }
        } else {
            await db.insert(hiqCourseHoleInfo).values({
                courseId: data.courseId,
                courseName: data.courseName,
                subPathName: data.subPathName || "",
                holeNo: data.holeNo,
                par: data.par,
                voteCount: 1,
                isVerified: false
            });
        }
    }

    // --- Golf Match Session (PIN based) ---
    async createGolfMatchSession(data: any): Promise<any> {
        const pinCode = Math.floor(1000 + Math.random() * 9000).toString();

        const host = await db.select({
            name: hiqMembers.name,
            profileImageUrl: profiles.profileImageUrl
        })
            .from(hiqMembers)
            .leftJoin(profiles, eq(hiqMembers.profileId, profiles.id))
            .where(eq(hiqMembers.id, data.hostId))
            .limit(1);

        const [session] = await db.insert(golfMatchSessions).values({
            ...data,
            doublingMode: data.doublingMode, // Explicitly set to avoid default override
            pinCode,
            players: [{
                memberId: data.hostId,
                name: host[0]?.name || "Host",
                profileImageUrl: host[0]?.profileImageUrl,
                scores: new Array(18).fill(0),
                penalties: Array.from({ length: 18 }, () => ({ ob: false, hz: false, bunk: false, putt3: false }))
            }]
        }).returning();
        return session;
    }

    async getGolfMatchSession(id: string): Promise<any> {
        const [session] = await db.select().from(golfMatchSessions).where(eq(golfMatchSessions.id, id));
        if (!session) return null;

        let pars: number[] = new Array(18).fill(4);

        if (session.courseId) {
            try {
                // Fetch course info to populate Hole Pars
                const courses = await db.select().from(rankueGolfCourses)
                    .where(eq(rankueGolfCourses.clubId, session.courseId));

                const frontPars = courses.find(c => c.name === session.frontCourseName)?.pars as number[];
                const backPars = courses.find(c => c.name === session.backCourseName)?.pars as number[];

                if (frontPars && backPars) {
                    pars = [...frontPars, ...backPars];
                } else if (frontPars) {
                    pars = [...frontPars, ...frontPars];
                }
            } catch (e) {
                console.error("Error fetching course pars:", e);
            }
        }

        return { ...session, pars };
    }

    async getGolfMatchSessionByPin(pin: string): Promise<any> {
        const [session] = await db.select().from(golfMatchSessions).where(and(eq(golfMatchSessions.pinCode, pin), eq(golfMatchSessions.status, 'waiting')));
        return session;
    }

    async joinGolfMatchSession(pin: string, memberId: string, name: string): Promise<any> {
        const found = await this.getGolfMatchSessionByPin(pin);
        if (!found) throw notFound("게임을 찾을 수 없거나 이미 시작되었습니다.");

        const player = await db.select({
            name: hiqMembers.name,
            profileImageUrl: profiles.profileImageUrl
        })
            .from(hiqMembers)
            .leftJoin(profiles, eq(hiqMembers.profileId, profiles.id))
            .where(eq(hiqMembers.id, memberId))
            .limit(1);

        // Append the joining player under a row lock. Re-read inside the transaction so the
        // capacity/dedup checks and the write see a consistent snapshot — two players joining
        // at once (or a join racing a host score-save) can't both append onto stale state.
        return await db.transaction(async (tx) => {
            const [session] = await tx.select().from(golfMatchSessions)
                .where(eq(golfMatchSessions.id, found.id))
                .for('update');
            if (!session) throw notFound("게임을 찾을 수 없거나 이미 시작되었습니다.");

            const players = session.players || [];
            if (players.length >= 4) throw conflict("방이 꽉 찼습니다.");
            if (players.some((p: any) => p.memberId === memberId)) return session;

            const updatedPlayers = [...players, {
                memberId,
                name: player[0]?.name || name,
                profileImageUrl: player[0]?.profileImageUrl,
                scores: new Array(18).fill(0),
                penalties: Array.from({ length: 18 }, () => ({ ob: false, hz: false, bunk: false, putt3: false }))
            }];

            const [updated] = await tx.update(golfMatchSessions)
                .set({ players: updatedPlayers })
                .where(eq(golfMatchSessions.id, session.id))
                .returning();
            return updated;
        });
    }

    async updateGolfMatchScore(id: string, holeNo: number, players: any, nearHistory?: any): Promise<any> {
        // Concurrent writers (host saving scores vs a guest joining via joinGolfMatchSession)
        // both touch the same row's `players` JSON. A blind overwrite is last-write-wins and
        // silently drops the other writer's change. Serialize with a row lock and merge by
        // memberId so a concurrent join is preserved and we only apply the incoming scores.
        return await db.transaction(async (tx) => {
            const [current] = await tx.select().from(golfMatchSessions)
                .where(eq(golfMatchSessions.id, id))
                .for('update');
            if (!current) return undefined;

            const incomingById = new Map<string, any>((players || []).map((p: any) => [p.memberId, p]));
            const merged = (current.players || []).map((dbP: any) => {
                const inc = incomingById.get(dbP.memberId);
                if (!inc) return dbP; // player not in this payload (e.g. concurrently joined) — keep as-is
                incomingById.delete(dbP.memberId);
                return { ...dbP, ...inc };
            });
            // Append any genuinely new players present only in the payload.
            for (const inc of incomingById.values()) merged.push(inc);

            const [session] = await tx.update(golfMatchSessions)
                .set({
                    players: merged,
                    currentHole: holeNo,
                    // Preserve existing nearHistory when the caller doesn't send it (most saves don't).
                    nearHistory: nearHistory !== undefined ? nearHistory : (current.nearHistory || {}),
                    updatedAt: new Date(),
                    status: 'playing'
                })
                .where(eq(golfMatchSessions.id, id))
                .returning();
            return session;
        });
    }

    async updateGolfMatchCourse(id: string, frontName?: string, backName?: string): Promise<any> {
        const updateData: any = { updatedAt: new Date() };
        if (frontName) updateData.frontCourseName = frontName;
        if (backName) updateData.backCourseName = backName;

        const [session] = await db.update(golfMatchSessions)
            .set(updateData)
            .where(eq(golfMatchSessions.id, id))
            .returning();
        return session;
    }

    async finishGolfMatchSession(id: string): Promise<any> {
        // Idempotency guard: only the FIRST caller transitions the row to 'finished'.
        // The WHERE status != 'finished' makes this atomic, so concurrent/duplicate finish
        // requests (double-tap, retry) cannot both insert history / double-count stats.
        const [session] = await db.update(golfMatchSessions)
            .set({ status: 'finished', updatedAt: new Date() })
            .where(and(eq(golfMatchSessions.id, id), ne(golfMatchSessions.status, 'finished')))
            .returning();

        // Already finished (or not found): return current state without re-inserting history.
        if (!session) {
            const [existing] = await db.select().from(golfMatchSessions).where(eq(golfMatchSessions.id, id));
            return existing;
        }

        {
            const DEFAULT_PAR = [4, 4, 3, 4, 5, 4, 3, 4, 4, 4, 4, 3, 4, 5, 4, 3, 4, 4];
            const pars = (session as any).pars || DEFAULT_PAR;

            for (const player of session.players) {
                if (!player.memberId) continue; // Skip malformed player entries
                const scores = player.scores || new Array(18).fill(0);

                // Batch Update Fix: Treat 0 as Par for total calculation
                let totalScore = 0;
                for (let i = 0; i < 18; i++) {
                    const s = scores[i] || 0;
                    totalScore += (s > 0) ? s : (pars[i] || 4);
                }

                await db.insert(hiqGameHistory).values({
                    memberId: player.memberId,
                    gameId: null,
                    gameMode: 'match',
                    gameType: 'golf',
                    score: totalScore,
                    innings: 18,
                    average: (totalScore / 18).toFixed(2),
                    isWinner: false,
                    isRanked: true,
                    locationName: session.courseName || "알 수 없는 구장",
                    sportCategory: 'GOLF' as any,
                    scoreJson: player.scores
                });

                // Update member's golf stats (Average based)
                await this.updateGolfStats(player.memberId);
            }
        }

        return session;
    }

    async findGolfSessionForHistory(history: HiqGameHistory): Promise<any> {
        // Heuristic: Find session updated around the same time as history creation
        const timeWindowMinutes = 10;
        const historyTime = new Date(history.createdAt);
        const startTime = new Date(historyTime.getTime() - timeWindowMinutes * 60000);
        const endTime = new Date(historyTime.getTime() + timeWindowMinutes * 60000);

        // Find session
        const sessions = await db.select().from(golfMatchSessions)
            .where(and(
                eq(golfMatchSessions.status, 'finished'),
                gte(golfMatchSessions.updatedAt, startTime),
                lte(golfMatchSessions.updatedAt, endTime)
            ));

        // Candidates: any finished session in the window that contains this member.
        const candidates = sessions.filter(s => (s.players || []).some((p: any) => p.memberId === history.memberId));
        if (candidates.length === 0) return null;

        // Time-only matching is ambiguous when the same member finishes two sessions within the
        // window. Disambiguate deterministically using data already stored on the history row:
        // the exact per-hole scoreJson and the course name. Fall back to closest-in-time.
        const historyScores = JSON.stringify((history as any).scoreJson ?? null);
        const sameMemberScores = (s: any) => {
            const p = (s.players || []).find((pl: any) => pl.memberId === history.memberId);
            return p ? JSON.stringify(p.scores ?? null) : null;
        };
        const score = (s: any) => {
            let pts = 0;
            if (historyScores !== "null" && sameMemberScores(s) === historyScores) pts += 4; // strongest signal
            if (history.locationName && s.courseName === history.locationName) pts += 2;
            // Tiebreak: prefer the session updated closest to when the history row was created.
            const proximity = 1 - Math.min(1, Math.abs(new Date(s.updatedAt).getTime() - historyTime.getTime()) / (timeWindowMinutes * 60000));
            return pts + proximity;
        };
        const match = candidates.reduce((best, s) => (score(s) > score(best) ? s : best), candidates[0]);

        if (!match) return null;

        // Transform to HiqGame shape for the dialog
        const players = match.players;
        const DEFAULT_PAR = [4, 4, 3, 4, 5, 4, 3, 4, 4, 4, 4, 3, 4, 5, 4, 3, 4, 4];
        // Use session pars if available, otherwise default
        const pars = (match as any).pars || DEFAULT_PAR;

        const calculateBirdiePlus = (scores: number[] | undefined) => {
            if (!scores) return 0;
            return scores.reduce((count, score, idx) => {
                if (score > 0 && score <= (pars[idx] || 4) - 1) return count + 1;
                return count;
            }, 0);
        };

        return {
            id: match.id,
            gameMode: 'match',
            gameType: 'golf',
            storeId: 'golf-field',
            isRanked: true,
            winnerId: null, // Not strictly identifying winner here
            totalInnings: 18,
            status: 'finished',
            pars, // Include PAR data for scorecard display

            player1Id: players[0]?.memberId,
            player1Name: players[0]?.name,
            player1Avatar: players[0]?.profileImageUrl,
            player1Score: players[0]?.scores ? players[0].scores.reduce((sum: number, s: number, idx: number) => sum + (s > 0 ? s : (pars[idx] || 4)), 0) : 0,
            player1Innings: players[0]?.scores,
            player1HighRun: calculateBirdiePlus(players[0]?.scores),

            player2Id: players[1]?.memberId,
            player2Name: players[1]?.name,
            player2Avatar: players[1]?.profileImageUrl,
            player2Score: players[1]?.scores ? players[1].scores.reduce((sum: number, s: number, idx: number) => sum + (s > 0 ? s : (pars[idx] || 4)), 0) : 0,
            player2Innings: players[1]?.scores,
            player2HighRun: calculateBirdiePlus(players[1]?.scores),

            player3Id: players[2]?.memberId,
            player3Name: players[2]?.name,
            player3Avatar: players[2]?.profileImageUrl,
            player3Score: players[2]?.scores ? players[2].scores.reduce((sum: number, s: number, idx: number) => sum + (s > 0 ? s : (pars[idx] || 4)), 0) : 0,
            player3Innings: players[2]?.scores,
            player3HighRun: calculateBirdiePlus(players[2]?.scores),

            player4Id: players[3]?.memberId,
            player4Name: players[3]?.name,
            player4Avatar: players[3]?.profileImageUrl,
            player4Score: players[3]?.scores ? players[3].scores.reduce((sum: number, s: number, idx: number) => sum + (s > 0 ? s : (pars[idx] || 4)), 0) : 0,
            player4Innings: players[3]?.scores,
            player4HighRun: calculateBirdiePlus(players[3]?.scores),
        };
    }

    // --- Golf Membership Orders ---
    async createGolfMembershipOrder(data: InsertGolfMembershipOrder): Promise<GolfMembershipOrder> {
        const [order] = await db.insert(golfMembershipOrders).values(data).returning();
        return order;
    }

    async getGolfMembershipOrders(): Promise<GolfMembershipOrder[]> {
        return await db.select().from(golfMembershipOrders).orderBy(desc(golfMembershipOrders.createdAt));
    }

    async updateGolfMembershipOrderStatus(id: string, status: any): Promise<GolfMembershipOrder | undefined> {
        const [order] = await db.update(golfMembershipOrders)
            .set({ status, updatedAt: new Date() })
            .where(eq(golfMembershipOrders.id, id))
            .returning();
        return order;
    }
}

function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    var R = 6371; // Radius of the earth in km
    var dLat = deg2rad(lat2 - lat1);  // deg2rad below
    var dLon = deg2rad(lon2 - lon1);
    var a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2)
        ;
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c; // Distance in km
    return d;
}

function deg2rad(deg: number) {
    return deg * (Math.PI / 180)
}
