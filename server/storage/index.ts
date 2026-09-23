import { UserRepository } from "./user.repo.js";
import { CrewRepository } from "./crew.repo.js";
import { GolfRepository } from "./golf.repo.js";
import { GameRepository } from "./game.repo.js";
import { AppSessionRepository } from "./appSession.repo.js";
import { AdminRepository } from "./admin.repo.js";
import { NotificationRepository } from "./notification.repo.js";
import type { NotifGroup } from "../../shared/notificationGroup.js";
import { CommunityRepository } from "./community.repo.js";
import { ChatRepository } from "./chat.repo.js";
import { UmbRepository } from "./umb.repo.js";
import { PbaRepository } from "./pba.repo.js";
import { GolfRankRepository } from "./golfRank.repo.js";
import { GolfArcadeRepository } from "./golfArcade.repo.js";
import { TournamentRepository } from "./tournament.repo.js";
import { SimRepository } from "./sim.repo.js";
import { SimMatchRepository } from "./simMatch.repo.js";
import { SimDrillRepository } from "./simDrill.repo.js";

class Storage {
    public users = new UserRepository();
    public crews = new CrewRepository();
    public golf = new GolfRepository();
    public games = new GameRepository();
    public appSessions = new AppSessionRepository();
    public admin = new AdminRepository();
    public notifs = new NotificationRepository();
    public community = new CommunityRepository();
    public chat = new ChatRepository();
    public umb = new UmbRepository();
    public pba = new PbaRepository();
    public golfRank = new GolfRankRepository();   // 골프 랭킹(2026-09-13) — 공개 읽기
    public golfArcade = new GolfArcadeRepository();   // 골프 온라인게임 방(2026-09-14)
    public tournaments = new TournamentRepository();
    public sim = new SimRepository();
    public simMatch = new SimMatchRepository();
    public simDrill = new SimDrillRepository();

    // --- Backward Compatibility Wrappers ---
    // User / Member
    async getMemberById(id: string) { return this.users.getMemberById(id); }
    async setMemberLocale(id: string, locale: string) { return this.users.setMemberLocale(id, locale); }
    async getMemberByPhone(storeId: string, phone: string) { return this.users.getMemberByPhone(storeId, phone); }
    async getMembersByPhone(phone: string) { return this.users.getMembersByPhone(phone); }
    async updateMember(id: string, data: any) { return this.users.updateMember(id, data); }
    async createMember(data: any) { return this.users.createMember(data); }
    async incrementVisitCount(id: string) { return this.users.incrementVisitCount(id); }
    async getProfile(id: string) { return this.users.getProfile(id); }
    async createProfile(data: any) { return this.users.createProfile(data); }
    async getProfileByPhone(phone: string) { return this.users.getProfileByPhone(phone); }
    async getProfileBySocialSub(provider: "google" | "apple", sub: string) { return this.users.getProfileBySocialSub(provider, sub); }
    async getMemberByProfileId(profileId: string) { return this.users.getMemberByProfileId(profileId); }
    async deleteAccount(memberId: string) { return this.users.deleteAccount(memberId); }
    async updateProfile(id: string, data: any) { return this.users.updateProfile(id, data); }
    async getFriends(id: string, sport?: string) { return this.users.getFriends(id, sport); }
    async listStoreMemberNames(storeId: string, excludeId: string, limit?: number) { return this.users.listStoreMemberNames(storeId, excludeId, limit); }
    async listFriendIds(id: string, sport?: "BILLIARDS" | "GOLF") { return this.users.listFriendIds(id, sport); }
    async isFriend(id: string, otherId: string, sport?: "BILLIARDS" | "GOLF") { return this.users.isFriend(id, otherId, sport); }
    async requestFriend(reqId: string, recId: string, sport: "BILLIARDS" | "GOLF" = "BILLIARDS") { return this.users.requestFriend(reqId, recId, sport); }
    async getStoreMembersWithStats(id: string) { return this.users.getStoreMembersWithStats(id); }
    async getTopRankings(storeId?: string, limit?: number, type?: '3c' | '4c', countryCode?: string, sport?: 'BILLIARDS' | 'GOLF') { return this.users.getTopRankings(storeId, limit, type, countryCode, sport); }
    async getAvailableOpponents(storeId: string, currentUserId: string, sport: 'BILLIARDS' | 'GOLF' = 'BILLIARDS') { return this.users.getAvailableOpponents(storeId, currentUserId, sport); }
    async getAllMembers(storeId: string) { return this.users.getAllMembers(storeId); }
    async updatePushToken(memberId: string, token: string) { return this.users.updatePushToken(memberId, token); }
    async createFriendship(reqId: string, recId: string, sport?: "BILLIARDS" | "GOLF") { return this.users.createFriendship(reqId, recId, sport); }

    // Golf
    async getGolfBookings(date?: string, filters?: any) { return this.golf.getGolfBookings(date, filters); }
    async createGolfBooking(data: any) { return this.golf.createGolfBooking(data); }
    async getGolfBooking(id: string) { return this.golf.getGolfBooking(id); }
    async countJoinRequests(ids: string[]) { return this.golf.countJoinRequests(ids); }
    async myJoinStatuses(memberId: string, ids: string[]) { return this.golf.myJoinStatuses(memberId, ids); }
    async decideJoinRequest(bookingId: string, memberId: string, accept: boolean, capacity: number) { return this.golf.decideJoinRequest(bookingId, memberId, accept, capacity); }
    async listMyRequests(memberId: string) { return this.golf.listMyRequests(memberId); }
    async pendingRequesterIds(bookingId: string) { return this.golf.pendingRequesterIds(bookingId); }
    async countRecentBookingsByOwner(ownerId: string, minutes: number) { return this.golf.countRecentBookingsByOwner(ownerId, minutes); }
    async activeRequesterIds(bookingId: string) { return this.golf.activeRequesterIds(bookingId); }
    async applyToJoin(bookingId: string, memberId: string, capacity: number, headcount = 1) { return this.golf.applyToJoin(bookingId, memberId, capacity, headcount); }
    async cancelJoinRequest(bookingId: string, memberId: string) { return this.golf.cancelJoinRequest(bookingId, memberId); }
    async listJoinApplicants(bookingId: string) { return this.golf.listJoinApplicants(bookingId); }
    async setJoinNoShow(bookingId: string, memberId: string, noShow: boolean, capacity?: number) { return this.golf.setJoinNoShow(bookingId, memberId, noShow, capacity); }
    async deleteGolfBooking(id: string, managerPhone?: string, ownerId?: string) { return this.golf.deleteGolfBooking(id, managerPhone, ownerId); }
    async convertBookingToJoin(id: string, ownerId: string, patch: Parameters<GolfRepository["convertBookingToJoin"]>[2]) { return this.golf.convertBookingToJoin(id, ownerId, patch); }
    async getGolfJoins(filters?: any) { return this.golf.getGolfJoins(filters); }
    async createGolfJoin(data: any) { return this.golf.createGolfJoin(data); }
    async deleteGolfJoin(id: string, hostId?: string) { return this.golf.deleteGolfJoin(id, hostId); }
    async updateGolfStats(id: string) { return this.golf.updateGolfStats(id); }
    async getGolfPassportStats(id: string) { return this.golf.getGolfPassportStats(id); }
    async getGolfBookingCounts(start: string, end: string, viewType?: string, filters?: any) { return this.golf.getGolfBookingCounts(start, end, viewType, filters); }
    async processScorecardOCR(data: any) { return this.golf.processScorecardOCR(data); }
    async updateCourseHoleInfo(data: any) { return this.golf.updateCourseHoleInfo(data); }
    async createGolfMatchSession(hostId: string, input: any) { return this.golf.createGolfMatchSession(hostId, input); }
    async joinGolfMatchSession(pin: string, mid: string): Promise<{ session: any; added: boolean }> { return this.golf.joinGolfMatchSession(pin, mid); }
    async getGolfMatchSession(id: string) { return this.golf.getGolfMatchSession(id); }
    async startGolfMatchSession(id: string) { return this.golf.startGolfMatchSession(id); }
    async updateGolfMatchScore(id: string, hole: number, players: unknown) { return this.golf.updateGolfMatchScore(id, hole, players); }
    async finishGolfMatchSession(id: string) { return this.golf.finishGolfMatchSession(id); }
    async abandonGolfMatchSession(id: string) { return this.golf.abandonGolfMatchSession(id); }
    async getActiveGolfMatch(memberId: string) { return this.golf.getActiveGolfMatch(memberId); }
    async findGolfSessionForHistory(h: any) { return this.golf.findGolfSessionForHistory(h); }
    async updateGolfMatchCourse(id: string, front?: string, back?: string) { return this.golf.updateGolfMatchCourse(id, front, back); }
    async getGolfClubs(search?: string, lat?: number, lng?: number) { return this.golf.getGolfClubs(search, lat, lng); }
    async getGolfClubCourses(clubId: string) { return this.golf.getGolfClubCourses(clubId); }
    async createGolfClub(data: any) { return this.golf.createGolfClub(data); }
    async createGolfClubCourse(data: any) { return this.golf.createGolfClubCourse(data); }
    async addCourseNamesIfEmpty(clubId: string, names: string[]) { return this.golf.addCourseNamesIfEmpty(clubId, names); }

    // Golf Membership Orders
    async createGolfMembershipOrder(data: any) { return this.golf.createGolfMembershipOrder(data); }
    async getGolfMembershipOrders() { return this.golf.getGolfMembershipOrders(); }
    async updateGolfMembershipOrderStatus(id: string, status: any) { return this.golf.updateGolfMembershipOrderStatus(id, status); }


    // Billiards / Game
    async startHiqGame(data: any) { return this.games.startHiqGame(data); }
    async getHiqGameById(id: string) { return this.games.getHiqGameById(id); }
    async updateHiqGameScore(id: string, data: any) { return this.games.updateHiqGameScore(id, data); }
    async finishHiqGame(id: string, data: any) { return this.games.finishHiqGame(id, data); }
    async getMemberGameHistory(id: string, sport?: string) { return this.games.getMemberGameHistory(id, sport); }
    async checkAndUpdateHandicap(id: string, type: any) { return this.games.checkAndUpdateHandicap(id, type); }
    async getMemberStatsAnalysis(id: string, type?: any) { return this.games.getMemberStatsAnalysis(id, type); }
    async getHeadToHeadStats(id1: string, id2: string) { return this.games.getHeadToHeadStats(id1, id2); }
    async getHeadToHeadGames(id1: string, id2: string, sport?: string) { return this.games.getHeadToHeadGames(id1, id2, sport); }
    async claimGameRecord(gid: string, mid: string, idx: number) { return this.games.claimGameRecord(gid, mid, idx); }
    async getGameHistoryById(id: string) { return this.games.getGameHistoryById(id); }
    async createInvite(id: string) { return this.games.createInvite(id); }
    async getInviteStatus(code: string) { return this.games.getInviteStatus(code); }
    async joinInvite(code: string, id: string) { return this.games.joinInvite(code, id); }
    // 매칭 대결 카드(2026-09-23) — 카드가 핀을 들고 대기실 노릇을 한다.
    async getLivePendingInvite(hostId: string, sport?: "BILLIARDS" | "GOLF") { return this.games.getLivePendingInvite(hostId, sport); }
    async getMatchInviteCardStatus(code: string, viewerId: string) { return this.games.getMatchInviteCardStatus(code, viewerId); }

    // Crew
    async getCrew(id: string) { return this.crews.getCrew(id); }
    async getCrewMembership(crewId: string, memberId: string) { return this.crews.getCrewMembership(crewId, memberId); }
    async getPollByOptionId(optionId: string) { return this.crews.getPollByOptionId(optionId); }
    async createCrew(data: any) { return this.crews.createCrew(data); }
    async getUserCrews(id: string, sport?: string) { return this.crews.getUserCrews(id, sport); }
    async getCrewPosts(id: string, mid?: string) { return this.crews.getCrewPosts(id, mid); }
    async createCrewActivity(data: any) { return this.crews.createCrewActivity(data); }
    async getUpcomingCrewActivities(id: string) { return this.crews.getUpcomingCrewActivities(id); }
    async joinCrewActivity(aid: string, mid: string) { return this.crews.joinCrewActivity(aid, mid); }
    async leaveCrewActivity(aid: string, mid: string) { return this.crews.leaveCrewActivity(aid, mid); }
    async updateCrewActivity(aid: string, data: any) { return this.crews.updateCrewActivity(aid, data); }
    async deleteCrewActivity(aid: string) { return this.crews.deleteCrewActivity(aid); }
    async getCrewActivity(aid: string) { return this.crews.getCrewActivity(aid); }
    async getMemberActivities(mid: string, crewId?: string) { return this.crews.getMemberActivities(mid, crewId); }
    async createPoll(data: any, options: string[]) { return this.crews.createPoll(data, options); }
    async getCrewPolls(id: string, mid?: string) { return this.crews.getCrewPolls(id, mid); }
    async votePoll(pid: string, oid: string, mid: string) { return this.crews.votePoll(pid, oid, mid); }
    async deletePoll(id: string) { return this.crews.deletePoll(id); }
    async getPollVotes(oid: string) { return this.crews.getPollVotes(oid); }
    async createCrewPost(data: any) { return this.crews.createCrewPost(data); }
    async getCrewPost(id: string) { return this.crews.getCrewPost(id); }
    async deleteCrewPost(id: string) { return this.crews.deleteCrewPost(id); }
    async toggleCrewPostLike(id: string, mid: string) { return this.crews.toggleCrewPostLike(id, mid); }
    async getCrewComment(id: string) { return this.crews.getCrewComment(id); }
    async deleteCrewComment(id: string) { return this.crews.deleteCrewComment(id); }
    async getCrewPostComments(postId: string) { return this.crews.getCrewPostComments(postId); }
    async createCrewPostComment(data: any) { return this.crews.createCrewPostComment(data); }
    async getCrewPhotoComments(photoId: string) { return this.crews.getCrewPhotoComments(photoId); }
    async createCrewPhotoComment(data: any) { return this.crews.createCrewPhotoComment(data); }
    async getCrewPhotos(id: string, mid?: string) { return this.crews.getCrewPhotos(id, mid); }
    async toggleCrewPhotoLike(id: string, mid: string) { return this.crews.toggleCrewPhotoLike(id, mid); }
    async getCrewPhotoComment(id: string) { return this.crews.getCrewPhotoComment(id); }
    async deleteCrewPhotoComment(id: string) { return this.crews.deleteCrewPhotoComment(id); }
    async createCrewPhoto(data: any) { return this.crews.createCrewPhoto(data); }
    async getCrewPhoto(id: string) { return this.crews.getCrewPhoto(id); }
    async deleteCrewPhoto(id: string) { return this.crews.deleteCrewPhoto(id); }
    /** 크루 채팅은 2026-09-21 부터 hiq_chat_messages("crew:<id>") 에 있다 — 옛 이름은 라우트 호환용. */
    async getCrewChats(crewId: string, memberId?: string) { return memberId ? this.chat.messages({ kind: "crew", id: crewId, key: `crew:${crewId}` }, memberId, { limit: 100 }) : []; }
    async createCrewChat(data: { crewId: string; senderId: string; message: string; type?: string; metadata?: unknown }) {
        const row = await this.chat.addMessage({ key: `crew:${data.crewId}`, senderId: data.senderId, message: data.message, type: data.type ?? "text", metadata: data.metadata });
        return { ...row, crewId: data.crewId };
    }
    async getCrewChat(chatId: string) { const m = await this.chat.getMessage(chatId); return m ? { ...m, crewId: m.roomKey.startsWith("crew:") ? m.roomKey.slice(5) : null } : undefined; }
    async deleteCrewChat(chatId: string) { return this.chat.deleteMessage(chatId); }
    async searchCrews(q?: string, s?: string, lat?: number, lng?: number, viewerCountry?: string) { return this.crews.searchCrews(q, s, lat, lng, viewerCountry); }
    async joinCrew(cid: string, mid: string) { return this.crews.joinCrew(cid, mid); }
    async updateCrew(id: string, data: any) { return this.crews.updateCrew(id, data); }
    async deleteCrew(id: string) { return this.crews.deleteCrew(id); }
    async updateCrewMemberRole(cid: string, mid: string, r: string) { return this.crews.updateCrewMemberRole(cid, mid, r); }
    async leaveCrew(cid: string, mid: string) { return this.crews.leaveCrew(cid, mid); }
    async createSettlement(d: any, i: any, p: any) { return this.admin.createSettlement(d, i, p); }
    async getAllCrews() { return this.crews.getAllCrews(); }

    // Admin / Store
    async getStoreBySlug(slug: string) { return this.admin.getStoreBySlug(slug); }
    async getStoreById(id: string) { return this.admin.getStoreById(id); }
    async updateStore(id: string, data: any) { return this.admin.updateStore(id, data); }
    async getAdminStats(id: string) { return this.admin.getAdminStats(id); }
    async getGlobalStats() { return this.admin.getGlobalStats(); }
    async getAllMembersForAdmin() { return this.admin.getAllMembersForAdmin(); }
    async getCrewsForSitemap() { return this.admin.getCrewsForSitemap(); }
    async getStoresForSitemap() { return this.admin.getStoresForSitemap(); }
    async getPublicStores() { return this.admin.getPublicStores(); }
    async getPublicStoreBySlug(slug: string) { return this.admin.getPublicStoreBySlug(slug); }
    async createPartnerLead(data: any) { return this.admin.createPartnerLead(data); }
    async searchStores(q: string) { return this.admin.searchStores(q); }
    async getPartnerLeads() { return this.admin.getPartnerLeads(); }
    async updatePartnerLeadStatus(id: string, s: any) { return this.admin.updatePartnerLeadStatus(id, s); }
    async getAllStores() { return this.admin.getAllStores(); }
    async getNotices() { return this.admin.getNotices(); }
    async createNotice(d: any) { return this.admin.createNotice(d); }
    async getReportedUsers() { return this.admin.getReportedUsers(); }
    async banUser(id: string) { return this.admin.banUser(id); }
    async getStoreByOwnerProfileId(id: string) { return this.admin.getStoreByOwnerProfileId(id); }
    async createStore(d: any) { return this.admin.createStore(d); }
    async getActiveTournaments(id?: string) { return this.admin.getActiveTournaments(id); }
    async getTournamentById(id: string) { return this.admin.getTournamentById(id); }
    async getSettlement(id: string) { return this.admin.getSettlement(id); }
    async createTournament(d: any) { return this.admin.createTournament(d); }
    async createSuggestion(d: any) { return this.admin.createSuggestion(d); }
    async getSuggestions() { return this.admin.getSuggestions(); }
    async markSuggestionRead(id: string, isRead: boolean) { return this.admin.markSuggestionRead(id, isRead); }
    async markAllSuggestionsRead() { return this.admin.markAllSuggestionsRead(); }

    // Notifications
    /** 한 페이지(기본 30·최대 50) + 다음 커서. 묶음(turn|chat|crew|notice)으로 걸러 볼 수 있다. */
    async getNotifications(id: string, sport?: "BILLIARDS" | "GOLF", opts?: { group?: NotifGroup; before?: string; limit?: number }) { return this.notifs.getNotifications(id, sport, opts); }
    async createNotification(data: any) { return this.notifs.createNotification(data); }
    async markNotificationAsRead(id: string, mid: string) { return this.notifs.markNotificationAsRead(id, mid); }
    /** 지금 보고 있는 종목만 읽음 처리한다 — 종목을 빼먹으면 당구에서 눌러 골프까지 읽힌다. */
    async markAllNotificationsAsRead(mid: string, sport?: "BILLIARDS" | "GOLF") { return this.notifs.markAllNotificationsAsRead(mid, sport); }
    async countUnreadNotifications(mid: string, sport?: "BILLIARDS" | "GOLF") { return this.notifs.countUnread(mid, sport); }
    async deleteNotification(id: string, mid: string) { return this.notifs.deleteNotification(id, mid); }
    /** 골프 긴급 조인 전체 방송 대상(골프에 흔적이 있고 푸시 토큰이 있는 회원). */
    async listGolfPushMembers(excludeIds: readonly string[], limit?: number) { return this.notifs.listGolfPushMembers(excludeIds, limit); }
    async hasRecentGolfUrgent(ownerId: string, hours: number) { return this.notifs.hasRecentGolfUrgent(ownerId, hours); }
}

export const storage = new Storage();

// Export standalone helper functions
export { searchUsers, getRecentOpponents } from "./hiqSearchHelpers.js";
