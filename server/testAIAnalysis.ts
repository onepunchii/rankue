import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function testAIAnalysis() {
  try {
    console.log('🧪 AI 분석 생성 테스트 시작...');
    console.log('🔑 OpenAI API Key:', process.env.OPENAI_API_KEY ? '설정됨' : '설정되지 않음');
    
    const testBill = {
      billName: '국민건강보험법 일부개정법률안',
      proposer: '홍길동',
      summary: '국민건강보험료 경감 혜택 확대를 위한 법률안입니다.'
    };

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `당신은 한국의 정책 전문가입니다. 주어진 법률안을 분석하여 구조화된 인사이트를 제공하세요.

다음 형식의 JSON으로 응답해주세요:
{
  "summary": "법률안의 핵심 내용을 2-3문장으로 요약 (200자 이내)",
  "pros": ["장점1", "장점2", "장점3"],
  "cons": ["단점1", "단점2", "단점3"],
  "oneLiner": "법률안을 한 문장으로 요약 (100자 이내)",
  "keywords": ["키워드1", "키워드2", "키워드3", "키워드4", "키워드5"]
}

중립적이고 객관적인 관점에서 분석하며, 장점과 단점을 균형있게 제시하세요.`
        },
        {
          role: "user",
          content: `법률안명: ${testBill.billName}
발의자: ${testBill.proposer}
요약: ${testBill.summary}`
        }
      ],
      response_format: { type: "json_object" },
      max_tokens: 1000,
      temperature: 0.7
    });

    console.log('\n✅ AI 응답 수신 성공!');
    console.log('\n📊 생성된 분석:');
    console.log(JSON.stringify(JSON.parse(response.choices[0].message.content || '{}'), null, 2));
    
  } catch (error: any) {
    console.error('\n❌ AI 분석 생성 실패:');
    console.error('에러 메시지:', error.message);
    console.error('에러 상세:', error);
  }
}

testAIAnalysis();
