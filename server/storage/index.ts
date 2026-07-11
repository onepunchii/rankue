import { UserRepository } from "./user.repo.js";
import { CrewRepository } from "./crew.repo.js";
import { GolfRepository } from "./golf.repo.js";
import { GameRepository } from "./game.repo.js";
import { AdminRepository } from "./admin.repo.js";
import { NotificationRepository } from "./notification.repo.js";

class Storage {
    public users = new UserRepository();
    public crews = new CrewRepository();
    public golf = new GolfRepository();
    public games = new GameRepository();
    public admin = new AdminRepository();
    public notifs = new NotificationRepository();

    // --- Backward Compatibility Wrappers ---
    // User / Member
    async getMemberById(id: string) { return this.users.getMemberById(id); }
    async getMemberByPhone(storeId: string, phone: string) { return this.users.getMemberByPhone(storeId, phone); }
    async getMembersByPhone(phone: string) { return this.users.getMembersByPhone(phone); }
    async updateMember(id: string, data: any) { return this.users.updateMember(id, data); }
    async createMember(data: any) { return this.users.createMember(data); }
    async incrementVisitCount(id: string) { return this.users.incrementVisitCount(id); }
    async getProfile(id: string) { return this.users.getProfile(id); }
    async createProfile(data: any) { return this.users.createProfile(data); }
    async getProfileByPhone(phone: string) { return this.users.getProfileByPhone(phone); }
    async updateProfile(id: string, data: any) { return this.users.updateProfile(id, data); }
    async getFriends(id: string, sport?: string) { return this.users.getFriends(id, sport); }
    async requestFriend(reqId: string, recId: string, sport: "BILLIARDS" | "GOLF" = "BILLIARDS") { return this.users.requestFriend(reqId, recId, sport); }
    async getStoreMembersWithStats(id: string) { return this.users.getStoreMembersWithStats(id); }
    async getTopRankings(storeId?: string, limit: number = 20, type: '3c' | '4c' = '4c') { return this.users.getTopRankings(storeId, limit, type); }
    async getAvailableOpponents(storeId: string, currentUserId: string, sport: 'BILLIARDS' | 'GOLF' = 'BILLIARDS') { return this.users.getAvailableOpponents(storeId, currentUserId, sport); }
    async getAllMembers(storeId: string) { return this.users.getAllMembers(storeId); }
    async updatePushToken(memberId: string, token: string) { return this.users.updatePushToken(memberId, token); }
    async createFriendship(reqId: string, recId: string, sport?: "BILLIARDS" | "GOLF") { return this.users.createFriendship(reqId, recId, sport); }

    // Golf
    async getGolfBookings(date?: string, filters?: any) { return this.golf.getGolfBookings(date, filters); }
    async createGolfBooking(data: any) { return this.golf.createGolfBooking(data); }
    async deleteGolfBooking(id: string, managerPhone?: string) { return this.golf.deleteGolfBooking(id, managerPhone); }
    async getGolfJoins(filters?: any) { return this.golf.getGolfJoins(filters); }
    async createGolfJoin(data: any) { return this.golf.createGolfJoin(data); }
    async deleteGolfJoin(id: string, hostId?: string) { return this.golf.deleteGolfJoin(id, hostId); }
    async updateGolfStats(id: string) { return this.golf.updateGolfStats(id); }
    async getGolfPassportStats(id: string) { return this.golf.getGolfPassportStats(id); }
    async getGolfBookingCounts(start: string, end: string, viewType?: string) { return this.golf.getGolfBookingCounts(start, end, viewType); }
    async seedGolfSampleData(id: string) { return this.golf.seedGolfSampleData(id); }
    async processScorecardOCR(data: any) { return this.golf.processScorecardOCR(data); }
    async updateCourseHoleInfo(data: any) { return this.golf.updateCourseHoleInfo(data); }
    async createGolfMatchSession(data: any) { return this.golf.createGolfMatchSession(data); }
    async getGolfMatchSessionByPin(pin: string) { return this.golf.getGolfMatchSessionByPin(pin); }
    async joinGolfMatchSession(pin: string, mid: string, name: string) { return this.golf.joinGolfMatchSession(pin, mid, name); }
    async getGolfMatchSession(id: string) { return this.golf.getGolfMatchSession(id); }
    async updateGolfMatchScore(id: string, hole: number, players: any, near?: any) { return this.golf.updateGolfMatchScore(id, hole, players, near); }
    async finishGolfMatchSession(id: string) { return this.golf.finishGolfMatchSession(id); }
    async findGolfSessionForHistory(h: any) { return this.golf.findGolfSessionForHistory(h); }
    async updateGolfMatchCourse(id: string, front?: string, back?: string) { return this.golf.updateGolfMatchCourse(id, front, back); }
    async getGolfClubs(search?: string, lat?: number, lng?: number) { return this.golf.getGolfClubs(search, lat, lng); }
    async getGolfClubCourses(clubId: string) { return this.golf.getGolfClubCourses(clubId); }
    async createGolfClub(data: any) { return this.golf.createGolfClub(data); }
    async createGolfClubCourse(data: any) { return this.golf.createGolfClubCourse(data); }

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
    async recordSuccessfulShot(data: any) { return this.games.recordSuccessfulShot(data); }
    async searchSuccessfulShots(type: any, pos: any) { return this.games.searchSuccessfulShots(type, pos); }
    async createInvite(id: string) { return this.games.createInvite(id); }
    async getInviteStatus(code: string) { return this.games.getInviteStatus(code); }
    async joinInvite(code: string, id: string) { return this.games.joinInvite(code, id); }

    // Crew
    async getCrew(id: string) { return this.crews.getCrew(id); }
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
    async getCrewPhotos(id: string, mid?: string) { return this.crews.getCrewPhotos(id, mid); }
    async toggleCrewPhotoLike(id: string, mid: string) { return this.crews.toggleCrewPhotoLike(id, mid); }
    async getCrewPhotoComment(id: string) { return this.crews.getCrewPhotoComment(id); }
    async deleteCrewPhotoComment(id: string) { return this.crews.deleteCrewPhotoComment(id); }
    async createCrewPhoto(data: any) { return this.crews.createCrewPhoto(data); }
    async getCrewPhoto(id: string) { return this.crews.getCrewPhoto(id); }
    async deleteCrewPhoto(id: string) { return this.crews.deleteCrewPhoto(id); }
    async getCrewChats(id: string, mid?: string) { return this.crews.getCrewChats(id, mid); }
    async createCrewChat(data: any) { return this.crews.createCrewChat(data); }
    async getCrewChat(id: string) { return this.crews.getCrewChat(id); }
    async deleteCrewChat(id: string) { return this.crews.deleteCrewChat(id); }
    async searchCrews(q?: string, s?: string, lat?: number, lng?: number) { return this.crews.searchCrews(q, s, lat, lng); }
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

    // Notifications
    async getNotifications(id: string) { return this.notifs.getNotifications(id); }
    async createNotification(data: any) { return this.notifs.createNotification(data); }
    async markNotificationAsRead(id: string, mid: string) { return this.notifs.markNotificationAsRead(id, mid); }
    async deleteNotification(id: string, mid: string) { return this.notifs.deleteNotification(id, mid); }
}

export const storage = new Storage();

// Export standalone helper functions
export { searchUsers, getRecentOpponents } from "./hiqSearchHelpers.js";
