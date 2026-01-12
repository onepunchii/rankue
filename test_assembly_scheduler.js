import { runAssemblyBillScheduler } from './server/assemblyBillScheduler.js';

console.log('🏛️ Testing Assembly Bill Scheduler...');

try {
  const result = await runAssemblyBillScheduler();
  console.log('✅ Scheduler completed successfully!');
  console.log('Result:', JSON.stringify(result, null, 2));
} catch (error) {
  console.error('❌ Scheduler failed:', error);
}