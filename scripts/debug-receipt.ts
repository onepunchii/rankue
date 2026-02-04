import { Expo } from 'expo-server-sdk';
import dotenv from "dotenv";

dotenv.config();

const expo = new Expo();
const pushToken = "ExponentPushToken[v33_iULS8MX89yxmzM3Ufy]";

async function checkReceipt() {
    console.log(`🔍 Checking delivery for token: ${pushToken}`);

    const messages = [{
        to: pushToken,
        sound: 'default',
        title: '🧪 Receipt Debug Check',
        body: 'Confirming delivery to Google/Apple...',
        data: { debug: true },
        priority: 'high',
        channelId: 'default',
    }];

    try {
        const chunks = expo.chunkPushNotifications(messages as any);
        for (let chunk of chunks) {
            console.log("🚀 Sending to Expo...");
            const tickets = await expo.sendPushNotificationsAsync(chunk);
            console.log("🎟️ Ticket Response:", JSON.stringify(tickets, null, 2));

            const ticketId = (tickets[0] as any).id;
            if (ticketId) {
                console.log(`⏳ Waiting 10 seconds to fetch receipt for ID: ${ticketId}...`);
                await new Promise(resolve => setTimeout(resolve, 10000));

                const receipts = await expo.getPushNotificationReceiptsAsync([ticketId]);
                console.log("🧾 Receipt Response:", JSON.stringify(receipts, null, 2));
            }
        }
    } catch (error) {
        console.error("❌ Send error:", error);
    }
    process.exit(0);
}

checkReceipt();
