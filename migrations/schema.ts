import { pgTable, foreignKey, uuid, text, integer, timestamp, boolean, jsonb, unique, doublePrecision, date, varchar } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const hiqGameHistory = pgTable("hiq_game_history", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	memberId: uuid("member_id").notNull(),
	gameId: uuid("game_id"),
	gameMode: text("game_mode").notNull(),
	gameType: text("game_type").notNull(),
	score: integer().notNull(),
	innings: integer().notNull(),
	average: text().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	isWinner: boolean("is_winner").default(false).notNull(),
	earnedPoints: integer("earned_points").default(0).notNull(),
	opponentName: text("opponent_name"),
	isRanked: boolean("is_ranked").default(false).notNull(),
	highRun: integer("high_run").default(0).notNull(),
	inningData: jsonb("inning_data"),
	storeId: uuid("store_id"),
	sportCategory: text("sport_category").default('BILLIARDS').notNull(),
	locationName: text("location_name"),
	subType: text("sub_type"),
	scoreJson: jsonb("score_json"),
}, (table) => [
	foreignKey({
			columns: [table.gameId],
			foreignColumns: [hiqGames.id],
			name: "hiq_game_history_game_id_hiq_games_id_fk"
		}),
	foreignKey({
			columns: [table.memberId],
			foreignColumns: [hiqMembers.id],
			name: "hiq_game_history_member_id_hiq_members_id_fk"
		}),
	foreignKey({
			columns: [table.storeId],
			foreignColumns: [hiqStores.id],
			name: "hiq_game_history_store_id_hiq_stores_id_fk"
		}),
]);

export const hiqMembers = pgTable("hiq_members", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	storeId: uuid("store_id").notNull(),
	phone: text().notNull(),
	name: text().notNull(),
	birthYear: integer("birth_year"),
	handi3C: integer("handi_3c"),
	handi4C: integer("handi_4c"),
	average: text(),
	marketingAgree: boolean("marketing_agree").default(false),
	visitCount: integer("visit_count").default(0),
	lastVisitedAt: timestamp("last_visited_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	gender: text(),
	rating3C: integer("rating_3c").default(0).notNull(),
	rating4C: integer("rating_4c").default(0).notNull(),
	totalSimPoints: integer("total_sim_points").default(0).notNull(),
	profileId: uuid("profile_id"),
	avg3C: doublePrecision("avg_3c").default(0),
	avg4C: doublePrecision("avg_4c").default(0),
	defaultAccountBank: text("default_account_bank"),
	defaultAccountNumber: text("default_account_number"),
	defaultAccountHolder: text("default_account_holder"),
	golfHandicap: integer("golf_handicap").default(0),
	golfAvgScore: doublePrecision("golf_avg_score").default(0),
	golfGrade: text("golf_grade"),
	golfGradeVerified: boolean("golf_grade_verified").default(false).notNull(),
	totalGolfGames: integer("total_golf_games").default(0).notNull(),
	golfBestScore: integer("golf_best_score").default(0),
	introduction: text(),
}, (table) => [
	foreignKey({
			columns: [table.profileId],
			foreignColumns: [profiles.id],
			name: "hiq_members_profile_id_profiles_id_fk"
		}),
	foreignKey({
			columns: [table.storeId],
			foreignColumns: [hiqStores.id],
			name: "hiq_members_store_id_hiq_stores_id_fk"
		}),
	unique("hiq_members_store_id_phone_unique").on(table.storeId, table.phone),
]);

export const hiqVisitLogs = pgTable("hiq_visit_logs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	memberId: uuid("member_id").notNull(),
	visitedAt: timestamp("visited_at", { mode: 'string' }).defaultNow().notNull(),
	storeId: uuid("store_id"),
}, (table) => [
	foreignKey({
			columns: [table.memberId],
			foreignColumns: [hiqMembers.id],
			name: "hiq_visit_logs_member_id_hiq_members_id_fk"
		}),
	foreignKey({
			columns: [table.storeId],
			foreignColumns: [hiqStores.id],
			name: "hiq_visit_logs_store_id_hiq_stores_id_fk"
		}),
]);

export const profiles = pgTable("profiles", {
	id: uuid().primaryKey().notNull(),
	nickname: text(),
	email: text(),
	phone: text(),
	profileImageUrl: text("profile_image_url"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	role: text().default('user').notNull(),
	status: text().default('active').notNull(),
	password: text(),
	currentSport: text("current_sport").default('BILLIARDS').notNull(),
	pushToken: text("push_token"),
});

export const hiqSimRecords = pgTable("hiq_sim_records", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	memberId: uuid("member_id").notNull(),
	shotData: jsonb("shot_data").notNull(),
	points: integer().notNull(),
	difficulty: text(),
	cushionCount: integer("cushion_count"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.memberId],
			foreignColumns: [hiqMembers.id],
			name: "hiq_sim_records_member_id_hiq_members_id_fk"
		}),
]);

export const hiqSuccessfulShots = pgTable("hiq_successful_shots", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	gameType: text("game_type").notNull(),
	ballPositions: jsonb("ball_positions").notNull(),
	shotParams: jsonb("shot_params").notNull(),
	cushionCount: integer("cushion_count"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const hiqLeaderboard = pgTable("hiq_leaderboard", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	memberId: uuid("member_id").notNull(),
	score: integer().notNull(),
	rank: integer(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.memberId],
			foreignColumns: [hiqMembers.id],
			name: "hiq_leaderboard_member_id_hiq_members_id_fk"
		}),
]);

export const hiqFriendships = pgTable("hiq_friendships", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	requesterId: uuid("requester_id").notNull(),
	receiverId: uuid("receiver_id").notNull(),
	status: text().default('pending').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	sportCategory: text("sport_category").default('BILLIARDS').notNull(),
}, (table) => [
	foreignKey({
			columns: [table.receiverId],
			foreignColumns: [hiqMembers.id],
			name: "hiq_friendships_receiver_id_hiq_members_id_fk"
		}),
	foreignKey({
			columns: [table.requesterId],
			foreignColumns: [hiqMembers.id],
			name: "hiq_friendships_requester_id_hiq_members_id_fk"
		}),
	unique("hiq_friendships_requester_id_receiver_id_sport_category_unique").on(table.requesterId, table.receiverId, table.sportCategory),
]);

export const hiqClubMembers = pgTable("hiq_club_members", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	storeId: uuid("store_id").notNull(),
	memberId: uuid("member_id").notNull(),
	localHandi3C: integer("local_handi_3c"),
	localHandi4C: integer("local_handi_4c"),
	memo: text(),
	joinedAt: timestamp("joined_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.memberId],
			foreignColumns: [hiqMembers.id],
			name: "hiq_club_members_member_id_hiq_members_id_fk"
		}),
	foreignKey({
			columns: [table.storeId],
			foreignColumns: [hiqStores.id],
			name: "hiq_club_members_store_id_hiq_stores_id_fk"
		}),
	unique("hiq_club_members_store_id_member_id_unique").on(table.storeId, table.memberId),
]);

export const hiqInvites = pgTable("hiq_invites", {
	code: text().notNull(),
	hostId: uuid("host_id").notNull(),
	guestId: uuid("guest_id"),
	status: text().default('pending').notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	id: uuid().defaultRandom().primaryKey().notNull(),
	storeId: uuid("store_id"),
	sportCategory: text("sport_category").default('BILLIARDS').notNull(),
}, (table) => [
	foreignKey({
			columns: [table.guestId],
			foreignColumns: [hiqMembers.id],
			name: "hiq_invites_guest_id_hiq_members_id_fk"
		}),
	foreignKey({
			columns: [table.hostId],
			foreignColumns: [hiqMembers.id],
			name: "hiq_invites_host_id_hiq_members_id_fk"
		}),
]);

export const hiqTournamentParticipants = pgTable("hiq_tournament_participants", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	tournamentId: uuid("tournament_id").notNull(),
	memberId: uuid("member_id").notNull(),
	currentRank: integer("current_rank"),
	status: text().default('active'),
	registeredAt: timestamp("registered_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.memberId],
			foreignColumns: [hiqMembers.id],
			name: "hiq_tournament_participants_member_id_hiq_members_id_fk"
		}),
	foreignKey({
			columns: [table.tournamentId],
			foreignColumns: [hiqTournaments.id],
			name: "hiq_tournament_participants_tournament_id_hiq_tournaments_id_fk"
		}),
	unique("hiq_tournament_participants_tournament_id_member_id_unique").on(table.tournamentId, table.memberId),
]);

export const hiqCrewComments = pgTable("hiq_crew_comments", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	postId: uuid("post_id").notNull(),
	authorId: uuid("author_id").notNull(),
	content: text().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.authorId],
			foreignColumns: [hiqMembers.id],
			name: "hiq_crew_comments_author_id_hiq_members_id_fk"
		}),
	foreignKey({
			columns: [table.postId],
			foreignColumns: [hiqCrewPosts.id],
			name: "hiq_crew_comments_post_id_hiq_crew_posts_id_fk"
		}),
]);

export const hiqStores = pgTable("hiq_stores", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	slug: text().notNull(),
	name: text().notNull(),
	logoText: text("logo_text"),
	themeColor: text("theme_color").default('#0e4d2a'),
	neonColor: text("neon_color").default('#ffd700'),
	subText: text("sub_text"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	ownerId: uuid("owner_id"),
	description: text(),
	notice: text(),
	region: text(),
	address: text(),
	latitude: doublePrecision(),
	longitude: doublePrecision(),
	phone: text(),
	pricePer10Min: integer("price_per_10min"),
	openTime: text("open_time"),
	closeTime: text("close_time"),
	hasParking: boolean("has_parking").default(false),
	tableCount: integer("table_count").default(0),
	priceLarge: integer("price_large").default(2000),
	priceMedium: integer("price_medium").default(1500),
	parkingDescription: text("parking_description"),
	tableLarge: integer("table_large").default(0),
	tableMedium: integer("table_medium").default(0),
	facilities: jsonb(),
	images: jsonb(),
	plan: text().default('free'),
	subscriptionStatus: text("subscription_status").default('active').notNull(),
	nextBillingDate: timestamp("next_billing_date", { mode: 'string' }),
	subscriptionTier: text("subscription_tier").default('BASIC'),
	subscriptionExpiresAt: timestamp("subscription_expires_at", { mode: 'string' }),
	billingKey: text("billing_key"),
	paymentMethod: text("payment_method"),
}, (table) => [
	foreignKey({
			columns: [table.ownerId],
			foreignColumns: [profiles.id],
			name: "hiq_stores_owner_id_profiles_id_fk"
		}),
	unique("hiq_stores_slug_unique").on(table.slug),
]);

export const hiqTournaments = pgTable("hiq_tournaments", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	storeId: uuid("store_id").notNull(),
	title: text().notNull(),
	content: text(),
	startDate: timestamp("start_date", { mode: 'string' }).notNull(),
	endDate: timestamp("end_date", { mode: 'string' }),
	entryFee: integer("entry_fee").default(20000),
	gameType: text("game_type").notNull(),
	status: text().default('recruiting').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	recruitEnd: timestamp("recruit_end", { mode: 'string' }),
	format: text().default('knockout').notNull(),
	handicapRule: text("handicap_rule"),
	maxPlayers: integer("max_players").default(32),
	prizes: jsonb(),
	posterUrl: text("poster_url"),
	matchMethod: text("match_method").default('handicap').notNull(),
	handicapRate: integer("handicap_rate").default(100),
	targetScore: integer("target_score"),
	bankShotPoint: integer("bank_shot_point").default(2),
	timeLimit: integer("time_limit").default(40),
	sportCategory: text("sport_category").default('BILLIARDS').notNull(),
}, (table) => [
	foreignKey({
			columns: [table.storeId],
			foreignColumns: [hiqStores.id],
			name: "hiq_tournaments_store_id_hiq_stores_id_fk"
		}),
]);

export const hiqCrewChats = pgTable("hiq_crew_chats", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	crewId: uuid("crew_id").notNull(),
	senderId: uuid("sender_id").notNull(),
	message: text().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	type: text().default('text').notNull(),
	metadata: jsonb(),
}, (table) => [
	foreignKey({
			columns: [table.crewId],
			foreignColumns: [hiqCrews.id],
			name: "hiq_crew_chats_crew_id_hiq_crews_id_fk"
		}),
	foreignKey({
			columns: [table.senderId],
			foreignColumns: [hiqMembers.id],
			name: "hiq_crew_chats_sender_id_hiq_members_id_fk"
		}),
]);

export const hiqCrewActivities = pgTable("hiq_crew_activities", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	crewId: uuid("crew_id").notNull(),
	creatorId: uuid("creator_id").notNull(),
	title: text().notNull(),
	description: text(),
	activityDate: timestamp("activity_date", { mode: 'string' }).notNull(),
	locationStoreId: uuid("location_store_id"),
	locationName: text("location_name"),
	maxParticipants: integer("max_participants").default(8),
	cost: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	sportCategory: text("sport_category").default('BILLIARDS').notNull(),
	category: text(),
}, (table) => [
	foreignKey({
			columns: [table.creatorId],
			foreignColumns: [hiqMembers.id],
			name: "hiq_crew_activities_creator_id_hiq_members_id_fk"
		}),
	foreignKey({
			columns: [table.crewId],
			foreignColumns: [hiqCrews.id],
			name: "hiq_crew_activities_crew_id_hiq_crews_id_fk"
		}),
	foreignKey({
			columns: [table.locationStoreId],
			foreignColumns: [hiqStores.id],
			name: "hiq_crew_activities_location_store_id_hiq_stores_id_fk"
		}),
]);

export const hiqCrewActivityParticipants = pgTable("hiq_crew_activity_participants", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	activityId: uuid("activity_id").notNull(),
	memberId: uuid("member_id").notNull(),
	status: text().default('joined').notNull(),
	joinedAt: timestamp("joined_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.activityId],
			foreignColumns: [hiqCrewActivities.id],
			name: "hiq_crew_activity_participants_activity_id_hiq_crew_activities_"
		}),
	foreignKey({
			columns: [table.memberId],
			foreignColumns: [hiqMembers.id],
			name: "hiq_crew_activity_participants_member_id_hiq_members_id_fk"
		}),
	unique("hiq_crew_activity_participants_activity_id_member_id_unique").on(table.activityId, table.memberId),
]);

export const hiqCrewPhotoLikes = pgTable("hiq_crew_photo_likes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	photoId: uuid("photo_id").notNull(),
	memberId: uuid("member_id").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.memberId],
			foreignColumns: [hiqMembers.id],
			name: "hiq_crew_photo_likes_member_id_hiq_members_id_fk"
		}),
	foreignKey({
			columns: [table.photoId],
			foreignColumns: [hiqCrewPhotos.id],
			name: "hiq_crew_photo_likes_photo_id_hiq_crew_photos_id_fk"
		}).onDelete("cascade"),
	unique("hiq_crew_photo_likes_photo_id_member_id_unique").on(table.photoId, table.memberId),
]);

export const hiqCrewPhotos = pgTable("hiq_crew_photos", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	crewId: uuid("crew_id").notNull(),
	uploaderId: uuid("uploader_id").notNull(),
	url: text().notNull(),
	caption: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.crewId],
			foreignColumns: [hiqCrews.id],
			name: "hiq_crew_photos_crew_id_hiq_crews_id_fk"
		}),
	foreignKey({
			columns: [table.uploaderId],
			foreignColumns: [hiqMembers.id],
			name: "hiq_crew_photos_uploader_id_hiq_members_id_fk"
		}),
]);

export const partnerLeads = pgTable("partner_leads", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	ownerName: text("owner_name").notNull(),
	phoneNumber: text("phone_number").notNull(),
	storeName: text("store_name"),
	region: text(),
	status: text().default('NEW').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	businessNumber: text("business_number"),
	businessLicenseFile: text("business_license_file"),
	regionDetail: text("region_detail"),
});

export const hiqCrewPhotoComments = pgTable("hiq_crew_photo_comments", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	photoId: uuid("photo_id").notNull(),
	authorId: uuid("author_id").notNull(),
	content: text().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.authorId],
			foreignColumns: [hiqMembers.id],
			name: "hiq_crew_photo_comments_author_id_hiq_members_id_fk"
		}),
	foreignKey({
			columns: [table.photoId],
			foreignColumns: [hiqCrewPhotos.id],
			name: "hiq_crew_photo_comments_photo_id_hiq_crew_photos_id_fk"
		}).onDelete("cascade"),
]);

export const hiqGames = pgTable("hiq_games", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	storeId: uuid("store_id").notNull(),
	gameMode: text("game_mode").notNull(),
	gameType: text("game_type").notNull(),
	player1Id: uuid("player1_id").notNull(),
	player2Id: uuid("player2_id"),
	player3Id: uuid("player3_id"),
	player4Id: uuid("player4_id"),
	player2Name: text("player2_name"),
	player3Name: text("player3_name"),
	player4Name: text("player4_name"),
	player1Target: integer("player1_target").default(0).notNull(),
	player2Target: integer("player2_target").default(0).notNull(),
	player3Target: integer("player3_target").default(0).notNull(),
	player4Target: integer("player4_target").default(0).notNull(),
	player1Score: integer("player1_score").default(0).notNull(),
	player2Score: integer("player2_score").default(0).notNull(),
	player3Score: integer("player3_score").default(0).notNull(),
	player4Score: integer("player4_score").default(0).notNull(),
	player1FinishScore: integer("player1_finish_score").default(0).notNull(),
	player2FinishScore: integer("player2_finish_score").default(0).notNull(),
	player3FinishScore: integer("player3_finish_score").default(0).notNull(),
	player4FinishScore: integer("player4_finish_score").default(0).notNull(),
	finishTargetCount: integer("finish_target_count").default(0).notNull(),
	ruleFinishType: text("rule_finish_type").default('none').notNull(),
	usePbaRule: boolean("use_pba_rule").default(false).notNull(),
	targetScore: integer("target_score"),
	totalInnings: integer("total_innings").default(0).notNull(),
	player1FinishInnings: integer("player1_finish_innings").default(0).notNull(),
	player2FinishInnings: integer("player2_finish_innings").default(0).notNull(),
	player3FinishInnings: integer("player3_finish_innings").default(0).notNull(),
	player4FinishInnings: integer("player4_finish_innings").default(0).notNull(),
	status: text().default('playing_base').notNull(),
	playedAt: timestamp("played_at", { mode: 'string' }).defaultNow().notNull(),
	winnerId: uuid("winner_id"),
	isRanked: boolean("is_ranked").default(false).notNull(),
	player1Name: text("player1_name"),
	result: text(),
	player1HighRun: integer("player1_high_run").default(0).notNull(),
	player2HighRun: integer("player2_high_run").default(0).notNull(),
	player3HighRun: integer("player3_high_run").default(0).notNull(),
	player4HighRun: integer("player4_high_run").default(0).notNull(),
	player1Innings: jsonb("player1_innings"),
	player2Innings: jsonb("player2_innings"),
	player3Innings: jsonb("player3_innings"),
	player4Innings: jsonb("player4_innings"),
	tournamentId: uuid("tournament_id"),
	sportCategory: text("sport_category").default('BILLIARDS').notNull(),
}, (table) => [
	foreignKey({
			columns: [table.player1Id],
			foreignColumns: [hiqMembers.id],
			name: "hiq_games_player1_id_hiq_members_id_fk"
		}),
	foreignKey({
			columns: [table.player2Id],
			foreignColumns: [hiqMembers.id],
			name: "hiq_games_player2_id_hiq_members_id_fk"
		}),
	foreignKey({
			columns: [table.player3Id],
			foreignColumns: [hiqMembers.id],
			name: "hiq_games_player3_id_hiq_members_id_fk"
		}),
	foreignKey({
			columns: [table.player4Id],
			foreignColumns: [hiqMembers.id],
			name: "hiq_games_player4_id_hiq_members_id_fk"
		}),
	foreignKey({
			columns: [table.storeId],
			foreignColumns: [hiqStores.id],
			name: "hiq_games_store_id_hiq_stores_id_fk"
		}),
	foreignKey({
			columns: [table.winnerId],
			foreignColumns: [hiqMembers.id],
			name: "hiq_games_winner_id_hiq_members_id_fk"
		}),
]);

export const hiqCrewPosts = pgTable("hiq_crew_posts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	crewId: uuid("crew_id").notNull(),
	authorId: uuid("author_id").notNull(),
	title: text().notNull(),
	content: text().notNull(),
	isNotice: boolean("is_notice").default(false).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	category: text(),
	sportCategory: text("sport_category").default('BILLIARDS').notNull(),
	images: jsonb(),
}, (table) => [
	foreignKey({
			columns: [table.authorId],
			foreignColumns: [hiqMembers.id],
			name: "hiq_crew_posts_author_id_hiq_members_id_fk"
		}),
	foreignKey({
			columns: [table.crewId],
			foreignColumns: [hiqCrews.id],
			name: "hiq_crew_posts_crew_id_hiq_crews_id_fk"
		}),
]);

export const hiqCrewMembers = pgTable("hiq_crew_members", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	crewId: uuid("crew_id").notNull(),
	memberId: uuid("member_id").notNull(),
	role: text().default('member').notNull(),
	joinedAt: timestamp("joined_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.crewId],
			foreignColumns: [hiqCrews.id],
			name: "hiq_crew_members_crew_id_hiq_crews_id_fk"
		}),
	foreignKey({
			columns: [table.memberId],
			foreignColumns: [hiqMembers.id],
			name: "hiq_crew_members_member_id_hiq_members_id_fk"
		}),
	unique("hiq_crew_members_crew_id_member_id_unique").on(table.crewId, table.memberId),
]);

export const hiqCrewLikes = pgTable("hiq_crew_likes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	postId: uuid("post_id").notNull(),
	memberId: uuid("member_id").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.memberId],
			foreignColumns: [hiqMembers.id],
			name: "hiq_crew_likes_member_id_hiq_members_id_fk"
		}),
	foreignKey({
			columns: [table.postId],
			foreignColumns: [hiqCrewPosts.id],
			name: "hiq_crew_likes_post_id_hiq_crew_posts_id_fk"
		}),
	unique("hiq_crew_likes_post_id_member_id_unique").on(table.postId, table.memberId),
]);

export const notices = pgTable("notices", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	title: text().notNull(),
	content: text().notNull(),
	target: text().default('all').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const hiqSettlementParticipants = pgTable("hiq_settlement_participants", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	itemId: uuid("item_id").notNull(),
	memberId: uuid("member_id").notNull(),
}, (table) => [
	foreignKey({
			columns: [table.itemId],
			foreignColumns: [hiqSettlementItems.id],
			name: "hiq_settlement_participants_item_id_hiq_settlement_items_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.memberId],
			foreignColumns: [hiqMembers.id],
			name: "hiq_settlement_participants_member_id_hiq_members_id_fk"
		}),
	unique("hiq_settlement_participants_item_id_member_id_unique").on(table.itemId, table.memberId),
]);

export const hiqSettlements = pgTable("hiq_settlements", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	crewId: uuid("crew_id").notNull(),
	creatorId: uuid("creator_id").notNull(),
	title: text().notNull(),
	accountBank: text("account_bank"),
	accountNumber: text("account_number"),
	status: text().default('active').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	accountHolder: text("account_holder"),
}, (table) => [
	foreignKey({
			columns: [table.creatorId],
			foreignColumns: [hiqMembers.id],
			name: "hiq_settlements_creator_id_hiq_members_id_fk"
		}),
	foreignKey({
			columns: [table.crewId],
			foreignColumns: [hiqCrews.id],
			name: "hiq_settlements_crew_id_hiq_crews_id_fk"
		}),
]);

export const hiqSettlementItems = pgTable("hiq_settlement_items", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	settlementId: uuid("settlement_id").notNull(),
	roundOrder: integer("round_order").notNull(),
	title: text().notNull(),
	amount: integer().notNull(),
	payerId: uuid("payer_id").notNull(),
}, (table) => [
	foreignKey({
			columns: [table.payerId],
			foreignColumns: [hiqMembers.id],
			name: "hiq_settlement_items_payer_id_hiq_members_id_fk"
		}),
	foreignKey({
			columns: [table.settlementId],
			foreignColumns: [hiqSettlements.id],
			name: "hiq_settlement_items_settlement_id_hiq_settlements_id_fk"
		}).onDelete("cascade"),
]);

export const hiqCrews = pgTable("hiq_crews", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	description: text(),
	leaderId: uuid("leader_id").notNull(),
	baseStoreId: uuid("base_store_id"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	emblem: text(),
	gameType: text("game_type").default('any').notNull(),
	region: text(),
	tags: jsonb(),
	joinType: text("join_type").default('auto').notNull(),
	maxMembers: integer("max_members").default(50),
	coverImage: text("cover_image"),
	shortIntro: text("short_intro"),
	meetingDay: text("meeting_day"),
	meetingTime: text("meeting_time"),
	sportCategory: text("sport_category").default('BILLIARDS').notNull(),
	introQuestions: jsonb("intro_questions").default([]).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.baseStoreId],
			foreignColumns: [hiqStores.id],
			name: "hiq_crews_base_store_id_hiq_stores_id_fk"
		}),
	foreignKey({
			columns: [table.leaderId],
			foreignColumns: [hiqMembers.id],
			name: "hiq_crews_leader_id_hiq_members_id_fk"
		}),
]);

export const golfJoins = pgTable("golf_joins", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	courseName: text("course_name").notNull(),
	region: text().notNull(),
	datetime: timestamp({ mode: 'string' }).notNull(),
	hostId: uuid("host_id"),
	managerPhone: text("manager_phone"),
	greenFee: integer("green_fee").notNull(),
	joinHeadcount: integer("join_headcount").notNull(),
	joinCondition: text("join_condition"),
	roundDate: date("round_date"),
	comment: text(),
	status: text().default('recruiting').notNull(),
	isBlind: boolean("is_blind").default(false).notNull(),
	blindName: text("blind_name"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const hiqCourseHoleInfo = pgTable("hiq_course_hole_info", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	courseId: text("course_id").notNull(),
	courseName: text("course_name").notNull(),
	subPathName: text("sub_path_name"),
	holeNo: integer("hole_no").notNull(),
	par: integer().notNull(),
	voteCount: integer("vote_count").default(1).notNull(),
	isVerified: boolean("is_verified").default(false).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("hiq_course_hole_info_course_id_sub_path_name_hole_no_unique").on(table.courseId, table.subPathName, table.holeNo),
]);

export const golfBookings = pgTable("golf_bookings", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	courseId: text("course_id").notNull(),
	courseName: text("course_name").notNull(),
	region: text().notNull(),
	datetime: timestamp({ mode: 'string' }).notNull(),
	managerPhone: text("manager_phone").notNull(),
	greenFee: integer("green_fee").notNull(),
	isHotDeal: boolean("is_hot_deal").default(false).notNull(),
	options: jsonb().default([]),
	courseType: text("course_type"),
	comment: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	isBlind: boolean("is_blind").default(false).notNull(),
	blindName: text("blind_name"),
	policyType: text("policy_type").default('POLICY_STANDARD').notNull(),
	policyCustomText: text("policy_custom_text"),
	listingType: text("listing_type").default('BOOKING').notNull(),
	joinHeadcount: integer("join_headcount"),
	joinCondition: text("join_condition"),
});

export const golfMatchSessions = pgTable("golf_match_sessions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	pinCode: text("pin_code").notNull(),
	hostId: uuid("host_id").notNull(),
	courseId: text("course_id"),
	courseName: text("course_name"),
	gameMode: text("game_mode").default('stroke').notNull(),
	stake: integer().default(1000).notNull(),
	useOecd: boolean("use_oecd").default(false).notNull(),
	useDouble: boolean("use_double").default(true).notNull(),
	status: text().default('waiting').notNull(),
	currentHole: integer("current_hole").default(1).notNull(),
	players: jsonb().default([]).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	doublingMode: text("doubling_mode").default('next').notNull(),
	nearHistory: jsonb("near_history").default({}).notNull(),
	frontCourseName: text("front_course_name"),
	backCourseName: text("back_course_name"),
	birdieAmount: integer("birdie_amount").default(10000).notNull(),
	eagleAmount: integer("eagle_amount").default(20000).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.hostId],
			foreignColumns: [hiqMembers.id],
			name: "golf_match_sessions_host_id_hiq_members_id_fk"
		}),
]);

export const hiqNotifications = pgTable("hiq_notifications", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	memberId: uuid("member_id").notNull(),
	title: text().notNull(),
	body: text().notNull(),
	category: text(),
	type: text(),
	params: jsonb(),
	isRead: boolean("is_read").default(false).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.memberId],
			foreignColumns: [hiqMembers.id],
			name: "hiq_notifications_member_id_hiq_members_id_fk"
		}),
]);

export const regions = pgTable("regions", {
	code: varchar({ length: 10 }).primaryKey().notNull(),
	sido: varchar({ length: 50 }),
	sigungu: varchar({ length: 50 }),
	dong: varchar({ length: 50 }),
	fullName: varchar("full_name", { length: 150 }),
});

export const golfClubs = pgTable("golf_clubs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	region: text(),
	totalHoles: integer("total_holes").default(18),
	address: text(),
	imageUrl: text("image_url"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const golfClubCourses = pgTable("golf_club_courses", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	clubId: uuid("club_id").notNull(),
	name: text().notNull(),
	holeCount: integer("hole_count").default(9).notNull(),
	index: integer().default(0).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.clubId],
			foreignColumns: [golfClubs.id],
			name: "golf_club_courses_club_id_golf_clubs_id_fk"
		}),
]);

export const rankueGolfClubs = pgTable("rankue_golf_clubs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	region: text(),
	address: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const rankueGolfCourses = pgTable("rankue_golf_courses", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	clubId: uuid("club_id").notNull(),
	name: text().notNull(),
	pars: jsonb().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.clubId],
			foreignColumns: [rankueGolfClubs.id],
			name: "rankue_golf_courses_club_id_fkey"
		}),
]);
