import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  unique,
  uuid,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// 1. 프로필 (기본 사용자 정보 - HiQ에서 참조할 수 있음)
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().notNull(), // Supabase Auth user id
  nickname: text("nickname"),
  email: text("email"),
  phone: text("phone"),
  profileImageUrl: text("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// --- HiQ (Billiard Service) Tables ---
export const hiqStores = pgTable("hiq_stores", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  slug: text("slug").unique().notNull(), // URL identifier (e.g. 'hiq', 'busan')
  name: text("name").notNull(),
  logoText: text("logo_text"),
  themeColor: text("theme_color").default("#0e4d2a"),
  neonColor: text("neon_color").default("#ffd700"),
  subText: text("sub_text"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const hiqMembers = pgTable("hiq_members", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  storeId: uuid("store_id").references(() => hiqStores.id).notNull(),
  phone: text("phone").notNull(),
  name: text("name").notNull(),
  birthYear: integer("birth_year"),
  handi3c: integer("handi_3c"),
  handi4c: integer("handi_4c"),
  average: text("average"),
  marketingAgree: boolean("marketing_agree").default(false),
  visitCount: integer("visit_count").default(0),
  lastVisitedAt: timestamp("last_visited_at"),
  gender: text("gender", { enum: ["male", "female"] }),
  rating3c: integer("rating_3c").default(0).notNull(),
  rating4c: integer("rating_4c").default(0).notNull(),
  totalSimPoints: integer("total_sim_points").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique().on(table.storeId, table.phone),
]);

export const hiqGames = pgTable("hiq_games", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  storeId: uuid("store_id").references(() => hiqStores.id).notNull(),
  gameMode: text("game_mode", { enum: ["match", "practice"] }).notNull(),
  gameType: text("game_type", { enum: ["3c", "4c"] }).notNull(),
  player1Id: uuid("player1_id").references(() => hiqMembers.id).notNull(),
  player2Id: uuid("player2_id").references(() => hiqMembers.id),
  player3Id: uuid("player3_id").references(() => hiqMembers.id),
  player4Id: uuid("player4_id").references(() => hiqMembers.id),

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
  ruleFinishType: text("rule_finish_type", { enum: ["none", "3c", "bank"] }).default("none").notNull(),
  usePbaRule: boolean("use_pba_rule").default(false).notNull(),
  targetScore: integer("target_score").notNull(),
  totalInnings: integer("total_innings").default(0).notNull(),
  winnerId: uuid("winner_id").references(() => hiqMembers.id), // The player who triggered finish

  player1FinishInnings: integer("player1_finish_innings").default(0).notNull(),
  player2FinishInnings: integer("player2_finish_innings").default(0).notNull(),
  player3FinishInnings: integer("player3_finish_innings").default(0).notNull(),
  player4FinishInnings: integer("player4_finish_innings").default(0).notNull(),

  player1HighRun: integer("player1_high_run").default(0).notNull(),
  player2HighRun: integer("player2_high_run").default(0).notNull(),
  player3HighRun: integer("player3_high_run").default(0).notNull(),
  player4HighRun: integer("player4_high_run").default(0).notNull(),

  player1Innings: jsonb("player1_innings"),
  player2Innings: jsonb("player2_innings"),
  player3Innings: jsonb("player3_innings"),
  player4Innings: jsonb("player4_innings"),

  status: text("status", { enum: ["playing_base", "playing_finish", "finished"] }).default("playing_base").notNull(),
  isRanked: boolean("is_ranked").default(false).notNull(), // True if at least one VERIFIED MEMBER opponent existed
  player1Name: text("player1_name"),
  result: text("result"), // Summary of game outcome
  playedAt: timestamp("played_at").defaultNow().notNull(),
});

export const hiqVisitLogs = pgTable("hiq_visit_logs", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  memberId: uuid("member_id").references(() => hiqMembers.id).notNull(),
  visitedAt: timestamp("visited_at").defaultNow().notNull(),
});

export const hiqGameHistory = pgTable("hiq_game_history", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  memberId: uuid("member_id").references(() => hiqMembers.id).notNull(),
  gameId: uuid("game_id").references(() => hiqGames.id).notNull(),
  gameMode: text("game_mode", { enum: ["match", "practice"] }).notNull(),
  gameType: text("game_type", { enum: ["3c", "4c"] }).notNull(),
  score: integer("score").notNull(),
  innings: integer("innings").notNull(),
  average: text("average").notNull(),
  isWinner: boolean("is_winner").default(false).notNull(),
  isRanked: boolean("is_ranked").default(false).notNull(),
  highRun: integer("high_run").default(0).notNull(),
  inningData: jsonb("inning_data"),
  earnedPoints: integer("earned_points").default(0).notNull(),
  opponentName: text("opponent_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const hiqFriendships = pgTable("hiq_friendships", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  requesterId: uuid("requester_id").references(() => hiqMembers.id).notNull(),
  receiverId: uuid("receiver_id").references(() => hiqMembers.id).notNull(),
  status: text("status", { enum: ["pending", "accepted"] }).default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique().on(table.requesterId, table.receiverId),
]);

export const insertHiqStoreSchema = createInsertSchema(hiqStores).omit({ id: true, createdAt: true, updatedAt: true });
export const insertHiqMemberSchema = createInsertSchema(hiqMembers, {
  phone: z.string().min(10, "전화번호 형식이 올바르지 않습니다."),
  name: z.string().min(2, "이름은 2글자 이상이어야 합니다."),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  visitCount: true
});

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

export const hiqInvites = pgTable("hiq_invites", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  code: text("code").notNull(), // 6-digit code
  hostId: uuid("host_id").references(() => hiqMembers.id).notNull(),
  guestId: uuid("guest_id").references(() => hiqMembers.id), // Filled when a member joins
  status: text("status", { enum: ["pending", "accepted", "expired"] }).default("pending").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Profile = typeof profiles.$inferSelect;
export type HiqStore = typeof hiqStores.$inferSelect;
export type InsertHiqStore = z.infer<typeof insertHiqStoreSchema>;
export type HiqMember = typeof hiqMembers.$inferSelect;
export type InsertHiqMember = z.infer<typeof insertHiqMemberSchema>;
export type HiqGame = typeof hiqGames.$inferSelect;
export type InsertHiqGame = z.infer<typeof insertHiqGameSchema>;
export type HiqVisitLog = typeof hiqVisitLogs.$inferSelect;
export type InsertHiqVisitLog = z.infer<typeof insertHiqVisitLogSchema>;
export type HiqGameHistory = typeof hiqGameHistory.$inferSelect;
export type InsertHiqGameHistory = z.infer<typeof insertHiqGameHistorySchema>;
export type HiqFriendship = typeof hiqFriendships.$inferSelect;
export type InsertHiqFriendship = z.infer<typeof insertHiqFriendshipSchema>;
export const hiqSimRecords = pgTable("hiq_sim_records", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  memberId: uuid("member_id").references(() => hiqMembers.id).notNull(),
  shotData: jsonb("shot_data").notNull(), // The coordinates and params of the shot
  points: integer("points").notNull(),
  difficulty: text("difficulty"), // 'easy', 'normal', 'hard', 'pro'
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
  // Initial Ball Positions
  ballPositions: jsonb("ball_positions").notNull(), // { white: {x,y}, yellow: {x,y}, red: {x,y} }
  // Winning Shot Parameters
  shotParams: jsonb("shot_params").notNull(),     // { angle, power, spinX, spinY }
  // Result Info
  cushionCount: integer("cushion_count"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertHiqSimRecordSchema = createInsertSchema(hiqSimRecords).omit({ id: true, createdAt: true });
export const insertHiqLeaderboardSchema = createInsertSchema(hiqLeaderboard).omit({ id: true, updatedAt: true });
export const insertHiqSuccessfulShotSchema = createInsertSchema(hiqSuccessfulShots).omit({ id: true, createdAt: true });

export type HiqSimRecord = typeof hiqSimRecords.$inferSelect;
export type HiqLeaderboard = typeof hiqLeaderboard.$inferSelect;
export type HiqSuccessfulShot = typeof hiqSuccessfulShots.$inferSelect;
export type InsertHiqSuccessfulShot = z.infer<typeof insertHiqSuccessfulShotSchema>;
