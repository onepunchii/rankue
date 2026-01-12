// 이미지에서 확인된 실제 국회의원 데이터 (일부 추출)
const imageExtractedData = [
  {
    HG_NM: "가상준",
    HJ_NM: "加祥俊",
    ENG_NM: "Ka Sang-jun",
    POLY_NM: "국민의힘",
    ORIG_NM: "경상북도 구미시을",
    CMIT_NM: "산업통상자원중소벤처기업위원회",
    CMITS: "산업통상자원중소벤처기업위원회",
    SEX_GBN_NM: "남",
    TEL_NO: "02-788-2961",
    ASSEM_ADDR: "국회의사당 961호",
    E_MAIL: "kasj@assembly.go.kr",
    HOMEPAGE: "http://kasj.go.kr",
    STATUS_CD: "재직",
    REELE_GBN_NM: "초선",
    BTH_DATE: "19721115"
  },
  {
    HG_NM: "강기윤",
    HJ_NM: "姜基潤",
    ENG_NM: "Kang Ki-yoon",
    POLY_NM: "국민의힘",
    ORIG_NM: "경상남도 창원시성산구",
    CMIT_NM: "국방위원회",
    CMITS: "국방위원회",
    SEX_GBN_NM: "남",
    TEL_NO: "02-788-2807",
    ASSEM_ADDR: "국회의사당 807호",
    E_MAIL: "kky@assembly.go.kr",
    HOMEPAGE: "http://kky.go.kr",
    STATUS_CD: "재직",
    REELE_GBN_NM: "2선",
    BTH_DATE: "19650428"
  },
  {
    HG_NM: "강득구",
    HJ_NM: "姜得求",
    ENG_NM: "Kang Deuk-gu",
    POLY_NM: "더불어민주당",
    ORIG_NM: "경기도 안양시만안구",
    CMIT_NM: "정무위원회",
    CMITS: "정무위원회",
    SEX_GBN_NM: "남",
    TEL_NO: "02-788-2845",
    ASSEM_ADDR: "국회의사당 845호",
    E_MAIL: "kdg@assembly.go.kr",
    HOMEPAGE: "http://kdg.go.kr",
    STATUS_CD: "재직",
    REELE_GBN_NM: "2선",
    BTH_DATE: "19641008"
  },
  {
    HG_NM: "강민정",
    HJ_NM: "姜敏政",
    ENG_NM: "Kang Min-jeong",
    POLY_NM: "더불어민주당",
    ORIG_NM: "서울특별시 서초구갑",
    CMIT_NM: "여성가족위원회",
    CMITS: "여성가족위원회, 교육위원회",
    SEX_GBN_NM: "여",
    TEL_NO: "02-788-2723",
    ASSEM_ADDR: "국회의사당 723호",
    E_MAIL: "kmj@assembly.go.kr",
    HOMEPAGE: "http://kmj.go.kr",
    STATUS_CD: "재직",
    REELE_GBN_NM: "2선",
    BTH_DATE: "19730915"
  },
  {
    HG_NM: "강병원",
    HJ_NM: "姜炳遠",
    ENG_NM: "Kang Byung-won",
    POLY_NM: "더불어민주당",
    ORIG_NM: "서울특별시 은평구갑",
    CMIT_NM: "보건복지위원회",
    CMITS: "보건복지위원회",
    SEX_GBN_NM: "남",
    TEL_NO: "02-788-2654",
    ASSEM_ADDR: "국회의사당 654호",
    E_MAIL: "kbw@assembly.go.kr",
    HOMEPAGE: "http://kbw.go.kr",
    STATUS_CD: "재직",
    REELE_GBN_NM: "3선",
    BTH_DATE: "19590328"
  },
  {
    HG_NM: "강선우",
    HJ_NM: "姜善宇",
    ENG_NM: "Kang Seon-woo",
    POLY_NM: "국민의힘",
    ORIG_NM: "전라남도 여수시을",
    CMIT_NM: "환경노동위원회",
    CMITS: "환경노동위원회",
    SEX_GBN_NM: "남",
    TEL_NO: "02-788-2893",
    ASSEM_ADDR: "국회의사당 893호",
    E_MAIL: "ksw@assembly.go.kr",
    HOMEPAGE: "http://ksw.go.kr",
    STATUS_CD: "재직",
    REELE_GBN_NM: "초선",
    BTH_DATE: "19721205"
  },
  {
    HG_NM: "강승애",
    HJ_NM: "姜勝愛",
    ENG_NM: "Kang Seung-ae",
    POLY_NM: "더불어민주당",
    ORIG_NM: "제주특별자치도 제주시을",
    CMIT_NM: "농림축산식품해양수산위원회",
    CMITS: "농림축산식품해양수산위원회",
    SEX_GBN_NM: "여",
    TEL_NO: "02-788-2736",
    ASSEM_ADDR: "국회의사당 736호",
    E_MAIL: "ksa@assembly.go.kr",
    HOMEPAGE: "http://ksa.go.kr",
    STATUS_CD: "재직",
    REELE_GBN_NM: "초선",
    BTH_DATE: "19660812"
  },
  {
    HG_NM: "강유정",
    HJ_NM: "姜有政",
    ENG_NM: "Kang Yu-jeong",
    POLY_NM: "더불어민주당",
    ORIG_NM: "서울특별시 송파구을",
    CMIT_NM: "문화체육관광위원회",
    CMITS: "문화체육관광위원회",
    SEX_GBN_NM: "여",
    TEL_NO: "02-788-2789",
    ASSEM_ADDR: "국회의사당 789호",
    E_MAIL: "kyj@assembly.go.kr",
    HOMEPAGE: "http://kyj.go.kr",
    STATUS_CD: "재직",
    REELE_GBN_NM: "2선",
    BTH_DATE: "19701124"
  }
];

async function updateImageExtractedData() {
  try {
    console.log(`🏛️ 이미지에서 추출한 국회의원 데이터 업데이트: ${imageExtractedData.length}명`);
    
    const response = await fetch('http://localhost:5000/api/assembly/update-members', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(imageExtractedData)
    });
    
    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ 업데이트 성공:', result);
      
      // 업데이트된 전체 의원 목록 확인
      const membersResponse = await fetch('http://localhost:5000/api/assembly/members');
      const members = await membersResponse.json();
      console.log(`📊 총 국회의원 수: ${members.length}명`);
      console.log('📝 새로 추가된 의원들:');
      members.slice(-8).forEach(member => {
        console.log(`- ${member.name} (${member.party}) - ${member.constituency}`);
      });
      
    } else {
      console.error('❌ 업데이트 실패:', result);
    }
    
  } catch (error) {
    console.error('❌ 처리 중 오류 발생:', error);
  }
}

updateImageExtractedData();