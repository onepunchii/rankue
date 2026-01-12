// XLS 파일을 JSON으로 변환하여 국회의원 데이터 업데이트
const XLSX = require('xlsx');

async function convertXlsToJson() {
  try {
    console.log('📊 XLS 파일 읽기 시작...');
    
    // XLS 파일 읽기
    const workbook = XLSX.readFile('attached_assets/국회의원인적사항_1753895003647.xls');
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // JSON으로 변환
    const jsonData = XLSX.utils.sheet_to_json(worksheet);
    
    console.log(`✅ 변환 완료: ${jsonData.length}명의 국회의원 데이터`);
    console.log('📝 첫 번째 데이터 샘플:');
    console.log(JSON.stringify(jsonData[0], null, 2));
    
    // 데이터 구조 확인
    if (jsonData.length > 0) {
      console.log('\n🔍 데이터 필드 목록:');
      Object.keys(jsonData[0]).forEach(key => {
        console.log(`- ${key}: ${jsonData[0][key]}`);
      });
    }
    
    // 국회의원 데이터 업데이트 API 호출
    console.log('\n🏛️ 국회의원 데이터 업데이트 시작...');
    
    const response = await fetch('http://localhost:5000/api/assembly/update-members', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(jsonData)
    });
    
    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ 업데이트 성공:', result);
      
      // 업데이트된 전체 의원 목록 확인
      const membersResponse = await fetch('http://localhost:5000/api/assembly/members');
      const members = await membersResponse.json();
      console.log(`📊 총 국회의원 수: ${members.length}명`);
      
    } else {
      console.error('❌ 업데이트 실패:', result);
    }
    
  } catch (error) {
    console.error('❌ 처리 중 오류 발생:', error);
  }
}

convertXlsToJson();