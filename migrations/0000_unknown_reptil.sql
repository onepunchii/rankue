-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE "hiq_game_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"game_id" uuid,
	"game_mode" text NOT NULL,
	"game_type" text NOT NULL,
	"score" integer NOT NULL,
	"innings" integer NOT NULL,
	"average" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"is_winner" boolean DEFAULT false NOT NULL,
	"earned_points" integer DEFAULT 0 NOT NULL,
	"opponent_name" text,
	"is_ranked" boolean DEFAULT false NOT NULL,
	"high_run" integer DEFAULT 0 NOT NULL,
	"inning_data" jsonb,
	"store_id" uuid,
	"sport_category" text DEFAULT 'BILLIARDS' NOT NULL,
	"location_name" text,
	"sub_type" text,
	"score_json" jsonb
);
--> statement-breakpoint
CREATE TABLE "hiq_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"phone" text NOT NULL,
	"name" text NOT NULL,
	"birth_year" integer,
	"handi_3c" integer,
	"handi_4c" integer,
	"average" text,
	"marketing_agree" boolean DEFAULT false,
	"visit_count" integer DEFAULT 0,
	"last_visited_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"gender" text,
	"rating_3c" integer DEFAULT 0 NOT NULL,
	"rating_4c" integer DEFAULT 0 NOT NULL,
	"total_sim_points" integer DEFAULT 0 NOT NULL,
	"profile_id" uuid,
	"avg_3c" double precision DEFAULT 0,
	"avg_4c" double precision DEFAULT 0,
	"default_account_bank" text,
	"default_account_number" text,
	"default_account_holder" text,
	"golf_handicap" integer DEFAULT 0,
	"golf_avg_score" double precision DEFAULT 0,
	"golf_grade" text,
	"golf_grade_verified" boolean DEFAULT false NOT NULL,
	"total_golf_games" integer DEFAULT 0 NOT NULL,
	"golf_best_score" integer DEFAULT 0,
	"introduction" text,
	CONSTRAINT "hiq_members_store_id_phone_unique" UNIQUE("store_id","phone")
);
--> statement-breakpoint
CREATE TABLE "hiq_visit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"visited_at" timestamp DEFAULT now() NOT NULL,
	"store_id" uuid
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nickname" text,
	"email" text,
	"phone" text,
	"profile_image_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"password" text,
	"current_sport" text DEFAULT 'BILLIARDS' NOT NULL,
	"push_token" text
);
--> statement-breakpoint
CREATE TABLE "hiq_sim_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"shot_data" jsonb NOT NULL,
	"points" integer NOT NULL,
	"difficulty" text,
	"cushion_count" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hiq_successful_shots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_type" text NOT NULL,
	"ball_positions" jsonb NOT NULL,
	"shot_params" jsonb NOT NULL,
	"cushion_count" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hiq_leaderboard" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"rank" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hiq_friendships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_id" uuid NOT NULL,
	"receiver_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"sport_category" text DEFAULT 'BILLIARDS' NOT NULL,
	CONSTRAINT "hiq_friendships_requester_id_receiver_id_sport_category_unique" UNIQUE("requester_id","receiver_id","sport_category")
);
--> statement-breakpoint
CREATE TABLE "hiq_club_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"local_handi_3c" integer,
	"local_handi_4c" integer,
	"memo" text,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hiq_club_members_store_id_member_id_unique" UNIQUE("store_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "hiq_invites" (
	"code" text NOT NULL,
	"host_id" uuid NOT NULL,
	"guest_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid,
	"sport_category" text DEFAULT 'BILLIARDS' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hiq_tournament_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"current_rank" integer,
	"status" text DEFAULT 'active',
	"registered_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hiq_tournament_participants_tournament_id_member_id_unique" UNIQUE("tournament_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "hiq_crew_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hiq_stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"logo_text" text,
	"theme_color" text DEFAULT '#0e4d2a',
	"neon_color" text DEFAULT '#ffd700',
	"sub_text" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"owner_id" uuid,
	"description" text,
	"notice" text,
	"region" text,
	"address" text,
	"latitude" double precision,
	"longitude" double precision,
	"phone" text,
	"price_per_10min" integer,
	"open_time" text,
	"close_time" text,
	"has_parking" boolean DEFAULT false,
	"table_count" integer DEFAULT 0,
	"price_large" integer DEFAULT 2000,
	"price_medium" integer DEFAULT 1500,
	"parking_description" text,
	"table_large" integer DEFAULT 0,
	"table_medium" integer DEFAULT 0,
	"facilities" jsonb,
	"images" jsonb,
	"plan" text DEFAULT 'free',
	"subscription_status" text DEFAULT 'active' NOT NULL,
	"next_billing_date" timestamp,
	"subscription_tier" text DEFAULT 'BASIC',
	"subscription_expires_at" timestamp,
	"billing_key" text,
	"payment_method" text,
	CONSTRAINT "hiq_stores_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "hiq_tournaments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content" text,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp,
	"entry_fee" integer DEFAULT 20000,
	"game_type" text NOT NULL,
	"status" text DEFAULT 'recruiting' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"recruit_end" timestamp,
	"format" text DEFAULT 'knockout' NOT NULL,
	"handicap_rule" text,
	"max_players" integer DEFAULT 32,
	"prizes" jsonb,
	"poster_url" text,
	"match_method" text DEFAULT 'handicap' NOT NULL,
	"handicap_rate" integer DEFAULT 100,
	"target_score" integer,
	"bank_shot_point" integer DEFAULT 2,
	"time_limit" integer DEFAULT 40,
	"sport_category" text DEFAULT 'BILLIARDS' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hiq_crew_chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"crew_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"type" text DEFAULT 'text' NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "hiq_crew_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"crew_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"activity_date" timestamp NOT NULL,
	"location_store_id" uuid,
	"location_name" text,
	"max_participants" integer DEFAULT 8,
	"cost" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"sport_category" text DEFAULT 'BILLIARDS' NOT NULL,
	"category" text
);
--> statement-breakpoint
CREATE TABLE "hiq_crew_activity_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"status" text DEFAULT 'joined' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hiq_crew_activity_participants_activity_id_member_id_unique" UNIQUE("activity_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "hiq_crew_photo_likes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"photo_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hiq_crew_photo_likes_photo_id_member_id_unique" UNIQUE("photo_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "hiq_crew_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"crew_id" uuid NOT NULL,
	"uploader_id" uuid NOT NULL,
	"url" text NOT NULL,
	"caption" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_name" text NOT NULL,
	"phone_number" text NOT NULL,
	"store_name" text,
	"region" text,
	"status" text DEFAULT 'NEW' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"business_number" text,
	"business_license_file" text,
	"region_detail" text
);
--> statement-breakpoint
CREATE TABLE "hiq_crew_photo_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"photo_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hiq_games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"game_mode" text NOT NULL,
	"game_type" text NOT NULL,
	"player1_id" uuid NOT NULL,
	"player2_id" uuid,
	"player3_id" uuid,
	"player4_id" uuid,
	"player2_name" text,
	"player3_name" text,
	"player4_name" text,
	"player1_target" integer DEFAULT 0 NOT NULL,
	"player2_target" integer DEFAULT 0 NOT NULL,
	"player3_target" integer DEFAULT 0 NOT NULL,
	"player4_target" integer DEFAULT 0 NOT NULL,
	"player1_score" integer DEFAULT 0 NOT NULL,
	"player2_score" integer DEFAULT 0 NOT NULL,
	"player3_score" integer DEFAULT 0 NOT NULL,
	"player4_score" integer DEFAULT 0 NOT NULL,
	"player1_finish_score" integer DEFAULT 0 NOT NULL,
	"player2_finish_score" integer DEFAULT 0 NOT NULL,
	"player3_finish_score" integer DEFAULT 0 NOT NULL,
	"player4_finish_score" integer DEFAULT 0 NOT NULL,
	"finish_target_count" integer DEFAULT 0 NOT NULL,
	"rule_finish_type" text DEFAULT 'none' NOT NULL,
	"use_pba_rule" boolean DEFAULT false NOT NULL,
	"target_score" integer,
	"total_innings" integer DEFAULT 0 NOT NULL,
	"player1_finish_innings" integer DEFAULT 0 NOT NULL,
	"player2_finish_innings" integer DEFAULT 0 NOT NULL,
	"player3_finish_innings" integer DEFAULT 0 NOT NULL,
	"player4_finish_innings" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'playing_base' NOT NULL,
	"played_at" timestamp DEFAULT now() NOT NULL,
	"winner_id" uuid,
	"is_ranked" boolean DEFAULT false NOT NULL,
	"player1_name" text,
	"result" text,
	"player1_high_run" integer DEFAULT 0 NOT NULL,
	"player2_high_run" integer DEFAULT 0 NOT NULL,
	"player3_high_run" integer DEFAULT 0 NOT NULL,
	"player4_high_run" integer DEFAULT 0 NOT NULL,
	"player1_innings" jsonb,
	"player2_innings" jsonb,
	"player3_innings" jsonb,
	"player4_innings" jsonb,
	"tournament_id" uuid,
	"sport_category" text DEFAULT 'BILLIARDS' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hiq_crew_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"crew_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"is_notice" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"category" text,
	"sport_category" text DEFAULT 'BILLIARDS' NOT NULL,
	"images" jsonb
);
--> statement-breakpoint
CREATE TABLE "hiq_crew_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"crew_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hiq_crew_members_crew_id_member_id_unique" UNIQUE("crew_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "hiq_crew_likes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hiq_crew_likes_post_id_member_id_unique" UNIQUE("post_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"target" text DEFAULT 'all' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hiq_settlement_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	CONSTRAINT "hiq_settlement_participants_item_id_member_id_unique" UNIQUE("item_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "hiq_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"crew_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"title" text NOT NULL,
	"account_bank" text,
	"account_number" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"account_holder" text
);
--> statement-breakpoint
CREATE TABLE "hiq_settlement_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"settlement_id" uuid NOT NULL,
	"round_order" integer NOT NULL,
	"title" text NOT NULL,
	"amount" integer NOT NULL,
	"payer_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hiq_crews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"leader_id" uuid NOT NULL,
	"base_store_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"emblem" text,
	"game_type" text DEFAULT 'any' NOT NULL,
	"region" text,
	"tags" jsonb,
	"join_type" text DEFAULT 'auto' NOT NULL,
	"max_members" integer DEFAULT 50,
	"cover_image" text,
	"short_intro" text,
	"meeting_day" text,
	"meeting_time" text,
	"sport_category" text DEFAULT 'BILLIARDS' NOT NULL,
	"intro_questions" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "golf_joins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_name" text NOT NULL,
	"region" text NOT NULL,
	"datetime" timestamp NOT NULL,
	"host_id" uuid,
	"manager_phone" text,
	"green_fee" integer NOT NULL,
	"join_headcount" integer NOT NULL,
	"join_condition" text,
	"round_date" date,
	"comment" text,
	"status" text DEFAULT 'recruiting' NOT NULL,
	"is_blind" boolean DEFAULT false NOT NULL,
	"blind_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hiq_course_hole_info" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" text NOT NULL,
	"course_name" text NOT NULL,
	"sub_path_name" text,
	"hole_no" integer NOT NULL,
	"par" integer NOT NULL,
	"vote_count" integer DEFAULT 1 NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hiq_course_hole_info_course_id_sub_path_name_hole_no_unique" UNIQUE("course_id","sub_path_name","hole_no")
);
--> statement-breakpoint
CREATE TABLE "golf_bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" text NOT NULL,
	"course_name" text NOT NULL,
	"region" text NOT NULL,
	"datetime" timestamp NOT NULL,
	"manager_phone" text NOT NULL,
	"green_fee" integer NOT NULL,
	"is_hot_deal" boolean DEFAULT false NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb,
	"course_type" text,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"is_blind" boolean DEFAULT false NOT NULL,
	"blind_name" text,
	"policy_type" text DEFAULT 'POLICY_STANDARD' NOT NULL,
	"policy_custom_text" text,
	"listing_type" text DEFAULT 'BOOKING' NOT NULL,
	"join_headcount" integer,
	"join_condition" text
);
--> statement-breakpoint
CREATE TABLE "golf_match_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pin_code" text NOT NULL,
	"host_id" uuid NOT NULL,
	"course_id" text,
	"course_name" text,
	"game_mode" text DEFAULT 'stroke' NOT NULL,
	"stake" integer DEFAULT 1000 NOT NULL,
	"use_oecd" boolean DEFAULT false NOT NULL,
	"use_double" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"current_hole" integer DEFAULT 1 NOT NULL,
	"players" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"doubling_mode" text DEFAULT 'next' NOT NULL,
	"near_history" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"front_course_name" text,
	"back_course_name" text,
	"birdie_amount" integer DEFAULT 10000 NOT NULL,
	"eagle_amount" integer DEFAULT 20000 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hiq_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"category" text,
	"type" text,
	"params" jsonb,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regions" (
	"code" varchar(10) PRIMARY KEY NOT NULL,
	"sido" varchar(50),
	"sigungu" varchar(50),
	"dong" varchar(50),
	"full_name" varchar(150)
);
--> statement-breakpoint
CREATE TABLE "golf_clubs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"region" text,
	"total_holes" integer DEFAULT 18,
	"address" text,
	"image_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "golf_club_courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"name" text NOT NULL,
	"hole_count" integer DEFAULT 9 NOT NULL,
	"index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rankue_golf_clubs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"region" text,
	"address" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rankue_golf_courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"name" text NOT NULL,
	"pars" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hiq_game_history" ADD CONSTRAINT "hiq_game_history_game_id_hiq_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."hiq_games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_game_history" ADD CONSTRAINT "hiq_game_history_member_id_hiq_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."hiq_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_game_history" ADD CONSTRAINT "hiq_game_history_store_id_hiq_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."hiq_stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_members" ADD CONSTRAINT "hiq_members_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_members" ADD CONSTRAINT "hiq_members_store_id_hiq_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."hiq_stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_visit_logs" ADD CONSTRAINT "hiq_visit_logs_member_id_hiq_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."hiq_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_visit_logs" ADD CONSTRAINT "hiq_visit_logs_store_id_hiq_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."hiq_stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_sim_records" ADD CONSTRAINT "hiq_sim_records_member_id_hiq_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."hiq_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_leaderboard" ADD CONSTRAINT "hiq_leaderboard_member_id_hiq_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."hiq_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_friendships" ADD CONSTRAINT "hiq_friendships_receiver_id_hiq_members_id_fk" FOREIGN KEY ("receiver_id") REFERENCES "public"."hiq_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_friendships" ADD CONSTRAINT "hiq_friendships_requester_id_hiq_members_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."hiq_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_club_members" ADD CONSTRAINT "hiq_club_members_member_id_hiq_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."hiq_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_club_members" ADD CONSTRAINT "hiq_club_members_store_id_hiq_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."hiq_stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_invites" ADD CONSTRAINT "hiq_invites_guest_id_hiq_members_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."hiq_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_invites" ADD CONSTRAINT "hiq_invites_host_id_hiq_members_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."hiq_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_tournament_participants" ADD CONSTRAINT "hiq_tournament_participants_member_id_hiq_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."hiq_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_tournament_participants" ADD CONSTRAINT "hiq_tournament_participants_tournament_id_hiq_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."hiq_tournaments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_crew_comments" ADD CONSTRAINT "hiq_crew_comments_author_id_hiq_members_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."hiq_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_crew_comments" ADD CONSTRAINT "hiq_crew_comments_post_id_hiq_crew_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."hiq_crew_posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_stores" ADD CONSTRAINT "hiq_stores_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_tournaments" ADD CONSTRAINT "hiq_tournaments_store_id_hiq_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."hiq_stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_crew_chats" ADD CONSTRAINT "hiq_crew_chats_crew_id_hiq_crews_id_fk" FOREIGN KEY ("crew_id") REFERENCES "public"."hiq_crews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_crew_chats" ADD CONSTRAINT "hiq_crew_chats_sender_id_hiq_members_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."hiq_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_crew_activities" ADD CONSTRAINT "hiq_crew_activities_creator_id_hiq_members_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."hiq_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_crew_activities" ADD CONSTRAINT "hiq_crew_activities_crew_id_hiq_crews_id_fk" FOREIGN KEY ("crew_id") REFERENCES "public"."hiq_crews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_crew_activities" ADD CONSTRAINT "hiq_crew_activities_location_store_id_hiq_stores_id_fk" FOREIGN KEY ("location_store_id") REFERENCES "public"."hiq_stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_crew_activity_participants" ADD CONSTRAINT "hiq_crew_activity_participants_activity_id_hiq_crew_activities_" FOREIGN KEY ("activity_id") REFERENCES "public"."hiq_crew_activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_crew_activity_participants" ADD CONSTRAINT "hiq_crew_activity_participants_member_id_hiq_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."hiq_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_crew_photo_likes" ADD CONSTRAINT "hiq_crew_photo_likes_member_id_hiq_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."hiq_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_crew_photo_likes" ADD CONSTRAINT "hiq_crew_photo_likes_photo_id_hiq_crew_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."hiq_crew_photos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_crew_photos" ADD CONSTRAINT "hiq_crew_photos_crew_id_hiq_crews_id_fk" FOREIGN KEY ("crew_id") REFERENCES "public"."hiq_crews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_crew_photos" ADD CONSTRAINT "hiq_crew_photos_uploader_id_hiq_members_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."hiq_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_crew_photo_comments" ADD CONSTRAINT "hiq_crew_photo_comments_author_id_hiq_members_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."hiq_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_crew_photo_comments" ADD CONSTRAINT "hiq_crew_photo_comments_photo_id_hiq_crew_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."hiq_crew_photos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_games" ADD CONSTRAINT "hiq_games_player1_id_hiq_members_id_fk" FOREIGN KEY ("player1_id") REFERENCES "public"."hiq_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_games" ADD CONSTRAINT "hiq_games_player2_id_hiq_members_id_fk" FOREIGN KEY ("player2_id") REFERENCES "public"."hiq_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_games" ADD CONSTRAINT "hiq_games_player3_id_hiq_members_id_fk" FOREIGN KEY ("player3_id") REFERENCES "public"."hiq_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_games" ADD CONSTRAINT "hiq_games_player4_id_hiq_members_id_fk" FOREIGN KEY ("player4_id") REFERENCES "public"."hiq_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_games" ADD CONSTRAINT "hiq_games_store_id_hiq_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."hiq_stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_games" ADD CONSTRAINT "hiq_games_winner_id_hiq_members_id_fk" FOREIGN KEY ("winner_id") REFERENCES "public"."hiq_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_crew_posts" ADD CONSTRAINT "hiq_crew_posts_author_id_hiq_members_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."hiq_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_crew_posts" ADD CONSTRAINT "hiq_crew_posts_crew_id_hiq_crews_id_fk" FOREIGN KEY ("crew_id") REFERENCES "public"."hiq_crews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_crew_members" ADD CONSTRAINT "hiq_crew_members_crew_id_hiq_crews_id_fk" FOREIGN KEY ("crew_id") REFERENCES "public"."hiq_crews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_crew_members" ADD CONSTRAINT "hiq_crew_members_member_id_hiq_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."hiq_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_crew_likes" ADD CONSTRAINT "hiq_crew_likes_member_id_hiq_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."hiq_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_crew_likes" ADD CONSTRAINT "hiq_crew_likes_post_id_hiq_crew_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."hiq_crew_posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_settlement_participants" ADD CONSTRAINT "hiq_settlement_participants_item_id_hiq_settlement_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."hiq_settlement_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_settlement_participants" ADD CONSTRAINT "hiq_settlement_participants_member_id_hiq_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."hiq_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_settlements" ADD CONSTRAINT "hiq_settlements_creator_id_hiq_members_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."hiq_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_settlements" ADD CONSTRAINT "hiq_settlements_crew_id_hiq_crews_id_fk" FOREIGN KEY ("crew_id") REFERENCES "public"."hiq_crews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_settlement_items" ADD CONSTRAINT "hiq_settlement_items_payer_id_hiq_members_id_fk" FOREIGN KEY ("payer_id") REFERENCES "public"."hiq_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_settlement_items" ADD CONSTRAINT "hiq_settlement_items_settlement_id_hiq_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."hiq_settlements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_crews" ADD CONSTRAINT "hiq_crews_base_store_id_hiq_stores_id_fk" FOREIGN KEY ("base_store_id") REFERENCES "public"."hiq_stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_crews" ADD CONSTRAINT "hiq_crews_leader_id_hiq_members_id_fk" FOREIGN KEY ("leader_id") REFERENCES "public"."hiq_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "golf_match_sessions" ADD CONSTRAINT "golf_match_sessions_host_id_hiq_members_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."hiq_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiq_notifications" ADD CONSTRAINT "hiq_notifications_member_id_hiq_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."hiq_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "golf_club_courses" ADD CONSTRAINT "golf_club_courses_club_id_golf_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."golf_clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rankue_golf_courses" ADD CONSTRAINT "rankue_golf_courses_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."rankue_golf_clubs"("id") ON DELETE no action ON UPDATE no action;
*/