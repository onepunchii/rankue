import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  unique,
  uuid,
  jsonb,
  doublePrecision,
  date,
  varchar,
  index
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// --- Regions Database ---
export const regions = pgTable("regions", {
  code: varchar("code", { length: 10 }).primaryKey().notNull(),
  sido: varchar("sido", { length: 50 }),
  sigungu: varchar("sigungu", { length: 50 }),
  dong: varchar("dong", { length: 50 }),
  fullName: varchar("full_name", { length: 150 }),
});

export const SUBSCRIPTION_TIERS = {
  BASIC: "BASIC",
  PREMIUM: "PREMIUM"
} as const;

// 1. 프로필 (통합 계정 - Auth)
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().notNull(), // Supabase Auth user id
  nickname: text("nickname"),
  email: text("email"),
  phone: text("phone"),
  password: text("password"), // Simple password for proto
  profileImageUrl: text("profile_image_url"),
  role: text("role", { enum: ["user", "store_owner", "admin", "super_admin", "booking_manager"] }).default("user").notNull(),
  status: text("status", { enum: ["active", "banned"] }).default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  currentSport: text("current_sport", { enum: ["BILLIARDS", "GOLF"] }).default("BILLIARDS").notNull(),
  pushToken: text("push_token"), // Expo Push Token column added
  securityQuestion: text("security_question"),
  securityAnswer: text("security_answer"),
  // 소셜 로그인 식별자 — 글로벌(비한국) 유저는 구글·애플로 가입 (한국은 기존 전화번호 유지)
  googleSub: text("google_sub").unique(),
  appleSub: text("apple_sub").unique(),
  // 글로벌 신원 — 동명이인 문제 해결 + 지역·국가 단위 랭킹 확장 기반.
  // handle: 유니크 @아이디(소문자 영숫자·_ 3~20자). 가입 시 자동 생성, 프로필에서 변경.
  // countryCode: ISO 3166-1 alpha-2(KR·VN·TR…) — 가입 시 IP 헤더로 자동. 국가 랭킹의 축.
  // regionCode: 국가 하위 지역(예: KR-11 서울) — 지역 랭킹용 예비(지금은 미수집).
  handle: text("handle").unique(),
  countryCode: text("country_code"),
  regionCode: text("region_code"),
});

// 2. 당구장 (Club/Store) - SaaS Tenant
export const hiqStores = pgTable("hiq_stores", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  slug: text("slug").unique().notNull(), // URL/QR identifier
  name: text("name").notNull(),
  ownerId: uuid("owner_id").references(() => profiles.id), // 사장님 계정 ID

  // Display Info
  logoText: text("logo_text"),
  themeColor: text("theme_color").default("#0e4d2a"),
  neonColor: text("neon_color").default("#ffd700"),
  subText: text("sub_text"),
  description: text("description"),
  notice: text("notice"),

  // Business Info
  region: text("region"), // e.g., "Seoul/Gangnam"
  address: text("address"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  phone: text("phone"),

  // Facilities & Pricing
  pricePer10Min: integer("price_per_10min"), // Legacy
  priceLarge: integer("price_large").default(2000),
  priceMedium: integer("price_medium").default(1500),

  openTime: text("open_time"),
  closeTime: text("close_time"),

  hasParking: boolean("has_parking").default(false), // Legacy flag
  parkingDescription: text("parking_description"), // Detailed parking info

  // Subscription (Billing)
  // Legacy plan field might be there, but using new requested fields
  plan: text("plan").default("free"),
  subscriptionTier: text("subscription_tier").default("BASIC"), // BASIC | PREMIUM
  subscriptionExpiresAt: timestamp("subscription_expires_at"),
  subscriptionStatus: text("subscription_status", { enum: ["active", "overdue", "cancelled"] }).default("active").notNull(),
  nextBillingDate: timestamp("next_billing_date"),
  billingKey: text("billing_key"), // Token for recurring payment
  paymentMethod: text("payment_method"), // CARD, etc.

  tableCount: integer("table_count").default(0), // Legacy
  tableLarge: integer("table_large").default(0),
  tableMedium: integer("table_medium").default(0),

  facilities: jsonb("facilities").$type<string[]>(), // ["smoking", "food", "lesson"]
  images: jsonb("images").$type<string[]>(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// 3. 회원 (Global Member Identity)
export const hiqMembers = pgTable("hiq_members", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  storeId: uuid("store_id").references(() => hiqStores.id).notNull(), // 가입 경로 (모항) - SaaS Context

  // Personal Info
  phone: text("phone").notNull(),
  name: text("name").notNull(), // Display Name
  birthYear: integer("birth_year"),
  gender: text("gender", { enum: ["male", "female"] }),

  // Global Stats (Default)
  handi3c: integer("handi_3c"),
  handi4c: integer("handi_4c"),
  average: text("average"),
  rating3c: integer("rating_3c").default(0).notNull(),
  rating4c: integer("rating_4c").default(0).notNull(),
  avg3c: doublePrecision("avg_3c").default(0),
  avg4c: doublePrecision("avg_4c").default(0),

  // Golf Stats
  golfHandicap: integer("golf_handicap").default(0),
  golfBestScore: integer("golf_best_score").default(0),
  golfAvgScore: doublePrecision("golf_avg_score").default(0),
  golfGrade: text("golf_grade"),
  golfGradeVerified: boolean("golf_grade_verified").default(false).notNull(),
  totalGolfGames: integer("total_golf_games").default(0).notNull(),

  // Meta
  profileId: uuid("profile_id").references(() => profiles.id), // Link to Auth Profile if connected
  marketingAgree: boolean("marketing_agree").default(false),
  visitCount: integer("visit_count").default(0),
  lastVisitedAt: timestamp("last_visited_at"),
  totalSimPoints: integer("total_sim_points").default(0).notNull(),

  // Default Settlement Account
  defaultAccountBank: text("default_account_bank"),
  defaultAccountNumber: text("default_account_number"),
  defaultAccountHolder: text("default_account_holder"),
  introduction: text("introduction"),
  hideSkillBadge: boolean("hide_skill_badge").default(false).notNull(), // 커뮤니티 실력 뱃지 숨김

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique().on(table.storeId, table.phone), // 같은 매장에서 같은 번호 중복 방지 (기존 호환)
]);

// 4. 매장별 회원 멤버십 (N:M Relation - New for SaaS)
export const hiqClubMembers = pgTable("hiq_club_members", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  storeId: uuid("store_id").references(() => hiqStores.id).notNull(),
  memberId: uuid("member_id").references(() => hiqMembers.id).notNull(),

  // Store-specific Override (Optional)
  localHandi3c: integer("local_handi_3c"),
  localHandi4c: integer("local_handi_4c"),
  memo: text("memo"), // 사장님 메모

  joinedAt: timestamp("joined_at").defaultNow().notNull(),
}, (table) => [
  unique().on(table.storeId, table.memberId),
]);

// 5. 게임 (Game Session)
export const hiqGames = pgTable("hiq_games", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  storeId: uuid("store_id").references(() => hiqStores.id).notNull(), // 게임이 발생한 장소

  gameMode: text("game_mode", { enum: ["match", "practice", "tournament"] }).notNull(),
  gameType: text("game_type", { enum: ["3c", "4c", "golf"] }).notNull(),

  // Players
  player1Id: uuid("player1_id").references(() => hiqMembers.id).notNull(),
  player2Id: uuid("player2_id").references(() => hiqMembers.id),
  player3Id: uuid("player3_id").references(() => hiqMembers.id),
  player4Id: uuid("player4_id").references(() => hiqMembers.id),

  player1Name: text("player1_name"),
  player2Name: text("player2_name"),
  player3Name: text("player3_name"),
  player4Name: text("player4_name"),

  // Targets & Scores
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

  targetScore: integer("target_score"),

  player1FinishInnings: integer("player1_finish_innings").default(0).notNull(),
  player2FinishInnings: integer("player2_finish_innings").default(0).notNull(),
  player3FinishInnings: integer("player3_finish_innings").default(0).notNull(),
  player4FinishInnings: integer("player4_finish_innings").default(0).notNull(),

  // Stats
  player1HighRun: integer("player1_high_run").default(0).notNull(),
  player2HighRun: integer("player2_high_run").default(0).notNull(),
  player3HighRun: integer("player3_high_run").default(0).notNull(),
  player4HighRun: integer("player4_high_run").default(0).notNull(),

  // Innings Data
  player1Innings: jsonb("player1_innings"),
  player2Innings: jsonb("player2_innings"),
  player3Innings: jsonb("player3_innings"),
  player4Innings: jsonb("player4_innings"),

  totalInnings: integer("total_innings").default(0).notNull(),

  // Game State
  status: text("status", { enum: ["playing_base", "playing_finish", "finished"] }).default("playing_base").notNull(),
  result: text("result"),
  isRanked: boolean("is_ranked").default(false).notNull(),

  // Finish Rules
  finishTargetCount: integer("finish_target_count").default(0).notNull(),
  ruleFinishType: text("rule_finish_type", { enum: ["none", "3c", "bank"] }).default("none").notNull(),
  usePbaRule: boolean("use_pba_rule").default(false).notNull(),

  winnerId: uuid("winner_id").references(() => hiqMembers.id),
  playedAt: timestamp("played_at").defaultNow().notNull(),
  sportCategory: text("sport_category", { enum: ["BILLIARDS", "GOLF"] }).default("BILLIARDS").notNull(),

  // Tournament Link
  tournamentId: uuid("tournament_id"), // FK added later if needed or loose link
});

// 6. 대회 (Tournament) - Store Event
export const hiqTournaments = pgTable("hiq_tournaments", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  storeId: uuid("store_id").references(() => hiqStores.id).notNull(),

  title: text("title").notNull(),
  content: text("content"), // 대회 요강 (description)

  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"), // Optional
  recruitEnd: timestamp("recruit_end"), // 접수 마감

  gameType: text("game_type", { enum: ["3c", "4c", "golf"] }).notNull(),
  sportCategory: text("sport_category", { enum: ["BILLIARDS", "GOLF"] }).default("BILLIARDS").notNull(),
  format: text("format", { enum: ["knockout", "league"] }).default("knockout").notNull(),

  matchMethod: text("match_method", { enum: ["handicap", "fixed"] }).default("handicap").notNull(),
  handicapRule: text("handicap_rule"), // text description

  // Rule Details
  handicapRate: integer("handicap_rate").default(100), // e.g. 100%, 70%
  targetScore: integer("target_score"), // Only for fixed method
  bankShotPoint: integer("bank_shot_point").default(2),
  timeLimit: integer("time_limit").default(40),

  maxPlayers: integer("max_players").default(32),
  entryFee: integer("entry_fee").default(20000),
  prizes: jsonb("prizes"), // { "1st": "30만원" }

  status: text("status", { enum: ["recruiting", "preparing", "ongoing", "ended"] }).default("recruiting").notNull(),
  posterUrl: text("poster_url"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 7. 대회 참가자
export const hiqTournamentParticipants = pgTable("hiq_tournament_participants", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  tournamentId: uuid("tournament_id").references(() => hiqTournaments.id).notNull(),
  memberId: uuid("member_id").references(() => hiqMembers.id).notNull(),

  currentRank: integer("current_rank"),
  status: text("status", { enum: ["active", "eliminated", "winner"] }).default("active"),

  registeredAt: timestamp("registered_at").defaultNow().notNull(),
}, (table) => [
  unique().on(table.tournamentId, table.memberId),
]);

// 8. 크루 (Crew/Club) - Community
export const hiqCrews = pgTable("hiq_crews", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  name: text("name").notNull(),
  description: text("description"),
  leaderId: uuid("leader_id").references(() => hiqMembers.id).notNull(),
  baseStoreId: uuid("base_store_id").references(() => hiqStores.id), // Basecamp

  // New Fields for Wizard
  emblem: text("emblem"), // Emoji or URL
  gameType: text("game_type", { enum: ["3c", "4c", "pocket", "any", "field", "screen", "range"] }).default("any").notNull(),
  region: text("region"),
  // 국가 코드 — 생성자 프로필에서 서버가 자동 세팅(클라 값 신뢰 안 함). 국가별 크루 발견·랭킹 축.
  // region은 자유 텍스트 유지: ko는 행정동 검색, 비ko는 도시명 직접 입력.
  countryCode: text("country_code"),
  tags: jsonb("tags"), // ["#tag1", "#tag2"]
  joinType: text("join_type", { enum: ["auto", "approval"] }).default("auto").notNull(),
  maxMembers: integer("max_members").default(50),
  coverImage: text("cover_image"), // New Cover Image URL
  shortIntro: text("short_intro"), // Short slogan (e.g. "광진구 2030 크루")
  meetingDay: text("meeting_day"), // e.g. "SAT"
  meetingTime: text("meeting_time"), // e.g. "14:00"
  sportCategory: text("sport_category", { enum: ["BILLIARDS", "GOLF", "MIXED"] }).default("BILLIARDS").notNull(),
  introQuestions: jsonb("intro_questions"),

  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),


  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique().on(table.name), // 크루명 중복 금지 (오너 확정 2026-08-05). 대소문자 변형은 앱 검사가 잡는다.
]);

export const hiqCrewMembers = pgTable("hiq_crew_members", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  crewId: uuid("crew_id").references(() => hiqCrews.id).notNull(),
  memberId: uuid("member_id").references(() => hiqMembers.id).notNull(),
  role: text("role", { enum: ["leader", "manage", "member", "pending"] }).default("member").notNull(),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
}, (table) => [
  unique().on(table.crewId, table.memberId)
]);

export const hiqCrewActivities = pgTable("hiq_crew_activities", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  crewId: uuid("crew_id").references(() => hiqCrews.id).notNull(),
  creatorId: uuid("creator_id").references(() => hiqMembers.id).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  activityDate: timestamp("activity_date").notNull(),
  locationStoreId: uuid("location_store_id").references(() => hiqStores.id), // If at a HiQ store
  locationName: text("location_name"), // If generic location
  maxParticipants: integer("max_participants").default(8),
  cost: text("cost"), // e.g. "Game fee Dutch pay"
  sportCategory: text("sport_category", { enum: ["BILLIARDS", "GOLF"] }).default("BILLIARDS").notNull(),
  category: text("category"), // REGULAR_ROUNDING, BLITZ_SCREEN, etc.
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const hiqCrewActivityParticipants = pgTable("hiq_crew_activity_participants", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  activityId: uuid("activity_id").references(() => hiqCrewActivities.id).notNull(),
  memberId: uuid("member_id").references(() => hiqMembers.id).notNull(), // Links to HiqMember directly for simplicity (or CrewMember)
  status: text("status", { enum: ["joined", "waiting"] }).default("joined").notNull(),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
}, (table) => [
  unique().on(table.activityId, table.memberId)
]);

// 8.1 크루 게시판 (Crew Posts)
export const hiqCrewPosts = pgTable("hiq_crew_posts", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  crewId: uuid("crew_id").references(() => hiqCrews.id).notNull(),
  authorId: uuid("author_id").references(() => hiqMembers.id).notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  category: text("category"), // 공지사항, 가입인사, 모임후기, 자유글
  isNotice: boolean("is_notice").default(false).notNull(),
  images: jsonb("images").$type<string[]>(), // Array of image URLs
  sportCategory: text("sport_category", { enum: ["BILLIARDS", "GOLF"] }).default("BILLIARDS").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 8.2 크루 댓글 (Crew Comments)
export const hiqCrewComments = pgTable("hiq_crew_comments", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  postId: uuid("post_id").references(() => hiqCrewPosts.id).notNull(),
  authorId: uuid("author_id").references(() => hiqMembers.id).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 8.3 크루 사진첩 (Crew Photos)
export const hiqCrewPhotos = pgTable("hiq_crew_photos", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  crewId: uuid("crew_id").references(() => hiqCrews.id).notNull(),
  uploaderId: uuid("uploader_id").references(() => hiqMembers.id).notNull(),
  url: text("url").notNull(),
  caption: text("caption"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 8.4 크루 채팅 (Crew Chats)
export const hiqCrewChats = pgTable("hiq_crew_chats", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  crewId: uuid("crew_id").references(() => hiqCrews.id).notNull(),
  senderId: uuid("sender_id").references(() => hiqMembers.id).notNull(),
  message: text("message").notNull(),
  type: text("type", { enum: ["text", "photo", "settlement"] }).default("text").notNull(),
  metadata: jsonb("metadata"), // For settlementId, photoUrl, etc.
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 8.5 정산 (Settlements)
export const hiqSettlements = pgTable("hiq_settlements", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  crewId: uuid("crew_id").references(() => hiqCrews.id).notNull(),
  creatorId: uuid("creator_id").references(() => hiqMembers.id).notNull(),
  title: text("title").notNull(), // "11/24 불금 정모"
  accountBank: text("account_bank"),
  accountNumber: text("account_number"),
  accountHolder: text("account_holder"),
  status: text("status", { enum: ["active", "completed"] }).default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const hiqSettlementItems = pgTable("hiq_settlement_items", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  settlementId: uuid("settlement_id").references(() => hiqSettlements.id, { onDelete: 'cascade' }).notNull(),
  roundOrder: integer("round_order").notNull(), // 1, 2, 3...
  title: text("title").notNull(), // "1차 고기", "2차 노래방"
  amount: integer("amount").notNull(),
  payerId: uuid("payer_id").references(() => hiqMembers.id).notNull(), // Who paid this round
});

export const hiqSettlementParticipants = pgTable("hiq_settlement_participants", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  itemId: uuid("item_id").references(() => hiqSettlementItems.id, { onDelete: 'cascade' }).notNull(),
  memberId: uuid("member_id").references(() => hiqMembers.id).notNull(),
}, (table) => [
  unique().on(table.itemId, table.memberId)
]);

// 8.5 크루 게시글 좋아요 (Crew Post Likes)
export const hiqCrewLikes = pgTable("hiq_crew_likes", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  postId: uuid("post_id").references(() => hiqCrewPosts.id).notNull(),
  memberId: uuid("member_id").references(() => hiqMembers.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique().on(table.postId, table.memberId),
]);

// 8.6 크루 사진 좋아요 (Crew Photo Likes)
export const hiqCrewPhotoLikes = pgTable("hiq_crew_photo_likes", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  photoId: uuid("photo_id").references(() => hiqCrewPhotos.id, { onDelete: 'cascade' }).notNull(),
  memberId: uuid("member_id").references(() => hiqMembers.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique().on(table.photoId, table.memberId)
]);

// 8.7 크루 사진 댓글 (Crew Photo Comments)
export const hiqCrewPhotoComments = pgTable("hiq_crew_photo_comments", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  photoId: uuid("photo_id").references(() => hiqCrewPhotos.id, { onDelete: 'cascade' }).notNull(),
  authorId: uuid("author_id").references(() => hiqMembers.id).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 8.8 크루 투표 (Crew Polls)
export const hiqPolls = pgTable("hiq_polls", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  crewId: uuid("crew_id").references(() => hiqCrews.id, { onDelete: 'cascade' }).notNull(),
  authorId: uuid("author_id").references(() => hiqMembers.id).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  isAnonymous: boolean("is_anonymous").default(false).notNull(),
  allowMultiple: boolean("allow_multiple").default(false).notNull(),
  status: text("status", { enum: ["active", "closed"] }).default("active").notNull(),
  endTime: timestamp("end_time"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const hiqPollOptions = pgTable("hiq_poll_options", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  pollId: uuid("poll_id").references(() => hiqPolls.id, { onDelete: 'cascade' }).notNull(),
  text: text("text").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const hiqPollVotes = pgTable("hiq_poll_votes", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  pollId: uuid("poll_id").references(() => hiqPolls.id, { onDelete: 'cascade' }).notNull(),
  optionId: uuid("option_id").references(() => hiqPollOptions.id, { onDelete: 'cascade' }).notNull(),
  memberId: uuid("member_id").references(() => hiqMembers.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique().on(table.optionId, table.memberId)
]);


export const insertHiqCrewSchema = createInsertSchema(hiqCrews).omit({ id: true, createdAt: true });
export const insertHiqCrewMemberSchema = createInsertSchema(hiqCrewMembers).omit({ id: true, joinedAt: true });

// --- Types Export ---
export type HiqCrew = typeof hiqCrews.$inferSelect;
export type InsertHiqCrew = z.infer<typeof insertHiqCrewSchema>;
export type HiqCrewMember = typeof hiqCrewMembers.$inferSelect;
export type InsertHiqCrewMember = z.infer<typeof insertHiqCrewMemberSchema>;

export const insertHiqCrewPostSchema = createInsertSchema(hiqCrewPosts).omit({ id: true, createdAt: true });
export type HiqCrewPost = typeof hiqCrewPosts.$inferSelect;
export type InsertHiqCrewPost = z.infer<typeof insertHiqCrewPostSchema>;

// 9. 파트너 입점 문의 (Lead Gen)
export const partnerLeads = pgTable("partner_leads", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  ownerName: text("owner_name").notNull(),
  phoneNumber: text("phone_number").notNull(),
  storeName: text("store_name"),
  region: text("region"),
  status: text("status", { enum: ["NEW", "CONTACTED", "REGISTERED"] }).default("NEW").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  businessNumber: text("business_number"), // New
  businessLicenseFile: text("business_license_file"), // New (URL or Path)
  regionDetail: text("region_detail"), // New (Gu/Dong info)
});

// 9.1 골프 부킹 (Golf Booking)
export const golfBookings = pgTable("golf_bookings", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  courseId: text("course_id").notNull(),
  courseName: text("course_name").notNull(),
  region: text("region").notNull(),
  datetime: timestamp("datetime").notNull(),
  managerPhone: text("manager_phone").notNull(),
  greenFee: integer("green_fee").notNull(),
  isHotDeal: boolean("is_hot_deal").default(false).notNull(),
  options: jsonb("options").$type<string[]>().default([]),
  courseType: text("course_type"),
  comment: text("comment"),
  isBlind: boolean("is_blind").default(false).notNull(),
  blindName: text("blind_name"),
  policyType: text("policy_type").default("POLICY_STANDARD").notNull(),
  policyCustomText: text("policy_custom_text"),
  listingType: text("listing_type").default("BOOKING").notNull(),
  joinHeadcount: integer("join_headcount"),
  joinCondition: text("join_condition"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 9.2 골프 조인 (Golf Join) - Separated from Booking
export const golfJoins = pgTable("golf_joins", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  courseName: text("course_name").notNull(),
  region: text("region").notNull(),
  datetime: timestamp("datetime").notNull(),
  hostId: uuid("host_id"),
  managerPhone: text("manager_phone"),
  greenFee: integer("green_fee").notNull(),
  joinHeadcount: integer("join_headcount").notNull(),
  joinCondition: text("join_condition"),
  roundDate: date("round_date"),
  comment: text("comment"),
  status: text("status", { enum: ["recruiting", "closed"] }).default("recruiting").notNull(),
  isBlind: boolean("is_blind").default(false).notNull(),
  blindName: text("blind_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 9.3 골프 코스 홀 정보 (Crowdsourced PAR Info)
export const hiqCourseHoleInfo = pgTable("hiq_course_hole_info", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  courseId: text("course_id").notNull(),
  courseName: text("course_name").notNull(),
  subPathName: text("sub_path_name"),
  holeNo: integer("hole_no").notNull(),
  par: integer("par").notNull(),
  voteCount: integer("vote_count").default(1).notNull(),
  isVerified: boolean("is_verified").default(false).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique().on(table.courseId, table.subPathName, table.holeNo)
]);

export const insertPartnerLeadSchema = createInsertSchema(partnerLeads).omit({ id: true, createdAt: true, status: true });
export type PartnerLead = typeof partnerLeads.$inferSelect;
export type InsertPartnerLead = z.infer<typeof insertPartnerLeadSchema>;

export const insertGolfBookingSchema = createInsertSchema(golfBookings).omit({ id: true, createdAt: true });
export type GolfBooking = typeof golfBookings.$inferSelect;
export type InsertGolfBooking = z.infer<typeof insertGolfBookingSchema>;

export const insertGolfJoinSchema = createInsertSchema(golfJoins).omit({ id: true, createdAt: true });
export type GolfJoin = typeof golfJoins.$inferSelect;
export type InsertGolfJoin = z.infer<typeof insertGolfJoinSchema>;

// 10. 공지사항 (Admin Notice)
export const notices = pgTable("notices", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  target: text("target", { enum: ["all", "owners"] }).default("all").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertNoticeSchema = createInsertSchema(notices).omit({ id: true, createdAt: true });
export type Notice = typeof notices.$inferSelect;
export type InsertNotice = z.infer<typeof insertNoticeSchema>;

// --- Existing Tables (Logs, History, Friendship, Invites) ---
// (Minor updates to references if needed)

// 11. 건의함 (Suggestion Box)
export const suggestions = pgTable("suggestions", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  userId: uuid("user_id").references(() => profiles.id), // Login user if available
  type: text("type").notNull(), // BUG, PARTNERSHIP, FEATURE, ETC
  content: text("content").notNull(),
  contact: text("contact"), // Email or Phone
  isRead: boolean("is_read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSuggestionSchema = createInsertSchema(suggestions).omit({ id: true, createdAt: true, isRead: true });
export type Suggestion = typeof suggestions.$inferSelect;
export type InsertSuggestion = z.infer<typeof insertSuggestionSchema>;

// 12. 에러 수집함 (Client Error Logs)
// 클라이언트 window.onerror / unhandledrejection 에서 익명 전송된 에러를 저장
export const errorLogs = pgTable("error_logs", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  message: text("message").notNull(),
  stack: text("stack"),
  url: text("url"), // 발생 페이지 경로 (쿼리스트링 제외)
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ErrorLog = typeof errorLogs.$inferSelect;


export const hiqVisitLogs = pgTable("hiq_visit_logs", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  memberId: uuid("member_id").references(() => hiqMembers.id).notNull(),
  storeId: uuid("store_id").references(() => hiqStores.id), // Which store?
  visitedAt: timestamp("visited_at").defaultNow().notNull(),
});

export const hiqGameHistory = pgTable("hiq_game_history", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  memberId: uuid("member_id").references(() => hiqMembers.id).notNull(),
  gameId: uuid("game_id").references(() => hiqGames.id),
  storeId: uuid("store_id").references(() => hiqStores.id), // Partition by store

  gameMode: text("game_mode", { enum: ["match", "practice", "tournament"] }).notNull(),
  gameType: text("game_type", { enum: ["3c", "4c", "golf"] }).notNull(),

  score: integer("score").notNull(),
  innings: integer("innings").notNull(),
  average: text("average").notNull(),
  isWinner: boolean("is_winner").default(false).notNull(),
  isRanked: boolean("is_ranked").default(false).notNull(),
  highRun: integer("high_run").default(0).notNull(),
  inningData: jsonb("inning_data"),
  earnedPoints: integer("earned_points").default(0).notNull(),
  opponentName: text("opponent_name"),
  locationName: text("location_name"), // Added for Golf: Course name
  subType: text("sub_type"), // Added for Golf: Course sub-type (e.g. "Castle")
  scoreJson: jsonb("score_json"), // Added for Golf: Hole-by-hole scores
  sportCategory: text("sport_category", { enum: ["BILLIARDS", "GOLF"] }).default("BILLIARDS").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const hiqFriendships = pgTable("hiq_friendships", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  requesterId: uuid("requester_id").references(() => hiqMembers.id).notNull(),
  receiverId: uuid("receiver_id").references(() => hiqMembers.id).notNull(),
  status: text("status", { enum: ["pending", "accepted"] }).default("pending").notNull(),
  sportCategory: text("sport_category", { enum: ["BILLIARDS", "GOLF"] }).default("BILLIARDS").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique().on(table.requesterId, table.receiverId, table.sportCategory),
]);

export const hiqInvites = pgTable("hiq_invites", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  code: text("code").notNull(), // 6-digit code (Billiards) or 4-digit code (Golf)
  hostId: uuid("host_id").references(() => hiqMembers.id).notNull(),
  storeId: uuid("store_id"), // Context
  guestId: uuid("guest_id").references(() => hiqMembers.id),
  status: text("status", { enum: ["pending", "accepted", "expired"] }).default("pending").notNull(),
  sportCategory: text("sport_category", { enum: ["BILLIARDS", "GOLF"] }).default("BILLIARDS").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});


// --- Golf Club & Course Database ---
export const golfClubs = pgTable("golf_clubs", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  name: text("name").notNull(),
  region: text("region"),
  totalHoles: integer("total_holes").default(18),
  address: text("address"),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const golfClubCourses = pgTable("golf_club_courses", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  clubId: uuid("club_id").references(() => golfClubs.id).notNull(),
  name: text("name").notNull(),
  holeCount: integer("hole_count").default(9).notNull(),
  index: integer("index").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertGolfClubSchema = createInsertSchema(golfClubs).omit({ id: true, createdAt: true, updatedAt: true });
export const insertGolfClubCourseSchema = createInsertSchema(golfClubCourses).omit({ id: true, createdAt: true, updatedAt: true });

export type GolfClub = typeof golfClubs.$inferSelect;
export type InsertGolfClub = z.infer<typeof insertGolfClubSchema>;
export type GolfClubCourse = typeof golfClubCourses.$inferSelect;
export type InsertGolfClubCourse = z.infer<typeof insertGolfClubCourseSchema>;

// --- Rankue Official Golf Database (Separate from user/store data) ---
export const rankueGolfClubs = pgTable("rankue_golf_clubs", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  name: text("name").notNull(), // 골프장 이름
  region: text("region"),
  address: text("address"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const rankueGolfCourses = pgTable("rankue_golf_courses", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  clubId: uuid("club_id").references(() => rankueGolfClubs.id).notNull(),
  name: text("name").notNull(), // 코스 이름 (e.g. "East", "West")
  pars: jsonb("pars").$type<number[]>().notNull(), // [4, 4, 3, 5, 4, 3, 4, 5, 4]
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertRankueGolfClubSchema = createInsertSchema(rankueGolfClubs).omit({ id: true, createdAt: true, updatedAt: true });
export const insertRankueGolfCourseSchema = createInsertSchema(rankueGolfCourses).omit({ id: true, createdAt: true, updatedAt: true });

export type RankueGolfClub = typeof rankueGolfClubs.$inferSelect;
export type RankueGolfCourse = typeof rankueGolfCourses.$inferSelect;

// 11. 골프 매치 세션 (PIN 기반 실시간 내기 매치)
export const golfMatchSessions = pgTable("golf_match_sessions", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  pinCode: text("pin_code").notNull(), // 4-digit PIN
  hostId: uuid("host_id").references(() => hiqMembers.id).notNull(),

  courseId: text("course_id"),
  courseName: text("course_name"),

  gameMode: text("game_mode", { enum: ["stroke", "skins"] }).default("stroke").notNull(),
  stake: integer("stake").default(1000).notNull(), // Per stroke/hole
  useOecd: boolean("use_oecd").default(false).notNull(),
  useDouble: boolean("use_double").default(false).notNull(),

  status: text("status", { enum: ["waiting", "playing", "finished"] }).default("waiting").notNull(),
  currentHole: integer("current_hole").default(1).notNull(),

  // Player Data: Array of { memberId, name, scores: [18], penalties: [18] }
  players: jsonb("players").$type<any[]>().default([]).notNull(),

  doublingMode: text("doubling_mode", { enum: ["none", "next"] }).default("next").notNull(),
  nearHistory: jsonb("near_history").default({}).notNull(),
  frontCourseName: text("front_course_name"),
  backCourseName: text("back_course_name"),
  birdieAmount: integer("birdie_amount").default(10000).notNull(),
  eagleAmount: integer("eagle_amount").default(20000).notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertGolfMatchSessionSchema = createInsertSchema(golfMatchSessions).omit({ id: true, createdAt: true, updatedAt: true });
export type GolfMatchSession = typeof golfMatchSessions.$inferSelect;
export type InsertGolfMatchSession = z.infer<typeof insertGolfMatchSessionSchema>;

// 12. 골프 회원권 거래 (Membership Orders)
export const golfMembershipOrders = pgTable("golf_membership_orders", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  courseName: text("course_name").notNull(),
  orderType: text("order_type", { enum: ["BUY", "SELL"] }).notNull(),
  price: doublePrecision("price").notNull(), // Hope Price (Use doublePrecision for large numbers/safety, though integer is usually fine for KRW)
  contact: text("contact").notNull(),
  status: text("status", { enum: ["PENDING", "CONTACTED", "COMPLETED", "CANCELLED"] }).default("PENDING").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertGolfMembershipOrderSchema = createInsertSchema(golfMembershipOrders).omit({ id: true, createdAt: true, updatedAt: true });
export type GolfMembershipOrder = typeof golfMembershipOrders.$inferSelect;
export type InsertGolfMembershipOrder = z.infer<typeof insertGolfMembershipOrderSchema>;

export const hiqSimRecords = pgTable("hiq_sim_records", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  memberId: uuid("member_id").references(() => hiqMembers.id).notNull(),
  shotData: jsonb("shot_data").notNull(),
  points: integer("points").notNull(),
  difficulty: text("difficulty"),
  cushionCount: integer("cushion_count"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const hiqLeaderboard = pgTable("hiq_leaderboard", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  memberId: uuid("member_id").references(() => hiqMembers.id).notNull(),
  score: integer("score").notNull(),
  rank: integer("rank"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const hiqSuccessfulShots = pgTable("hiq_successful_shots", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  gameType: text("game_type", { enum: ["3c", "4c"] }).notNull(),
  ballPositions: jsonb("ball_positions").notNull(),
  shotParams: jsonb("shot_params").notNull(),
  cushionCount: integer("cushion_count"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// --- Zod Insert Schemas ---
export const insertHiqStoreSchema = createInsertSchema(hiqStores).omit({ id: true, createdAt: true, updatedAt: true });
export const insertHiqMemberSchema = createInsertSchema(hiqMembers, {
  phone: z.string().min(10, "전화번호 형식이 올바르지 않습니다."),
  name: z.string().min(2, "이름은 2글자 이상이어야 합니다."),
}).extend({
  password: z.string().optional(),
  securityQuestion: z.string().optional(),
  securityAnswer: z.string().optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  visitCount: true,
  totalSimPoints: true
});

export const insertHiqClubMemberSchema = createInsertSchema(hiqClubMembers).omit({ id: true, joinedAt: true });
export const insertHiqTournamentSchema = createInsertSchema(hiqTournaments).omit({ id: true, createdAt: true });
export const insertHiqTournamentParticipantSchema = createInsertSchema(hiqTournamentParticipants).omit({ id: true, registeredAt: true });

export const insertHiqGameSchema = createInsertSchema(hiqGames).omit({
  id: true,
  playedAt: true
});

export const insertHiqVisitLogSchema = createInsertSchema(hiqVisitLogs).omit({
  id: true,
  visitedAt: true
});

export const insertHiqGameHistorySchema = createInsertSchema(hiqGameHistory).omit({
  id: true,
  createdAt: true
});

export const insertHiqFriendshipSchema = createInsertSchema(hiqFriendships).omit({
  id: true,
  createdAt: true
});

export const insertHiqSimRecordSchema = createInsertSchema(hiqSimRecords).omit({ id: true, createdAt: true });
export const insertHiqLeaderboardSchema = createInsertSchema(hiqLeaderboard).omit({ id: true, updatedAt: true });
export const insertHiqSuccessfulShotSchema = createInsertSchema(hiqSuccessfulShots).omit({ id: true, createdAt: true });


// --- Types Export ---
export type Profile = typeof profiles.$inferSelect;
export type HiqStore = typeof hiqStores.$inferSelect;
export type InsertHiqStore = z.infer<typeof insertHiqStoreSchema>;
export type HiqMember = typeof hiqMembers.$inferSelect;
export type InsertHiqMember = z.infer<typeof insertHiqMemberSchema>;
export type HiqClubMember = typeof hiqClubMembers.$inferSelect;
export type InsertHiqClubMember = z.infer<typeof insertHiqClubMemberSchema>;
export type HiqTournament = typeof hiqTournaments.$inferSelect;
export type InsertHiqTournament = z.infer<typeof insertHiqTournamentSchema>;
export type HiqTournamentParticipant = typeof hiqTournamentParticipants.$inferSelect;
export type InsertHiqTournamentParticipant = z.infer<typeof insertHiqTournamentParticipantSchema>;
export type HiqGame = typeof hiqGames.$inferSelect;
export type InsertHiqGame = z.infer<typeof insertHiqGameSchema>;
export type HiqVisitLog = typeof hiqVisitLogs.$inferSelect;
export type InsertHiqVisitLog = z.infer<typeof insertHiqVisitLogSchema>;
export type HiqGameHistory = typeof hiqGameHistory.$inferSelect;
export type InsertHiqGameHistory = z.infer<typeof insertHiqGameHistorySchema>;
export type HiqFriendship = typeof hiqFriendships.$inferSelect;
export type InsertHiqFriendship = z.infer<typeof insertHiqFriendshipSchema>;
export type HiqSimRecord = typeof hiqSimRecords.$inferSelect;
export type HiqLeaderboard = typeof hiqLeaderboard.$inferSelect;
export type HiqSuccessfulShot = typeof hiqSuccessfulShots.$inferSelect;
export type InsertHiqSuccessfulShot = z.infer<typeof insertHiqSuccessfulShotSchema>;

export const insertHiqCrewActivitySchema = createInsertSchema(hiqCrewActivities).omit({ id: true, createdAt: true });
export const insertHiqCrewActivityParticipantSchema = createInsertSchema(hiqCrewActivityParticipants).omit({ id: true, joinedAt: true });

export type HiqCrewActivity = typeof hiqCrewActivities.$inferSelect;
export type InsertHiqCrewActivity = z.infer<typeof insertHiqCrewActivitySchema>;
export type HiqCrewActivityParticipant = typeof hiqCrewActivityParticipants.$inferSelect;
export type InsertHiqCrewActivityParticipant = z.infer<typeof insertHiqCrewActivityParticipantSchema>;

export const insertHiqCrewLikeSchema = createInsertSchema(hiqCrewLikes).omit({ id: true, createdAt: true });
export type HiqCrewLike = typeof hiqCrewLikes.$inferSelect;
export type InsertHiqCrewLike = z.infer<typeof insertHiqCrewLikeSchema>;
export const insertHiqCrewPhotoLikeSchema = createInsertSchema(hiqCrewPhotoLikes);
export const insertHiqCrewPhotoCommentSchema = createInsertSchema(hiqCrewPhotoComments);

export const insertHiqSettlementSchema = createInsertSchema(hiqSettlements).omit({ id: true, createdAt: true, status: true });
export const insertHiqSettlementItemSchema = createInsertSchema(hiqSettlementItems).omit({ id: true });
export const insertHiqSettlementParticipantSchema = createInsertSchema(hiqSettlementParticipants).omit({ id: true });

export type HiqSettlement = typeof hiqSettlements.$inferSelect;
export type InsertHiqSettlement = z.infer<typeof insertHiqSettlementSchema>;
export type HiqSettlementItem = typeof hiqSettlementItems.$inferSelect;
export type InsertHiqSettlementItem = z.infer<typeof insertHiqSettlementItemSchema>;

export type HiqSettlementParticipant = typeof hiqSettlementParticipants.$inferSelect;
export type InsertHiqSettlementParticipant = z.infer<typeof insertHiqSettlementParticipantSchema>;

export type HiqCrewPhotoLike = typeof hiqCrewPhotoLikes.$inferSelect;
export type InsertHiqCrewPhotoLike = typeof hiqCrewPhotoLikes.$inferInsert;
export type HiqCrewPhotoComment = typeof hiqCrewPhotoComments.$inferSelect;
export type InsertHiqCrewPhotoComment = typeof hiqCrewPhotoComments.$inferInsert;

export const insertHiqCrewCommentSchema = createInsertSchema(hiqCrewComments).omit({ id: true, createdAt: true });
export type InsertHiqCrewComment = z.infer<typeof insertHiqCrewCommentSchema>;

export const insertHiqCrewPhotoSchema = createInsertSchema(hiqCrewPhotos).omit({ id: true, createdAt: true });
export type InsertHiqCrewPhoto = z.infer<typeof insertHiqCrewPhotoSchema>;

export const insertHiqCrewChatSchema = createInsertSchema(hiqCrewChats).omit({ id: true, createdAt: true });
export type InsertHiqCrewChat = z.infer<typeof insertHiqCrewChatSchema>;

export const insertHiqPollSchema = createInsertSchema(hiqPolls).omit({ id: true, createdAt: true, status: true });
export const insertHiqPollOptionSchema = createInsertSchema(hiqPollOptions).omit({ id: true, createdAt: true });
export const insertHiqPollVoteSchema = createInsertSchema(hiqPollVotes).omit({ id: true, createdAt: true });

export type HiqPoll = typeof hiqPolls.$inferSelect;
export type InsertHiqPoll = z.infer<typeof insertHiqPollSchema>;
export type HiqPollOption = typeof hiqPollOptions.$inferSelect;
export type InsertHiqPollOption = z.infer<typeof insertHiqPollOptionSchema>;
export type HiqPollVote = typeof hiqPollVotes.$inferSelect;
export type InsertHiqPollVote = z.infer<typeof insertHiqPollVoteSchema>;


// --- Settlement Relations ---

export const hiqSettlementsRelations = relations(hiqSettlements, ({ many }) => ({
  items: many(hiqSettlementItems),
}));

export const hiqSettlementItemsRelations = relations(hiqSettlementItems, ({ one, many }) => ({
  settlement: one(hiqSettlements, {
    fields: [hiqSettlementItems.settlementId],
    references: [hiqSettlements.id],
  }),
  participants: many(hiqSettlementParticipants),
  payer: one(hiqMembers, {
    fields: [hiqSettlementItems.payerId],
    references: [hiqMembers.id],
  }),
}));

export const hiqSettlementParticipantsRelations = relations(hiqSettlementParticipants, ({ one }) => ({
  item: one(hiqSettlementItems, {
    fields: [hiqSettlementParticipants.itemId],
    references: [hiqSettlementItems.id],
  }),
  member: one(hiqMembers, {
    fields: [hiqSettlementParticipants.memberId],
    references: [hiqMembers.id],
  }),
}));
export const insertHiqCourseHoleInfoSchema = createInsertSchema(hiqCourseHoleInfo).omit({ id: true, updatedAt: true });
export type HiqCourseHoleInfo = typeof hiqCourseHoleInfo.$inferSelect;
export type InsertHiqCourseHoleInfo = z.infer<typeof insertHiqCourseHoleInfoSchema>;

// 12. 알림함 (Notification Inbox)
export const hiqNotifications = pgTable("hiq_notifications", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  memberId: uuid("member_id").references(() => hiqMembers.id).notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  category: text("category"), // BILLIARDS, GOLF
  type: text("type"), // CHAT, NOTICE, MEETING, RANKING
  params: jsonb("params"), // JSON structure for deep linking
  isRead: boolean("is_read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertHiqNotificationSchema = createInsertSchema(hiqNotifications).omit({ id: true, createdAt: true });
export type HiqNotification = typeof hiqNotifications.$inferSelect;
export type InsertHiqNotification = z.infer<typeof insertHiqNotificationSchema>;

// hiq_crew_notification_settings — per-crew per-member push notification preferences
export const hiqCrewNotificationSettings = pgTable("hiq_crew_notification_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  crewId: uuid("crew_id").notNull(),
  memberId: uuid("member_id").notNull(),
  chatEnabled: boolean("chat_enabled").default(true).notNull(),
  activityEnabled: boolean("activity_enabled").default(true).notNull(),
  settlementEnabled: boolean("settlement_enabled").default(true).notNull(),
  postCommentEnabled: boolean("post_comment_enabled").default(true).notNull(),
  pollEnabled: boolean("poll_enabled").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  uniq: unique().on(table.crewId, table.memberId),
}));
export type HiqCrewNotificationSetting = typeof hiqCrewNotificationSettings.$inferSelect;
export type InsertHiqCrewNotificationSetting = typeof hiqCrewNotificationSettings.$inferInsert;

// --- Poll Relations ---

export const hiqPollsRelations = relations(hiqPolls, ({ many, one }) => ({
  options: many(hiqPollOptions),
  votes: many(hiqPollVotes),
  author: one(hiqMembers, {
    fields: [hiqPolls.authorId],
    references: [hiqMembers.id],
  }),
}));

export const hiqPollOptionsRelations = relations(hiqPollOptions, ({ one, many }) => ({
  poll: one(hiqPolls, {
    fields: [hiqPollOptions.pollId],
    references: [hiqPolls.id],
  }),
  votes: many(hiqPollVotes),
}));

export const hiqPollVotesRelations = relations(hiqPollVotes, ({ one }) => ({
  poll: one(hiqPolls, {
    fields: [hiqPollVotes.pollId],
    references: [hiqPolls.id],
  }),
  option: one(hiqPollOptions, {
    fields: [hiqPollVotes.optionId],
    references: [hiqPollOptions.id],
  }),
  member: one(hiqMembers, {
    fields: [hiqPollVotes.memberId],
    references: [hiqMembers.id],
  }),
}));

// 13. 커뮤니티 — 전체 공개 게시판. 크루와의 경계선: 가입 승인이 없으면 커뮤니티.
// 채팅·DM은 만들지 않는다(공개 댓글만) — 거래 알선 뒷문 + 크루 잠식 방지.
export const hiqCommunityPosts = pgTable("hiq_community_posts", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  // brag=한 큐 자랑, ask=물어보기(잡담 흡수), store=우리 매장, lesson=레슨
  board: text("board", { enum: ["brag", "ask", "store", "lesson"] }).notNull(),
  authorId: uuid("author_id").references(() => hiqMembers.id).notNull(),
  // 자랑은 제목 없이 캡션이 곧 제목 — title은 store/lesson에서만 선택 사용
  title: text("title"),
  content: text("content").notNull(),
  images: jsonb("images").$type<string[]>(),
  // 경기결과 카드 — 클라이언트는 historyId만 보내고, 카드 내용(gameCard)은 서버가
  // 전적 DB에서 직접 스냅샷을 떠서 채운다. 수정 불가(위조 불가능이 랭큐의 차별점).
  historyId: uuid("history_id").references(() => hiqGameHistory.id),
  gameCard: jsonb("game_card").$type<{
    gameType: string; score: number; innings: number; average: string;
    isWinner: boolean; highRun: number; opponentName: string | null; playedAt: string;
  }>(),
  tags: jsonb("tags").$type<string[]>(), // #장비 등 — 중고거래 수요 관찰용
  regionName: text("region_name"), // 사용자가 직접 선택한 시·군·구 (GPS 미사용)
  // 우리 매장/레슨 글의 소속 근거 — 최근 30일 내 경기를 기록한 매장
  storeId: uuid("store_id").references(() => hiqStores.id),
  storeName: text("store_name"),
  isBlinded: boolean("is_blinded").default(false).notNull(), // 3인 신고 자동 블라인드
  blindReason: text("blind_reason"),
  appealText: text("appeal_text"), // 블라인드 이의제기 (원탭 + 사유)
  appealAt: timestamp("appeal_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const hiqCommunityComments = pgTable("hiq_community_comments", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  postId: uuid("post_id").references(() => hiqCommunityPosts.id).notNull(),
  authorId: uuid("author_id").references(() => hiqMembers.id).notNull(),
  content: text("content").notNull(),
  isBlinded: boolean("is_blinded").default(false).notNull(),
  blindReason: text("blind_reason"),
  appealText: text("appeal_text"),
  appealAt: timestamp("appeal_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const hiqCommunityLikes = pgTable("hiq_community_likes", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  postId: uuid("post_id").references(() => hiqCommunityPosts.id).notNull(),
  memberId: uuid("member_id").references(() => hiqMembers.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique().on(table.postId, table.memberId),
]);

// 14. 신고 — 커뮤니티뿐 아니라 크루 콘텐츠에도 소급 적용 (Apple 1.2 / Play UGC)
export const hiqReports = pgTable("hiq_reports", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  targetType: text("target_type", {
    enum: ["community_post", "community_comment", "crew_post", "crew_comment", "crew_photo", "crew_chat", "member"],
  }).notNull(),
  targetId: uuid("target_id").notNull(),
  reporterId: uuid("reporter_id").references(() => hiqMembers.id).notNull(),
  reason: text("reason").notNull(), // abuse, gambling, trade, privacy, spam, etc
  detail: text("detail"),
  status: text("status", { enum: ["pending", "actioned", "dismissed"] }).default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique().on(table.targetType, table.targetId, table.reporterId), // 동일인 중복 신고 방지
]);

// 15. 사용자 차단 — 피드·상세·댓글 모든 쿼리에 횡단 적용 (Play 1:1 상호작용 필수 요건)
export const hiqBlocks = pgTable("hiq_blocks", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  blockerId: uuid("blocker_id").references(() => hiqMembers.id).notNull(),
  blockedId: uuid("blocked_id").references(() => hiqMembers.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique().on(table.blockerId, table.blockedId),
]);

// 16. UMB 세계랭킹 — 주간 스냅샷 (umb-carom.org 공식 랭킹 PDF에서 수집, 출처 표기)
export const umbRankings = pgTable("umb_rankings", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  category: text("category", { enum: ["players", "ladies", "juniors"] }).notNull(),
  edition: text("edition").notNull(), // "21/2026"
  editionDate: timestamp("edition_date").notNull(),
  rank: integer("rank").notNull(),
  playerName: text("player_name").notNull(),
  fed: text("fed").notNull(), // 국가 코드 2자
  playerUmbId: text("player_umb_id").notNull(), // UMB 고유 선수 ID — 선행 0 보존 위해 text
  points: integer("points").notNull(),
  penaltyPoints: integer("penalty_points").default(0).notNull(),
  // 대회별 획득 점수 {A: 57, B: 16, ...} — 컬럼 의미는 umbEvents 레전드 참조
  eventPoints: jsonb("event_points").$type<Record<string, number>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique().on(table.category, table.edition, table.playerUmbId),
  index("umb_rankings_player_idx").on(table.category, table.playerUmbId),
  index("umb_rankings_edition_idx").on(table.category, table.editionDate),
]);

// 회차별 대회 레전드 — PDF 1페이지의 컬럼(A~M) → 대회명·장소·날짜 매핑
export const umbEvents = pgTable("umb_events", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  category: text("category", { enum: ["players", "ladies", "juniors"] }).notNull(),
  edition: text("edition").notNull(),
  editionDate: timestamp("edition_date").notNull(),
  colKey: text("col_key").notNull(), // "A" ~ "M"
  label: text("label").notNull(), // "UMB / CEB World Cup - PORTO (PT) 2025-07-05"
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique().on(table.category, table.edition, table.colKey),
]);

// 17. 매장 디렉터리 — 수집한 전국 당구장 목록 (제휴 hiqStores와 별개의 미인증 리스팅).
// 객관 정보만 싣는다(오너 결정 2026-08-05): 이름·주소·전화(비마스킹만)·영업시간·테이블 수.
// 설명·요금 자유텍스트는 저작권·퍼오기 인상 때문에 미전재 — 사장님 인증 후 직접 작성.
export const storeListings = pgTable("store_listings", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  code: text("code").notNull(), // 수집 소스의 클럽코드 (안정 식별자, URL 슬러그)
  name: text("name").notNull(),
  region: text("region").notNull(), // 시도 (서울·경기·...)
  address: text("address").notNull(),
  phone: text("phone"), // 마스킹(별표) 전화는 null
  openHours: text("open_hours"),
  tableLarge: integer("table_large"),   // 대대
  tableMedium: integer("table_medium"), // 중대
  tablePocket: integer("table_pocket"), // 포켓
  claimed: boolean("claimed").default(false).notNull(), // 사장님 인증 완료 여부
  claimedStoreId: uuid("claimed_store_id"), // 인증 시 연결되는 제휴 매장(hiqStores)
  description: text("description"), // 사장님 인증 후 직접 작성
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique().on(table.code),
  index("store_listings_region_idx").on(table.region),
]);

// 사장님 클레임 신청 — 초기엔 수동 승인(오너 검토), 추후 전화 인증 자동화
export const storeListingClaims = pgTable("store_listing_claims", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  listingCode: text("listing_code").notNull(),
  applicantName: text("applicant_name").notNull(),
  applicantPhone: text("applicant_phone").notNull(),
  message: text("message"),
  status: text("status", { enum: ["pending", "approved", "rejected"] }).default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 정보 수정 제안 — 폐업·이전·오기 신고 (방문자 누구나)
export const storeListingSuggestions = pgTable("store_listing_suggestions", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  listingCode: text("listing_code").notNull(),
  message: text("message").notNull(),
  contact: text("contact"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type StoreListing = typeof storeListings.$inferSelect;
export type InsertStoreListing = typeof storeListings.$inferInsert;

// 선수 네이티브 이름 — 로마자 표기(UMB 원본)의 현지 문자 표기.
// 한국 선수는 로마자→한글 결정적 변환기(umbKoreanName.ts)가 채운다.
// 자국 문자로 검색·표시하는 사용자를 위함 ("조명우" ↔ "CHO Myung Woo").
export const umbPlayerNames = pgTable("umb_player_names", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  playerUmbId: text("player_umb_id").notNull(),
  nativeName: text("native_name").notNull(),
  lang: text("lang").notNull(), // "ko" 등
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique().on(table.playerUmbId),
]);
export type UmbPlayerName = typeof umbPlayerNames.$inferSelect;

export type UmbRanking = typeof umbRankings.$inferSelect;
export type InsertUmbRanking = typeof umbRankings.$inferInsert;
export type UmbEvent = typeof umbEvents.$inferSelect;

export const insertHiqCommunityPostSchema = createInsertSchema(hiqCommunityPosts).omit({
  id: true, createdAt: true, updatedAt: true, isBlinded: true, blindReason: true, appealText: true, appealAt: true,
});
export type HiqCommunityPost = typeof hiqCommunityPosts.$inferSelect;
export type InsertHiqCommunityPost = z.infer<typeof insertHiqCommunityPostSchema>;

export const insertHiqCommunityCommentSchema = createInsertSchema(hiqCommunityComments).omit({
  id: true, createdAt: true, isBlinded: true, blindReason: true, appealText: true, appealAt: true,
});
export type HiqCommunityComment = typeof hiqCommunityComments.$inferSelect;
export type InsertHiqCommunityComment = z.infer<typeof insertHiqCommunityCommentSchema>;

export type HiqReport = typeof hiqReports.$inferSelect;
export type InsertHiqReport = typeof hiqReports.$inferInsert;
export type HiqBlock = typeof hiqBlocks.$inferSelect;


