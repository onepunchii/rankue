
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Pool } from '@neondatabase/serverless';
import ws from 'ws';
import { neonConfig } from '@neondatabase/serverless';

neonConfig.webSocketConstructor = ws;

async function run() {
    if (!process.env.DATABASE_URL) {
        console.error("DATABASE_URL is missing");
        process.exit(1);
    }

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();

    try {
        const jsonPath = path.join(process.cwd(), 'golf/golf_courses_final.json');
        if (!fs.existsSync(jsonPath)) {
            console.error(`JSON file not found at ${jsonPath}`);
            process.exit(1);
        }

        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        console.log(`Starting seeding for ${data.length} golf clubs...`);

        for (const club of data) {
            try {
                await client.query('BEGIN');

                // 1. Golf Club Insert or Get ID
                let clubId;
                const clubRes = await client.query(
                    'SELECT id FROM rankue_golf_clubs WHERE name = $1',
                    [club.clubName]
                );

                if (clubRes.rows.length > 0) {
                    clubId = clubRes.rows[0].id;
                    // console.log(`Existing club found: ${club.clubName}`);
                } else {
                    const insertRes = await client.query(
                        'INSERT INTO rankue_golf_clubs (name) VALUES ($1) RETURNING id',
                        [club.clubName]
                    );
                    clubId = insertRes.rows[0].id;
                    console.log(`Created club: ${club.clubName}`);
                }

                // 2. Courses Insert
                let newCoursesCount = 0;
                for (const course of club.courses) {
                    // Check if course exists
                    const courseRes = await client.query(
                        'SELECT id FROM rankue_golf_courses WHERE club_id = $1 AND name = $2',
                        [clubId, course.courseName]
                    );

                    if (courseRes.rows.length === 0) {
                        await client.query(
                            'INSERT INTO rankue_golf_courses (club_id, name, pars) VALUES ($1, $2, $3)',
                            [clubId, course.courseName, JSON.stringify(course.pars)]
                        );
                        newCoursesCount++;
                    } else {
                        // Update pars if needed (overwrite)
                        await client.query(
                            'UPDATE rankue_golf_courses SET pars = $1, updated_at = now() WHERE id = $2',
                            [JSON.stringify(course.pars), courseRes.rows[0].id]
                        );
                    }
                }

                if (newCoursesCount > 0) {
                    console.log(`  Added ${newCoursesCount} courses to ${club.clubName}`);
                }

                await client.query('COMMIT');
            } catch (err) {
                await client.query('ROLLBACK');
                console.error(`Error processing ${club.clubName}:`, err);
            }
        }

        console.log('🎉 Seeding completed successfully!');
    } catch (err) {
        console.error('Fatal Error:', err);
    } finally {
        client.release();
        pool.end();
    }
}

run();
