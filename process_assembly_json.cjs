// 298명 국회의원 JSON 데이터 처리 및 업로드
const fs = require('fs');

async function processAssemblyJson() {
  try {
    console.log('📊 국회의원 JSON 파일 읽기 시작...');
    
    // JSON 파일 읽기
    const rawData = fs.readFileSync('attached_assets/kk_1753895744760.json', 'utf8');
    const jsonData = JSON.parse(rawData);
    
    console.log(`✅ JSON 파싱 완료: ${jsonData.length}개 항목`);
    
    // 첫 번째 항목이 헤더인지 확인
    if (jsonData[0] && jsonData[0].HG_NM === "이름") {
      console.log('🔍 첫 번째 항목은 헤더이므로 제거합니다.');
      jsonData.shift(); // 첫 번째 헤더 항목 제거
    }
    
    console.log(`🏛️ 실제 국회의원 데이터: ${jsonData.length}명`);
    
    // 샘플 데이터 확인
    if (jsonData.length > 0) {
      console.log('📝 첫 번째 의원 데이터:');
      console.log(`- 이름: ${jsonData[0].HG_NM}`);
      console.log(`- 정당: ${jsonData[0].POLY_NM}`);
      console.log(`- 선거구: ${jsonData[0].ORIG_NM}`);
    }
    
    // 데이터베이스 업데이트
    console.log('\n🚀 국회의원 데이터베이스 업데이트 시작...');
    
    const response = await fetch('http://localhost:5000/api/assembly/update-members', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(jsonData)
    });
    
    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ 전체 업데이트 성공!');
      console.log(`📊 성공: ${result.successCount}명, 실패: ${result.errorCount}명`);
      
      // 업데이트된 전체 의원 목록 확인
      const membersResponse = await fetch('http://localhost:5000/api/assembly/members');
      const members = await membersResponse.json();
      console.log(`\n🏛️ 총 국회의원 수: ${members.length}명`);
      
      // 정당별 통계
      const partyStats = {};
      members.forEach(member => {
        partyStats[member.party] = (partyStats[member.party] || 0) + 1;
      });
      
      console.log('\n📈 정당별 의원 수:');
      Object.entries(partyStats)
        .sort(([,a], [,b]) => b - a)
        .forEach(([party, count]) => {
          console.log(`- ${party}: ${count}명`);
        });
      
    } else {
      console.error('❌ 업데이트 실패:', result);
    }
    
  } catch (error) {
    console.error('❌ 처리 중 오류 발생:', error);
  }
}

processAssemblyJson();