import 'dotenv/config';
import { runAssemblyBillScheduler } from './assemblyBillScheduler';

async function main() {
    console.log('🚀 Manually triggering Assembly Bill Scheduler...');
    try {
        const result = await runAssemblyBillScheduler();
        console.log('✅ Result:', result);
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        process.exit(0);
    }
}

main();
