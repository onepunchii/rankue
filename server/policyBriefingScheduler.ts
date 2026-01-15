import cron from 'node-cron';
import Parser from 'rss-parser';
import OpenAI from 'openai';
import crypto from 'crypto';

// OpenAI initialization moved to methods to prevent crash on missing key
// const openai = new OpenAI({ ... });

const rssParser = new Parser({
  customFields: {
    item: [
      ['description', 'summary'],
      ['pubDate', 'publishedAt']
    ]
  }
});

interface PolicyBriefingItem {
  id: string;
  title: string;
  summary: string;
  link: string;
  publishedAt: string;
  category: string;
}

interface PolicySurvey {
  title: string;
  description: string;
  question: string;
  options: string[];
  category: string;
  sourceUrl: string;
  aiGenerated: boolean;
  aiAnalysis?: {
    summary: string;
    pros: string[];
    cons: string[];
    oneLiner: string;
    keywords: string[];
  };
}

class PolicyBriefingScheduler {
  private isRunning = false;
  private lastProcessedItems: Set<string> = new Set();

  constructor() {
    this.initializeScheduler();
  }

  private initializeScheduler() {
    console.log('📰 정책브리핑 자동 설문 생성 시스템 초기화');

    // 하루 3회 실행: 09:00, 13:00, 19:00 (KST)
    cron.schedule('0 9,13,19 * * *', async () => {
      if (this.isRunning) {
        console.log('⚠️ 정책브리핑 처리가 이미 진행 중입니다.');
        return;
      }

      console.log('📰 정책브리핑 RSS 피드 처리 시작');
      await this.processPolicyBriefing();
    }, {
      timezone: 'Asia/Seoul'
    });

    console.log('✅ 정책브리핑 스케줄러 등록 완료 (매일 09:00, 13:00, 19:00 실행)');
  }

  async processPolicyBriefing() {
    this.isRunning = true;

    try {
      // 1. RSS 피드에서 최신 정책 뉴스 가져오기
      const policyItems = await this.fetchPolicyFeed();

      // 2. 데이터베이스에서 이미 처리된 뉴스 확인
      const existingSurveys = await this.getExistingSurveysBySource();
      const existingSourceUrls = new Set(existingSurveys.map(s => s.newsSourceUrl).filter(Boolean));

      // 3. 새로운 항목만 필터링 (강화된 중복 제거)
      const newItems = policyItems.filter(item => {
        const isNotProcessed = !this.lastProcessedItems.has(item.id);
        const isNotInDatabase = !existingSourceUrls.has(item.link);
        const hasValidLink = item.link && item.link.trim() !== '';

        if (!isNotProcessed) {
          console.log(`🔄 이미 처리된 기사 스킵: ${item.title}`);
        }
        if (!isNotInDatabase) {
          console.log(`📚 데이터베이스에 이미 존재하는 기사 스킵: ${item.title}`);
        }

        return isNotProcessed && isNotInDatabase && hasValidLink;
      });

      if (newItems.length === 0) {
        console.log('📰 새로운 정책 뉴스가 없습니다.');
        return;
      }

      console.log(`📰 새로운 정책 뉴스 ${newItems.length}개 발견`);
      console.log(`📰 전체 RSS 피드 기사 수: ${policyItems.length}개`);

      // 4. 각 뉴스에 대해 AI 설문 생성 (당일 모든 기사 처리)
      const surveys: PolicySurvey[] = [];

      // 당일 발행된 기사만 필터링
      const todayItems = this.filterTodayArticles(newItems);
      console.log(`📰 당일 발행된 새로운 정책 뉴스 ${todayItems.length}개 처리 시작`);

      if (todayItems.length === 0) {
        console.log('📰 당일 발행된 새로운 정책 뉴스가 없습니다. 모든 새로운 뉴스를 처리합니다.');
        // 당일 기사가 없으면 모든 새로운 기사 처리
        todayItems.push(...newItems);
      }

      for (const item of todayItems) { // 당일 모든 기사 처리
        try {
          const survey = await this.generateSurveyFromPolicy(item);
          if (survey) {
            surveys.push(survey);
            this.lastProcessedItems.add(item.id);
            console.log(`📝 설문 생성 완료: ${survey.title}`);
          }
        } catch (error) {
          console.error(`❌ 정책 설문 생성 실패 (${item.title}):`, error);
        }
      }

      // 5. 생성된 설문을 데이터베이스에 저장
      if (surveys.length > 0) {
        await this.saveSurveysToDatabase(surveys);
        console.log(`✅ ${surveys.length}개의 정책 설문이 자동 생성되었습니다.`);
      }

    } catch (error) {
      console.error('❌ 정책브리핑 처리 중 오류:', error);
    } finally {
      this.isRunning = false;
    }
  }

  private async getExistingSurveysBySource() {
    try {
      const { storage } = await import("./storage");
      const surveys = await storage.getSurveys('politics');

      return surveys.filter((s: any) =>
        s.createdBy === 'system_policy' && s.newsSourceUrl
      );
    } catch (error) {
      console.error('❌ 기존 설문 조회 실패:', error);
      return [];
    }
  }

  private async fetchPolicyFeed(): Promise<PolicyBriefingItem[]> {
    try {
      const feed = await rssParser.parseURL('https://www.korea.kr/rss/policy.xml');

      // RSS 피드의 모든 항목 처리 (slice 제거하여 전체 가져오기)
      return feed.items.map((item) => {
        // URL을 기반으로 고유 ID 생성 (같은 기사는 항상 같은 ID)
        const uniqueId = this.generateUniqueId(item.title || '', item.link || '');

        return {
          id: uniqueId,
          title: item.title || '제목 없음',
          summary: item.summary || item.contentSnippet || '요약 없음',
          link: item.link || '',
          publishedAt: item.publishedAt || item.pubDate || new Date().toISOString(),
          category: 'policy'
        };
      });
    } catch (error) {
      console.error('❌ 정책 RSS 피드 가져오기 실패:', error);
      return [];
    }
  }

  private generateUniqueId(title: string, link: string): string {
    // 제목과 링크를 기반으로 해시 생성 (같은 기사는 항상 같은 ID)
    const hash = crypto.createHash('md5').update(`${title}_${link}`).digest('hex');
    return `policy_${hash.substring(0, 12)}`;
  }

  private filterTodayArticles(items: PolicyBriefingItem[]): PolicyBriefingItem[] {
    // 현재 시각을 기준으로 최근 24시간 이내의 기사만 필터링
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    console.log(`📅 기사 필터링 기준: ${yesterday.toISOString()} ~ ${now.toISOString()}`);

    return items.filter(item => {
      try {
        const articleDate = new Date(item.publishedAt);
        const isRecent = articleDate >= yesterday && articleDate <= now;

        console.log(`📅 기사 날짜 확인: ${item.title} (${item.publishedAt}) - ${isRecent ? '포함' : '제외'}`);

        return isRecent;
      } catch (error) {
        console.error(`❌ 기사 날짜 파싱 실패: ${item.title}`, error);
        // 날짜 파싱 실패 시에도 포함시켜서 누락 방지
        console.log(`📅 날짜 파싱 실패로 포함: ${item.title}`);
        return true;
      }
    });
  }

  private async generateAIAnalysis(policyItem: PolicyBriefingItem): Promise<any> {
    try {
      const apiKey = process.env.OPENAI_API_KEY || "dummy-key-to-prevent-crash";
      const openai = new OpenAI({ apiKey });

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `당신은 한국의 정책 전문가입니다. 주어진 정책 뉴스를 분석하여 구조화된 인사이트를 제공하세요.

다음 형식의 JSON으로 응답해주세요:
{
  "summary": "정책의 핵심 내용과 배경을 2-3문장으로 요약 (200자 이내)",
  "pros": ["장점1", "장점2", "장점3"],
  "cons": ["단점1", "단점2", "단점3"],
  "oneLiner": "정책을 한 문장으로 요약 (100자 이내)",
  "keywords": ["키워드1", "키워드2", "키워드3", "키워드4", "키워드5"]
}

중립적이고 객관적인 관점에서 분석하며, 장점과 단점을 균형있게 제시하세요.`
          },
          {
            role: "user",
            content: `정책 뉴스:
제목: ${policyItem.title}
요약: ${policyItem.summary}
링크: ${policyItem.link}`
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
    } catch (error) {
      console.error('❌ AI 분석 생성 실패:', error);
      return null;
    }
  }

  private async generateSurveyFromPolicy(policyItem: PolicyBriefingItem): Promise<PolicySurvey | null> {
    try {
      // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      const apiKey = process.env.OPENAI_API_KEY || "dummy-key-to-prevent-crash";
      const openai = new OpenAI({ apiKey });

      if (!process.env.OPENAI_API_KEY) {
        console.warn("⚠️ OPENAI_API_KEY is not set. Policy briefing scheduler will not function correctly.");
      }
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `당신은 한국의 정책 전문가입니다. 주어진 정책 뉴스를 바탕으로 국민 여론을 조사할 수 있는 설문을 생성해주세요.

다음 형식의 JSON으로 응답해주세요:
{
  "title": "설문 제목 (50자 이내)",
  "description": "설문 설명 (100자 이내)",
  "question": "핵심 질문 (정책에 대한 국민 의견 조사)",
  "options": ["선택지1", "선택지2", "선택지3", "선택지4", "선택지5"],
  "category": "policy"
}

설문은 중립적이고 균형잡힌 관점에서 작성하며, 다양한 의견을 수렴할 수 있도록 해주세요.`
          },
          {
            role: "user",
            content: `정책 뉴스:
제목: ${policyItem.title}
요약: ${policyItem.summary}
링크: ${policyItem.link}`
          }
        ],
        response_format: { type: "json_object" },
        max_tokens: 800,
        temperature: 0.7
      });

      const surveyData = JSON.parse(response.choices[0].message.content || '{}');

      // AI 분석 생성
      console.log('🤖 AI 기사 분석 생성 중...');
      const aiAnalysis = await this.generateAIAnalysis(policyItem);

      return {
        title: surveyData.title || `"${policyItem.title}"에 대한 국민 의견 조사`,
        description: surveyData.description || '최신 정책에 대한 국민 여론을 조사합니다.',
        question: surveyData.question || `"${policyItem.title}" 정책에 대해 어떻게 생각하십니까?`,
        options: surveyData.options || [
          '매우 찬성한다',
          '찬성한다',
          '보통이다',
          '반대한다',
          '매우 반대한다'
        ],
        category: 'policy',
        sourceUrl: policyItem.link,
        aiGenerated: true,
        aiAnalysis: aiAnalysis
      };

    } catch (error) {
      console.error('❌ AI 설문 생성 실패:', error);
      return null;
    }
  }

  private async saveSurveysToDatabase(surveys: PolicySurvey[]) {
    try {
      const { storage } = await import("./storage");

      for (const survey of surveys) {
        // 설문 데이터 생성
        const surveyData = {
          title: survey.title,
          description: survey.description,
          category: 'politics', // 정책 설문도 정치 카테고리에 포함
          experienceReward: 30,
          isActive: true,
          isAnonymous: false,
          createdBy: 'system_policy',
          participantCount: 0,
          votingStartDate: new Date(),
          votingEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7일간 활성
          votingDurationMinutes: 7 * 24 * 60,
          rewardType: 'experience',
          rewardAmount: 30,
          rewardDescription: '정책 설문 참여 보상',
          sponsorName: null,
          prizePoolTotal: 0,
          winnerCount: 1,
          newsSourceUrl: survey.sourceUrl,
          // AI 분석 데이터 추가
          aiAnalysisSummary: survey.aiAnalysis?.summary || null,
          aiAnalysisPros: survey.aiAnalysis?.pros || null,
          aiAnalysisCons: survey.aiAnalysis?.cons || null,
          aiAnalysisOneLiner: survey.aiAnalysis?.oneLiner || null,
          aiAnalysisKeywords: survey.aiAnalysis?.keywords || null,
          seoTitle: survey.title,
          seoDescription: survey.description,
          seoKeywords: ['정책브리핑', '정부정책', '국민의견', '여론조사'],
          ogImage: null,
          canonicalUrl: null,
          isIndexable: true,
          priority: 7,
          changeFrequency: 'weekly',
        };

        const savedSurvey = await storage.createSurvey(surveyData);

        // 설문 질문 생성
        const questionData = {
          surveyId: savedSurvey.id,
          question: survey.question,
          type: 'single_choice',
          options: survey.options,
          isRequired: true,
          order: 1
        };

        await storage.createSurveyQuestion(questionData);

        console.log(`📝 정책 설문 생성 완료 (AI 분석 포함): ${survey.title}`);
      }
    } catch (error) {
      console.error('❌ 설문 데이터베이스 저장 실패:', error);
    }
  }

  // 수동 실행을 위한 메서드
  async runManually() {
    console.log('🔄 정책브리핑 수동 실행 시작');
    try {
      await this.processPolicyBriefing();
      console.log('✅ 정책브리핑 수동 실행 완료');
    } catch (error) {
      console.error('❌ 정책브리핑 수동 실행 실패:', error);
      throw error;
    }
  }

  // 상태 확인 메서드
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastProcessedCount: this.lastProcessedItems.size,
      nextSchedule: '매일 09:00, 13:00, 19:00 (KST)'
    };
  }
}

export default PolicyBriefingScheduler;