import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { profiles } from "../shared/schema.ts";
import { isNotNull } from "drizzle-orm";
import dotenv from "dotenv";
import { Expo } from 'expo-server-sdk';

dotenv.config();

const connectionString = process.env.DATABASE_URL!;
const pool = new pg.Pool({ connectionString });
const db = drizzle(pool);
const expo = new Expo();

// 사용법: npx tsx scripts/send-global-push.ts "제목" "내용"
const args = process.argv.slice(2);
const title = args[0] || "🔔 랭큐 전체 공지";
const body = args[1] || "알림함 기능이 업데이트되었습니다. 지금 확인해보세요!";

async function sendGlobalPush() {
    console.log("🔍 전체 푸시 토큰 조회 중...");
    try {
        const users = await db.select().from(profiles).where(isNotNull(profiles.pushToken));

        if (users.length === 0) {
            console.log("❌ 푸시 토큰이 등록된 유저가 없습니다.");
            process.exit(0);
        }

        const tokens = users.map(u => u.pushToken).filter(t => Expo.isExpoPushToken(t));
        const uniqueTokens = [...new Set(tokens)];

        console.log(`✅ ${uniqueTokens.length}개의 유효한 토큰 발견!`);

        const messages = uniqueTokens.map(token => ({
            to: token as string,
            sound: 'default',
            title: title,
            body: body,
            data: { category: "GENERAL", type: "NOTICE" },
            priority: 'high',
            channelId: 'default',
        }));

        console.log(`🚀 ${messages.length}명에게 발송 시작...`);

        const chunks = expo.chunkPushNotifications(messages as any);
        let successCount = 0;
        let failCount = 0;

        for (let chunk of chunks) {
            try {
                const tickets = await expo.sendPushNotificationsAsync(chunk);
                successCount += tickets.length;
            } catch (error) {
                console.error("❌ 청크 발송 실패:", error);
                failCount += chunk.length;
            }
        }

        console.log(`✨ 결과: 성공 ${successCount}건 / 실패 ${failCount}건`);

    } catch (e) {
        console.error("오류 발생:", e);
    }
    process.exit(0);
}

sendGlobalPush();
