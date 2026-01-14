import OpenAI from "openai";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
// Lazy initialization to prevent crash on startup if key is missing
let openaiInstance: OpenAI | null = null;
function getOpenAI() {
  if (!openaiInstance) {
    const apiKey = process.env.OPENAI_API_KEY || "dummy-key-to-prevent-crash";
    openaiInstance = new OpenAI({ apiKey });
  }
  return openaiInstance;
}

interface GeneratedSurvey {
  title: string;
  description: string;
  category: 'fun' | 'life' | 'deep';
  analysis: {
    summary: string;
    pros: string[];
    cons: string[];
    oneLiner: string;
    keywords: string[];
  };
  questions: {
    question: string;
    type: 'single_choice' | 'multiple_choice';
    options: string[];
  }[];
}

export async function generateSurveyFromNews(newsTitle: string, newsDescription?: string): Promise<GeneratedSurvey> {
  try {
    const prompt = `다음 뉴스 기사를 분석하여 사용자들이 사안을 입체적으로 이해하고 투표할 수 있도록 돕는 심층 분석과 설문조사를 만들어주세요.

뉴스 제목: ${newsTitle}
${newsDescription ? `뉴스 내용: ${newsDescription}` : ''}

다음 조건을 만족하는 데이터를 JSON 형식으로 생성해주세요:

1. [분석 영역]
   - summary: 기사의 핵심 내용을 3-4문장으로 객관적 요약
   - pros: 이 사안에 대한 찬성 의견이나 긍정적 측면 3가지
   - cons: 이 사안에 대한 반대 의견이나 우려되는 측면 3가지
   - oneLiner: 사안의 본질을 꿰뚫는 날카로운 통찰이 담긴 한 줄 평
   - keywords: 관련 핵심 키워드 3-5개

2. [설문 영역]
   - title: 뉴스와 관련되면서도 참여를 유도하는 매력적인 제목
   - description: 설문의 취지를 설명하는 짧은 문구
   - category: 'fun' (가벼움/재미), 'life' (일상 밀착), 'deep' (사회적/정치적 이슈) 중 택일
   - questions: 2-3개의 심층 질문. 각 질문은 단순 찬반을 넘어 사용자의 가치관을 묻는 형태.

JSON 형식:
{
  "title": "설문 제목",
  "description": "설문 설명",
  "category": "fun|life|deep",
  "analysis": {
    "summary": "핵심 요약",
    "pros": ["긍정/찬성1", "긍정/찬성2", "긍정/찬성3"],
    "cons": ["부정/반대1", "부정/반대2", "부정/반대3"],
    "oneLiner": "날카로운 한 줄 평",
    "keywords": ["키워드1", "키워드2"]
  },
  "questions": [
    {
      "question": "질문 내용",
      "type": "single_choice",
      "options": ["선택지1", "선택지2", "선택지3"]
    }
  ]
}`;

    const response = await getOpenAI().chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "당신은 중립적이면서도 날카로운 통찰력을 가진 전문 시사 분석가이자 설문 설계자입니다. 사용자들이 복잡한 뉴스의 이면을 이해하고 지성적인 투표를 할 수 있도록 돕는 것이 당신의 미션입니다. 항상 JSON 형식으로 응답하세요."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');

    // Validate the response structure
    if (!result.title || !result.analysis || !result.questions) {
      throw new Error("Invalid AI response structure");
    }

    return result as GeneratedSurvey;
  } catch (error) {
    console.error("Error generating survey from news:", error);

    // Provide fallback survey if AI fails
    return {
      title: `${newsTitle}에 대한 여러분의 생각은?`,
      description: "이 뉴스에 대한 의견을 공유해주세요",
      category: 'life' as const,
      analysis: {
        summary: newsDescription?.substring(0, 200) || "최신 뉴스에 대한 분석입니다.",
        pros: ["새로운 시각 제공", "사회적 관심 환기", "논의의 장 마련"],
        cons: ["정보 부족", "갈등 소지", "해결책 미비"],
        oneLiner: "변화의 시작일까요, 단순한 현상일까요?",
        keywords: ["뉴스", "이슈", "투표"]
      },
      questions: [
        {
          question: "이 뉴스에 대해 어떻게 생각하시나요?",
          type: 'single_choice' as const,
          options: ["매우 긍정적", "긍정적", "보통", "부정적", "매우 부정적"]
        }
      ]
    };
  }
}

interface NationalPersona {
  type: 'national';
  hero_summary: {
    class_icon: string;
    class_name: string;
    level_title: string;
    comment: string;
  };
  stats: {
    power: number;
    intellect: number;
    survival: number;
  };
  history_badges: string[];
  traffic_light: 'Green' | 'Yellow' | 'Red';
}

interface LocalPersona {
  type: 'local';
  summary: {
    title: string;
    comment: string;
    traffic_light: 'Green' | 'Yellow' | 'Red';
  };
  wealth_analysis: {
    tier: string;
    chicken_index: string;
    comparison_text: string;
  };
  rpg_stats: {
    gold: number;
    intellect: number;
    moral: number;
    power: number;
    vitality: number;
    charm: number;
  };
  badges: string[];
  risk_factors: {
    criminal_record: string;
    tax_arrears: string;
  };
}

export type PoliticianPersona = NationalPersona | LocalPersona;

// 정치인 게임 캐릭터 카드 데이터 생성 함수
export async function generatePoliticianPersona(politicianData: any): Promise<PoliticianPersona> {
  const isNational = politicianData.type === 'national' || politicianData.type === 'assembly';

  try {
    const prompt = isNational ? `
# Role
너는 국회의원의 정치적 영향력을 분석하는 '여의도 스카우터' AI다.
입력된 데이터(상임위, 선수, 대수)를 바탕으로 RPG 게임 스타일의 "영웅 카드" 정보를 생성해라.

# Input Mapping
- mainCommittee 또는 committees 컬럼 -> [소속 상임위원회] 데이터임 (예: 기획재정위원회)
- reelectionStatus 컬럼 -> [당선 횟수] 데이터임 (예: 초선, 3선)
- contribution 또는 career2 컬럼 -> [역대 당선 대수] 데이터임 (예: 제21대, 제22대)

# Input Data
${JSON.stringify(politicianData, null, 2)}

# Analysis Logic
1. [레벨 & 칭호 부여 (Leveling)]
   - "초선": Lv.10 "패기의 신입" | "재선": Lv.40 "노련한 경력직"
   - "3선": Lv.70 "중량급 실세" | "4선" 이상: Lv.99 "여의도 만렙"
   - 데이터에 '비례대표'가 포함된다면 "특수부대원" 칭호 추가.

2. [직업 클래스 분류 (Class)]
   - mainCommittee 또는 committees 키워드에 따라 클래스 매칭:
     - 기획/재정/예산 -> "💰 재무관 (The Treasurer)"
     - 국방/정보 -> "🛡️ 가디언 (The Guardian)"
     - 법제사법 -> "⚖️ 심판관 (The Arbiter)"
     - 교육/문화/복지 -> "❤️ 힐러 (The Caretaker)"
     - 국토/산업/농해수 -> "🏗️ 빌더 (The Builder)"
     - 외교/통일 -> "🤝 네고시에이터 (The Negotiator)"
     - 운영/정무 -> "🧠 전략가 (The Strategist)"

3. [스탯 산출 (0~100)]
   - 권력 (Power): 선수가 높을수록 상승 (초선 30 ~ 5선 100)
   - 지력 (Intellect): 전문성이 강한 상임위(법사, 기재, 과방)일 경우 +20
   - 생존력 (Survival): career2(역대 대수)의 갯수가 많을수록 높음

4. [신호등 (traffic_light)]
   - 출석률 90% 이상 & 법안 20건 이상 "Green", 그 외 "Yellow/Red"

# Output Format (JSON)
{
  "type": "national",
  "hero_summary": {
    "class_icon": "직업 이모지",
    "class_name": "직업명",
    "level_title": "칭호",
    "comment": "AI의 해설"
  },
  "stats": {
    "power": 0,
    "intellect": 0,
    "survival": 0
  },
  "history_badges": ["15대", "16대", "...", "22대"],
  "traffic_light": "Green"
}` : `
# Role
너는 기초의원의 현실 데이터를 MZ세대 감성으로 분석하는 '동네 정치 분석가'이다.

# Input Data
${JSON.stringify(politicianData, null, 2)}

# Analysis Logic
1. [기초의원: 현실 체감 데이터 중심]
   - 치킨 지수: (재산신고액(단위:천원) * 1) / 20,000(치킨 1마리 가격).
   - 도덕성(Moral): (100 - (전과 건수 * 20) - (체납액 > 0 ? 20 : 0)).
   - 골드(Gold): 재산 20억 이상이면 100점.
   - 매력(Charm): 재산이 평균(8억)에 가깝고 전과가 없을 때 "친근한 이웃"으로 높게 책정.

# Output Format (JSON)
{
  "type": "local",
  "summary": {
    "title": "닉네임",
    "comment": "AI의 한 줄 평",
    "traffic_light": "Green/Yellow/Red"
  },
  "wealth_analysis": {
    "tier": "등급/포지션 텍스트",
    "chicken_index": "비유 텍스트",
    "comparison_text": "멘트"
  },
  "rpg_stats": {
    "gold": 0, "intellect": 0, "moral": 0, "power": 0, "vitality": 0, "charm": 0
  },
  "badges": ["태그1", "태그2", "태그3"],
  "risk_factors": {
    "criminal_record": "상태 요약",
    "tax_arrears": "정보"
  }
}`;

    const response = await getOpenAI().chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "당신은 위트 있는 정치 데이터 분석가입니다. 항상 유효한 JSON 형식으로만 응답하세요."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.8
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    return result as PoliticianPersona;
  } catch (error) {
    console.error("Error generating politician persona:", error);
    // 폴백 데이터
    if (isNational) {
      return {
        type: 'national',
        hero_summary: {
          class_icon: "👤",
          class_name: "미지의 인물",
          level_title: "분석 중",
          comment: "데이터 분석 중 오류가 발생했습니다."
        },
        stats: { power: 50, intellect: 50, survival: 50 },
        history_badges: [],
        traffic_light: "Yellow"
      };
    } else {
      return {
        type: 'local',
        summary: {
          title: `${politicianData.name} 분석가`,
          comment: "데이터 분석 중 오류가 발생했습니다.",
          traffic_light: "Green"
        },
        wealth_analysis: {
          tier: "알 수 없음",
          chicken_index: "0마리",
          comparison_text: "정보를 불러올 수 없습니다."
        },
        rpg_stats: { gold: 50, intellect: 50, moral: 50, power: 50, vitality: 50, charm: 50 },
        badges: ["#데이터_로딩중"],
        risk_factors: { criminal_record: "정보 없음", tax_arrears: "정보 없음" }
      };
    }
  }
}

export async function generateSurveyTitleFromNews(newsTitle: string): Promise<string> {
  try {
    const prompt = `다음 뉴스 제목을 바탕으로 흥미로운 설문조사 제목을 하나만 생성해주세요.

뉴스 제목: ${newsTitle}

조건:
- 15-25자 정도의 간결한 제목
- 참여하고 싶게 만드는 매력적인 표현
- 뉴스 내용과 관련성 있음
- 한국어로 작성
- 정치적 중립성 유지

설문 제목만 응답해주세요 (JSON 형식 없이):`;

    const response = await getOpenAI().chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 100
    });

    return response.choices[0].message.content?.trim() || `${newsTitle}에 대한 여러분의 생각은?`;
  } catch (error) {
    console.error("Error generating survey title:", error);
    return `${newsTitle}에 대한 여러분의 생각은?`;
  }
}

// Update interface to match the 'Final Spicy Fact Bomber' format
interface PersonalityAnalysis {
  profile: {
    nickname: string;
    description: string;
    main_class: string;
  };
  radar_chart_data: {
    subject: string;
    label: string;
    A: number;
    fullMark: number;
  }[];
  moments_of_truth: {
    category: string;
    question: string;
    choice: string;
    analysis: string;
  }[];
  final_verdict: {
    strongest_stat: string;
    prescription: string;
  };
}

// AI 성향 분석 함수 - 최종 매운맛 (팩트 폭격기 + 오각 그래프 통합) Ver.
export async function analyzeUserPersonality(
  createdSurveys: any[],
  surveyResponses: any[],
  participations: any[]
): Promise<PersonalityAnalysis> {
  try {
    // 데이터 요약 준비
    const surveyData = createdSurveys.map(survey => ({
      title: survey.title,
      description: survey.description,
      category: survey.category || 'unknown'
    }));

    // 참여 데이터를 기반으로 설문 제목 및 카테고리 매핑
    const surveyInfoMap = new Map();
    participations.forEach((p: any) => {
      if (p.survey) {
        surveyInfoMap.set(p.surveyId, {
          title: p.survey.title,
          category: p.survey.category
        });
      }
    });

    const responseData = surveyResponses.map(response => {
      const surveyInfo = surveyInfoMap.get(response.surveyId);
      return {
        title: response.title || surveyInfo?.title || "알 수 없는 설문",
        question: response.question || "질문 내용 없음", // CRITICAL: Pass the question text!
        questionType: response.questionType || 'unknown',
        answer: response.answer,
        category: response.category || surveyInfo?.category || 'unknown'
      };
    });

    // Debug logging to verify data passed to AI
    console.log("Analysis Data Check:", {
      totalSurveys: surveyInfoMap.size,
      firstResponse: responseData[0]
    });

    const participationStats = {
      totalParticipations: participations.length,
      categoryCounts: participations.reduce((acc: any, p: any) => {
        const category = p.survey?.category || 'unknown';
        acc[category] = (acc[category] || 0) + 1;
        return acc;
      }, {}),
      completionRate: participations.length > 0
        ? participations.filter((p: any) => p.completed || p.completedAt).length / participations.length
        : 0
    };

    const prompt = `
당신은 사용자의 데이터를 분석해 뼈를 때리는 **'AI 팩트폭력배'**이자 **'데이터 시각화 전문가'**입니다.
사용자의 활동 내역을 5대 관심사(정치, 경제, 연예, 국제, 스포츠)로 분류하여 분석하고,
이를 **매운맛 텍스트**와 **오각형 레이더 차트 데이터**로 동시에 출력하세요.

## 1. 분석 대상 데이터
- **활동 통계:** ${JSON.stringify(participationStats)}
- **설문 내역:** ${JSON.stringify(surveyData)}
- **투표 선택:** ${JSON.stringify(responseData)}

## 2. 분석 지침 (Tone & Manner)
- **말투:** "해요"체 금지. 시니컬하고 위트 있는 **음슴체**나 **반말** 사용.
- **태도:** 사용자의 '시민 의식'을 포장하지 말고, 그 뒤에 숨은 **'관종력', '탐욕', '홍대병'**을 찾아내 비꼬아주세요.
- **점수 산정:** 활동량과 투표 성향을 근거로 5개 분야의 점수(0~100)를 냉정하게 매기세요.

## 3. 출력 형식 (JSON Only)
반드시 아래 JSON 구조를 유지하세요. 프론트엔드에서 바로 렌더링할 데이터입니다.

{
  "profile": {
    "nickname": "데이터로 본 별명 (예: 여의도 키보드 워리어, 자본주의 괴물)",
    "description": "사용자의 전체적인 성향을 요약하는 3줄 독설",
    "main_class": "RPG 직업명 (예: 전략가, 선동가, 구경꾼)"
  },

  // ★ Recharts 라이브러리에 바로 들어갈 데이터 포맷
  "radar_chart_data": [
    { 
      "subject": "정치", 
      "label": "여의도 훈수력", 
      "A": 0-100, // 정치 관심도 점수
      "fullMark": 100 
    },
    { 
      "subject": "경제", 
      "label": "자본주의 촉", 
      "A": 0-100, // 경제 관심도 점수
      "fullMark": 100 
    },
    { 
      "subject": "연예", 
      "label": "도파민 농도", 
      "A": 0-100, // 연예 관심도 점수
      "fullMark": 100 
    },
    { 
      "subject": "국제", 
      "label": "글로벌 오지랖", 
      "A": 0-100, // 국제 이슈 관심도 점수
      "fullMark": 100 
    },
    { 
      "subject": "스포츠", 
      "label": "방구석 감독직", 
      "A": 0-100, // 스포츠 승부욕 점수
      "fullMark": 100 
    }
  ],

  "moments_of_truth": [
    // 사용자의 성향이 적나라하게 드러난 결정적 투표 3개
    {
      "category": "economy",
      "question": "responseData의 title 필드 값 (절대 예시 문구를 쓰지 말 것)",
      "choice": "사용자의 선택",
      "analysis": "선택에 대한 매운맛 해석 (예: '노동 소득을 우습게 아는 도박꾼 기질이 다분함')"
    }
  ],

  "final_verdict": {
    "strongest_stat": "가장 높은 점수의 라벨 (예: 여의도 훈수력)",
    "prescription": "정신 차리게 만드는 현실적인 조언 한마디"
  }
}
`;

    const response = await getOpenAI().chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "당신은 한국의 팩트폭력 전문 프로파일러 AI입니다. 사용자의 투표 기록을 기반으로 냉소적이고 매운맛 분석을 제공합니다."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      max_tokens: 1500,
    });

    const analysisText = response.choices[0].message.content;
    if (!analysisText) {
      throw new Error("Empty response from OpenAI");
    }

    const analysis = JSON.parse(analysisText);
    return analysis as PersonalityAnalysis;
  } catch (error) {
    console.error("Error analyzing user personality:", error);

    // Fallback Mock Data (Final Spicy Version)
    return {
      profile: {
        nickname: "데이터 미수집 유령",
        description: "아직 아무런 흔적도 남기지 않았음. 존재감이 공기 수준임. 혹시 AI가 무서워서 숨어있는 거임?",
        main_class: "투명인간"
      },
      radar_chart_data: [
        { subject: "정치", label: "여의도 훈수력", A: 10, fullMark: 100 },
        { subject: "경제", label: "자본주의 촉", A: 10, fullMark: 100 },
        { subject: "연예", label: "도파민 농도", A: 10, fullMark: 100 },
        { subject: "국제", label: "글로벌 오지랖", A: 10, fullMark: 100 },
        { subject: "스포츠", label: "방구석 감독직", A: 10, fullMark: 100 }
      ],
      moments_of_truth: [
        {
          category: "general",
          question: "데이터 없음",
          choice: "선택 없음",
          analysis: "투표를 안 하니 분석할 것도 없음. 무임승차 하지 말고 설문 좀 하러 가셈."
        }
      ],
      final_verdict: {
        strongest_stat: "투명인간력",
        prescription: "로그아웃 버튼 누르기 전에 설문 아무거나 하나만이라도 눌러보길 권장함."
      }
    };
  }
}

export interface BrainQuestionGenerated {
  q: string;
  options: string[];
  answer: string;
  explanation: string;
}

export async function generateBrainQuestions(
  category: string,
  level: number,
  count: number
): Promise<BrainQuestionGenerated[]> {
  try {
    // Prompt Engineering per Spec
    // Categories: LOGIC, MATH, VERBAL, ECONOMY, TRIVIA
    // Level: 1-5
    // Format: 4 Options (mostly), Trivia Lv1-2 mixed with O/X (30%)

    // Difficulty Mapping Description
    const difficultyDesc = [
      "초등학생 수준 (Very Easy)",
      "중학생/상식 수준 (Easy)",
      "일반 성인 평균 수준 (Normal)",
      "상위 10% 지능 수준 (Hard)",
      "멘사/전문가 수준 (Very Hard)"
    ][level - 1] || "Normal";

    const prompt = `
대주제: [${category}]
난이도: Level ${level} (${difficultyDesc})
수량: ${count}개

당신은 지능 지수(IQ) 측정을 위한 전문 출제위원입니다.
제시된 주제와 난이도에 맞는 4지선다형(또는 일부 O/X) 문제를 JSON 배열 포맷으로 생성해주세요.

# 출제 가이드라인
1. **${category}** 영역의 본질적 능력을 테스트해야 합니다.
2. **Level ${level}**: ${difficultyDesc} 난이도를 정확히 준수하세요.
   - Level 2는 일반인 평균이므로 너무 어렵거나 너무 쉬우면 안 됩니다.
   - Level 4-5는 확실히 변별력이 있어야 합니다 (함정, 복합 추론 등).
3. **오답(Distractors) 전략**:
   - 찍어서 맞히기 어렵도록, 매력적인 오답을 포함해야 합니다.
   - Math의 경우 단순 계산 실수로 나올 수 있는 값을 오답에 넣으세요.
4. **형식**: 기본 4지선다.
   - 단, 'TRIVIA' 카테고리의 Level 1, 2일 경우에만 30% 확률로 O/X(양자택일) 문제를 섞어주세요.

# JSON Output Format (Array)
[
  {
    "q": "문제 지문 (필요시 상황 설명 포함)",
    "options": ["선택지 A", "선택지 B", "선택지 C", "선택지 D"], (O/X 문제면 ["O", "X"])
    "answer": "정답 텍스트 (옵션 중 하나와 정확히 일치)",
    "explanation": "해설 및 정답 근거 (사용자가 납득할 수 있게)"
  }
]
`;

    const response = await getOpenAI().chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a professional IQ Test creator. Output strict JSON array."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.8
    });

    const content = response.choices[0].message.content;
    const parsed = JSON.parse(content || '{"questions": []}');
    // Sometimes GPT returns { questions: [...] } even if asked for array. Handle both.
    const questions = Array.isArray(parsed) ? parsed : (parsed.questions || parsed.data || []);

    return questions as BrainQuestionGenerated[];

  } catch (error) {
    console.error("Error generating brain questions:", error);
    // Fallback: Empty array or basic mock
    return [];
  }
}