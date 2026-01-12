// 정책브리핑 스케줄러 테스트 스크립트
import PolicyBriefingScheduler from './server/policyBriefingScheduler.js';

console.log('🔄 정책브리핑 수동 테스트 시작');

const scheduler = new PolicyBriefingScheduler();

try {
  await scheduler.runManually();
  console.log('✅ 정책브리핑 테스트 완료');
} catch (error) {
  console.error('❌ 정책브리핑 테스트 실패:', error);
}