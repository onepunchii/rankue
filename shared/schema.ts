import {
  pgTable,
  text,
  varchar,
  timestamp,
  jsonb,
  integer,
  bigint,
  boolean,
  unique,
  uuid,
  numeric,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// 1. 통합 인증 및 AI 페르소나 시스템
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().notNull(), // Supabase Auth user id
  nickname: varchar("nickname", { length: 50 }),
  email: varchar("email", { length: 255 }),
  fullName: varchar("full_name", { length: 100 }),
  phone: varchar("phone", { length: 50 }),
  profileImageUrl: varchar("profile_image_url", { length: 500 }),

  // [중요] 정치 성향 및 AI 페르소나 분석
  participationCount: integer("participation_count").default(0).notNull(),
  politicalAnalysis: jsonb("political_analysis").default({
    economic: 50, // 0: 분배/복지, 100: 성장/상생
    social: 50,   // 0: 진보/자유, 100: 보수/질서
    keywords: []
  }).notNull(),
  aiPersona: jsonb("ai_persona").default({}).notNull(),
  personaStatus: varchar("persona_status", { length: 20 }).default("collecting").notNull(), // 'collecting', 'ready', 'generated'

  // 등급 및 포인트 시스템
  level: integer("level").default(1).notNull(),
  experience: integer("experience").default(0).notNull(),
  personalPoints: integer("personal_points").default(0).notNull(),
  availableLotteryTickets: integer("available_lottery_tickets").default(1).notNull(),

  // 인구통계 정보 (설문 분석용)
  ageGroup: varchar("age_group", { length: 20 }),
  gender: varchar("gender", { length: 10 }),
  region: varchar("region", { length: 50 }),
  city: varchar("city", { length: 100 }),
  constituency: varchar("constituency", { length: 200 }), // 지역구 정보
  jobCategory: varchar("job_category", { length: 100 }),
  educationLevel: varchar("education_level", { length: 100 }),
  incomeLevel: varchar("income_level", { length: 50 }),
  maritalStatus: varchar("marital_status", { length: 50 }),
  isPetOwner: boolean("is_pet_owner").default(false),

  // 설정 및 메타데이터
  badges: text("badges").array().default([]).notNull(),
  pushToken: varchar("push_token", { length: 255 }),
  notificationSettings: jsonb("notification_settings").default({
    push: true,
    email: true,
    marketing: false
  }),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// 2. 인물 마스터 데이터 (CSV 소스 기반)
export const celebrities = pgTable("celebrities", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  name: varchar("name", { length: 200 }).notNull(),
  category: varchar("category", { length: 50 }).notNull(), // 'boy_group', 'actor_female', etc.
  gender: varchar("gender", { length: 50 }),
  type: varchar("type", { length: 100 }), // 'Individual', 'Group'
  imageUrl: varchar("image_url", { length: 500 }),
  description: text("description"),
  rankOriginal: integer("rank_original"),
  createdAt: timestamp("created_at").defaultNow(),
});

// 3. 설문(투표) 시스템
export const surveys = pgTable("surveys", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  title: varchar("title", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 300 }).unique(),
  description: text("description"),
  category: varchar("category", { length: 50 }).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdBy: uuid("created_by").references(() => profiles.id),
  participantCount: integer("participant_count").default(0).notNull(),

  experienceReward: integer("experience_reward").default(10),
  personalPointsReward: integer("personal_points_reward").default(0),

  isAnonymous: boolean("is_anonymous").default(false),
  rewardType: varchar("reward_type", { length: 50 }).default("experience"),
  rewardAmount: integer("reward_amount").default(0),
  newsSourceUrl: text("news_source_url"),

  // SEO & Social Meta
  seoTitle: varchar("seo_title", { length: 255 }),
  seoDescription: text("seo_description"),
  seoKeywords: text("seo_keywords").array(),
  canonicalUrl: text("canonical_url"),
  ogImage: text("og_image"),

  // AI 분석 메타데이터
  aiAnalysisSummary: text("ai_analysis_summary"),
  aiAnalysisPros: text("ai_analysis_pros").array(),
  aiAnalysisCons: text("ai_analysis_cons").array(),
  aiAnalysisKeywords: text("ai_analysis_keywords").array(),
  aiAnalysisOneLiner: text("ai_analysis_one_liner"),

  votingStartDate: timestamp("voting_start_date").defaultNow(),
  votingEndDate: timestamp("voting_end_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const surveyQuestions = pgTable("survey_questions", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  surveyId: bigint("survey_id", { mode: "number" }).references(() => surveys.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  type: varchar("type", { length: 50 }).notNull(), // 'multiple_choice', 'text', 'rating', 'ranking'
  options: jsonb("options"), // 선택지 배열
  isRequired: boolean("is_required").default(true),
  order: integer("order").default(0),
  ratingScale: integer("rating_scale").default(5),
});

export const surveyResponses = pgTable("survey_responses", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  surveyId: bigint("survey_id", { mode: "number" }).references(() => surveys.id, { onDelete: "cascade" }),
  questionId: bigint("question_id", { mode: "number" }).references(() => surveyQuestions.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => profiles.id, { onDelete: "set null" }),
  answer: jsonb("answer").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Political Aggregation Stats
export const politicalStats = pgTable("political_stats", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  surveyId: bigint("survey_id", { mode: "number" }).notNull(),
  weekLabel: text("week_label").notNull(), // e.g. "2026년 1월 3주차"
  presidential: jsonb("presidential").notNull(), // { positive: 30, negative: 60, neutral: 10 }
  parties: jsonb("parties").notNull(), // { '더불어민주당': 40, '국민의힘': 35... }
  candidates: jsonb("candidates").notNull(), // { '이재명': 40, '한동훈': 30... }
  totalParticipants: integer("total_participants").default(0).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPoliticalStatsSchema = createInsertSchema(politicalStats);

export const userSurveyParticipation = pgTable("user_survey_participation", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  userId: uuid("user_id").references(() => profiles.id, { onDelete: "cascade" }),
  surveyId: bigint("survey_id", { mode: "number" }).references(() => surveys.id, { onDelete: "cascade" }),
  pointsEarned: integer("points_earned").default(0),
  completedAt: timestamp("completed_at").defaultNow(),
}, (table) => [
  unique().on(table.userId, table.surveyId),
]);

// 6. 커뮤니티 및 기타 기능
export const celebrityBattles = pgTable("celebrity_battles", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  title: varchar("title", { length: 255 }).notNull(),
  category: varchar("category", { length: 50 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 20 }).default("active"),
  startDate: timestamp("start_date").defaultNow(),
  endDate: timestamp("endDate"),
});

export const quickPolls = pgTable("quick_polls", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  title: varchar("title", { length: 255 }).notNull(),
  options: jsonb("options").notNull(),
  creatorId: uuid("creator_id").references(() => profiles.id),
  voteCount: integer("vote_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const quickPollVotes = pgTable("quick_poll_votes", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  pollId: bigint("poll_id", { mode: "number" }).references(() => quickPolls.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => profiles.id, { onDelete: "cascade" }),
  optionId: integer("option_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  unique().on(table.pollId, table.userId),
]);

export const rewardItems = pgTable("reward_items", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  pointCost: integer("point_cost").notNull(),
  category: varchar("category", { length: 50 }).notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const battleParticipants = pgTable("battle_participants", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  battleId: bigint("battle_id", { mode: "number" }).references(() => celebrityBattles.id, { onDelete: "cascade" }),
  celebrityId: bigint("celebrity_id", { mode: "number" }).references(() => celebrities.id),
  voteCount: integer("vote_count").default(0),
});

export const battleVotes = pgTable("battle_votes", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  battleId: bigint("battle_id", { mode: "number" }).references(() => celebrityBattles.id, { onDelete: "cascade" }),
  participantId: bigint("participant_id", { mode: "number" }).references(() => battleParticipants.id, { onDelete: "cascade" }),
  voterId: uuid("voter_id").references(() => profiles.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  unique().on(table.battleId, table.voterId),
]);

// 5. 국회 및 뉴스 의안 시스템
export const assemblyBills = pgTable("assembly_bills", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  billName: varchar("bill_name", { length: 500 }).notNull(),
  proposer: varchar("proposer", { length: 200 }).notNull(),
  billId: varchar("bill_id", { length: 100 }).unique(),
  procStage: varchar("proc_stage", { length: 100 }),
  proposalDate: timestamp("proposal_date"),
  summary: text("summary"),
  detailLink: varchar("detail_link", { length: 500 }),
  surveyId: bigint("survey_id", { mode: "number" }).references(() => surveys.id),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// 5. 국회 및 뉴스 의안 시스템
export const assemblyMembers = pgTable("assembly_members", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  name: varchar("name", { length: 100 }).notNull(),
  nameHanja: varchar("name_hanja", { length: 100 }), // 한자명
  nameEng: varchar("name_eng", { length: 100 }), // 영문명
  party: varchar("party", { length: 100 }),

  // 지역 정보
  region: varchar("region", { length: 50 }), // 시/도
  district: varchar("district", { length: 100 }), // 시/군/구
  constituency: varchar("constituency", { length: 200 }), // 선거구

  // 상세 프로필
  gender: varchar("gender", { length: 10 }),
  birthDate: varchar("birth_date", { length: 20 }),
  age: integer("age"),
  polyImage: varchar("image_url", { length: 500 }),

  // 당선 정보
  electionTerm: varchar("election_term", { length: 20 }), // 당선 대수 (21대, 22대 등)
  reelectionStatus: varchar("reelection_status", { length: 50 }), // 재선 여부 (초선, 재선, 3선, 4선 등)

  // 의정 활동 데이터
  mainCommittee: varchar("main_committee", { length: 200 }), // 주요 상임위원회
  committee: varchar("committee", { length: 200 }), // 소속 위원회 (복수 가능)
  committees: text("committees"), // 전체 위원회 목록
  billsProposed: integer("bills_proposed").default(0),
  attendanceRate: numeric("attendance_rate", { precision: 5, scale: 2 }).default("0.00"),

  // 경력 및 학력
  education: text("education"), // 학력
  career1: text("career1"), // 주요 경력 1
  career2: text("career2"), // 주요 경력 2

  // 연락처
  phoneNumber: varchar("phone_number", { length: 50 }), // 전화번호
  email: varchar("email", { length: 100 }), // 이메일
  officeRoom: varchar("office_room", { length: 100 }), // 사무실 호실
  homepage: varchar("homepage", { length: 200 }), // 홈페이지

  // 기타
  status: varchar("status", { length: 50 }).default("재직"), // 재직 상태

  // AI 및 평가
  activityScore: integer("activity_score").default(0),
  jobEvaluation: integer("job_evaluation").default(0), // 직무 수행 평가 점수
  aiPersona: jsonb("ai_persona"), // AI 생성 페르소나 카드 데이터

  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const localCouncilMembers = pgTable("local_council_members", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  name: varchar("name", { length: 100 }).notNull(),
  party: varchar("party", { length: 100 }),

  // 지역 정보 (광역/기초 구분)
  type: varchar("type", { length: 50 }).notNull(), // 'metro_council' (광역의원), 'local_council' (기초의원), 'metro_head' (광역단체장), 'local_head' (기초단체장)
  cityProvince: varchar("city_province", { length: 100 }).notNull(), // 시/도
  district: varchar("district", { length: 100 }), // 시/군/구 (기초의원/단체장일 경우)
  constituency: varchar("constituency", { length: 200 }), // 선거구명

  // 프로필
  gender: varchar("gender", { length: 10 }),
  birthDate: varchar("birth_date", { length: 20 }),
  age: integer("age"),
  address: varchar("address", { length: 500 }),
  profileImage: varchar("profile_image", { length: 500 }),

  // 상세 정보
  job: varchar("job", { length: 100 }), // 직업
  education: text("education"), // 학력
  career1: text("career1"), // 경력1
  career2: text("career2"), // 경력2

  property: bigint("property", { mode: "number" }), // 재산신고액 (천원)
  taxArrears: bigint("tax_arrears", { mode: "number" }), // 체납액 (천원)
  criminalHistory: varchar("criminal_history", { length: 200 }), // 전과기록
  candidacyCount: varchar("candidacy_count", { length: 50 }), // 입후보횟수
  aiPersona: jsonb("ai_persona"), // AI 생성 페르소나 카드 데이터

  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Ratings & Comments
export const assemblyRatings = pgTable("assembly_ratings", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  targetId: bigint("target_id", { mode: "number" }).references(() => assemblyMembers.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => profiles.id, { onDelete: "cascade" }),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const localCouncilRatings = pgTable("local_council_ratings", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  targetId: bigint("target_id", { mode: "number" }).references(() => localCouncilMembers.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => profiles.id, { onDelete: "cascade" }),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAssemblyMemberSchema = createInsertSchema(assemblyMembers);
export const insertLocalCouncilMemberSchema = createInsertSchema(localCouncilMembers);
export const insertAssemblyRatingSchema = createInsertSchema(assemblyRatings);
export const insertLocalCouncilRatingSchema = createInsertSchema(localCouncilRatings); // Added export


export const assemblyComments = pgTable("assembly_comments", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  targetId: bigint("target_id", { mode: "number" }).references(() => assemblyMembers.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => profiles.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  likeCount: integer("like_count").default(0),
  reportCount: integer("report_count").default(0),
  isFiltered: boolean("is_filtered").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const localCouncilComments = pgTable("local_council_comments", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  targetId: bigint("target_id", { mode: "number" }).references(() => localCouncilMembers.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => profiles.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  likeCount: integer("like_count").default(0),
  reportCount: integer("report_count").default(0),
  isFiltered: boolean("is_filtered").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const newsArticles = pgTable("news_articles", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  title: text("title").notNull(),
  url: text("url").unique().notNull(),
  publishedAt: timestamp("published_at"),
  imageUrl: text("image_url"),
  content: text("content"),
  category: text("category").default("전체"),
  mindTranslation: jsonb("mind_translation"),
  createdAt: timestamp("created_at").defaultNow(),
});

// 6. 포인트 및 가상 재화 시스템
export const pointTransactions = pgTable("point_transactions", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  userId: uuid("user_id").references(() => profiles.id, { onDelete: "cascade" }).notNull(),
  type: varchar("type", { length: 20 }).notNull(), // 'earn', 'spend', 'send', 'receive'
  amount: integer("amount").notNull(),
  description: text("description").notNull(),
  referenceId: varchar("reference_id", { length: 100 }), // e.g., order_id, external_id
  relatedUserId: uuid("related_user_id").references(() => profiles.id),
  status: varchar("status", { length: 20 }).default("completed").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const lotteryTickets = pgTable("lottery_tickets", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  userId: uuid("user_id").references(() => profiles.id, { onDelete: "cascade" }),
  roundId: integer("round_id").notNull(),
  numbers: integer("numbers").array().notNull(),
  isWinner: boolean("is_winner").default(false),
  prizeAmount: integer("prize_amount").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const lotteryDraws = pgTable("lottery_draws", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  drawDate: timestamp("draw_date").notNull().unique(),
  winningNumbers: integer("winning_numbers").array().notNull(),
  totalParticipants: integer("total_participants").default(0),
  totalPrizePool: integer("total_prize_pool").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// 7. 음악 랭킹 시스템
export const musicCategories = pgTable("music_categories", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  name: varchar("name", { length: 100 }).notNull(),
  icon: varchar("icon", { length: 50 }),
  description: text("description"),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
});

export const musicArtists = pgTable("music_artists", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  name: varchar("name", { length: 200 }).notNull(),
  categoryId: bigint("category_id", { mode: "number" }).references(() => musicCategories.id),
  imageUrl: varchar("image_url", { length: 500 }),
  description: text("description"),
  debutYear: integer("debut_year"),
  agency: varchar("agency", { length: 200 }),
  currentMonthVotes: integer("current_month_votes").default(0),
  totalVotes: integer("total_votes").default(0),
  currentRank: integer("current_rank").default(0),
  previousRank: integer("previous_rank").default(0),
  isActive: boolean("is_active").default(true),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const musicVotes = pgTable("music_votes", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  userId: varchar("user_id", { length: 100 }).notNull(), // guest_common or uuid
  artistId: bigint("artist_id", { mode: "number" }).references(() => musicArtists.id),
  categoryId: bigint("category_id", { mode: "number" }).references(() => musicCategories.id),
  voteMonth: varchar("vote_month", { length: 7 }).notNull(), // YYYY-MM
  ipAddress: varchar("ip_address", { length: 50 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  unique().on(table.userId, table.artistId, table.voteMonth), // 한 달에 아티스트당 1회 투표 제한 (또는 로직에 따라 변경 가능)
]);

export const musicMonthlyRankings = pgTable("music_monthly_rankings", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  month: varchar("month", { length: 7 }).notNull(), // YYYY-MM
  categoryId: bigint("category_id", { mode: "number" }).references(() => musicCategories.id),
  artistId: bigint("artist_id", { mode: "number" }).references(() => musicArtists.id),
  finalRank: integer("final_rank").notNull(),
  totalVotes: integer("total_votes").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  unique().on(table.month, table.categoryId, table.artistId),
]);

// --- Relations ---
export const profilesRelations = relations(profiles, ({ many }) => ({
  surveys: many(surveys),
  responses: many(surveyResponses),
  participations: many(userSurveyParticipation),
  transactions: many(pointTransactions),
  lotteryTickets: many(lotteryTickets),
  battleVotes: many(battleVotes),
}));

export const surveysRelations = relations(surveys, ({ one, many }) => ({
  creator: one(profiles, { fields: [surveys.createdBy], references: [profiles.id] }),
  questions: many(surveyQuestions),
  responses: many(surveyResponses),
  assemblyBill: one(assemblyBills, { fields: [surveys.id], references: [assemblyBills.surveyId] }),
}));

export const celebrityBattlesRelations = relations(celebrityBattles, ({ many }) => ({
  participants: many(battleParticipants),
}));

export const battleParticipantsRelations = relations(battleParticipants, ({ one }) => ({
  battle: one(celebrityBattles, { fields: [battleParticipants.battleId], references: [celebrityBattles.id] }),
  celebrity: one(celebrities, { fields: [battleParticipants.celebrityId], references: [celebrities.id] }),
}));

// 11. 정치 지표 (여론조사 데이터)
export const politicalPolls = pgTable("political_polls", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  pollDate: timestamp("poll_date").notNull(),
  pollType: varchar("poll_type", { length: 50 }).notNull(), // 'presidential_approval', 'party_support', 'candidate_support'
  targetName: varchar("target_name", { length: 100 }).notNull(), // '윤석열', '더불어민주당' 등
  value: varchar("value", { length: 50 }).notNull(), // 지지율 (숫자 문자열)
  category: varchar("category", { length: 50 }), // '긍정', '부정', '무응답' 등 (대통령 지지율의 경우)
  source: varchar("source", { length: 100 }), // 조사 기관/출처
  sampleSize: integer("sample_size"), // 표본 크기
  marginOfError: varchar("margin_of_error", { length: 50 }), // 오차 범위
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const politicalFigures = pgTable("political_figures", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  name: varchar("name", { length: 100 }).notNull(),
  party: varchar("party", { length: 100 }),
  position: varchar("position", { length: 100 }),
  imageUrl: varchar("image_url", { length: 500 }),
  description: text("description"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// --- Zod Schemas ---
export const insertProfileSchema = createInsertSchema(profiles);
export const insertSurveySchema = createInsertSchema(surveys);
export const insertSurveyQuestionSchema = createInsertSchema(surveyQuestions);
export const insertSurveyResponseSchema = createInsertSchema(surveyResponses);
export const insertUserSurveyParticipationSchema = createInsertSchema(userSurveyParticipation);
export const insertCelebritySchema = createInsertSchema(celebrities);
export const insertCelebrityBattleSchema = createInsertSchema(celebrityBattles);
export const insertBattleParticipantSchema = createInsertSchema(battleParticipants);
export const insertBattleVoteSchema = createInsertSchema(battleVotes);
export const insertQuickPollSchema = createInsertSchema(quickPolls);
export const insertRewardItemSchema = createInsertSchema(rewardItems);
export const insertAssemblyBillSchema = createInsertSchema(assemblyBills);
export const insertAssemblyCommentSchema = createInsertSchema(assemblyComments);
export const insertLocalCouncilCommentSchema = createInsertSchema(localCouncilComments);
export const insertNewsArticleSchema = createInsertSchema(newsArticles);
export const insertPointTransactionSchema = createInsertSchema(pointTransactions);
export const insertLotteryTicketSchema = createInsertSchema(lotteryTickets);
export const insertLotteryDrawSchema = createInsertSchema(lotteryDraws);

// Added Tables for Rewards System
export const rewardOrders = pgTable("reward_orders", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  userId: uuid("user_id").references(() => profiles.id).notNull(),
  productId: bigint("product_id", { mode: "number" }).references(() => rewardItems.id).notNull(),
  productName: varchar("product_name", { length: 200 }).notNull(),
  pointCost: integer("point_cost").notNull(),
  status: varchar("status", { length: 20 }).default("pending").notNull(), // pending, approved, rejected, completed, failed
  couponCode: varchar("coupon_code", { length: 100 }),
  approvedBy: uuid("approved_by").references(() => profiles.id),
  approvedAt: timestamp("approved_at"),
  rejectedBy: uuid("rejected_by").references(() => profiles.id),
  rejectedReason: text("rejected_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const providerLogs = pgTable("provider_logs", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  orderId: bigint("order_id", { mode: "number" }).references(() => rewardOrders.id),
  provider: varchar("provider", { length: 50 }).notNull(),
  action: varchar("action", { length: 50 }).notNull(),
  status: varchar("status", { length: 20 }).notNull(),
  payload: jsonb("payload"),
  response: jsonb("response"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertRewardOrderSchema = createInsertSchema(rewardOrders);
export const insertProviderLogSchema = createInsertSchema(providerLogs);

// --- Types ---
export type Profile = typeof profiles.$inferSelect;
export type User = Profile; // Alias for compatibility
export type UpsertUser = z.infer<typeof insertProfileSchema>;
export type Celebrity = typeof celebrities.$inferSelect;
export type Survey = typeof surveys.$inferSelect;
export type SurveyQuestion = typeof surveyQuestions.$inferSelect;
export type SurveyResponse = typeof surveyResponses.$inferSelect;
export type UserSurveyParticipation = typeof userSurveyParticipation.$inferSelect;
export type CelebrityBattle = typeof celebrityBattles.$inferSelect;
export type BattleParticipant = typeof battleParticipants.$inferSelect;
export type BattleVote = typeof battleVotes.$inferSelect;
export type QuickPoll = typeof quickPolls.$inferSelect;
export type RewardItem = typeof rewardItems.$inferSelect;
export type AssemblyBill = typeof assemblyBills.$inferSelect;
export type Politician = typeof politicians.$inferSelect;
export type PoliticianRating = typeof politicianRatings.$inferSelect;
export type AssemblyMember = Politician; // Alias for compatibility
export type NewsArticle = typeof newsArticles.$inferSelect;
export type PointTransaction = typeof pointTransactions.$inferSelect;
export type LotteryTicket = typeof lotteryTickets.$inferSelect;
export type LotteryDraw = typeof lotteryDraws.$inferSelect;
export type RewardOrder = typeof rewardOrders.$inferSelect;
export type ProviderLog = typeof providerLogs.$inferSelect;

export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type InsertSurvey = z.infer<typeof insertSurveySchema>;
export type InsertSurveyQuestion = z.infer<typeof insertSurveyQuestionSchema>;
export type InsertSurveyResponse = z.infer<typeof insertSurveyResponseSchema>;
export type InsertPoliticalStats = z.infer<typeof insertPoliticalStatsSchema>;
export type InsertUserSurveyParticipation = z.infer<typeof insertUserSurveyParticipationSchema>;
export type InsertCelebrity = z.infer<typeof insertCelebritySchema>;
export type InsertCelebrityBattle = z.infer<typeof insertCelebrityBattleSchema>;
export type InsertBattleParticipant = z.infer<typeof insertBattleParticipantSchema>;
export type InsertBattleVote = z.infer<typeof insertBattleVoteSchema>;
export type InsertQuickPoll = z.infer<typeof insertQuickPollSchema>;
export type InsertRewardItem = z.infer<typeof insertRewardItemSchema>;
export type InsertAssemblyBill = z.infer<typeof insertAssemblyBillSchema>;
export type InsertPolitician = z.infer<typeof insertPoliticianSchema>;
export type InsertPoliticianRating = z.infer<typeof insertPoliticianRatingSchema>;
export type InsertAssemblyMember = InsertPolitician; // Alias for compatibility
export type InsertNewsArticle = z.infer<typeof insertNewsArticleSchema>;
export type InsertPointTransaction = z.infer<typeof insertPointTransactionSchema>;
export type InsertLotteryTicket = z.infer<typeof insertLotteryTicketSchema>;
export type InsertLotteryDraw = z.infer<typeof insertLotteryDrawSchema>;
export type InsertRewardOrder = z.infer<typeof insertRewardOrderSchema>;
export type InsertProviderLog = z.infer<typeof insertProviderLogSchema>;

export type MusicCategory = typeof musicCategories.$inferSelect;
export type MusicArtist = typeof musicArtists.$inferSelect;
export type MusicVote = typeof musicVotes.$inferSelect;
export type MusicMonthlyRanking = typeof musicMonthlyRankings.$inferSelect;

export const insertMusicCategorySchema = createInsertSchema(musicCategories);
export const insertMusicArtistSchema = createInsertSchema(musicArtists);
export const insertMusicVoteSchema = createInsertSchema(musicVotes);
export const insertMusicMonthlyRankingSchema = createInsertSchema(musicMonthlyRankings);

export type InsertMusicCategory = z.infer<typeof insertMusicCategorySchema>;
export type InsertMusicArtist = z.infer<typeof insertMusicArtistSchema>;
export type InsertMusicVote = z.infer<typeof insertMusicVoteSchema>;
export type InsertMusicMonthlyRanking = z.infer<typeof insertMusicMonthlyRankingSchema>;
