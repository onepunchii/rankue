import { db } from './db';
import { surveys } from '../shared/schema.js';
import { isNotNull, and, isNull, or, eq } from 'drizzle-orm';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function generateAIAnalysisForSurvey(survey: any) {
  try {
    console.log(`🤖 "${survey.title}" 설문에 대한 AI 분석 생성 중...`);

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `당신은 한국의 정책 및 뉴스 전문가입니다. 주어진 설문 정보를 바탕으로 구조화된 인사이트를 제공하세요.

다음 형식의 JSON으로 응답해주세요:
{
  "summary": "설문 주제의 핵심 내용과 배경을 2-3문장으로 요약 (200자 이내)",
  "pros": ["장점1", "장점2", "장점3"],
  "cons": ["단점1", "단점2", "단점3"],
  "oneLiner": "설문 주제를 한 문장으로 요약 (100자 이내)",
  "keywords": ["키워드1", "키워드2", "키워드3", "키워드4", "키워드5"]
}

중립적이고 객관적인 관점에서 분석하며, 장점과 단점을 균형있게 제시하세요.`
        },
        {
          role: "user",
          content: `설문 정보:
제목: ${survey.title}
설명: ${survey.description || ''}
뉴스 출처: ${survey.newsSourceUrl}`
        }
      ],
      response_format: { type: "json_object" },
      max_tokens: 1000,
      temperature: 0.7
    });

    const analysisData = JSON.parse(response.choices[0].message.content || '{}');

    console.log(`✅ "${survey.title}" AI 분석 생성 완료`);

    return {
      summary: analysisData.summary || '',
      pros: analysisData.pros || [],
      cons: analysisData.cons || [],
      oneLiner: analysisData.oneLiner || '',
      keywords: analysisData.keywords || []
    };
  } catch (error) {
    console.error(`❌ "${survey.title}" AI 분석 생성 실패:`, error);
    return null;
  }
}

async function addAIAnalysisToExistingSurveys() {
  try {
    console.log('🚀 기존 설문에 AI 분석 추가 배치 작업 시작...');

    // newsSourceUrl이 있지만 AI 분석이 없는 설문들 조회
    const surveysWithoutAnalysis = await db
      .select()
      .from(surveys)
      .where(
        and(
          isNotNull(surveys.newsSourceUrl),
          or(
            isNull(surveys.aiAnalysisSummary),
            isNull(surveys.aiAnalysisPros),
            isNull(surveys.aiAnalysisCons)
          )
        )
      )
      .limit(25);  // 한 번에 최대 25개까지만 처리

    console.log(`📊 AI 분석이 필요한 설문: ${surveysWithoutAnalysis.length}개`);

    if (surveysWithoutAnalysis.length === 0) {
      console.log('✅ 모든 설문에 AI 분석이 이미 포함되어 있습니다.');
      return;
    }

    let successCount = 0;
    let failCount = 0;

    for (const survey of surveysWithoutAnalysis) {
      try {
        // AI 분석 생성
        const aiAnalysis = await generateAIAnalysisForSurvey(survey);

        if (!aiAnalysis) {
          failCount++;
          continue;
        }

        // 데이터베이스 업데이트
        await db
          .update(surveys)
          .set({
            aiAnalysisSummary: aiAnalysis.summary,
            aiAnalysisPros: aiAnalysis.pros,
            aiAnalysisCons: aiAnalysis.cons,
            aiAnalysisOneLiner: aiAnalysis.oneLiner,
            aiAnalysisKeywords: aiAnalysis.keywords
          })
          .where(eq(surveys.id, survey.id));

        console.log(`✅ 설문 ${survey.id} "${survey.title}" AI 분석 업데이트 완료`);
        successCount++;

        // API 요청 간 딜레이 (Rate limit 방지)
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`❌ 설문 ${survey.id} 처리 실패:`, error);
        failCount++;
      }
    }

    console.log(`\n📊 배치 작업 완료 요약:`);
    console.log(`   ✅ 성공: ${successCount}개`);
    console.log(`   ❌ 실패: ${failCount}개`);
    console.log(`   📝 총 처리: ${successCount + failCount}개`);

  } catch (error) {
    console.error('❌ 배치 작업 실행 중 오류:', error);
    throw error;
  }
}

// 직접 실행
console.log('🎬 스크립트를 직접 실행합니다...');
addAIAnalysisToExistingSurveys()
  .then(() => {
    console.log('✅ 스크립트 실행 완료');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ 스크립트 실행 실패:', error);
    process.exit(1);
  });

export { addAIAnalysisToExistingSurveys };
