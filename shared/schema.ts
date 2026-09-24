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
  index,
  primaryKey,
  bigint, type AnyPgColumn } from "drizzle-orm/pg-core";
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
  /**
   * 알림 카테고리별 켬/끔(2026-09-13 오너: "크루 알림·온라인게임 알림 등 카테고리로 나눠서").
   * {"rooms": false} 처럼 **끈 것만** 담는다 — 없는 키는 켜짐이라 카테고리를 새로 만들어도 옛 값을 손볼 필요가 없다.
   * 규칙은 shared/notificationPrefs.ts. 끄면 푸시만 멈추고 인앱 알림함에는 그대로 쌓인다.
   */
  pushPrefs: jsonb("push_prefs"),
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
  /** 국가(ISO 3166-1 alpha-2, 예 "KR"). 시뮬레이터 랭킹의 국가별 보기용 — 기기 언어에서 추정하거나 본인이 고른다. */
  country: text("country"),
  // 이용약관 동의(2026-09-11, App Store 1.2·Play UGC) — 본 약관 버전(shared/terms.ts)과 동의 시각. 둘 다 비어 있으면 미동의.
  termsVersion: text("terms_version"),
  termsAcceptedAt: timestamp("terms_accepted_at"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  /** 앱 언어(ko·en·vi·tr·es). 푸시는 받는 사람 언어로 만들어야 하므로 저장한다 — GET /me 때 x-locale 헤더로 갱신(2026-09-22). */
  locale: text("locale").default("ko").notNull(),
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
  // 마무리(알다마 종료 후 쿠션) 진행 상황 — 슬롯별 성공 횟수 {"1":2,"2":0}.
  // 새로고침해도 마무리 진행이 남아야 해서 저장한다(점수·이닝과 같은 동기화 경로).
  finishProgress: jsonb("finish_progress").$type<Record<string, number>>(),

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
  baseStoreId: uuid("base_store_id").references(() => hiqStores.id), // Basecamp (파트너 매장)
  // 디렉토리(storeListings) 베이스 — 파트너가 아닌 전국 1,195곳 어디든 지정 가능.
  // 매장 상세 페이지의 "활동 크루" 섹션이 이 컬럼으로 조회한다 (사장님 유입 플라이휠의 연료).
  baseListingCode: text("base_listing_code"),

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

/**
 * 채팅 메시지 — 방 종류와 무관하게 한 표(2026-09-21 오너: "크루 안 채팅은 빼고 채팅 탭 하나로, 친구·라이벌 1:1, 관리자 문의").
 * room_key 가 방이다: "crew:<crewId>" · "listing:<bookingId>"(조인·부킹) · "dm:<roomId>"(1:1·소그룹) · "support:<memberId>"(관리자 문의).
 * 명단은 종류마다 유래가 다르다 — 크루는 크루원, 조인·부킹은 올린 사람+확정된 사람, dm 은 hiq_chat_room_members, support 는 그 회원+운영자.
 * sender_id null = 시스템 메시지. type: text | system | photo | settlement(정산 카드) 등 — 카드는 서버만 만든다.
 * 옛 크루 채팅(hiq_crew_chats)은 이 표로 옮겼다(id 유지). 옛 표는 보관만.
 */
export const hiqChatMessages = pgTable("hiq_chat_messages", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  roomKey: text("room_key").notNull(),
  senderId: uuid("sender_id").references(() => hiqMembers.id),
  message: text("message").notNull(),
  type: text("type").default("text").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  idxRoom: index("idx_chat_messages_room").on(t.roomKey, t.createdAt),
}));
export type HiqChatMessage = typeof hiqChatMessages.$inferSelect;

/** 1:1·소그룹 방(dm). 크루·조인·문의 방은 행이 없다(명단이 다른 표에서 나온다). */
export const hiqChatRooms = pgTable("hiq_chat_rooms", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  kind: text("kind", { enum: ["dm"] }).default("dm").notNull(),
  /** 채팅 탭이 종목별이라 방도 종목을 가진다(2026-09-21) — 골프 친구와의 방은 골프 탭에만. */
  sport: text("sport", { enum: ["BILLIARDS", "GOLF"] }).default("BILLIARDS").notNull(),
  title: text("title"),
  createdBy: uuid("created_by").references(() => hiqMembers.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const hiqChatRoomMembers = pgTable("hiq_chat_room_members", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  roomId: uuid("room_id").references(() => hiqChatRooms.id, { onDelete: "cascade" }).notNull(),
  memberId: uuid("member_id").references(() => hiqMembers.id).notNull(),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
}, (t) => ({
  uniq: unique().on(t.roomId, t.memberId),
}));

/**
 * 방별 읽은 시각(2026-09-21) — 안 읽은 수와 하단 탭 배지의 근거. roomKey = "crew:<crewId>" | "listing:<bookingId>".
 * 크루 채팅은 이 표가 생기기 전 메시지를 전부 '읽음'으로 본다(행이 없으면 생성 시각 기준이 아니라 지금 기준).
 */
export const hiqChatReads = pgTable("hiq_chat_reads", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  roomKey: text("room_key").notNull(),
  memberId: uuid("member_id").references(() => hiqMembers.id).notNull(),
  lastReadAt: timestamp("last_read_at").defaultNow().notNull(),
  /**
   * 이 방 알림 끄기(2026-09-23 채팅 ⋯ 메뉴). 방을 나가지 않고 조용히 둘 수 있어야 한다.
   * **크루 방은 이 값을 쓰지 않는다** — 크루 설정 화면의 hiq_crew_notification_settings.chat_enabled 가 이미 있고,
   * 두 곳에 스위치를 두면 한쪽을 꺼도 다른 쪽이 "켜짐"으로 보인다. 크루는 그 표 하나만 본다.
   */
  muted: boolean("muted").default(false).notNull(),
}, (t) => ({
  uniq: unique().on(t.roomKey, t.memberId),
}));

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

// 8.9 크루 토너먼트 (Crew Tournament)
// 기존 hiqTournaments(6번)는 storeId 가 notNull 인 **매장 소유** 대회라 크루가 여는 대회를
// 담을 수 없다. 정모(hiqCrewActivities) 패턴을 그대로 복제해 크루용으로 따로 둔다.
// 목표점수·핸디캡 컬럼이 없는 건 의도다 — 오너 결정(2026-08-30): 대회에서 정하지 않고
// 대진에서 경기를 시작할 때 기존 매칭 화면에서 그때그때 맞춘다.
export const hiqCrewTournaments = pgTable("hiq_crew_tournaments", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  crewId: uuid("crew_id").references(() => hiqCrews.id, { onDelete: 'cascade' }).notNull(),
  creatorId: uuid("creator_id").references(() => hiqMembers.id).notNull(),

  title: text("title").notNull(),
  description: text("description"),
  gameType: text("game_type", { enum: ["3c", "4c"] }).notNull(), // 종목 — 화면의 공 색과 1:1
  format: text("format", { enum: ["knockout", "league"] }).default("knockout").notNull(),

  maxPlayers: integer("max_players").default(8).notNull(),
  // 한 대진을 몇 판으로 가리는가(1·3·5). 오너 결정(2026-09-03): 유저 건의 "몇전 몇승이
  // 승리인가요?" — 판 수는 대회 전체 공통. 3판이면 2선승.
  bestOf: integer("best_of").default(1).notNull(),
  recruitEnd: timestamp("recruit_end"),
  startAt: timestamp("start_at"),
  prize: text("prize"), // "우승 5만원" 같은 자유 문구

  // recruiting: 접수중(대진 없음) → drawn: 대진 확정(아직 아무 경기도 시작 안 함, 조정 자유)
  // → ongoing: 경기가 하나라도 시작됨 → ended: 우승자 확정
  status: text("status", { enum: ["recruiting", "drawn", "ongoing", "ended", "canceled"] }).default("recruiting").notNull(),
  championId: uuid("champion_id").references(() => hiqMembers.id),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// 참가 신청 — 오너 결정(2026-08-30): 크루원은 승인 절차 없이 신청 즉시 확정.
export const hiqCrewTournamentParticipants = pgTable("hiq_crew_tournament_participants", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  tournamentId: uuid("tournament_id").references(() => hiqCrewTournaments.id, { onDelete: 'cascade' }).notNull(),
  memberId: uuid("member_id").references(() => hiqMembers.id).notNull(),

  seed: integer("seed"), // 대진 생성 시 RP 내림차순으로 부여. 크루장이 자리를 바꾸면 같이 바뀐다.
  finalRank: integer("final_rank"), // 1 = 우승
  status: text("status", { enum: ["active", "eliminated", "winner"] }).default("active").notNull(),
  wins: integer("wins").default(0).notNull(),   // 풀리그 순위 집계용
  losses: integer("losses").default(0).notNull(),

  registeredAt: timestamp("registered_at").defaultNow().notNull(),
}, (table) => [
  unique().on(table.tournamentId, table.memberId), // 중복 신청 방지
]);

// 대진 한 칸. 좌표 규칙은 shared/tournamentBracket.ts 참고 —
// round 1 이 가장 아래(첫 경기)이고 위로 갈수록 커진다. (round,slot) 승자는 (round+1, slot>>1).
// gameId 로 실제 경기 기록과 이어지고, 경기가 끝나면 이 행을 통해 승자를 윗칸에 올린다.
// hiqGames 쪽에는 컬럼을 추가하지 않는다 — gameMode 를 "match" 그대로 두어야 RP·상대전적이
// 지금과 똑같이 남기 때문이다(대회는 경기의 종류가 아니라 경기에 붙는 꼬리표).
export const hiqCrewTournamentMatches = pgTable("hiq_crew_tournament_matches", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  tournamentId: uuid("tournament_id").references(() => hiqCrewTournaments.id, { onDelete: 'cascade' }).notNull(),

  round: integer("round").notNull(),
  slot: integer("slot").notNull(),

  p1Id: uuid("p1_id").references(() => hiqMembers.id),
  p2Id: uuid("p2_id").references(() => hiqMembers.id), // null + p1 있음 = 부전승
  p1Score: integer("p1_score"), // 마지막 판 점수
  p2Score: integer("p2_score"),
  // N판 승부의 누적 승수. bestOf=1 이면 항상 0/1 로 끝난다.
  p1Wins: integer("p1_wins").default(0).notNull(),
  p2Wins: integer("p2_wins").default(0).notNull(),
  winnerId: uuid("winner_id").references(() => hiqMembers.id),
  loserId: uuid("loser_id").references(() => hiqMembers.id),

  gameId: uuid("game_id").references(() => hiqGames.id),
  // pending: 두 자리가 아직 안 참 / ready: 둘 다 찼고 시작 대기(이때만 자리 조정 가능)
  // playing: 경기중 / done: 종료 / bye: 부전승 자동 진출
  status: text("status", { enum: ["pending", "ready", "playing", "done", "bye"] }).default("pending").notNull(),

  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique().on(table.tournamentId, table.round, table.slot),
  index("idx_crew_tmatch_game").on(table.gameId), // 경기 종료 훅이 gameId 로 대진을 되찾는다
]);

export const insertHiqCrewTournamentSchema = createInsertSchema(hiqCrewTournaments)
  .omit({ id: true, createdAt: true, updatedAt: true, status: true, championId: true, creatorId: true, crewId: true });
export type HiqCrewTournament = typeof hiqCrewTournaments.$inferSelect;
export type InsertHiqCrewTournament = z.infer<typeof insertHiqCrewTournamentSchema>;
export type HiqCrewTournamentParticipant = typeof hiqCrewTournamentParticipants.$inferSelect;
export type HiqCrewTournamentMatch = typeof hiqCrewTournamentMatches.$inferSelect;


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
  /**
   * 이 글을 올린 회원. 2026-09-09 추가 — 그전엔 신원이 manager_phone 문자열 하나뿐이었고
   * 그걸 클라이언트가 보냈다. 남의 번호를 매니저로 박아 매물을 올릴 수 있었고(문의 전화가 그 사람에게 가고
   * 그 사람만 지울 수 있었다), 삭제 권한도 그 자기신고 문자열에 걸려 있었다.
   * 옛 행은 null 이라 번호로 되짚는다. 새 글은 서버가 로그인 정보로 채운다.
   */
  ownerId: uuid("owner_id").references(() => hiqMembers.id),
  courseId: text("course_id").notNull(),
  courseName: text("course_name").notNull(),
  region: text("region").notNull(),
  /**
   * 지역 필터용 코드(shared/golfRegions.ts). region 은 골프장 마스터에서 온 자유 문자열이라
   * '경기'·'경기도 용인시'·'용인' 이 뒤섞인다. 예전엔 그 문자열에 LIKE '%경기%' 를 걸었는데,
   * 경기 남부·북부·동부가 전부 같은 '경기' 를 훑어서 세 필터가 완전히 같은 결과를 냈다(2026-09-09 검토).
   * 이제 넣을 때 서버가 코드로 굳힌다. region 은 화면에 그대로 보여 주는 표시용으로 남는다.
   */
  regionCode: text("region_code"),
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
  /**
   * 조인 2026-09-21(오너: "심플하고 누구나 만들기 쉽게, 남녀 구별, 스크린 조인").
   * joinType 필드/스크린/파크 · slots 자리 목록(shared/golfJoin JoinSlot[], 첫 자리는 호스트) · costMode FIXED(그린피)/SPLIT(1/N)
   * · venueName 스크린·파크 장소 이름 · lat/lng 장소 좌표(있을 때만 — "내 주변" 정렬용).
   * 옛 글은 전부 null → 화면이 slotsFromLegacy 로 자리를 만든다.
   */
  /** 부킹 올린 쪽(2026-09-21 오너 A안: 누구나 올린다) — STORE 매장·매니저, PERSONAL 개인 양도. 카드 배지가 이걸 본다. 옛 글은 null(매장). */
  sellerType: text("seller_type", { enum: ["STORE", "PERSONAL"] }),
  joinType: text("join_type", { enum: ["FIELD", "SCREEN", "PARK"] }),
  slots: jsonb("slots").$type<{ role: "HOST" | "GUEST" | "OPEN"; gender: "M" | "F" | "ANY" }[]>(),
  costMode: text("cost_mode", { enum: ["FIXED", "SPLIT"] }),
  venueName: text("venue_name"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  /** 신고 누적·운영자 조치로 가려진 매물. 커뮤니티 글과 같은 방식이다(지우지 않고 가린다 — 추적이 남는다). */
  isBlinded: boolean("is_blinded").default(false).notNull(),
  blindReason: text("blind_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * 조인 신청 기록 (2026-09-09 신설).
 *
 * 그전엔 '조인 신청하기' 버튼이 문자 앱만 열고 끝이었다 — 누가 신청했는지도, 몇 명이 찼는지도,
 * 안 나타났는지도 어디에도 남지 않았다. 크루 안에서 조인을 열려면 신청자가 회원으로 남아야 하고,
 * 노쇼 장치도 "신청한 적이 있다"는 기록 위에서만 만들 수 있다.
 *
 * 조인 글 자체는 golf_bookings(listing_type='JOIN') 행이다. 여기는 그 글에 대한 신청만 담는다.
 */
/**
 * 골프장 한 곳 = 페이지 한 장(2026-09-24 오너: "홈에 전체 골프장, 관심 누르면 취소티 알림, 골프장 누르면 정보 — 우리는 더 심화").
 *
 * 왜 새 표인가: 골프장 명부가 세 벌로 갈라져 있었다 — 부킹·조인 글이 가리키는 정적 목록 525곳
 * (client/src/golf/data/golfCourses.ts), 랭큐매치가 쓰는 rankue_golf_clubs 652곳(좌표·코스 파),
 * TGM 234종목(그린피·소개·회원권 시세). 이 표가 셋을 하나로 묶는다.
 *
 * 한 행 = **골프장**이다. 정적 목록은 회원제·대중제를 두 줄로 적어(가야 384·385) 같은 이름·같은 주소의
 * 페이지가 둘 생겼다 — course_ids 에 둘 다 담아 한 장으로 합친다.
 *
 * ⚠️ 정적 목록의 rating·difficulty·vibe·grass·imageUrl·phone 은 **가짜 자리채움 값**이다
 * (평점은 4.5/4.9 두 값뿐, 전화는 031-107-1013 → 031-114-1026 식 등차수열). 여기로 옮기지 않는다.
 */
export const golfCoursePages = pgTable("golf_course_pages", {
  /** 한글 슬러그 — 검색어가 주소에 그대로 보인다(/golf/course/렉스필드). */
  slug: text("slug").primaryKey().notNull(),
  name: text("name").notNull(),
  /** 시도(경기·강원 …) — 지역 허브의 열쇠 */
  region: text("region").notNull(),
  /** 시군구(이천시·김해시 …) */
  city: text("city"),
  address: text("address"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  /** 정적 목록 id 들 — 부킹·조인 글의 course_id 가 이걸 가리킨다. TGM 에만 있는 골프장은 빈 배열. */
  courseIds: integer("course_ids").array().default([]).notNull(),
  /** 랭큐매치 명부(rankue_golf_clubs.id) — 라운드 기록·코스 파 */
  clubId: uuid("club_id"),
  /** 회원제 · 대중제 · 회원제+대중제 */
  kind: text("kind"),
  holes: integer("holes"),
  /** [{ courseId, kind, holes }] — 회원제 45홀 + 대중제 9홀 처럼 */
  parts: jsonb("parts"),
  /** [{ name, par }] — rankue_golf_courses 의 코스별 파 */
  courses: jsonb("courses"),
  /** TGM 이 직접 쓴 소개문(golf-intros.json). 동아에서 온 '기본정보.소개'는 쓰지 않는다. */
  intro: text("intro"),
  /** { opened, members, homepage, membershipTypes, notes } */
  info: jsonb("info"),
  /** { rows: [{ day, nonMember, member, family }], extra: { caddie, cart }, notes } */
  fees: jsonb("fees"),
  /** 이 골프장에 붙은 TGM 회원권 종목 id 들 */
  tgmItems: text("tgm_items").array().default([]).notNull(),
  /**
   * 2026-09-24 보강(오너가 준 골프장 자료 304곳 — 로고·잔디·플레이 방식·연락처).
   * logo 는 /img/golf-logos/<id>.png(흰 바탕 워드마크라 화면은 흰 로고판 위에 얹는다).
   * 그 자료의 이름은 **지금 이름**이라(로제비앙GC ← 구 큐로CC) 대표 이름으로 쓰고, 옛 이름은 aliases 로 남긴다 — 두 이름 다 검색에 걸리게.
   * 그 자료의 평점·즐겨찾기 수는 **싣지 않는다**(남의 사이트 숫자다. popularity 는 목록 정렬에만 쓴다).
   */
  logo: text("logo"),
  /** 한국잔디 · 양잔디 · 벤트그라스 */
  grass: text("grass").array().default([]).notNull(),
  /** 3인가능 · 2인가능 · 노캐디 */
  play: text("play").array().default([]).notNull(),
  phone: text("phone"),
  website: text("website"),
  /** 대표 그린피(원) — 그린피 표가 없는 골프장의 참고값 */
  feeFrom: integer("fee_from"),
  popularity: integer("popularity").default(0).notNull(),
  aliases: text("aliases").array().default([]).notNull(),
  extIds: integer("ext_ids").array().default([]).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [index("golf_course_pages_region_idx").on(t.region, t.city)]);

/** 회원권 시세 — TGM 이 매일 20시(KST)에 갱신하는 값을 받아 둔다. 단위 만원. */
export const golfMembershipPrices = pgTable("golf_membership_prices", {
  itemId: text("item_id").primaryKey().notNull(),
  slug: text("slug").references(() => golfCoursePages.slug, { onDelete: "cascade" }).notNull(),
  /** 종목 이름 — '개인', '법인', '주중', '무기명' … */
  label: text("label").notNull(),
  price: integer("price").notNull(),
  yearHigh: integer("year_high"),
  yearLow: integer("year_low"),
  /** 전일 대비 등락(만원). 이력 마지막 두 점에서 계산한다. */
  change: integer("change"),
  asOf: date("as_of"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [index("golf_membership_prices_slug_idx").on(t.slug)]);

export const golfMembershipPriceHistory = pgTable("golf_membership_price_history", {
  itemId: text("item_id").notNull(),
  d: date("d").notNull(),
  price: integer("price").notNull(),
}, (t) => [primaryKey({ columns: [t.itemId, t.d] })]);

/**
 * 관심 골프장(☆) — 그 골프장에 부킹·조인·긴급티가 올라오면 푸시.
 * filters: { days?: ("weekday"|"weekend")[], parts?: ("morning"|"afternoon"|"night")[], maxFee?: number, minSeats?: number, kinds?: ("BOOKING"|"JOIN")[] }
 * 비어 있으면 전부 받는다.
 */
export const golfCourseWatches = pgTable("golf_course_watches", {
  memberId: uuid("member_id").references(() => hiqMembers.id, { onDelete: "cascade" }).notNull(),
  slug: text("slug").references(() => golfCoursePages.slug, { onDelete: "cascade" }).notNull(),
  filters: jsonb("filters"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.memberId, t.slug] }), index("golf_course_watches_slug_idx").on(t.slug)]);

export type GolfCoursePage = typeof golfCoursePages.$inferSelect;
export type GolfMembershipPrice = typeof golfMembershipPrices.$inferSelect;

export const golfJoinRequests = pgTable("golf_join_requests", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  bookingId: uuid("booking_id").references(() => golfBookings.id, { onDelete: "cascade" }).notNull(),
  memberId: uuid("member_id").references(() => hiqMembers.id).notNull(),
  /**
   * applied = 신청 중, cancelled = 본인이 취소, noshow = 글쓴이가 안 왔다고 표시.
   * 행을 지우지 않는다 — 반복 취소·노쇼를 나중에 볼 수 있어야 한다.
   * 취소한 시각은 updated_at 이다(취소 때 함께 갱신된다). 티타임과 견주면 '몇 시간 전 취소'가 나온다.
   */
  status: text("status", { enum: ["applied", "accepted", "rejected", "cancelled", "noshow"] }).default("applied").notNull(),
  /**
   * 이 글에서 이 사람이 **여태까지** 취소한/안 나타난 횟수. status 한 칸만 두면 다시 신청하는 순간
   * 지워진다 — 취소·재신청을 반복하는 사람이 늘 깨끗해 보이고, 노쇼로 찍힌 사람도 재신청 한 번으로
   * 표시를 지울 수 있었다(2026-09-10 검토). 이 두 칸은 재신청해도 안 줄어든다.
   */
  cancelCount: integer("cancel_count").default(0).notNull(),
  /** 부킹 예약 신청 인원(1~4, 2026-09-21). 조인 신청은 1 — 한 사람이 한 자리다. */
  headcount: integer("headcount").default(1).notNull(),
  noShowCount: integer("no_show_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique().on(table.bookingId, table.memberId),
]);

export type GolfJoinRequest = typeof golfJoinRequests.$inferSelect;

// 9.2 골프 조인 (Golf Join) - Separated from Booking
export const golfJoins = pgTable("golf_joins", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  courseName: text("course_name").notNull(),
  region: text("region").notNull(),
  /**
   * 지역 필터용 코드(shared/golfRegions.ts). region 은 골프장 마스터에서 온 자유 문자열이라
   * '경기'·'경기도 용인시'·'용인' 이 뒤섞인다. 예전엔 그 문자열에 LIKE '%경기%' 를 걸었는데,
   * 경기 남부·북부·동부가 전부 같은 '경기' 를 훑어서 세 필터가 완전히 같은 결과를 냈다(2026-09-09 검토).
   * 이제 넣을 때 서버가 코드로 굳힌다. region 은 화면에 그대로 보여 주는 표시용으로 남는다.
   */
  regionCode: text("region_code"),
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
  hidden: boolean("hidden").default(false).notNull(), // 가리기 — 삭제 없이 비노출
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

// 건의 답장 기록 — 운영자가 건의함에서 '앱으로 답장'한 내용을 건의에 붙여 남긴다
// (오너 요청 2026-09-11 "내가 답장한 내역도 볼 수 있게"). 그전 답장은 회원 알림(type suggestion_reply)으로만
// 남아 어느 건의에 답했는지 알 수 없었다 — 옛 답장은 scripts/backfill-suggestion-replies.ts 가 옮겼다.
// DDL: migrations/suggestion_replies.sql (추가만 하는 테이블).
export const suggestionReplies = pgTable("suggestion_replies", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  suggestionId: uuid("suggestion_id").references(() => suggestions.id, { onDelete: "cascade" }).notNull(),
  message: text("message").notNull(),
  // 보낸 운영자(프로필). FK 를 걸지 않는다 — 운영자 계정이 정리돼도 답장 기록은 남아야 한다. 옛 답장 이관분은 비어 있다.
  adminProfileId: uuid("admin_profile_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("suggestion_replies_suggestion_idx").on(table.suggestionId, table.createdAt),
]);

export type SuggestionReply = typeof suggestionReplies.$inferSelect;

// 신규 매장 등록 신청 — 디렉토리(1,195곳)에 없는 매장의 사장님이 직접 등록을 요청한다.
//
// 왜 별도 테이블인가: store_listings 를 읽는 공개 표면이 11곳(목록·상세·사이트맵·프리렌더·
// 크루 베이스 지정)이라, status 컬럼로 pending 을 섞으면 필터 하나만 빠져도 미승인 매장이
// 검색 색인에 샌다(2026-08-25 전수 실측). 신청은 여기 격리하고 승인 시에만 listings 로 옮긴다.
//
// 승인 = 리스팅 생성(코드 n00001~ 서버 발급) + 지오코딩 + 기존 클레임 승인 파이프라인
// (사장님 계정·파트너 매장·앱 알림) 재사용. 필드는 storeListings 와 1:1 로 맞춘다.
export const storeRegistrations = pgTable("store_registrations", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  name: text("name").notNull(),
  region: text("region").notNull(),       // 시도 (서울·경기·... — listings 와 같은 17개 축)
  address: text("address").notNull(),
  phone: text("phone"),
  openHours: text("open_hours"),
  tableLarge: integer("table_large"),
  tableMedium: integer("table_medium"),
  tablePocket: integer("table_pocket"),
  rate10Large: integer("rate10_large"),
  rate10Medium: integer("rate10_medium"),
  rate10Pocket: integer("rate10_pocket"),
  flatLarge: integer("flat_large"),
  flatMedium: integer("flat_medium"),
  flatPocket: integer("flat_pocket"),
  applicantName: text("applicant_name").notNull(),
  applicantPhone: text("applicant_phone").notNull(),
  /** owner = 사장님 신청(승인 시 사장님 권한·PIN 발급) / report = 이용자 제보(디렉토리에
   *  미인증 매장으로만 추가, 권한 없음). 유저 건의(2026-09-03) "사장님이 아닌데 등록 가능한가요?" */
  kind: text("kind", { enum: ["owner", "report"] }).default("owner").notNull(),
  status: text("status", { enum: ["pending", "approved", "rejected"] }).default("pending").notNull(),
  /** 승인 시 발급된 리스팅 코드 (n00001~) — 추적·중복 방지용 역참조 */
  listingCode: text("listing_code"),
  /** 승인 시 발급된 초기 PIN(신규 계정일 때만). 관리자가 나중에 사장님께 전화로 알려줄 수
   *  있도록 평문 보관(오너 결정 2026-08-28) — 어드민 전용 표면에서만 노출한다.
   *  사장님이 이후 비밀번호를 바꾸면 이 값은 낡은 값이 된다(라벨에 '초기'를 명시). */
  issuedPin: text("issued_pin"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  processedAt: timestamp("processed_at"),
}, (table) => [
  index("store_registrations_status_idx").on(table.status, table.createdAt),
]);

export type StoreRegistration = typeof storeRegistrations.$inferSelect;

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

// 일별 유니크 웹 접속자 — 슈퍼관리자 대시보드의 "접속자" 지표.
//
// ⚠️ 바로 위 hiq_visit_logs 와 혼동하지 말 것. 그쪽은 **회원의 매장 방문 기록**이라
//    member_id 가 필수이고 로그인하지 않은 사람은 애초에 잡히지 않는다.
//    이 테이블은 가입 여부와 무관한 웹/앱 접속자를 센다.
//    대시보드 라벨도 "접속자" vs "매장방문(24시간)" 으로 나눠 놨다.
//
// 설계:
//  · (day, visitor) 복합 PK → 하루 한 사람이 한 행. count(*) 가 곧 유니크 접속자수라
//    distinct 집계가 필요 없다.
//  · 클라이언트가 localStorage 로 게이트하므로 DB 쓰기는 방문자당 하루 1회다
//    (페이지 이동마다 쓰면 트래픽이 늘수록 DB 비용·지연이 같이 늘어난다).
//  · visitor 는 클라이언트가 만든 난수 ID다. IP·계정을 저장하지 않는다.
//  · day 는 KST 기준으로 넣는다(서버 UTC 자정에 날짜가 바뀌면 한국 기준과 어긋난다).
//
// DB 에는 2026-08-13 raw SQL 로 먼저 생성했고, 이 정의는 drizzle push 가
// "DB 에만 있는 테이블을 지울까요?" 로 제안하지 않게 막는 앵커 역할도 한다.
export const dailyVisits = pgTable("daily_visits", {
  day: date("day").notNull(),
  visitor: text("visitor").notNull(),
  firstSeen: timestamp("first_seen").defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.day, table.visitor] }),
  index("daily_visits_day_idx").on(table.day),
]);

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
  // 골프: 이 기록을 만든 경기와 골프장. 예전엔 '±10분 안에 끝난 세션' 이라는 시간 추측과 골프장 이름 글자로만
  // 이어져 있어서, 여권 도장이 화면마다 다르게 세졌고 기록 상세가 404 가 났다(2026-09-11).
  golfSessionId: uuid("golf_session_id"),
  golfClubId: text("golf_club_id"),
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

  // abandoned: 방장이 접은 방(기록 없음). 예전엔 버려진 방이 waiting/playing 으로 영원히 남아 핀을 붙잡았다.
  status: text("status", { enum: ["waiting", "playing", "finished", "abandoned"] }).default("waiting").notNull(),
  currentHole: integer("current_hole").default(1).notNull(),
  // solo(혼자 기록) | group(다함께 기록). 예전엔 화면이 보내도 칸이 없어 조용히 버려졌다.
  strokeMode: text("stroke_mode"),
  // 종료 순간 서버가 계산해 못박은 정산 { totals, transactions }. 결과 화면은 이걸 보여 준다 —
  // 볼 때마다 다시 계산하면 끝난 뒤 코스를 바꿀 때 금액이 소급해서 바뀌었다.
  settlement: jsonb("settlement"),
  finishedAt: timestamp("finished_at"),

  // Player Data: Array of { memberId, name, scores: [18], penalties: [18] }
  players: jsonb("players").$type<any[]>().default([]).notNull(),

  doublingMode: text("doubling_mode", { enum: ["none", "current", "next"] }).default("next").notNull(),
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
  totalSimPoints: true,
  // 약관 동의는 가입 본문에서 받지 않는다 — 서버가 버전을 검증한 뒤 직접 적는다(auth.ts /register)
  termsVersion: true,
  termsAcceptedAt: true
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
}, (table) => [
  // 알림함은 늘 "내 것을 최신순으로 한 페이지"다. PK 하나뿐이던 시절엔 Seq Scan + Sort 였다
  // (2026-09-23: 4,528행 중 한 계정이 893행). 커서 페이징(created_at < ?)까지 이 인덱스가 받는다.
  index("hiq_notifications_member_created_idx").on(table.memberId, table.createdAt.desc()),
]);

// 대결 신청 — 크루 멤버끼리 "한 판 치자"를 보내는 가장 가벼운 신호.
// 실제 경기 생성이 아니라 약속 제안이다(오너 결정 2026-08-22): 대부분 같은 매장에서
// 만나 치므로, 경기는 기존 PIN 흐름 그대로 두고 여기서는 의사만 오간다.
// 수락하면 신청자에게 알림이 돌아가고, 거절은 조용히 닫는다(거절 통보는 관계를 상하게 한다).
export const hiqChallenges = pgTable("hiq_challenges", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  crewId: uuid("crew_id").references(() => hiqCrews.id).notNull(),
  fromMemberId: uuid("from_member_id").references(() => hiqMembers.id).notNull(),
  toMemberId: uuid("to_member_id").references(() => hiqMembers.id).notNull(),
  status: text("status", { enum: ["pending", "accepted", "declined"] }).default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  respondedAt: timestamp("responded_at"),
}, (table) => [
  index("hiq_challenges_to_idx").on(table.toMemberId, table.status),
  index("hiq_challenges_pair_idx").on(table.fromMemberId, table.toMemberId),
]);

export type HiqChallenge = typeof hiqChallenges.$inferSelect;

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
  // 작성자의 앱 언어. 글이 곧 콘텐츠라 언어가 다르면 소음이 된다 — 목록에서 언어 필터와
  // 뱃지의 축. 게시판을 물리적으로 나누지 않는 이유: 지금 글이 2건이라 나누면 무인도가 된다
  // (오너 결정 2026-08-31: 분리가 아니라 태그+필터).
  language: text("language").default("ko").notNull(),
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
  /**
   * 대댓글이면 부모 댓글 id. **한 단계만** 둔다 — 답글에 답하면 그 답글의 부모(최상위)에 붙인다(2026-09-10 오너).
   * 부모가 사라지면 답글도 같이 사라진다(글 삭제 경로). 사용자가 부모를 지우는 경우는 deletedAt 으로 자리를 남긴다.
   */
  parentId: uuid("parent_id").references((): AnyPgColumn => hiqCommunityComments.id, { onDelete: "cascade" }),
  /** 답글이 달린 댓글을 지우면 행을 남기고 이 시각을 적는다(내용은 비운다) — 통째로 지우면 남이 단 답글까지 사라진다. */
  deletedAt: timestamp("deleted_at"),
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
    // golf_booking 추가(2026-09-09): 골프 매물에 신고·삭제가 하나도 없어 먹튀 글을 내릴 방법이 없었다
    // crew_photo_comment 추가(2026-09-11): 크루 사진 댓글도 신고 대상. DB CHECK 가 없는 text 라 타입만 넓힌다.
    // player_cheer 추가(2026-09-13): 선수 응원글도 신고 대상.
    enum: ["community_post", "community_comment", "crew_post", "crew_comment", "crew_photo", "crew_photo_comment", "crew_chat", "member", "golf_booking", "player_cheer"],
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

// 15-1. 신고 처리 기록(2026-09-11, 관리자 신고 큐 SX1) — 운영자가 신고 대상에 한 조치를 한 줄씩 쌓는다(고치거나 지우지 않는다).
// hiq_reports.status 는 "이 신고가 닫혔나"만 말한다. 누가·언제·무엇으로 닫았는지, 지운 원문이 무엇이었는지는 여기 남는다
// — 24시간 안에 대응했다는 근거이자, 작성자가 항의할 때 되짚을 기록이다. 조치 이름은 server/lib/reportQueue.ts.
export const hiqModerationActions = pgTable("hiq_moderation_actions", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  targetType: text("target_type").notNull(),
  targetId: uuid("target_id").notNull(),
  action: text("action").notNull(),
  adminProfileId: uuid("admin_profile_id"), // 처리한 운영자(profiles.id). 계정이 지워져도 기록은 남게 FK 는 걸지 않는다
  authorMemberId: uuid("author_member_id"), // 조치 당시 작성자 — 원문을 지운 뒤에도 작성자 정지를 할 수 있게
  note: text("note"), // 삭제 때 원문 일부 스냅샷
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type HiqModerationAction = typeof hiqModerationActions.$inferSelect;

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
  // 요금 — 구조화된 숫자만 전재 (원 단위). "요금안내" 자유텍스트는 저작권·퍼오기 인상
  // 때문에 미전재(사장님 인증 후 직접 작성) — 오너 확정 정책과 일관.
  rate10Large: integer("rate10_large"),   // 10분당 대대
  rate10Medium: integer("rate10_medium"), // 10분당 중대
  rate10Pocket: integer("rate10_pocket"), // 10분당 포켓
  flatLarge: integer("flat_large"),       // 정액제 대대
  flatMedium: integer("flat_medium"),     // 정액제 중대
  flatPocket: integer("flat_pocket"),     // 정액제 포켓
  // 좌표 — Nominatim 지오코딩(동·구 수준 폴백 포함). "내 주변 당구장" 거리순용
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
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
  /** 승인 시 발급된 초기 PIN(신규 계정일 때만) — 위 storeRegistrations 와 동일 정책 */
  issuedPin: text("issued_pin"),
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
/**
 * 응원글(2026-09-13 오너 제안 11번): 랭큐 회원이 UMB 선수 페이지에 남기는 짧은 공개 글.
 * **실존 인물에 대한 공개 글**이라 커뮤니티 댓글과 같은 안전장치를 그대로 탄다 — 욕설·내기 필터(checkContent),
 * 연락처 마스킹, 약관 동의·정지 문지기, 신고(targetType player_cheer)·자동 블라인드·차단 필터.
 */
export const hiqPlayerCheers = pgTable("hiq_player_cheers", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  category: text("category", { enum: ["players", "ladies", "juniors", "owgr", "rolex", "kpga", "klpga"] }).notNull(),
  playerUmbId: text("player_umb_id").notNull(),
  authorId: uuid("author_id").references(() => hiqMembers.id).notNull(),
  content: text("content").notNull(),
  isBlinded: boolean("is_blinded").default(false).notNull(),
  blindReason: text("blind_reason"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type HiqPlayerCheer = typeof hiqPlayerCheers.$inferSelect;

/**
 * 관심 선수(팔로우, 2026-09-13 오너). 랭큐 회원이 UMB 선수를 따라간다 — 랭큐 회원끼리의 '라이벌'(함께 친 상대)과는
 * 다른 개념이라 따로 둔다. 순위 변동 알림(7번)이 이 표를 보고 보낸다.
 */
/**
 * 앱 접속 세션(2026-09-13 오너: "회원들이 우리 앱에 얼마나 잔류하는지 잴 수 있나").
 * 앱이 앞으로 오면 한 줄 열고(opened_at), 뒤로 가면 닫는다(closed_at). 열려 있는 동안 5분마다 last_seen_at 을 찍어서
 * 강제 종료로 닫힘 신호가 안 와도 "마지막 신호 뒤 30분" 을 끝으로 본다. 외부 분석 SDK 대신 우리 DB 에만 남긴다 —
 * 회원 규모에 맞고, 남의 서버로 가는 데이터가 없다. 로그인한 회원만 기록한다(누군지 모르면 잔류를 셀 수 없다).
 * 어드민이 여기서 DAU/WAU/MAU · 회원별 마지막 접속·주간 접속일 · 가입 코호트 리텐션(D1/D7/D30)을 낸다.
 */
export const hiqAppSessions = pgTable("hiq_app_sessions", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  memberId: uuid("member_id").references(() => hiqMembers.id).notNull(),
  /** ios · android · web */
  platform: text("platform").notNull(),
  openedAt: timestamp("opened_at").defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  closedAt: timestamp("closed_at"),
}, (t) => ({
  memberIdx: index("hiq_app_sessions_member_idx").on(t.memberId, t.openedAt),
}));

export const hiqPlayerFollows = pgTable("hiq_player_follows", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  memberId: uuid("member_id").references(() => hiqMembers.id).notNull(),
  category: text("category", { enum: ["players", "ladies", "juniors", "owgr", "rolex", "kpga", "klpga"] }).notNull(),
  playerUmbId: text("player_umb_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  uniq: unique().on(t.memberId, t.category, t.playerUmbId),
}));

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

// --- PBA 투어 (pbatour.org 공개 AJAX API 수집) ---
// 선수 프로필 — detail API의 스탯은 통산(누적) 기준 (김가영 Prize 9.7억 = 통산 실측 확인).
// 선수 사진(ImgURL)은 초상권 문제로 수집·저장하지 않는다.
export const pbaPlayers = pgTable("pba_players", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  memCode: text("mem_code").notNull(), // "M0022424" — PBA 고유 선수 코드
  league: text("league", { enum: ["PBA", "LPBA"] }).notNull(),
  nameKo: text("name_ko").notNull(),
  nameEn: text("name_en"),
  nationCode: text("nation_code"), // "KR", "ES" 등 2자
  birthday: text("birthday"), // "1974-03-03" — detail API 원문 보존
  average: doublePrecision("average"), // 통산 에버리지
  bankShotRate: doublePrecision("bank_shot_rate"), // 뱅크샷 성공률 %
  highRun: integer("high_run"),
  win: integer("win"),
  lose: integer("lose"),
  draw: integer("draw"),
  careerPrize: bigint("career_prize", { mode: "number" }), // 통산 상금(원)
  // UMB 세계랭킹 교차 매칭 (이름 정규화 매칭 — "Daniel SANCHEZ" ↔ "SANCHEZ Daniel")
  umbPlayerId: text("umb_player_id"),
  umbCategory: text("umb_category"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique().on(table.memCode),
]);

// 시즌별 랭킹 스냅샷 — 시즌 진행 중엔 주간 크론이 같은 행을 덮어쓴다
export const pbaSeasonRanks = pgTable("pba_season_ranks", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  memCode: text("mem_code").notNull(),
  season: integer("season").notNull(), // 2025 = 2025-26 시즌
  league: text("league", { enum: ["PBA", "LPBA"] }).notNull(),
  prizeRank: integer("prize_rank"),
  pointRank: integer("point_rank"),
  prize: bigint("prize", { mode: "number" }).default(0).notNull(), // 시즌 상금(원)
  rankingPoint: integer("ranking_point").default(0).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique().on(table.memCode, table.season),
  index("pba_season_ranks_season_idx").on(table.league, table.season),
]);

export type PbaPlayer = typeof pbaPlayers.$inferSelect;
export type PbaSeasonRank = typeof pbaSeasonRanks.$inferSelect;

// PBA 대회(2026-09-24, /tournaments) — 일정(schedule/ajax/list)과 투어 목록(getTourList, 우승자)을 합친 한 줄.
// 주키가 tour_code 가 아닌 이유(실측): 팀리그(TLG) 코드는 따로 번호를 매겨 2025-26 팀리그 85~90 이
// 2021-22 투어 코드 85~90 과 겹치고, 아직 코드가 없는 예정 대회("PBA 제4차 투어")도 일정에 먼저 올라온다.
// 그래서 id = "T{투어코드}"(코드 있는 개인 투어) 또는 "S{일정 SEQ}"(팀리그·코드 없는 일정)이고, tour_code 는 개인 투어에만 채운다.
// 사진·로고는 저장하지 않는다(초상권·저작권) — 사실 정보만.
export const pbaTournaments = pgTable("pba_tournaments", {
  id: text("id").primaryKey().notNull(),
  tourCode: integer("tour_code"), // 개인 투어(PBA·LPBA·드림·챌린지)만. 팀리그·미정 일정은 null
  season: integer("season").notNull(), // 2025 = 2025-26 시즌
  league: text("league").notNull(), // PBA · LPBA · DREAM(PBA2) · CHALLENGE(PBA3) · TEAM(TLG)
  title: text("title").notNull(),
  titleEn: text("title_en"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  place: text("place"),
  totalPrize: bigint("total_prize", { mode: "number" }), // 원. 공식 표기("2억 5천만원")를 읽을 수 있을 때만
  winnerPrize: bigint("winner_prize", { mode: "number" }),
  winnerName: text("winner_name"), // 공식 표기 그대로("산체스", "김현우1")
  winnerMemCode: text("winner_mem_code"), // pba_players 와 하나로만 맞을 때만
  participants: integer("participants"),
  officialSeq: text("official_seq"), // pbatour 대회 안내 페이지(/ko/tournament/info/index?seq=) — 공식이 '자세히보기'를 여는 대회만
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique().on(table.tourCode),
  index("pba_tournaments_season_idx").on(table.season),
]);
export type PbaTournament = typeof pbaTournaments.$inferSelect;

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



// --- 8.10 시뮬레이터 v2 (shared/sim) ---
// 불변: 시뮬은 hiq_games 행을 만들지 않고 finishHiqGame 을 부르지 않으며, hiqMembers 의
// rating/avg/handi 컬럼을 절대 건드리지 않는다(2026-08-30 RP 오염 사고 참고). 그래서 이 테이블들은
// hiq_games 로의 FK 가 없고, 시뮬 레이팅은 별도 테이블에 산다.

export const hiqSimSessions = pgTable("hiq_sim_sessions", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  memberId: uuid("member_id").references(() => hiqMembers.id).notNull(),
  kind: text("kind", { enum: ["solo", "drill", "match"] }).default("solo").notNull(),
  gameType: text("game_type", { enum: ["3c", "4c"] }).notNull(),
  tableId: text("table_id", { enum: ["DAEDAE", "JUNGDAE_KR"] }).notNull(),
  cushionModel: text("cushion_model").default("han2005").notNull(),
  condition: doublePrecision("condition").default(1).notNull(),
  /** 규칙 세트 전체(shared/sim/rules Rules). 3쿠션 umb/pba, 4구 옵션 등 */
  rules: jsonb("rules").notNull(),
  finishType: text("finish_type", { enum: ["none", "3c", "bank"] }).default("none").notNull(),
  targetScore: integer("target_score").notNull(),
  inningCap: integer("inning_cap").default(0).notNull(),
  /** 서버가 유지하는 정본 세션 상태(shared/sim/rules SessionState). 클라이언트 값은 참고용. */
  state: jsonb("state").notNull(),
  /** 현재 공 배치(BallState[]). 다음 샷의 preState 는 이것과 같아야 한다. */
  balls: jsonb("balls").notNull(),
  // 아래는 목록·랭킹 조회용 비정규화 값(state 에서 복사)
  score: integer("score").default(0).notNull(),
  innings: integer("innings").default(0).notNull(),
  highRun: integer("high_run").default(0).notNull(),
  shots: integer("shots").default(0).notNull(),
  status: text("status", { enum: ["playing", "finished", "abandoned"] }).default("playing").notNull(),
  engineVersion: text("engine_version").notNull(),
  paramsHash: text("params_hash").notNull(),
  /** 클라이언트 해시가 서버 재시뮬과 달랐던 샷 수(결정론 텔레메트리) */
  mismatches: integer("mismatches").default(0).notNull(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
  lastShotAt: timestamp("last_shot_at"),
}, (t) => ({
  idxMember: index("idx_sim_sessions_member").on(t.memberId, t.startedAt),
  idxLadder: index("idx_sim_sessions_ladder").on(t.gameType, t.tableId, t.status),
}));

export const hiqSimShots = pgTable("hiq_sim_shots", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  sessionId: uuid("session_id").references(() => hiqSimSessions.id, { onDelete: "cascade" }).notNull(),
  idx: integer("idx").notNull(),
  playerIndex: integer("player_index").default(0).notNull(),
  /** 샷 직전 공 배치(BallState[]) — 이것 + input 만 있으면 리플레이가 된다 */
  preState: jsonb("pre_state").notNull(),
  /** ShotInput */
  input: jsonb("input").notNull(),
  /** 서버 재시뮬 해시(정본) */
  hash: text("hash").notNull(),
  /** 클라이언트가 보낸 해시. 서버와 다르면 mismatch */
  clientHash: text("client_hash"),
  eventCount: integer("event_count").notNull(),
  outcomeCode: text("outcome_code").notNull(),
  points: integer("points").notNull(),
  cushions: integer("cushions").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  uniq: unique().on(t.sessionId, t.idx),
}));

/** 시뮬 전용 성적. hiqMembers 의 rating·avg 컬럼과 완전히 분리. */
/**
 * 온라인 대전 레이팅(2026-09-12). **테이블(대대·중대)을 합친다** — 오너: "대대 중대 통합해줘".
 * 예전에는 hiq_sim_ratings 안에 종목·테이블별로 있었는데, 인원이 적어 사다리가 넷으로 쪼개지면
 * 한 판에 서너 명씩 남았고(전체 4명), 같은 사람이 판마다 다른 등급을 달았다.
 * 솔로 기록(세션·에버·하이런)은 테이블 특성이 실제로 다르므로 hiq_sim_ratings 에 그대로 둔다 — 여긴 대전 전용이다.
 */
export const hiqSimMatchRatings = pgTable("hiq_sim_match_ratings", {
  memberId: uuid("member_id").references(() => hiqMembers.id).notNull(),
  gameType: text("game_type", { enum: ["3c", "4c"] }).notNull(),
  /** Elo. 1000 시작, K=24. 실전 RP 와 무관하다. */
  rating: integer("rating").default(1000).notNull(),
  matches: integer("matches").default(0).notNull(),
  wins: integer("wins").default(0).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.memberId, t.gameType] }),
}));

export const hiqSimRatings = pgTable("hiq_sim_ratings", {
  memberId: uuid("member_id").references(() => hiqMembers.id).notNull(),
  gameType: text("game_type", { enum: ["3c", "4c"] }).notNull(),
  tableId: text("table_id", { enum: ["DAEDAE", "JUNGDAE_KR"] }).notNull(),
  /**
   * @deprecated 연습 집계 — 2026-09-12 부터 **쓰지 않는다**(오너: "연습은 다 빼자, 공식 멀티경기만 적용").
   * 연습은 되돌리기로 이닝을 지울 수 있어 에버리지·하이런이 실력이 아니라 되돌리기 사용량을 잰다.
   * 새로 쓰지 않고 화면도 읽지 않는다. 남은 값은 그때까지의 흔적이고, 필요하면 hiq_sim_sessions 에서 다시 셀 수 있다
   * (scripts/backfill-sim-solo-stats.ts).
   */
  sessions: integer("sessions").default(0).notNull(),
  totalScore: integer("total_score").default(0).notNull(),
  totalInnings: integer("total_innings").default(0).notNull(),
  bestAvg: doublePrecision("best_avg").default(0).notNull(),
  bestHighRun: integer("best_high_run").default(0).notNull(),
  /** @deprecated 2026-09-12 부터 대전 레이팅은 hiq_sim_match_ratings(테이블 통합) 에 쌓인다. 이 세 칸은 그때까지의 기록이다. */
  simRating: integer("sim_rating").default(1000).notNull(),
  matches: integer("matches").default(0).notNull(),
  wins: integer("wins").default(0).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.memberId, t.gameType, t.tableId] }),
}));

export type HiqSimSession = typeof hiqSimSessions.$inferSelect;
export type HiqSimShot = typeof hiqSimShots.$inferSelect;
export type HiqSimRating = typeof hiqSimRatings.$inferSelect;

// --- 8.11 시뮬레이터 네트워크 대전 A (비동기·폴링) ---
// 실전 경기 테이블과 무관. 초대 코드는 hiq_invites 를 쓰지 않고 자체 code 로 관리한다(실전 매칭의
// consent/consume 로직과 얽히지 않게). 서버가 모든 샷을 재시뮬해 정본을 쓴다.
export const hiqSimMatches = pgTable("hiq_sim_matches", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  code: text("code").notNull(),
  hostId: uuid("host_id").references(() => hiqMembers.id).notNull(),
  guestId: uuid("guest_id").references(() => hiqMembers.id),
  gameType: text("game_type", { enum: ["3c", "4c"] }).notNull(),
  tableId: text("table_id", { enum: ["DAEDAE", "JUNGDAE_KR"] }).notNull(),
  cushionModel: text("cushion_model").default("han2005").notNull(),
  condition: doublePrecision("condition").default(1).notNull(),
  /** 조준 보정(일반 모드). 리얼리티 모드 방은 false — 게스트 화면도 같은 모드로. 판정·해시엔 무관. */
  aimAssist: boolean("aim_assist").default(true).notNull(),
  /** 대전 미리보기 전체(연습처럼 쿠션 뒤까지). 기본 false = 첫 접촉 + 꼬리. 방장 설정, 게스트도 따른다. */
  fullPreview: boolean("full_preview").default(false).notNull(),
  /** 멀티방(공개 방): 방 목록에 떠서 누구나 참가. 기본 false = 코드·푸시 초대로만. */
  isPublic: boolean("is_public").default(false).notNull(),
  /**
   * 핸디전(2026-09-12 오너: "다마수에 따른 경기를 해야 합리적"). 참가하는 순간 서버가 두 사람의 온라인
   * 에버리지로 각자 목표를 정한다(shared/sim/handicap — 비율 유지, 길이 고정). 끄면 방장이 적은 다마수로
   * 둘 다 친다(맞대결). 이 칸이 생기기 전 방들은 전부 false 로 넣었다.
   */
  handicap: boolean("handicap").default(true).notNull(),
  /** 방 비밀번호(선택) "salt:sha256(salt+pw)". 있으면 참가(코드·목록 모두)에 password 가 맞아야 한다. */
  passwordHash: text("password_hash"),
  /** 호스트가 마지막으로 푸시 초대한 회원(친구에게 보내기). */
  invitedId: uuid("invited_id").references(() => hiqMembers.id),
  rules: jsonb("rules").notNull(),
  finishType: text("finish_type", { enum: ["none", "3c", "bank"] }).default("none").notNull(),
  hostTarget: integer("host_target").notNull(),
  /** 게스트 다마수. 참가 시 게스트가 정한다(없으면 hostTarget). */
  guestTarget: integer("guest_target"),
  inningCap: integer("inning_cap").default(0).notNull(),
  status: text("status", { enum: ["waiting", "playing", "finished", "canceled"] }).default("waiting").notNull(),
  /** 정본 세션 상태(SessionState). players[0]=host(white), players[1]=guest(yellow). */
  state: jsonb("state"),
  balls: jsonb("balls"),
  turn: integer("turn").default(0).notNull(),
  shots: integer("shots").default(0).notNull(),
  version: integer("version").default(0).notNull(),
  winnerId: uuid("winner_id").references(() => hiqMembers.id),
  /** finished 사유: target | inningCap | resign | claim(무응답 승리) */
  endReason: text("end_reason"),
  engineVersion: text("engine_version").notNull(),
  paramsHash: text("params_hash").notNull(),
  mismatches: integer("mismatches").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  startedAt: timestamp("started_at"),
  lastShotAt: timestamp("last_shot_at"),
  /** 40초 룰: 차례인 사람의 시계 시작 시각. 상대가 접속 중(host/guest_seen_at 이 PRESENCE_MS 안)이면 샷 직후 재생 여유(REPLAY_GRACE_MS)를 더해 서버가 바로 적고,
   *  아니면 차례인 사람이 조준 화면을 열 때(GET ?ack=1). 샷·시간 초과로 차례가 바뀌면 다시 계산. */
  turnSeenAt: timestamp("turn_seen_at"),
  /** 접속 표시: 각자가 대전 화면을 마지막으로 폴링·샷한 시각(5 s 단위 갱신). 차례가 넘어갈 때 상대 시계를 바로 돌릴지 정한다. */
  hostSeenAt: timestamp("host_seen_at"),
  guestSeenAt: timestamp("guest_seen_at"),
  /**
   * "한 판 더"(2026-09-15 오너: 라포). {"<회원 id>": "<ISO>"} — 끝난 대전에서 재경기를 원한다고 누른 사람.
   * 둘 다 누르면 서버가 같은 설정으로 새 대전을 만들고 rematchId 에 적는다. 양쪽 화면은 그 id 로 옮겨 간다.
   * 대화가 아니라 한 번의 의사 표시라 쌓지 않는다 — 대전 행 하나만 읽으면 끝이고, 대전이 지워지면 같이 사라진다.
   */
  rematchBy: jsonb("rematch_by"),
  /** 재경기로 만들어진 새 대전. 한 번 정해지면 안 바뀐다(양쪽이 같은 방으로 들어가는 기준점). */
  rematchId: uuid("rematch_id"),
  /**
   * 상대에게 보여 줄 조준 방향(rad, 2026-09-16). 치는 쪽이 겨누는 동안 드문드문 적고, 차례가 바뀌면 지운다.
   * 값 하나뿐이라 컬럼으로 둔다(이모지와 같은 이유) — 남길 기록이 아니라 몇 초짜리 현재 상태다.
   */
  aimPhi: doublePrecision("aim_phi"),
  aimAt: timestamp("aim_at"),
  /** 이모지 인사(2026-09-09 오너): 마지막 하나만 둔다 — 대화 내역이 아니라 순간 반응이라 쌓을 이유가 없다. */
  emojiCode: text("emoji_code"),
  /** 보낸 사람 자리(0 = 호스트, 1 = 게스트) */
  emojiFrom: integer("emoji_from"),
  emojiAt: timestamp("emoji_at"),
  /** 자리별 보낸 횟수 {"0":n,"1":m} — 한 대전 상한을 세는 용도. */
  emojiCounts: jsonb("emoji_counts"),
  /**
   * 오간 채팅 줄 수(2026-09-16). 폴링 응답이 이 숫자 하나만 싣고, 클라이언트는 **늘었을 때만** /chats 를 부른다
   * — shots ↔ 샷 idx 와 똑같은 규약이라 추가 폴링이 0이다. 본문은 절대 여기 두지 않는다:
   * 이모지처럼 단일 슬롯에 두면 둘이 같은 폴링 창(2~5초)에 보낼 때 앞의 말이 소리 없이 사라진다.
   */
  chatSeq: integer("chat_seq").default(0).notNull(),
  /**
   * 관전자 표시(2026-09-12): {"<회원 id>": epoch ms} — 관전 화면이 폴링할 때마다 자기 시각을 적는다.
   * 시각이 WATCHER_WINDOW_MS 안인 사람만 "보고 있는 중"으로 센다. 이름은 담지 않는다(숫자만 보인다).
   * 새 테이블을 만들지 않은 이유: 오래 남길 기록이 아니라 몇 초짜리 현재 상태이고, 대전 행 하나만 읽으면 끝이라서.
   * 갱신은 SQL 한 문장에서 오래된 항목을 걷어내며 하므로(pruneAndTouchWatcher) 관전자가 동시에 들어와도 서로 덮지 않는다.
   */
  watchers: jsonb("watchers"),
  /** 쓰리아웃: 각자의 40초 시간 초과 횟수. SHOT_CLOCK_STRIKES(3) 가 되면 그 사람의 실격패. */
  hostTimeouts: integer("host_timeouts").default(0).notNull(),
  guestTimeouts: integer("guest_timeouts").default(0).notNull(),
  finishedAt: timestamp("finished_at"),
}, (t) => ({
  idxCode: index("idx_sim_matches_code").on(t.code, t.status),
  idxPublic: index("idx_sim_matches_public").on(t.isPublic, t.status, t.createdAt),
  idxHost: index("idx_sim_matches_host").on(t.hostId, t.createdAt),
  idxGuest: index("idx_sim_matches_guest").on(t.guestId, t.createdAt),
}));

export const hiqSimMatchShots = pgTable("hiq_sim_match_shots", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  matchId: uuid("match_id").references(() => hiqSimMatches.id, { onDelete: "cascade" }).notNull(),
  idx: integer("idx").notNull(),
  playerIndex: integer("player_index").notNull(),
  memberId: uuid("member_id").references(() => hiqMembers.id).notNull(),
  preState: jsonb("pre_state").notNull(),
  input: jsonb("input").notNull(),
  hash: text("hash").notNull(),
  clientHash: text("client_hash"),
  eventCount: integer("event_count").notNull(),
  outcomeCode: text("outcome_code").notNull(),
  points: integer("points").notNull(),
  cushions: integer("cushions").default(0).notNull(),
  /**
   * 친 사람의 몇 번째 이닝이었나(1부터, shared/sim/rules shotInning). 2026-09-18 추가 — 그 전 행은 null.
   * 샷 행만으로는 이닝을 되짚을 수 없다: 40초 시간 초과는 행 없이 이닝을 넘기고, 둘이 연달아 넘기면
   * 행 순서에 흔적이 전혀 안 남는다. 다시 들어온 화면·관전 화면이 이닝별 점수판을 이 값으로 다시 그린다.
   */
  inning: integer("inning"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  uniq: unique().on(t.matchId, t.idx),
}));

/**
 * 대전 채팅 한 줄(2026-09-16 오너: "일단 자유로운 챗이 가능하게").
 *
 * 왜 자식 테이블인가: 이모지는 대전 행의 단일 슬롯이라 마지막 하나가 앞의 것을 덮는다. 순간 반응이라 손해가 작았지만
 * 대화는 다르다 — 두 사람이 같은 폴링 창에 하나씩 보내면 한쪽 말이 아무에게도 안 보인 채 사라진다.
 * seq 를 가진 행으로 두면 커서(from)로 읽어 한 줄도 안 빠진다. 샷(hiq_sim_match_shots)과 같은 구조다.
 *
 * kind: 자유 입력은 "text"(본문 그대로), 고정 인사는 "code"(코드만 저장하고 화면이 자기 언어로 그린다 —
 * 5개 언어 앱이라 한국어 문장을 저장하면 스페인어 상대 화면에 한국어가 뜬다).
 *
 * id 를 uuid PK 로 두는 건 **나중에 신고를 붙일 자리**다. 지금은 신고를 안 만들지만(오너: 유저 많아지면),
 * hiq_reports.targetId 가 uuid notNull 이라 그때 가서 스키마를 못 바꾸면 곤란해진다. 지금 넣는 비용은 0이다.
 *
 * clientKey: 같은 전송의 재시도를 한 줄로 합친다. 모바일에서 응답만 유실되는 일이 흔한데, 그때 사용자가 다시
 * 누르면 같은 말이 두 줄로 남거나 "너무 자주 보냈다"는 거짓 안내가 뜬다.
 */
export const hiqSimMatchChats = pgTable("hiq_sim_match_chats", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  matchId: uuid("match_id").references(() => hiqSimMatches.id, { onDelete: "cascade" }).notNull(),
  /** 1부터. 대전 행의 chat_seq 와 짝이다(그 값이 지금까지 오간 줄 수). */
  seq: integer("seq").notNull(),
  senderIndex: integer("sender_index").notNull(),
  senderId: uuid("sender_id").references(() => hiqMembers.id).notNull(),
  kind: text("kind", { enum: ["text", "code"] }).default("text").notNull(),
  text: text("text").notNull(),
  clientKey: text("client_key"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  uniq: unique().on(t.matchId, t.seq),
  uniqClient: unique().on(t.matchId, t.senderIndex, t.clientKey),
}));

export type HiqSimMatch = typeof hiqSimMatches.$inferSelect;
export type HiqSimMatchShot = typeof hiqSimMatchShots.$inferSelect;
export type HiqSimMatchChat = typeof hiqSimMatchChats.$inferSelect;

// --- 8.12 시뮬레이터 드릴 래더 (주간 고정 문제, 문제당 채점 1회) ---
export const hiqSimDrillAttempts = pgTable("hiq_sim_drill_attempts", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  memberId: uuid("member_id").references(() => hiqMembers.id).notNull(),
  weekId: text("week_id").notNull(),
  drillId: text("drill_id").notNull(),
  tableId: text("table_id", { enum: ["DAEDAE", "JUNGDAE_KR"] }).notNull(),
  input: jsonb("input").notNull(),
  hash: text("hash").notNull(),
  clientHash: text("client_hash"),
  success: boolean("success").notNull(),
  cushions: integer("cushions").default(0).notNull(),
  outcomeCode: text("outcome_code").notNull(),
  engineVersion: text("engine_version").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  uniq: unique().on(t.memberId, t.weekId, t.drillId),
  idxWeek: index("idx_sim_drill_week").on(t.weekId, t.success),
}));

export type HiqSimDrillAttempt = typeof hiqSimDrillAttempts.$inferSelect;

/* ── 골프 랭킹(2026-09-13 오너: PGA·LPGA·KPGA·KLPGA 를 당구 세계랭킹처럼) — shared/golfTours.ts 가 투어 목록의 정본 ── */

// 회차별 순위 스냅샷. 세계 랭킹(owgr·rolex)은 주 1회 회차, 투어 랭킹(kpga·klpga)은 바뀐 날에만 새 회차(서명이 같으면 건너뛴다).
export const golfRankings = pgTable("golf_rankings", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  tour: text("tour", { enum: ["owgr", "rolex", "kpga", "klpga"] }).notNull(),
  edition: text("edition").notNull(),              // "2026-09-06" (회차 기준일)
  editionDate: timestamp("edition_date").notNull(),
  rank: integer("rank").notNull(),
  playerId: text("player_id").notNull(),           // 출처의 선수 id(OWGR id · Rolex id · KPGA playerCode · KLPGA playerCode)
  playerName: text("player_name").notNull(),       // 출처 표기(세계 랭킹은 로마자, 국내 투어는 한글)
  nameKo: text("name_ko"),
  country: text("country").notNull(),              // IOC 3자(KOR)
  points: doublePrecision("points").notNull(),     // 순위 기준 값(평균 포인트 · 시즌 포인트)
  pointsTotal: doublePrecision("points_total"),    // 세계 랭킹의 총점
  events: integer("events"),
  prevRank: integer("prev_rank"),                  // 출처가 주는 지난 회차 순위(OWGR lastWeekRank · Rolex change)
  extra: jsonb("extra").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  unique().on(t.tour, t.edition, t.playerId),
  index("golf_rankings_player_idx").on(t.tour, t.playerId),
  index("golf_rankings_edition_idx").on(t.tour, t.edition, t.rank),
]);

// 선수 기본 정보(생일·영문 이름 등). 순위 행에도 이름이 있어 화면은 이 표 없이도 그려진다.
export const golfPlayers = pgTable("golf_players", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  tour: text("tour", { enum: ["owgr", "rolex", "kpga", "klpga"] }).notNull(),
  playerId: text("player_id").notNull(),
  name: text("name").notNull(),
  nameKo: text("name_ko"),
  nameEn: text("name_en"),
  country: text("country").notNull(),
  birthDate: text("birth_date"),                   // "1996-06-21" (OWGR 가 준다)
  extra: jsonb("extra").$type<Record<string, unknown>>(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [unique().on(t.tour, t.playerId)]);

// 시즌 기록(비거리·페어웨이·그린 적중·퍼팅·상금 …). 출처의 지표 키를 그대로 쓴다(KPGA menuId · KLPGA menu2).
export const golfStats = pgTable("golf_stats", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  tour: text("tour", { enum: ["owgr", "rolex", "kpga", "klpga"] }).notNull(),
  season: text("season").notNull(),                // "2026"
  statKey: text("stat_key").notNull(),
  label: text("label").notNull(),
  unit: text("unit").notNull().default(""),
  rank: integer("rank").notNull(),
  playerId: text("player_id").notNull(),
  playerName: text("player_name").notNull(),
  value: doublePrecision("value").notNull(),
  extra: jsonb("extra").$type<Record<string, unknown>>(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  unique().on(t.tour, t.season, t.statKey, t.playerId),
  index("golf_stats_player_idx").on(t.tour, t.playerId),
  index("golf_stats_key_idx").on(t.tour, t.season, t.statKey, t.rank),
]);

export type InsertGolfRanking = typeof golfRankings.$inferInsert;
export type InsertGolfPlayer = typeof golfPlayers.$inferInsert;
export type InsertGolfStat = typeof golfStats.$inferInsert;

/* ── 골프 온라인게임(미니골프 대전, 2026-09-14 오너: "골프도 온라인게임") — 규칙·코스는 shared/golf ── */

// 방: 6자리 코드로 모여 같은 코스를 각자 친다. 공이 서로 안 부딪히므로 서버는 타수만 모은다.
export const golfArcadeRooms = pgTable("golf_arcade_rooms", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  code: text("code").notNull(),
  hostId: uuid("host_id").references(() => hiqMembers.id).notNull(),
  courseId: text("course_id").default("rankue-park").notNull(),
  status: text("status", { enum: ["waiting", "playing", "finished"] }).default("waiting").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
}, (t) => [index("golf_arcade_rooms_code_idx").on(t.code, t.status)]);

export const golfArcadePlayers = pgTable("golf_arcade_players", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  roomId: uuid("room_id").references(() => golfArcadeRooms.id).notNull(),
  memberId: uuid("member_id").references(() => hiqMembers.id).notNull(),
  name: text("name").notNull(),
  /** 홀별 타수(끝낸 홀까지). 길이가 곧 진행 홀 수 */
  strokes: jsonb("strokes").$type<number[]>().default([]).notNull(),
  finishedAt: timestamp("finished_at"),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
}, (t) => [unique().on(t.roomId, t.memberId)]);

export type GolfArcadeRoom = typeof golfArcadeRooms.$inferSelect;
export type GolfArcadePlayer = typeof golfArcadePlayers.$inferSelect;
