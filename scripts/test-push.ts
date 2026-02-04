import { Expo } from 'expo-server-sdk';

// 사용법: npx ts-node scripts/test-push.ts <TOKEN> <TITLE> <BODY> <DATA_JSON>
// 예시: npx ts-node scripts/test-push.ts "ExponentPushToken[xxx]" "테스트 알림" "잘 가나요?" '{"category":"GOLF", "type":"CHAT"}'

const expo = new Expo();

const args = process.argv.slice(2);
const pushToken = args[0];
const title = args[1] || '🔔 테스트 알림';
const body = args[2] || '이것은 테스트 메시지입니다.';
const dataStr = args[3] || '{}';

async function sendPushNotification() {
    if (!Expo.isExpoPushToken(pushToken)) {
        console.error(`🚫 유효하지 않은 Expo Push Token입니다: ${pushToken}`);
        return;
    }

    let data = {};
    try {
        data = JSON.parse(dataStr);
    } catch (e) {
        console.warn('⚠️ 데이터 JSON 파싱 실패, 빈 객체로 전송합니다.');
    }

    const messages = [{
        to: pushToken,
        sound: 'default',
        title: title,
        body: body,
        data: data,
        priority: 'high',
        channelId: 'default', // Android 필수 설정
    }];

    console.log(`🚀 알림 전송 시도...`);
    console.log(`   To: ${pushToken}`);
    console.log(`   Title: ${title}`);
    console.log(`   Body: ${body}`);
    console.log(`   Data:`, data);

    try {
        const chunks = expo.chunkPushNotifications(messages as any);
        for (let chunk of chunks) {
            const ticketChunkArgs = await expo.sendPushNotificationsAsync(chunk);
            console.log('✅ 전송 결과 (Tickets):', ticketChunkArgs);
        }
        console.log('✨ 알림 전송 완료!');
    } catch (error) {
        console.error('❌ 알림 전송 실패:', error);
    }
}

if (!pushToken) {
    console.log('⚠️ 사용법: npx ts-node scripts/test-push.ts <TOKEN> [TITLE] [BODY] [DATA_JSON]');
} else {
    sendPushNotification();
}
