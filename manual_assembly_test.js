// 수동 국회의원 데이터 추가 테스트
// 기존 데이터베이스에 새로운 국회의원을 추가합니다.

// axios는 사용하지 않고 fetch를 사용합니다

const newMembers = [
  {
    "HG_NM": "윤석열",
    "HJ_NM": "尹錫悅", 
    "ENG_NM": "YOON SEOK-YEOL",
    "BTH_DATE": "19610118",
    "POLY_NM": "국민의힘",
    "ORIG_NM": "서울특별시 용산구갑",
    "CMIT_NM": "국정감사위원회",
    "REELE_GBN_NM": "1선",
    "CMITS": "국정감사위원회, 법제사법위원회",
    "SEX_GBN_NM": "남",
    "TEL_NO": "02-788-2100",
    "ASSEM_ADDR": "9001호",
    "E_MAIL": "president@assembly.go.kr",
    "HOMEPAGE": "http://www.yoonseokyeol.kr",
    "STATUS_CD": "재직"
  },
  {
    "HG_NM": "이낙연",
    "HJ_NM": "李洛淵", 
    "ENG_NM": "LEE NAK-YON",
    "BTH_DATE": "19521220",
    "POLY_NM": "더불어민주당",
    "ORIG_NM": "전라남도 목포시",
    "CMIT_NM": "운영위원회",
    "REELE_GBN_NM": "5선",
    "CMITS": "운영위원회, 기획재정위원회",
    "SEX_GBN_NM": "남",
    "TEL_NO": "02-788-2400",
    "ASSEM_ADDR": "9402호",
    "E_MAIL": "nakyeon@assembly.go.kr",
    "HOMEPAGE": "http://www.leenakyeon.kr",
    "STATUS_CD": "재직"
  }
];

async function addNewMembers() {
  try {
    console.log('🏛️ 새로운 국회의원 추가 시작...');
    
    const response = await fetch('http://localhost:5000/api/assembly/update-members', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(newMembers)
    });
    
    const result = await response.json();
    console.log('✅ 추가 성공:', result);
    
    // 업데이트된 전체 의원 목록 확인
    const membersResponse = await fetch('http://localhost:5000/api/assembly/members');
    const members = await membersResponse.json();
    console.log('📊 총 국회의원 수:', members.length);
    console.log('📝 최근 추가된 의원들:');
    members.slice(-5).forEach(member => {
      console.log(`- ${member.name} (${member.party})`);
    });
    
  } catch (error) {
    console.error('❌ 오류 발생:', error.message);
    if (error.response) {
      console.error('응답 데이터:', error.response.data);
    }
  }
}

addNewMembers();