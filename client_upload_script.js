// 브라우저 콘솔에서 실행할 설문 업로드 스크립트
console.log('🚀 폴리 설문지 업로드 시작...');

// 설문 데이터
const surveys = [
  {
    survey: {
      title: "50만원 소비 우선순위 설문조사",
      description: "만약 50만원이 생긴다면, 어느 분야에 가장 우선적으로 투자하고 싶으신가요? 여러분의 소비 패턴과 우선순위를 조사합니다.",
      category: "life",
      rewardType: "experience",
      rewardAmount: 15,
      votingDurationMinutes: 4320,
      isAnonymous: false
    },
    questions: [
      {
        question: "50만원이 생긴다면 가장 우선적으로 어느 분야에 투자하고 싶으신가요?",
        type: "dropdown",
        options: ["여행·휴식", "식료품·생활용품", "전자기기·디지털", "의료·건강관리", "교육·자기계발", "문화·여가"],
        isRequired: true
      },
      {
        question: "여행·휴식 분야라면 구체적으로 무엇에 투자하시겠습니까?",
        type: "dropdown",
        options: ["국내 여행 (숙박 포함)", "해외 항공권 예약", "호캉스 or 리조트 이용", "온천·스파 이용", "기차·고속버스 교통비"],
        isRequired: false
      },
      {
        question: "식료품·생활용품 분야라면 구체적으로 무엇에 투자하시겠습니까?",
        type: "dropdown",
        options: ["대형마트 장보기 (식자재)", "온라인 식품 정기배송", "유기농/프리미엄 식재료 구입", "화장지·세제 등 생필품 구입", "반찬/밀키트 구독 서비스"],
        isRequired: false
      },
      {
        question: "전자기기·디지털 분야라면 구체적으로 무엇에 투자하시겠습니까?",
        type: "dropdown",
        options: ["스마트폰 or 태블릿 구입", "무선 이어폰 or 헤드셋", "노트북 or 주변기기 (마우스 등)", "게임기 or 키보드/마우스 세트", "스마트워치 or 웨어러블 기기"],
        isRequired: false
      }
    ]
  },
  {
    survey: {
      title: "2025년 라이프스타일 트렌드 조사",
      description: "올해 가장 관심있는 라이프스타일 영역과 소비 패턴을 조사합니다.",
      category: "fun",
      rewardType: "experience",
      rewardAmount: 20,
      votingDurationMinutes: 4320,
      isAnonymous: false
    },
    questions: [
      {
        question: "2025년 가장 집중하고 싶은 라이프스타일 영역은 무엇입니까? (복수선택 가능)",
        type: "multiple_choice",
        options: ["건강한 식습관과 운동", "여행과 새로운 경험", "디지털 기기 활용 및 효율성", "문화생활과 취미활동", "자기계발과 학습", "인간관계와 소통"],
        isRequired: true
      },
      {
        question: "올해 가장 중요하게 생각하는 소비 가치는 무엇입니까?",
        type: "single_choice",
        options: ["가성비 - 합리적인 가격의 제품", "품질 - 비싸더라도 좋은 제품", "편의성 - 시간과 노력을 절약하는 제품", "친환경 - 지속가능한 제품", "트렌드 - 최신 유행하는 제품"],
        isRequired: true
      },
      {
        question: "다음 중 올해 새롭게 시도해보고 싶은 활동을 순위별로 선택해주세요.",
        type: "ranking",
        options: ["새로운 운동이나 피트니스", "요리나 베이킹 클래스", "외국어 학습", "여행 계획 및 실행", "창작활동 (그림, 음악 등)"],
        isRequired: true
      },
      {
        question: "2025년 라이프스타일 목표에 대해 자유롭게 적어주세요.",
        type: "text",
        isRequired: false
      }
    ]
  },
  {
    survey: {
      title: "현대인의 스트레스와 대처방안 조사",
      description: "현대 사회에서 느끼는 스트레스 요인과 해소 방법에 대한 익명 조사입니다.",
      category: "deep",
      rewardType: "experience",
      rewardAmount: 25,
      votingDurationMinutes: 7200,
      isAnonymous: true
    },
    questions: [
      {
        question: "현재 가장 큰 스트레스 요인은 무엇입니까?",
        type: "single_choice",
        options: ["업무/학업 압박", "경제적 부담", "인간관계 갈등", "건강 문제", "미래에 대한 불안", "사회적 기대와 압박"],
        isRequired: true
      },
      {
        question: "스트레스 해소를 위해 주로 사용하는 방법은? (복수선택 가능)",
        type: "multiple_choice",
        options: ["운동이나 신체활동", "음악감상이나 영화시청", "친구/가족과의 대화", "혼자만의 시간 갖기", "여행이나 나들이", "취미활동 몰입", "전문가 상담", "술이나 음식으로 해소"],
        isRequired: true
      },
      {
        question: "스트레스 관리에 도움이 될 것 같은 사회적 지원을 순위별로 선택해주세요.",
        type: "ranking",
        options: ["근무시간 단축 및 휴식권 보장", "정신건강 상담 서비스 확대", "경제적 부담 완화 정책", "여가 시설 및 프로그램 확충", "사회적 인식 개선 캠페인"],
        isRequired: true
      },
      {
        question: "스트레스와 관련해 하고 싶은 말이나 제안사항이 있다면 자유롭게 적어주세요.",
        type: "text",
        isRequired: false
      }
    ]
  }
];

// 업로드 함수
async function uploadSurvey(surveyData, index) {
  try {
    console.log(`📝 설문 ${index + 1} 업로드 중: ${surveyData.survey.title}`);
    console.log('Adding JWT token to Authorization header for Simple Auth API');
    
    const token = document.cookie.split('polli_token=')[1]?.split(';')[0] || '';
    
    const response = await fetch('/api/simple-auth/surveys', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(surveyData)
    });
    
    const result = await response.json();
    if (response.ok) {
      console.log(`✅ 설문 ${index + 1} 업로드 성공:`, result.survey.title);
      return result;
    } else {
      console.error(`❌ 설문 ${index + 1} 업로드 실패:`, result);
      return null;
    }
  } catch (error) {
    console.error(`❌ 설문 ${index + 1} 업로드 오류:`, error);
    return null;
  }
}

// 모든 설문 업로드
async function uploadAllSurveys() {
  const results = [];
  
  for (let i = 0; i < surveys.length; i++) {
    const result = await uploadSurvey(surveys[i], i);
    results.push(result);
    
    // 서버 부하 방지를 위한 지연
    if (i < surveys.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }
  
  const successCount = results.filter(r => r !== null).length;
  console.log(`🎉 설문 업로드 완료! ${successCount}/${surveys.length}개 성공`);
  
  return results;
}

// 실행
uploadAllSurveys();