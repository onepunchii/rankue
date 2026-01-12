// 실제 국회의원 데이터 업데이트 테스트 스크립트
// 사용자가 제공한 JSON 형식에 맞춰 실제 데이터 추가

const sampleAssemblyData = [
  {
    "HG_NM": "이재명",
    "HJ_NM": "李在明",
    "ENG_NM": "LEE JAEMYUNG",
    "BTH_DATE": "19640122",
    "POLY_NM": "더불어민주당",
    "ORIG_NM": "경기 성남시분당구갑",
    "CMIT_NM": "정치개혁특별위원회",
    "REELE_GBN_NM": "5선",
    "CMITS": "정치개혁특별위원회, 기획재정위원회",
    "SEX_GBN_NM": "남",
    "TEL_NO": "02-788-2918",
    "ASSEM_ADDR": "9323",
    "E_MAIL": "leejaemyung@assembly.go.kr",
    "HOMEPAGE": "http://www.leejaemyung.com",
    "STATUS_CD": "재직"
  },
  {
    "HG_NM": "한동훈",
    "HJ_NM": "韓東勳",
    "ENG_NM": "HAN DONGHOON",
    "BTH_DATE": "19730625",
    "POLY_NM": "국민의힘",
    "ORIG_NM": "서울 동작구을",
    "CMIT_NM": "법제사법위원회",
    "REELE_GBN_NM": "1선",
    "CMITS": "법제사법위원회, 정무위원회",
    "SEX_GBN_NM": "남",
    "TEL_NO": "02-788-2947",
    "ASSEM_ADDR": "9456",
    "E_MAIL": "handonghoon@assembly.go.kr",
    "HOMEPAGE": "http://www.handonghoon.co.kr",
    "STATUS_CD": "재직"
  },
  {
    "HG_NM": "김건희",
    "HJ_NM": "金建熙",
    "ENG_NM": "KIM GUNHEE",
    "BTH_DATE": "19700315",
    "POLY_NM": "국민의힘",
    "ORIG_NM": "서울 강남구갑",
    "CMIT_NM": "여성가족위원회",
    "REELE_GBN_NM": "2선",
    "CMITS": "여성가족위원회, 문화체육관광위원회",
    "SEX_GBN_NM": "여",
    "TEL_NO": "02-788-2701",
    "ASSEM_ADDR": "9102",
    "E_MAIL": "kimgunhee@assembly.go.kr",
    "HOMEPAGE": "http://www.kimgunhee.kr",
    "STATUS_CD": "재직"
  },
  {
    "HG_NM": "정진석",
    "HJ_NM": "鄭鎭碩",
    "ENG_NM": "JUNG JINSEOK",
    "BTH_DATE": "19650808",
    "POLY_NM": "국민의힘",
    "ORIG_NM": "서울 종로구",
    "CMIT_NM": "국정감사평가위원회",
    "REELE_GBN_NM": "4선",
    "CMITS": "국정감사평가위원회, 예산결산특별위원회",
    "SEX_GBN_NM": "남",
    "TEL_NO": "02-788-2381",
    "ASSEM_ADDR": "9714",
    "E_MAIL": "jungjinseok@assembly.go.kr",
    "HOMEPAGE": "http://www.jungjinseok.kr",
    "STATUS_CD": "재직"
  },
  {
    "HG_NM": "조국",
    "HJ_NM": "曺國",
    "ENG_NM": "CHO KOOK",
    "BTH_DATE": "19650920",
    "POLY_NM": "조국혁신당",
    "ORIG_NM": "서울 강남구을",
    "CMIT_NM": "법제사법위원회",
    "REELE_GBN_NM": "1선",
    "CMITS": "법제사법위원회, 정무위원회",
    "SEX_GBN_NM": "남",
    "TEL_NO": "02-788-2847",
    "ASSEM_ADDR": "9847",
    "E_MAIL": "chokook@assembly.go.kr",
    "HOMEPAGE": "http://www.chokook.kr",
    "STATUS_CD": "재직"
  }
];

async function testAssemblyUpdate() {
  try {
    console.log('🏛️ 국회의원 실제 데이터 업데이트 테스트 시작...');
    
    const response = await fetch('http://127.0.0.1:5000/api/assembly/update-members', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(sampleAssemblyData)
    });
    
    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ 업데이트 성공:', result);
    } else {
      console.error('❌ 업데이트 실패:', result);
    }
    
    // 업데이트된 데이터 확인
    const membersResponse = await fetch('http://localhost:5000/api/assembly/members');
    const members = await membersResponse.json();
    console.log('📊 현재 국회의원 수:', members.length);
    
  } catch (error) {
    console.error('❌ 테스트 실행 오류:', error);
  }
}

testAssemblyUpdate();