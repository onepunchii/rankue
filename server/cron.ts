import * as cron from 'node-cron';
import { storage } from './storage.js';
import { syncAssemblyRankingData } from './services/assemblyService.js';
import { createWeeklyPoliticalSurvey } from './politicalScheduler.js';
import { syncNews } from './services/newsService.js';
import { aggregateAllPastPoliticalSurveys, aggregatePoliticalStats } from './services/politicalStatsService.js';
import { db } from './db.js';
import { surveys } from '../shared/schema.js';
import { eq, and, like } from 'drizzle-orm';

export function setupCronJobs() {
    console.log('⏰ Cron jobs initialized');

    // 서버 시작 시 뉴스 동기화 및 누락된 로또 추첨 진행
    syncNews().catch(err => console.error('❌ Failed to sync news on startup:', err));

    // STARTUP CHECK: 오늘이 월요일이면 주간 설문 생성 시도 (이미 존재하면 스킵됨)
    const now = new Date();
    if (now.getDay() === 1) {
        console.log('📅 Monday detected on startup. Ensuring weekly political survey exists...');
        createWeeklyPoliticalSurvey().catch(err => console.error('❌ Failed to create weekly survey on startup:', err));
    }

    storage.runDailyLotteryDraw().then((draw) => {
        if (draw) {
            console.log(`✅ Missed lottery draw processed on startup: 회차 ${draw.id}`);
        }
    }).catch(error => {
        console.error('❌ Failed to run missed lottery draw on startup:', error);
    });

    // 0. Startup: Ensure stats are populated (One-off or check)
    // Run this async without blocking
    aggregateAllPastPoliticalSurveys().catch(e => console.error("Startup stats aggregation failed:", e));

    // 1. 매월 1일 자정에 국회의원 랭킹 데이터 업데이트
    cron.schedule('0 0 1 * *', async () => {
        console.log('📅 Running monthly ranking update...');
        try {
            await syncAssemblyRankingData();
            console.log('✅ Monthly ranking update completed');
        } catch (error) {
            console.error('❌ Monthly ranking update failed:', error);
        }
    });

    // 2. 매주 월요일 오전 9:00에 주간 정치 설문 생성
    cron.schedule('0 9 * * 1', async () => {
        console.log('📅 Running weekly political survey generation...');
        try {
            await createWeeklyPoliticalSurvey();
            console.log('✅ Weekly political survey generation completed');
        } catch (error) {
            console.error('❌ Weekly political survey generation failed:', error);
        }
    });

    // 2-1. Political Stats Aggregation (Hourly) - Keep stats fresh
    cron.schedule('0 * * * *', async () => {
        console.log('stats aggregation started');
        try {
            // Find active political surveys and update their stats
            const activeSurveys = await db.select().from(surveys).where(and(
                eq(surveys.category, 'politics'),
                eq(surveys.isActive, true),
                like(surveys.title, '%정기 여론조사%')
            ));

            for (const s of activeSurveys) {
                await aggregatePoliticalStats(s.id);
            }
        } catch (e) {
            console.error("Hourly stats aggregation failed:", e);
        }
    });

    // 3. 매일 자정 00:00에 로또 추첨 진행
    cron.schedule('0 0 * * *', async () => {
        console.log('🎰 Running daily lottery draw...');
        try {
            await storage.runDailyLotteryDraw();
            console.log('✅ Daily lottery draw completed');
        } catch (error) {
            console.error('❌ Daily lottery draw failed:', error);
        }
    });

    // 4. 매시 정각에 뉴스 동기화
    cron.schedule('0 * * * *', async () => {
        console.log('📅 Running hourly news synchronization...');
        try {
            await syncNews();
            console.log('✅ Hourly news synchronization completed');
        } catch (error) {
            console.error('❌ Hourly news synchronization failed:', error);
        }
    });
}
