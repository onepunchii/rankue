
import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function normalize4BallScores() {
    console.log("Starting 4-Ball Score Normalization...");

    try {
        // 1. Update hiq_games table
        console.log("Updating hiq_games...");
        await db.execute(sql`
      UPDATE hiq_games 
      SET 
        player1_target = CASE WHEN player1_target >= 10 THEN player1_target / 10 ELSE player1_target END,
        player2_target = CASE WHEN player2_target >= 10 THEN player2_target / 10 ELSE player2_target END,
        player3_target = CASE WHEN player3_target >= 10 THEN player3_target / 10 ELSE player3_target END,
        player4_target = CASE WHEN player4_target >= 10 THEN player4_target / 10 ELSE player4_target END,
        player1_score = CASE WHEN player1_score >= 10 THEN player1_score / 10 ELSE player1_score END,
        player2_score = CASE WHEN player2_score >= 10 THEN player2_score / 10 ELSE player2_score END,
        player3_score = CASE WHEN player3_score >= 10 THEN player3_score / 10 ELSE player3_score END,
        player4_score = CASE WHEN player4_score >= 10 THEN player4_score / 10 ELSE player4_score END,
        player1_high_run = CASE WHEN player1_high_run >= 10 THEN player1_high_run / 10 ELSE player1_high_run END,
        player2_high_run = CASE WHEN player2_high_run >= 10 THEN player2_high_run / 10 ELSE player2_high_run END,
        player3_high_run = CASE WHEN player3_high_run >= 10 THEN player3_high_run / 10 ELSE player3_high_run END,
        player4_high_run = CASE WHEN player4_high_run >= 10 THEN player4_high_run / 10 ELSE player4_high_run END
      WHERE game_type = '4c';
    `);

        // 2. Update hiq_game_history table
        console.log("Updating hiq_game_history...");
        await db.execute(sql`
      UPDATE hiq_game_history
      SET 
        score = CASE WHEN score >= 10 THEN score / 10 ELSE score END,
        high_run = CASE WHEN high_run >= 10 THEN high_run / 10 ELSE high_run END,
        average = CASE 
          WHEN score >= 10 AND innings > 0 THEN CAST(CAST((score / 10.0) / innings AS DECIMAL(10,3)) AS TEXT)
          ELSE average 
        END
      WHERE game_type = '4c';
    `);

        // 3. Update hiq_members table (handicap_4c)
        console.log("Updating hiq_members handicap...");
        await db.execute(sql`
      UPDATE hiq_members
      SET handi_4c = CASE WHEN handi_4c >= 10 THEN handi_4c / 10 ELSE handi_4c END;
    `);

        console.log("Successfully normalized all 4-Ball scores to count-based system.");
    } catch (error) {
        console.error("Error during normalization:", error);
    } finally {
        process.exit(0);
    }
}

normalize4BallScores();
