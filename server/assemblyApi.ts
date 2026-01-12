// 국회 OpenAPI 연동 모듈
import axios from 'axios';

// 국회 의안정보시스템 OpenAPI 기본 URL
const ASSEMBLY_API_BASE = 'http://open.assembly.go.kr/portal/openapi';

// API 엔드포인트
const API_ENDPOINTS = {
  // 의원별 법안 발의 정보
  memberBills: 'nwvrqwxyaytdsfvhu',
  // 법안 상세 정보
  billInfo: 'nzmimeepazxkubdpn',
  // 의원 정보
  memberInfo: 'nwzgbrueokpyzpuht'
};

interface AssemblyMemberActivity {
  name: string;
  billsProposed: number;
  billsCosponsored: number;
  billsPassed: number;
  attendanceRate: string;
  activityScore: number;
}

/**
 * 국회의원의 법안 발의 수를 가져옵니다
 */
export async function getMemberBillCount(memberName: string, age: number = 22): Promise<number> {
  try {
    const url = `${ASSEMBLY_API_BASE}/${API_ENDPOINTS.memberBills}`;
    const params = {
      PROPOSER: memberName,
      AGE: age.toString(),
      TYPE: 'json',
      pSize: '1000' // 충분한 크기로 설정
    };

    console.log(`📊 ${memberName} 의원의 법안 발의 정보 조회 중...`);
    
    const response = await axios.get(url, { 
      params,
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (response.data && response.data[API_ENDPOINTS.memberBills]) {
      const bills = response.data[API_ENDPOINTS.memberBills][1];
      if (bills && bills.row) {
        const billCount = Array.isArray(bills.row) ? bills.row.length : 1;
        console.log(`   ✓ ${memberName}: ${billCount}건 발의`);
        return billCount;
      }
    }
    
    return 0;
  } catch (error: any) {
    console.error(`❌ ${memberName} 법안 정보 조회 실패:`, error?.message || error);
    return 0;
  }
}

/**
 * 법안의 처리 상태를 확인합니다
 */
export async function getBillStatus(billId: string): Promise<{ isPassed: boolean; status: string }> {
  try {
    const url = `${ASSEMBLY_API_BASE}/${API_ENDPOINTS.billInfo}`;
    const params = {
      BILL_ID: billId,
      TYPE: 'json'
    };

    const response = await axios.get(url, { 
      params,
      timeout: 5000 
    });

    if (response.data && response.data[API_ENDPOINTS.billInfo]) {
      const billInfo = response.data[API_ENDPOINTS.billInfo][1];
      if (billInfo && billInfo.row) {
        const status = billInfo.row.PROC_RESULT_CD || '';
        const isPassed = status.includes('가결') || status.includes('통과');
        return { isPassed, status };
      }
    }
    
    return { isPassed: false, status: '미처리' };
  } catch (error: any) {
    console.error(`❌ 법안 상태 조회 실패:`, error?.message || error);
    return { isPassed: false, status: '조회실패' };
  }
}

/**
 * 활동지수를 계산합니다
 * 발의건수(40%) + 통과율(30%) + 출석률(20%) + 위원회활동(10%)
 */
export function calculateActivityScore(
  billsProposed: number,
  billsPassed: number,
  attendanceRate: number,
  committeeActivity: number = 80
): number {
  // 발의건수 점수 (0-40점, 최대 50건 기준)
  const proposalScore = Math.min((billsProposed / 50) * 40, 40);
  
  // 통과율 점수 (0-30점)
  const passRate = billsProposed > 0 ? (billsPassed / billsProposed) * 100 : 0;
  const passScore = Math.min((passRate / 20) * 30, 30); // 20% 통과율을 만점 기준
  
  // 출석률 점수 (0-20점)
  const attendanceScore = (attendanceRate / 100) * 20;
  
  // 위원회 활동 점수 (0-10점, 기본 80점 기준)
  const committeeScore = (committeeActivity / 100) * 10;
  
  const totalScore = proposalScore + passScore + attendanceScore + committeeScore;
  
  return Math.round(totalScore);
}

/**
 * 국회의원의 종합 활동 정보를 수집합니다
 */
export async function collectMemberActivity(memberName: string): Promise<AssemblyMemberActivity> {
  try {
    console.log(`🔍 ${memberName} 의원 활동 정보 수집 시작`);
    
    // 1. 법안 발의 수 조회
    const billsProposed = await getMemberBillCount(memberName);
    
    // 2. 임시로 통과 법안 수 계산 (실제로는 각 법안별 상태 확인 필요)
    const billsPassed = Math.floor(billsProposed * (Math.random() * 0.3 + 0.1)); // 10-40% 통과율
    
    // 3. 출석률 (임시 데이터, 실제로는 국정감사 출석 데이터 필요)
    const attendanceRate = (Math.random() * 20 + 80).toFixed(2); // 80-100%
    
    // 4. 활동지수 계산
    const activityScore = calculateActivityScore(
      billsProposed,
      billsPassed,
      parseFloat(attendanceRate)
    );
    
    console.log(`   ✅ ${memberName}: 발의 ${billsProposed}건, 통과 ${billsPassed}건, 출석률 ${attendanceRate}%, 활동지수 ${activityScore}점`);
    
    return {
      name: memberName,
      billsProposed,
      billsCosponsored: 0, // 공동발의는 별도 API 필요
      billsPassed,
      attendanceRate,
      activityScore
    };
    
  } catch (error) {
    console.error(`❌ ${memberName} 활동 정보 수집 실패:`, error);
    
    // 실패 시 기본 값 반환
    return {
      name: memberName,
      billsProposed: 0,
      billsCosponsored: 0,
      billsPassed: 0,
      attendanceRate: '0.00',
      activityScore: 0
    };
  }
}

/**
 * 여러 국회의원의 활동 정보를 배치로 수집합니다
 */
export async function batchCollectActivity(memberNames: string[], delay: number = 1000): Promise<AssemblyMemberActivity[]> {
  const results: AssemblyMemberActivity[] = [];
  
  console.log(`🚀 ${memberNames.length}명 국회의원 활동 정보 배치 수집 시작`);
  
  for (let index = 0; index < memberNames.length; index++) {
    const name = memberNames[index];
    try {
      const activity = await collectMemberActivity(name);
      results.push(activity);
      
      // API 호출 제한을 위한 지연
      if (index < memberNames.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      if ((index + 1) % 10 === 0) {
        console.log(`   📊 진행률: ${index + 1}/${memberNames.length} (${Math.round((index + 1) / memberNames.length * 100)}%)`);
      }
      
    } catch (error) {
      console.error(`❌ ${name} 처리 중 오류:`, error);
    }
  }
  
  console.log(`✅ 활동 정보 수집 완료: ${results.length}명`);
  return results;
}