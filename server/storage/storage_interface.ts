import type {
    HiqStore, InsertHiqStore, HiqMember, InsertHiqMember, HiqGame, InsertHiqGame, HiqGameHistory, InsertHiqGameHistory,
    HiqFriendship, InsertHiqSuccessfulShot, HiqSuccessfulShot, Profile, HiqTournament, InsertHiqTournament, InsertHiqCrew, HiqCrew,
    InsertHiqCrewActivity, InsertHiqCrewActivityParticipant, InsertPartnerLead, PartnerLead, Notice, InsertNotice,
    InsertHiqCrewPost, HiqCrewPhotoLike, HiqCrewPhotoComment, InsertHiqCrewPhotoLike, InsertHiqCrewPhotoComment,
    InsertHiqSettlement, InsertHiqSettlementItem, InsertHiqSettlementParticipant,
    HiqCrewActivity, HiqCrewActivityParticipant,
    GolfBooking, InsertGolfBooking,
    GolfJoin, InsertGolfJoin
} from "../../shared/schema.js";

export interface IStorage {
    // --- Profile Management ---
    createProfile(data: Partial<Profile>): Promise<Profile>;
    getProfileByPhone(phone: string): Promise<Profile | undefined>;
    getProfile(id: string): Promise<Profile | undefined>;
    updateProfile(id: string, data: Partial<Profile>): Promise<Profile>;

    // --- Store Management ---
    getStoreBySlug(slug: string): Promise<HiqStore | undefined>;
    getStoreById(id: string): Promise<HiqStore | undefined>;
    updateStore(id: string, data: Partial<HiqStore>): Promise<HiqStore>;
    createStore(data: InsertHiqStore): Promise<HiqStore>;
    searchStores(query: string): Promise<HiqStore[]>;
    getStoreByOwnerProfileId(profileId: string): Promise<HiqStore | undefined>;
    getAllStores(): Promise<any>;

    // --- Partner Leads ---
    createPartnerLead(data: InsertPartnerLead): Promise<void>;
    getPartnerLeads(): Promise<PartnerLead[]>;
    updatePartnerLeadStatus(id: string, status: "NEW" | "CONTACTED" | "REGISTERED"): Promise<void>;

    // --- Stats & Admin ---
    getGlobalStats(): Promise<any>;
    getAdminStats(storeId: string): Promise<{
        totalMembers: number;
        visitsToday: number;
        visitsYesterday: number;
        newToday: number;
    }>;
    getReportedUsers(): Promise<any>;
    banUser(userId: string): Promise<void>;

    // --- Notices ---
    getNotices(): Promise<Notice[]>;
    createNotice(data: InsertNotice): Promise<Notice>;

    // --- Crew Management ---
    createCrew(data: InsertHiqCrew): Promise<HiqCrew>;
    getCrew(id: string): Promise<any>;
    joinCrew(crewId: string, memberId: string, role?: string): Promise<any>;
    updateCrewMemberRole(crewId: string, memberId: string, role: string): Promise<void>;
    updateCrew(id: string, data: Partial<InsertHiqCrew>): Promise<any>;
    leaveCrew(crewId: string, memberId: string): Promise<void>;
    getUserCrews(memberId: string): Promise<any>;
    searchCrews(query?: string): Promise<any>;
    getAllCrews(): Promise<any>;
    deleteCrew(crewId: string): Promise<void>;

    // --- Crew Community ---
    getCrewPosts(crewId: string, currentMemberId?: string): Promise<any>;
    getCrewPost(postId: string): Promise<any>;
    deleteCrewPost(postId: string): Promise<void>;
    toggleCrewPostLike(postId: string, memberId: string): Promise<any>;
    getCrewPostComments(postId: string): Promise<any>;
    getCrewComment(commentId: string): Promise<any>;
    deleteCrewComment(commentId: string): Promise<void>;
    createCrewPostComment(data: any): Promise<any>;
    createCrewPost(data: InsertHiqCrewPost): Promise<any>;

    getCrewPhotos(crewId: string, currentMemberId?: string): Promise<any>;
    getCrewPhoto(photoId: string): Promise<any>;
    deleteCrewPhoto(photoId: string): Promise<void>;
    createCrewPhoto(data: any): Promise<any>;
    toggleCrewPhotoLike(photoId: string, memberId: string): Promise<any>;
    getCrewPhotoComments(photoId: string): Promise<any>;
    getCrewPhotoComment(commentId: string): Promise<any>;
    deleteCrewPhotoComment(commentId: string): Promise<void>;
    createCrewPhotoComment(data: any): Promise<any>;

    getCrewChats(crewId: string): Promise<any>;
    getCrewChat(chatId: string): Promise<any>;
    deleteCrewChat(chatId: string): Promise<void>;
    createCrewChat(data: any): Promise<any>;

    // --- Crew Activities ---
    createCrewActivity(data: InsertHiqCrewActivity): Promise<any>;
    getCrewActivities(crewId: string): Promise<any>;
    getUpcomingCrewActivities(crewId: string): Promise<any>;
    joinCrewActivity(activityId: string, memberId: string): Promise<any>;

    // --- Member Management ---
    getMembersByPhone(phone: string): Promise<HiqMember[]>;
    getMemberByPhone(storeId: string, phone: string): Promise<HiqMember | undefined>;
    getMemberById(id: string): Promise<HiqMember | undefined>;
    createMember(memberData: InsertHiqMember): Promise<HiqMember>;
    updateMember(id: string, data: Partial<HiqMember>): Promise<HiqMember>;
    updateHiqMember(id: string, data: Partial<HiqMember>): Promise<HiqMember>;
    incrementVisitCount(id: string): Promise<void>;
    getTopRankings(storeId?: string, limit?: number, type?: '3c' | '4c'): Promise<HiqMember[]>;
    getAvailableOpponents(storeId: string, currentUserId: string): Promise<HiqMember[]>;
    getAllMembers(storeId: string): Promise<HiqMember[]>;
    getAllMembersGlobal(): Promise<HiqMember[]>;
    getStoreMembersWithStats(storeId: string): Promise<any>;

    // --- Game Logic ---
    startHiqGame(gameData: InsertHiqGame): Promise<HiqGame>;
    getHiqGameById(id: string): Promise<HiqGame | undefined>;
    updateHiqGameScore(id: string, data: Partial<HiqGame>): Promise<void>;
    finishHiqGame(id: string, finalData: Partial<HiqGame>): Promise<HiqGame>;
    getMemberGameHistory(memberId: string): Promise<HiqGameHistory[]>;
    checkAndUpdateHandicap(userId: string, gameType: "3c" | "4c"): Promise<{ oldHandi: number, newHandi: number, message: string | null }>;
    getMemberStatsAnalysis(memberId: string, type?: "3c" | "4c"): Promise<any>;

    // --- Friend Management ---
    getFriends(memberId: string): Promise<any[]>;
    createFriendship(requesterId: string, receiverId: string): Promise<HiqFriendship>;
    getHeadToHeadStats(myId: string, friendId: string): Promise<any>;
    getHeadToHeadGames(myId: string, friendId: string): Promise<any>;

    // --- Invite System ---
    createInvite(hostId: string): Promise<string>;
    getInviteByCode(code: string): Promise<any>;
    joinInvite(code: string, guestId: string): Promise<boolean>;
    claimGameRecord(gameId: string, memberId: string, slotIndex: number): Promise<boolean>;

    // --- Successful Shots ---
    recordSuccessfulShot(data: InsertHiqSuccessfulShot): Promise<HiqSuccessfulShot>;
    searchSuccessfulShots(gameType: "3c" | "4c", currentPositions: any, limit?: number): Promise<HiqSuccessfulShot[]>;

    // --- Tournament Management ---
    createTournament(data: InsertHiqTournament): Promise<HiqTournament>;
    getActiveTournaments(storeId?: string): Promise<any[]>;
    getTournamentById(id: string): Promise<HiqTournament | undefined>;

    // --- Crew Community ---
    getCrewPosts(crewId: string, currentMemberId?: string): Promise<any>;
    toggleCrewPostLike(postId: string, memberId: string): Promise<any>;
    getCrewPostComments(postId: string): Promise<any>;
    createCrewPostComment(data: any): Promise<any>;
    createCrewPost(data: InsertHiqCrewPost): Promise<any>;
    getCrewPhotos(crewId: string, currentMemberId?: string): Promise<any>;
    createCrewPhoto(data: any): Promise<any>;
    toggleCrewPhotoLike(photoId: string, memberId: string): Promise<any>;
    getCrewPhotoComments(photoId: string): Promise<any>;
    createCrewPhotoComment(data: any): Promise<any>;
    getCrewChats(crewId: string): Promise<any>;
    createCrewChat(data: any): Promise<any>;

    // --- Golf ---
    checkAndUpdateGolfGrade(userId: string): Promise<any>;

    // --- Settlement ---
    createSettlement(data: any, items: any[], participants: any[]): Promise<any>;
    getSettlement(id: string): Promise<any>;

    // --- Golf Booking ---
    createGolfBooking(data: InsertGolfBooking): Promise<GolfBooking>;
    getGolfBookings(date?: string, filters?: any): Promise<GolfBooking[]>;
    getGolfBookingCounts(startDate: string, endDate: string, viewType?: string): Promise<any>;
    deleteGolfBooking(id: string): Promise<void>;

    // --- Golf Join ---
    createGolfJoin(data: InsertGolfJoin): Promise<GolfJoin>;
    getGolfJoins(filters?: any): Promise<GolfJoin[]>;
    deleteGolfJoin(id: string): Promise<void>;

    // --- Golf Match Session (PIN based) ---
    createGolfMatchSession(data: any): Promise<any>;
    getGolfMatchSession(id: string): Promise<any>;
    getGolfMatchSessionByPin(pin: string): Promise<any>;
    joinGolfMatchSession(pin: string, memberId: string, name: string): Promise<any>;
    updateGolfMatchScore(id: string, holeNo: number, playersData: any[]): Promise<any>;
    finishGolfMatchSession(id: string): Promise<any>;
}
