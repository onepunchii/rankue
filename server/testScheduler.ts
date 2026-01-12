
import 'dotenv/config';
import { runAssemblyBillScheduler } from './assemblyBillScheduler';
import PolicyBriefingScheduler from './policyBriefingScheduler';

async function testSchedulers() {
    console.log('🚀 Testing Schedulers and API Connectivity...');

    // 1. Test Assembly Bill Scheduler (National Assembly API)
    console.log('\n----------------------------------------');
    console.log('🏛️ Testing Assembly Bill Scheduler...');
    try {
        const assemblyResult = await runAssemblyBillScheduler();
        console.log('✅ Assembly Bill Scheduler Result:', assemblyResult);
    } catch (error) {
        console.error('❌ Assembly Bill Scheduler Error:', error);
    }

    // 2. Test Policy Briefing Scheduler (RSS Feed + OpenAI)
    console.log('\n----------------------------------------');
    console.log('📰 Testing Policy Briefing Scheduler...');
    try {
        const policyScheduler = new PolicyBriefingScheduler();
        await policyScheduler.runManually();
        const status = policyScheduler.getStatus();
        console.log('✅ Policy Briefing Scheduler Status:', status);
    } catch (error) {
        console.error('❌ Policy Briefing Scheduler Error:', error);
    }

    console.log('\n----------------------------------------');
    console.log('🏁 Test Complete');
    process.exit(0);
}

testSchedulers();
