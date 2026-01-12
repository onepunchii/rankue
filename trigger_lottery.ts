import 'dotenv/config';
import { storage } from './server/storage';

async function triggerLottery() {
    console.log('🎰 Manually triggering daily lottery draw...');
    try {
        const result = await storage.runDailyLotteryDraw();
        if (result) {
            console.log('✅ Daily lottery draw completed successfully!');
            console.log('Winning Numbers:', result.winningNumbers);
            console.log('Total Participants:', result.totalParticipants);
        } else {
            console.log('ℹ️ No pending draws to process.');
        }
    } catch (error) {
        console.error('❌ Daily lottery draw failed:', error);
    }
    process.exit(0);
}

triggerLottery();
