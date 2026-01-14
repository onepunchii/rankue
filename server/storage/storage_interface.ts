import {
    type User, type UpsertUser, type Survey, type InsertSurvey,
    type SurveyQuestion, type InsertSurveyQuestion, type SurveyResponse,
    type InsertSurveyResponse, type UserSurveyParticipation,
    type InsertUserSurveyParticipation, type LotteryTicket, type LotteryDraw,
    type PointTransaction, type InsertPointTransaction,
    type RewardItem, type InsertRewardItem,
    type QuickPoll, type InsertQuickPoll,
    type NewsArticle, type InsertNewsArticle,
    type BalanceGame, type InsertBalanceGame, type BalanceGameVote, type InsertBalanceGameVote,
    type Notification, type InsertNotification
} from "../../shared/schema.js";

export interface IStorage {
    // Auth & Identity compatibility
    users: any;

    // User operations
    getUser(id: string): Promise<User | undefined>;
    upsertUser(user: UpsertUser): Promise<User>;
    updateUser(userId: string, updateData: Partial<User>): Promise<User>;
    updateUserGameStats(userId: string, experienceGained: number): Promise<void>;
    updateUserLocation(userId: string, city: string, region: string): Promise<void>;
    updateUserPushToken(userId: string, pushToken: string): Promise<void>;
    getUsersByPushToken(): Promise<User[]>;
    updateUserNotificationSettings(userId: string, settings: any): Promise<void>;
    getUserByEmail(email: string): Promise<User | undefined>;

    // Notification operations
    getNotifications(userId: string): Promise<Notification[]>;
    createNotification(notification: InsertNotification): Promise<Notification>;
    markNotificationAsRead(id: number): Promise<void>;
    markAllNotificationsAsRead(userId: string): Promise<void>;
    getUnreadNotificationCount(userId: string): Promise<number>;

    // Survey operations
    getSurveys(category?: string): Promise<Survey[]>;
    getSurveysPaginated(page: number, limit: number, sortBy?: 'recent' | 'timeLeft'): Promise<{ surveys: Survey[]; total: number }>;
    getSurvey(id: number): Promise<Survey | undefined>;
    createSurvey(survey: InsertSurvey): Promise<Survey>;
    getSurveyWithQuestions(id: number): Promise<(Survey & { questions: SurveyQuestion[] }) | undefined>;
    getPopularSurveys(limit?: number): Promise<Survey[]>;
    getUserCreatedSurveys(userId: string): Promise<Survey[]>;
    getCategoryCounts(): Promise<Record<string, number>>;

    // Survey questions & responses
    createSurveyQuestion(question: InsertSurveyQuestion): Promise<SurveyQuestion>;
    getSurveyQuestions(surveyId: number): Promise<SurveyQuestion[]>;
    createSurveyResponse(response: InsertSurveyResponse): Promise<SurveyResponse>;
    getSurveyResponses(surveyId: number): Promise<SurveyResponse[]>;

    // Survey participation
    createParticipation(participation: InsertUserSurveyParticipation): Promise<UserSurveyParticipation>;
    getUserParticipation(userId: string, surveyId: number): Promise<UserSurveyParticipation | undefined>;
    getUserParticipations(userId: string): Promise<UserSurveyParticipation[]>;
    getTodayParticipantCount(): Promise<number>;

    // Lottery system
    getUserLotteryTickets(userId: string): Promise<LotteryTicket[]>;
    getTodayLotteryDraw(): Promise<LotteryDraw | undefined>;
    runDailyLotteryDraw(): Promise<LotteryDraw | null>;

    // Point system
    addPersonalPoints(userId: string, amount: number, description: string): Promise<void>;
    sendPointsToFriend(senderId: string, receiverId: string, amount: number): Promise<void>;
    getPointTransactions(userId: string): Promise<PointTransaction[]>;
    getRewardItems(): Promise<RewardItem[]>;
    purchaseReward(userId: string, rewardId: number): Promise<void>;

    // Quick Polls
    createQuickPoll(poll: InsertQuickPoll): Promise<QuickPoll>;
    getQuickPoll(pollId: number): Promise<QuickPoll | undefined>;
    voteQuickPoll(userId: string, pollId: number, optionId: number): Promise<{ success: boolean }>;

    // News Articles
    getLatestNewsArticles(limit?: number, category?: string, searchQuery?: string): Promise<NewsArticle[]>;
    getNewsAnalysis(url: string): Promise<NewsArticle | undefined>;
    saveNewsAnalysis(data: any): Promise<NewsArticle>;
    saveNewsArticle(data: any): Promise<NewsArticle>;

    // Balance Game Operations
    createBalanceGame(game: InsertBalanceGame): Promise<BalanceGame>;
    getBalanceGame(id: number): Promise<BalanceGame | undefined>;
    getBalanceGames(status?: string, limit?: number, category?: string): Promise<BalanceGame[]>;
    updateBalanceGameStatus(id: number, status: string): Promise<BalanceGame | undefined>;
    deleteBalanceGame(id: number): Promise<void>;
    voteBalanceGame(vote: InsertBalanceGameVote): Promise<BalanceGameVote>;
    getUserBalanceGameVote(userId: string | undefined, deviceId: string | undefined, gameId: number): Promise<BalanceGameVote | undefined>;

    // Politics & Politicians
    getPoliticians(type?: string, region?: string, limit?: number): Promise<any[]>;
    getTopPoliticiansByActivity(limit?: number): Promise<any[]>;
    getPoliticianActivities(politicianId?: number): Promise<any[]>;
    getPolitician(id: number): Promise<any | undefined>;
    getPoliticiansByRegion(region: string, district?: string): Promise<any[]>;
    createPolitician(politician: any): Promise<any>;
    updatePoliticianActivity(id: number, activityData: any): Promise<any>;
    getPoliticianByName(name: string): Promise<any | undefined>;
    updatePolitician(id: number, politician: any): Promise<any>;

    // Assembly Compatibility
    getAssemblyMembers(limit?: number): Promise<any[]>;
    getAssemblyMember(id: number): Promise<any | undefined>;
    getAssemblyMembersByConstituency(constituency: string): Promise<any[]>;
    getTopAssemblyMembersByActivity(limit?: number): Promise<any[]>;
    getAssemblyActivities(memberId?: number): Promise<any[]>;
    createAssemblyMember(member: any): Promise<any>;
    updateAssemblyMember(id: number, member: any): Promise<any>;
    updateAssemblyMemberActivity(id: number, activityData: any): Promise<any>;
    getAssemblyMemberByName(name: string): Promise<any | undefined>;
}
