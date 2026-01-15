import { IStorage } from "./storage_interface.js";
import { UserStorage } from "./userStorage.js";
import { SurveyStorage } from "./surveyStorage.js";
import { LotteryStorage } from "./lotteryStorage.js";
import { PointStorage } from "./pointStorage.js";
import { DiscussionStorage } from "./discussionStorage.js";
import { NewsStorage } from "./newsStorage.js";
import { PoliticsStorage } from "./politicsStorage.js";
import { BalanceGameStorage } from "./balanceGameStorage.js";
import { NotificationStorage } from "./notificationStorage.js";
import { PostgresBrainStorage } from "./brainStorage.js";
import {
    type User, type UpsertUser, type Survey, type InsertSurvey,
    type SurveyQuestion, type InsertSurveyQuestion, type SurveyResponse,
    type InsertSurveyResponse, type UserSurveyParticipation,
    type InsertUserSurveyParticipation, type LotteryTicket, type LotteryDraw,
    type PointTransaction, type InsertPointTransaction,
    type RewardItem, type InsertRewardItem,
    type RewardOrder, type InsertRewardOrder, type ProviderLog, type InsertProviderLog,
    type QuickPoll, type InsertQuickPoll,
    type NewsArticle, type InsertNewsArticle,
    type BalanceGame, type InsertBalanceGame, type BalanceGameVote, type InsertBalanceGameVote,
    type Notification, type InsertNotification, type BalanceGameComment, type InsertBalanceGameComment,
    type InsertBrainQuestion, type InsertBrainGameLog
} from "../../shared/schema.js";

export class DatabaseStorage implements IStorage {
    private profiles = new UserStorage();
    private surveys = new SurveyStorage();
    private lottery = new LotteryStorage();
    private points = new PointStorage();
    private discussions = new DiscussionStorage();
    private news = new NewsStorage();
    private politics = new PoliticsStorage();
    private balanceGames = new BalanceGameStorage();
    private notificationRecords = new NotificationStorage();
    private brain = new PostgresBrainStorage();

    // Notification operations
    getNotifications(userId: string) { return this.notificationRecords.getNotifications(userId); }
    createNotification(notification: InsertNotification) { return this.notificationRecords.createNotification(notification); }
    markNotificationAsRead(id: number) { return this.notificationRecords.markNotificationAsRead(id); }
    markAllNotificationsAsRead(userId: string) { return this.notificationRecords.markAllNotificationsAsRead(userId); }
    getUnreadNotificationCount(userId: string) { return this.notificationRecords.getUnreadNotificationCount(userId); }

    // ... (existing methods remain unchanged)

    // Balance Game Operations
    createBalanceGame(game: InsertBalanceGame) { return this.balanceGames.createBalanceGame(game); }
    getBalanceGame(id: number) { return this.balanceGames.getBalanceGame(id); }
    getBalanceGames(status?: string, limit?: number, category?: string) { return this.balanceGames.getBalanceGames(status, limit, category); }
    updateBalanceGameStatus(id: number, status: string) { return this.balanceGames.updateBalanceGameStatus(id, status); }
    deleteBalanceGame(id: number) { return this.balanceGames.deleteBalanceGame(id); }
    voteBalanceGame(vote: InsertBalanceGameVote) { return this.balanceGames.voteBalanceGame(vote); }
    getUserBalanceGameVote(userId: string | undefined, deviceId: string | undefined, gameId: number) { return this.balanceGames.getUserVote(userId, deviceId, gameId); }
    getUserBalanceGameVotes(userId: string) { return this.balanceGames.getUserBalanceGameVotes(userId); }
    getBalanceGameStats(gameId: number) { return this.balanceGames.getBalanceGameStats(gameId); }
    getBalanceGameComments(gameId: number) { return this.balanceGames.getBalanceGameComments(gameId); }
    createBalanceGameComment(comment: InsertBalanceGameComment) { return this.balanceGames.createBalanceGameComment(comment); }

    // Auth & Identity compatibility
    get users() { return this; }

    // User operations
    getUser(id: string) { return this.profiles.getUser(id); }
    upsertUser(user: UpsertUser) { return this.profiles.upsertUser(user); }
    updateUser(userId: string, updateData: Partial<User>) { return this.profiles.updateUser(userId, updateData); }
    updateUserGameStats(userId: string, exp: number) { return this.profiles.updateUserGameStats(userId, exp); }
    updateUserLocation(userId: string, city: string, region: string) {
        return this.profiles.updateUserLocation(userId, city, region);
    }
    updateUserPushToken(userId: string, token: string) { return this.profiles.updateUserPushToken(userId, token); }
    getUsersByPushToken() { return this.profiles.getUsersByPushToken(); }
    updateUserNotificationSettings(userId: string, settings: any) { return this.profiles.updateUserNotificationSettings(userId, settings); }
    getUserByEmail(email: string) { return this.profiles.getUserByEmail(email); }

    // Survey operations
    getSurveys(cat?: string) { return this.surveys.getSurveys(cat); }
    getSurveysPaginated(p: number, l: number, s?: any) { return this.surveys.getSurveysPaginated(p, l, s); }
    getSurvey(id: number) { return this.surveys.getSurvey(id); }
    getCategoryCounts() { return this.surveys.getCategoryCounts(); }
    createSurvey(s: InsertSurvey) { return this.surveys.createSurvey(s); }
    getSurveyWithQuestions(id: number) { return this.surveys.getSurveyWithQuestions(id); }
    getPopularSurveys(l?: number) { return this.surveys.getPopularSurveys(l); }
    getUserCreatedSurveys(uid: string) { return this.surveys.getUserCreatedSurveys(uid); }

    // Survey questions & responses
    createSurveyQuestion(q: InsertSurveyQuestion) { return this.surveys.createSurveyQuestion(q); }
    getSurveyQuestions(sid: number) { return this.surveys.getSurveyQuestions(sid); }
    createSurveyResponse(r: InsertSurveyResponse) { return this.surveys.createSurveyResponse(r); }
    getSurveyResponses(sid: number) { return this.surveys.getSurveyResponses(sid); }

    // Participation
    createParticipation(p: InsertUserSurveyParticipation) { return this.surveys.createParticipation(p); }
    getUserParticipation(uid: string, sid: number) { return this.surveys.getUserParticipation(uid, sid); }
    getUserParticipations(uid: string) { return this.surveys.getUserParticipations(uid); }
    getTodayParticipantCount() { return this.surveys.getTodayParticipantCount(); }

    // Lottery
    getUserLotteryTickets(uid: string) { return this.lottery.getUserLotteryTickets(uid); }
    getLotteryHistoryWithStats(limit?: number) { return this.lottery.getLotteryHistoryWithStats(limit); }

    // Points & Rewards
    addPersonalPoints(uid: string, a: number, d: string) { return this.points.addPersonalPoints(uid, a, d); }
    sendPointsToFriend(sid: string, rid: string, a: number) { return this.points.sendPointsToFriend(sid, rid, a); }
    getPointTransactions(uid: string) { return this.points.getPointTransactions(uid); }
    getRewardItems() { return this.points.getRewardItems(); }
    purchaseReward(uid: string, rid: number) { return this.points.purchaseReward(uid, rid); }

    // Extended Rewards
    holdPoints(userId: string, amount: number, type: string, referenceId: string | number, description: string) { return this.points.holdPoints(userId, amount, type, referenceId, description); }
    getRewardProducts(cat?: string) { return this.points.getRewardProducts(cat); }
    getRewardProduct(id: number) { return this.points.getRewardProduct(id); }
    createRewardProduct(data: InsertRewardItem) { return this.points.createRewardProduct(data); }
    updateRewardProduct(id: number, data: Partial<InsertRewardItem>) { return this.points.updateRewardProduct(id, data); }
    deleteRewardProduct(id: number) { return this.points.deleteRewardProduct(id); }
    createRewardOrder(data: InsertRewardOrder) { return this.points.createRewardOrder(data); }
    getRewardOrders(status?: string, limit?: number, offset?: number) { return this.points.getRewardOrders(status, limit, offset); }
    getRewardOrder(id: number) { return this.points.getRewardOrder(id); }
    getUserRewardOrders(userId: string) { return this.points.getUserRewardOrders(userId); }
    approveRewardOrder(id: number, approverId: string) { return this.points.approveRewardOrder(id, approverId); }
    rejectRewardOrder(id: number, rejecterId: string, reason: string) { return this.points.rejectRewardOrder(id, rejecterId, reason); }
    processRewardOrder(id: number) { return this.points.processRewardOrder(id); }
    getProviderLogs(orderId?: number, provider?: string, limit?: number) { return this.points.getProviderLogs(orderId, provider, limit); }
    getUserPointBalance(userId: string) { return this.points.getUserPointBalance(userId); }
    getPointLedger(userId: string, limit?: number) { return this.points.getPointTransactions(userId); }
    updatePointTransactionReference(transactionId: number, newReferenceId: string) { return this.points.updatePointTransactionReference(transactionId, newReferenceId); }

    // Quick Polls
    createQuickPoll(p: InsertQuickPoll) { return this.discussions.createQuickPoll(p); }
    getQuickPoll(pid: number) { return this.discussions.getQuickPoll(pid); }
    getLatestQuickPoll() { return this.discussions.getLatestQuickPoll(); }
    voteQuickPoll(uid: string, pid: number, oid: number) { return this.discussions.voteQuickPoll(uid, pid, oid); }

    // News
    getLatestNewsArticles(limit?: number, category?: string, searchQuery?: string) { return this.news.getLatestNewsArticles(limit, category, searchQuery); }
    getNewsAnalysis(url: string) { return this.news.getNewsAnalysis(url); }
    saveNewsAnalysis(data: any) { return this.news.saveNewsAnalysis(data); }
    saveNewsArticle(data: any) { return this.news.saveNewsArticle(data); }

    // Politics & Politicians
    getPoliticians(t: 'assembly' | 'local' = 'assembly', r?: string, l?: number) { return this.politics.getPoliticians(t, r, l); }
    getTopPoliticiansByActivity(l?: number) { return this.politics.getTopAssemblyMembersByActivity(l); }
    getPoliticianActivities(pid?: number) { return this.politics.getPoliticianActivities(pid); }
    getPolitician(id: number, type: 'assembly' | 'local' = 'assembly') { return this.politics.getPolitician(id, type); }
    getPoliticiansByRegion(r: string, d?: string, type: 'assembly' | 'local' = 'assembly') { return this.politics.getPoliticiansByRegion(r, d, type); }
    getLocalCouncilMembers(r: string, d: string) { return this.politics.getLocalCouncilMembers(r, d); }
    createPolitician(p: any, type: 'assembly' | 'local' = 'assembly') { return this.politics.createPolitician(p, type); }
    updatePoliticianActivity(id: number, d: any) { return this.politics.updatePoliticianActivity(id, d); }
    getPoliticianByName(n: string, type: 'assembly' | 'local' = 'assembly') { return this.politics.getPoliticianByName(n, type); }
    updatePolitician(id: number, p: any, type: 'assembly' | 'local' = 'assembly') { return this.politics.updatePolitician(id, p, type); }

    // Political Stats & Trends
    getLatestPoliticalStats() { return this.politics.getLatestPoliticalStats(); }
    getWeeklyTrends(limit?: number) { return this.politics.getWeeklyTrends(limit); }
    getPoliticalSurveys() { return this.politics.getPoliticalSurveys(); }

    // Assembly Compatibility Aliases
    getAssemblyMembers(limit?: number) { return this.politics.getPoliticians('assembly', undefined, limit); }
    getAssemblyMember(id: number) { return this.politics.getPolitician(id, 'assembly'); }
    getAssemblyMembersByConstituency(c: string) { return this.politics.getPoliticiansByRegion(c, undefined, 'assembly'); }
    getTopAssemblyMembersByActivity(limit?: number) { return this.politics.getTopAssemblyMembersByActivity(limit); }
    getAssemblyActivities(id?: number) { return this.politics.getPoliticianActivities(id); }
    createAssemblyMember(m: any) { return this.politics.createPolitician({ ...m, type: 'assembly', level: '국회', role: '의원' }, 'assembly'); }
    updateAssemblyMember(id: number, m: any) { return this.politics.updatePolitician(id, m, 'assembly'); }
    updateAssemblyMemberActivity(id: number, d: any) { return this.politics.updatePoliticianActivity(id, d); }
    getAssemblyMemberByName(n: string) { return this.politics.getPoliticianByName(n, 'assembly'); }

    // Ratings & Comments
    getPoliticianRatings(id: number, type: 'assembly' | 'local') { return this.politics.getPoliticianRatings(id, type); }
    getPoliticianAverageRatings(id: number, type: 'assembly' | 'local') { return this.politics.getPoliticianAverageRatings(id, type); }
    getUserPoliticianRating(uid: string, pid: number, type: 'assembly' | 'local') { return this.politics.getUserPoliticianRating(uid, pid, type); }
    createOrUpdatePoliticianRating(uid: string, pid: number, type: 'assembly' | 'local', rating: number, comment?: string, details?: any) { return this.politics.createOrUpdatePoliticianRating(uid, pid, type, rating, comment, details); }

    getPoliticianComments(pid: number, type: 'assembly' | 'local', limit?: number, offset?: number) { return this.politics.getPoliticianComments(pid, type, limit, offset); }
    createPoliticianComment(uid: string, pid: number, type: 'assembly' | 'local', content: string) { return this.politics.createPoliticianComment(uid, pid, type, content); }
    toggleCommentLike(uid: string, cid: number, type: 'assembly' | 'local') { return this.politics.toggleCommentLike(uid, cid, type); }
    reportComment(cid: number, type: 'assembly' | 'local') { return this.politics.reportComment(cid, type); }

    // Brain Rank Operations
    createBrainQuestion(q: InsertBrainQuestion) { return this.brain.createQuestion(q); }
    getBrainQuestion(id: number) { return this.brain.getQuestion(id); }
    getBrainDailyQuestions(level: number) { return this.brain.getDailyQuestions(level); }
    recordBrainGameLog(log: InsertBrainGameLog) { return this.brain.recordGameLog(log); }
    updateBrainRatings(uid: string, qid: number, correct: boolean, timeTaken: number = 0) { return this.brain.updateRatings(uid, qid, correct, timeTaken); }
    getUserBrainStats(uid: string) { return this.brain.getUserBrainStats(uid); }
    getBrainLeaderboard(cat: string, limit?: number) { return this.brain.getLeaderboard(cat, limit); }
}

export const storage = new DatabaseStorage();
