import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { profiles } from "../shared/schema.ts";
import { eq } from "drizzle-orm";
import dotenv from "dotenv";
import { Expo } from 'expo-server-sdk';

dotenv.config();

const connectionString = process.env.DATABASE_URL!;
const pool = new pg.Pool({ connectionString });
const db = drizzle(pool);
const expo = new Expo();

async function sendToMe() {
    console.log("🔍 내 토큰 조회 및 발송 시도...");
    try {
        const user = await db.select().from(profiles).where(eq(profiles.phone, "01093740076"));

        if (user.length === 0) {
            console.log("❌ 해당 전화번호의 유저를 찾을 수 없습니다.");
            process.exit(1);
        }

        const pushToken = user[0].pushToken;
        console.log("✅ 유저 발견:", user[0].nickname);

        if (!pushToken) {
            console.log("⚠️ 아직 DB에 Push Token이 없습니다. 앱을 재실행해주세요.");
            process.exit(0);
        }

        console.log("🔑 찾은 토큰:", pushToken);

        // 발송
        const messages = [{
            to: pushToken,
            sound: 'default',
            title: '🔔 테스트 성공!',
            body: 'DB에 저장된 토큰으로 보낸 알림입니다.',
            data: { test: true },
        }];

        const chunks = expo.chunkPushNotifications(messages as any);
        for (let chunk of chunks) {
            await expo.sendPushNotificationsAsync(chunk);
        }
        console.log('✨ 알림 전송 완료!');

    } catch (e) {
        console.error("오류 발생:", e);
    }
    process.exit(0);
}

sendToMe();
