import { db } from './db';
import { surveys, surveyQuestions } from '../shared/schema.js';
import { eq } from 'drizzle-orm';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function generateAIAnalysis() {
  console.log('🤖 AI 분석 생성 중...');

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `다음 형식의 JSON으로 응답해주세요:
{
  "summary": "정책의 핵심 내용 요약 (200자 이내)",
  "pros": ["장점1", "장점2", "장점3"],
  "cons": ["단점1", "단점2", "단점3"],
  "oneLiner": "한 문장 요약 (100자 이내)",
  "keywords": ["키워드1", "키워드2", "키워드3"]
}`
      },
      {
        role: "user",
        content: `정책: 청년 주거 지원 정책 확대`
      }
    ],
    response_format: { type: "json_object" },
    max_tokens: 1000,
    temperature: 0.7
  });

  const analysisData = JSON.parse(response.choices[0].message.content || '{}');
  return {
    summary: analysisData.summary || '',
    pros: analysisData.pros || [],
    cons: analysisData.cons || [],
    oneLiner: analysisData.oneLiner || '',
    keywords: analysisData.keywords || []
  };
}

async function testCreateSurvey() {
  try {
    console.log('🧪 AI 분석 포함 설문 생성 테스트 시작...\n');

    // 1. AI 분석 생성
    const aiAnalysis = await generateAIAnalysis();
    console.log('✅ AI 분석 생성 완료:');
    console.log(JSON.stringify(aiAnalysis, null, 2));
    console.log('');

    // 2. 설문 생성
    console.log('📝 설문 데이터베이스 저장 중...');
    const [createdSurvey] = await db
      .insert(surveys)
      .values({
        title: '[테스트] AI 분석 포함 설문',
        description: '이것은 AI 분석이 포함된 테스트 설문입니다.',
        category: 'politics',
        experienceReward: 30,
        isActive: true,
        isAnonymous: false,
        createdBy: 'system_test',
        votingStartDate: new Date(),
        votingEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        votingDurationMinutes: 7 * 24 * 60,
        rewardType: 'experience',
        rewardAmount: 30,
        // AI 분석 필드
        aiAnalysisSummary: aiAnalysis.summary,
        aiAnalysisPros: aiAnalysis.pros,
        aiAnalysisCons: aiAnalysis.cons,
        aiAnalysisOneLiner: aiAnalysis.oneLiner,
        aiAnalysisKeywords: aiAnalysis.keywords,
        seoTitle: '[테스트] AI 분석 포함 설문',
        seoDescription: 'AI 분석 테스트',
        priority: 5,
        changeFrequency: 'weekly',
        isIndexable: false
      })
      .returning();

    console.log(`✅ 설문 생성 완료 (ID: ${createdSurvey.id})`);
    console.log('');

    // 3. 질문 생성
    console.log('❓ 설문 질문 생성 중...');
    await db.insert(surveyQuestions).values({
      surveyId: createdSurvey.id,
      question: '이 정책에 대해 어떻게 생각하십니까?',
      type: 'single_choice',
      options: ['매우 찬성', '찬성', '중립', '반대', '매우 반대'],
      isRequired: true,
      order: 1
    });

    console.log('✅ 질문 생성 완료');
    console.log('');

    // 4. 생성된 설문 확인
    console.log('🔍 생성된 설문 확인 중...');
    const savedSurvey = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, createdSurvey.id))
      .limit(1);

    if (savedSurvey[0]) {
      console.log('✅ 데이터베이스 확인 완료:');
      console.log(`- ID: ${savedSurvey[0].id}`);
      console.log(`- 제목: ${savedSurvey[0].title}`);
      console.log(`- AI 요약: ${savedSurvey[0].aiAnalysisSummary ? '✓' : '✗'}`);
      console.log(`- AI 장점: ${savedSurvey[0].aiAnalysisPros ? '✓' : '✗'}`);
      console.log(`- AI 단점: ${savedSurvey[0].aiAnalysisCons ? '✓' : '✗'}`);
      console.log(`- AI 한줄: ${savedSurvey[0].aiAnalysisOneLiner ? '✓' : '✗'}`);
      console.log(`- AI 키워드: ${savedSurvey[0].aiAnalysisKeywords ? '✓' : '✗'}`);
    }

    console.log('\n✅ 테스트 성공! AI 분석이 포함된 설문이 정상적으로 생성되었습니다.');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ 테스트 실패:', error);
    process.exit(1);
  }
}

testCreateSurvey();
