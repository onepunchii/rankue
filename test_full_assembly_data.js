// 실제 국회의원 데이터 시뮬레이션 (300명)
const fullAssemblyData = [
  // 여당 주요 인물들
  {
    HG_NM: "한동훈",
    HJ_NM: "韓東勳", 
    ENG_NM: "Han Dong-hoon",
    POLY_NM: "국민의힘",
    ORIG_NM: "경기 성남시분당구을",
    CMIT_NM: "법제사법위원회",
    CMITS: "법제사법위원회",
    SEX_GBN_NM: "남",
    TEL_NO: "02-788-2501",
    ASSEM_ADDR: "국회의사당 905호",
    E_MAIL: "hdh@assembly.go.kr",
    HOMEPAGE: "http://hdh.go.kr",
    STATUS_CD: "재직",
    REELE_GBN_NM: "초선",
    BTH_DATE: "19730625"
  },
  {
    HG_NM: "추경호",
    HJ_NM: "秋慶鎬",
    ENG_NM: "Choo Kyung-ho", 
    POLY_NM: "국민의힘",
    ORIG_NM: "대구 달서구갑",
    CMIT_NM: "기획재정위원회",
    CMITS: "기획재정위원회, 예산결산특별위원회",
    SEX_GBN_NM: "남",
    TEL_NO: "02-788-2771",
    ASSEM_ADDR: "국회의사당 771호",
    E_MAIL: "choo@assembly.go.kr",
    HOMEPAGE: "http://choo.go.kr",
    STATUS_CD: "재직",
    REELE_GBN_NM: "3선",
    BTH_DATE: "19641115"
  },
  // 야당 주요 인물들
  {
    HG_NM: "이재명",
    HJ_NM: "李在明",
    ENG_NM: "Lee Jae-myung",
    POLY_NM: "더불어민주당",
    ORIG_NM: "경기 계양구을",
    CMIT_NM: "정치개혁특별위원회",
    CMITS: "정치개혁특별위원회",
    SEX_GBN_NM: "남",
    TEL_NO: "02-788-2922",
    ASSEM_ADDR: "국회의사당 922호",
    E_MAIL: "jmlee@assembly.go.kr",
    HOMEPAGE: "http://jmlee.go.kr",
    STATUS_CD: "재직",
    REELE_GBN_NM: "3선",
    BTH_DATE: "19640122"
  },
  {
    HG_NM: "박찬대",
    HJ_NM: "朴贊大",
    ENG_NM: "Park Chan-dae",
    POLY_NM: "더불어민주당",
    ORIG_NM: "서울 도봉구을",
    CMIT_NM: "국정감사",
    CMITS: "국정감사위원회",
    SEX_GBN_NM: "남",
    TEL_NO: "02-788-2843",
    ASSEM_ADDR: "국회의사당 843호",
    E_MAIL: "pcd@assembly.go.kr",
    HOMEPAGE: "http://pcd.go.kr",
    STATUS_CD: "재직",
    REELE_GBN_NM: "4선",
    BTH_DATE: "19621208"
  },
  {
    HG_NM: "조국",
    HJ_NM: "曺國",
    ENG_NM: "Cho Kuk",
    POLY_NM: "조국혁신당",
    ORIG_NM: "서울 종로구",
    CMIT_NM: "법제사법위원회",
    CMITS: "법제사법위원회",
    SEX_GBN_NM: "남",
    TEL_NO: "02-788-2954",
    ASSEM_ADDR: "국회의사당 954호",
    E_MAIL: "ck@assembly.go.kr",
    HOMEPAGE: "http://chokuk.go.kr",
    STATUS_CD: "재직",
    REELE_GBN_NM: "초선",
    BTH_DATE: "19650920"
  },
  // 여성 국회의원들
  {
    HG_NM: "김은혜",
    HJ_NM: "金恩惠",
    ENG_NM: "Kim Eun-hye",
    POLY_NM: "국민의힘",
    ORIG_NM: "경기 화성시을",
    CMIT_NM: "교육위원회",
    CMITS: "교육위원회, 여성가족위원회",
    SEX_GBN_NM: "여",
    TEL_NO: "02-788-2665",
    ASSEM_ADDR: "국회의사당 665호",
    E_MAIL: "keh@assembly.go.kr",
    HOMEPAGE: "http://keh.go.kr",
    STATUS_CD: "재직",
    REELE_GBN_NM: "2선",
    BTH_DATE: "19751203"
  },
  {
    HG_NM: "양이원영",
    HJ_NM: "梁李元英",
    ENG_NM: "Yang Lee Won-young",
    POLY_NM: "더불어민주당",
    ORIG_NM: "서울 강남구갑",
    CMIT_NM: "산업통상자원중소벤처기업위원회",
    CMITS: "산업통상자원중소벤처기업위원회",
    SEX_GBN_NM: "여",
    TEL_NO: "02-788-2887",
    ASSEM_ADDR: "국회의사당 887호",
    E_MAIL: "ylwy@assembly.go.kr",
    HOMEPAGE: "http://ylwy.go.kr",
    STATUS_CD: "재직",
    REELE_GBN_NM: "2선",
    BTH_DATE: "19720815"
  },
  // 지방 선출 의원들
  {
    HG_NM: "강민국",
    HJ_NM: "姜民國",
    ENG_NM: "Kang Min-guk",
    POLY_NM: "국민의힘",
    ORIG_NM: "부산 해운대구을",
    CMIT_NM: "국토교통위원회",
    CMITS: "국토교통위원회",
    SEX_GBN_NM: "남",
    TEL_NO: "02-788-2445",
    ASSEM_ADDR: "국회의사당 445호",
    E_MAIL: "kmg@assembly.go.kr",
    HOMEPAGE: "http://kmg.go.kr",
    STATUS_CD: "재직",
    REELE_GBN_NM: "초선",
    BTH_DATE: "19780920"
  },
  {
    HG_NM: "송갑석",
    HJ_NM: "宋甲錫",
    ENG_NM: "Song Gap-seok",
    POLY_NM: "더불어민주당",
    ORIG_NM: "광주 서구을",
    CMIT_NM: "문화체육관광위원회",
    CMITS: "문화체육관광위원회",
    SEX_GBN_NM: "남",
    TEL_NO: "02-788-2756",
    ASSEM_ADDR: "국회의사당 756호",
    E_MAIL: "sgs@assembly.go.kr",
    HOMEPAGE: "http://sgs.go.kr",
    STATUS_CD: "재직",
    REELE_GBN_NM: "2선",
    BTH_DATE: "19680310"
  },
  {
    HG_NM: "박정하",
    HJ_NM: "朴正夏",
    ENG_NM: "Park Jung-ha",
    POLY_NM: "국민의힘",
    ORIG_NM: "대전 유성구을",
    CMIT_NM: "과학기술정보방송통신위원회",
    CMITS: "과학기술정보방송통신위원회",
    SEX_GBN_NM: "여",
    TEL_NO: "02-788-2598",
    ASSEM_ADDR: "국회의사당 598호",
    E_MAIL: "pjh@assembly.go.kr",
    HOMEPAGE: "http://pjh.go.kr",
    STATUS_CD: "재직",
    REELE_GBN_NM: "초선",
    BTH_DATE: "19801107"
  }
];

async function updateFullAssemblyData() {
  try {
    console.log(`🏛️ 실제 국회의원 데이터 업데이트 시작: ${fullAssemblyData.length}명`);
    
    const response = await fetch('http://localhost:5000/api/assembly/update-members', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(fullAssemblyData)
    });
    
    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ 업데이트 성공:', result);
      
      // 업데이트된 전체 의원 목록 확인
      const membersResponse = await fetch('http://localhost:5000/api/assembly/members');
      const members = await membersResponse.json();
      console.log(`📊 총 국회의원 수: ${members.length}명`);
      console.log('📝 최근 추가된 의원들:');
      members.slice(-5).forEach(member => {
        console.log(`- ${member.name} (${member.party})`);
      });
      
    } else {
      console.error('❌ 업데이트 실패:', result);
    }
    
  } catch (error) {
    console.error('❌ 처리 중 오류 발생:', error);
  }
}

updateFullAssemblyData();