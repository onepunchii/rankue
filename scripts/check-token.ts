import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { profiles } from "../shared/schema.ts";
import { eq } from "drizzle-orm";
import dotenv from "dotenv";

dotenv.config();

const connectionString = process.env.DATABASE_URL!;
const pool = new pg.Pool({ connectionString });
const db = drizzle(pool);

async function checkToken() {
    console.log("🔍 토큰 조회 중...");
    try {
        // 전화번호로 조회 (암호화 안 되어 있다고 가정)
        // 010-9374-0076 또는 01093740076 등 포맷에 맞춰 검색
        // profiles 테이블은 phone으로 검색이 안 될 수 있음(authId 기준일 수 있음)
        // 하지만 profiles에 phone 컬럼이 있음

        const user = await db.select().from(profiles).where(eq(profiles.phone, "01093740076"));

        if (user.length > 0) {
            console.log("✅ 유저 발견:", user[0].nickname);
            console.log("🔑 Push Token:", user[0].pushToken || "❌ 없음 (null)");
        } else {
            // 하이픈 포함 검색 시도
            const user2 = await db.select().from(profiles).where(eq(profiles.phone, "010-9374-0076"));
            if (user2.length > 0) {
                console.log("✅ 유저 발견:", user2[0].nickname);
                console.log("🔑 Push Token:", user2[0].pushToken || "❌ 없음 (null)");
            } else {
                console.log("❌ 해당 전화번호의 유저를 찾을 수 없습니다.");
            }
        }
    } catch (e) {
        console.error("오류 발생:", e);
    }
    process.exit(0);
}

checkToken();
