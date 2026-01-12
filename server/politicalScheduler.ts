import { db } from './db';
import { surveys, surveyQuestions } from '@shared/schema';
import { eq, and, gte, lte } from 'drizzle-orm';

// 주차 계산 헬퍼
function getWeekNumber(d: Date = new Date()): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// 주간 정치 설문 생성 (고정 3대 지표)
export async function createWeeklyPoliticalSurvey(): Promise<void> {
  try {
    console.log('🗳️ [Scheduler] 주간 정치 설문 생성 프로세스 시작...');

    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    const weekNumber = getWeekNumber(today);

    const title = `${year}년 ${month}월 ${weekNumber}주차 정기 여론조사`;
    const description = "대한민국의 미래를 위한 소중한 한 표! 이번 주 정치 현안(대통령, 정당, 대선후보)에 대한 여러분의 의견을 들려주세요.";

    // 이번 주 월요일, 일요일 계산
    const currentDay = today.getDay(); // 0: Sun, 1: Mon ...
    const diffToMon = currentDay === 0 ? -6 : 1 - currentDay; // Sun(-6), Mon(0), Tue(-1)...

    const monday = new Date(today);
    monday.setDate(today.getDate() + diffToMon);
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    // 중복 체크 (제목으로 확인 - 뉴스 등 다른 정치 설문과 겹치지 않게)
    const existing = await db.select().from(surveys).where(
      eq(surveys.title, title)
    ).limit(1);

    if (existing.length > 0) {
      console.log(`✅ [Scheduler] 이번 주('${title}') 설문이 이미 존재합니다. 생성을 건너뜁니다.`);
      return;
    }

    // 1. 설문 본체 생성
    const [survey] = await db.insert(surveys).values({
      title,
      description,
      category: 'politics',
      isActive: true,
      isAnonymous: true,
      votingEndDate: sunday,
      experienceReward: 50,
      personalPointsReward: 30,
      // AI 분석 데이터 추가 (통일된 형식 유지)
      aiAnalysisSummary: "대한민국 정치 현황을 파악하기 위한 주간 정기 여론조사입니다. 대통령 국정수행 평가, 정당 지지도, 그리고 차기 대선 후보 적합도를 조사하여 민심의 흐름을 분석합니다.",
      aiAnalysisPros: ["객관적인 수치를 통한 민심 파악 가능", "정치권의 정책 방향 설정에 참고 자료 제공", "유권자의 목소리를 직접적으로 반영"],
      aiAnalysisCons: ["표본의 대표성 및 응답 편향 가능성", "단기적인 이슈에 의한 급격한 변동 가능성", "정치적 양극화 심화 우려"],
      aiAnalysisOneLiner: "매주 기록되는 지표는 대한민국 민주주의의 현재를 보여주는 거울입니다.",
      aiAnalysisKeywords: ["지지율", "정당지지도", "대선주자", "민심", "정기조사"]
      // createdBy 필드는 비워둡니다 (시스템 생성)
    }).returning();

    console.log(`📝 설문 생성됨: ID ${survey.id}`);

    // 2. 고정 질문 3가지 추가

    // Q1. 대통령 지지율
    await db.insert(surveyQuestions).values({
      surveyId: survey.id,
      question: "이재명 대통령의 현재 국정수행에 대해 어떻게 평가하십니까?",
      type: "single_choice",
      options: ["매우 잘하고 있다", "잘하는 편이다", "잘못하는 편이다", "매우 잘못하고 있다", "잘 모름"],
      order: 1,
      isRequired: true
    });

    // Q2. 정당 지지도
    await db.insert(surveyQuestions).values({
      surveyId: survey.id,
      question: "현재 어느 정당을 지지하십니까?",
      type: "single_choice",
      options: ["더불어민주당", "국민의힘", "조국혁신당", "개혁신당", "진보당", "기타 정당", "지지 정당 없음"],
      order: 2,
      isRequired: true
    });

    // Q3. 차기 대선 후보 적합도
    await db.insert(surveyQuestions).values({
      surveyId: survey.id,
      question: "차기 대통령으로 누가 가장 적합하다고 생각하십니까?",
      type: "single_choice",
      options: ["이재명", "한동훈", "조국", "오세훈", "홍준표", "김동연", "안철수", "이준석", "기타 인물"],
      order: 3,
      isRequired: true
    });

    console.log(`🎉 [Scheduler] 주간 정치 설문 생성 완료!`);

  } catch (error) {
    console.error("❌ [Scheduler] 주간 정치 설문 생성 실패:", error);
    throw error;
  }
}