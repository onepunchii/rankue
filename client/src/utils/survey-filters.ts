import { Survey } from "@shared/schema";

/**
 * 마감된 설문을 필터링하는 유틸리티 함수
 * @param surveys 설문 배열
 * @returns 아직 마감되지 않은 설문들만 반환
 */
export function filterActiveOnly(surveys: Survey[]): Survey[] {
  const now = new Date().getTime();
  
  return surveys.filter(survey => {
    // 종료일이 없으면 표시 (무제한 설문)
    if (!survey.votingEndDate) return true;
    
    const endDate = new Date(survey.votingEndDate).getTime();
    return endDate > now; // 아직 마감되지 않은 설문만 표시
  });
}

/**
 * 설문이 마감되었는지 확인하는 함수
 * @param survey 확인할 설문
 * @returns 마감 여부
 */
export function isSurveyExpired(survey: Survey): boolean {
  if (!survey.votingEndDate) return false;
  
  const now = new Date().getTime();
  const endDate = new Date(survey.votingEndDate).getTime();
  return endDate <= now;
}

/**
 * 마감된 설문만 필터링하는 유틸리티 함수 (결과 페이지용)
 * @param surveys 설문 배열
 * @returns 마감된 설문들만 반환
 */
export function filterExpiredOnly(surveys: Survey[]): Survey[] {
  const now = new Date().getTime();
  
  return surveys.filter(survey => {
    // 종료일이 없으면 제외 (무제한 설문은 결과 페이지에 표시하지 않음)
    if (!survey.votingEndDate) return false;
    
    const endDate = new Date(survey.votingEndDate).getTime();
    return endDate <= now; // 마감된 설문만 표시
  });
}

/**
 * 설문의 남은 시간을 계산하는 함수
 * @param endDate 설문 종료일
 * @returns 남은 시간 문자열
 */
export function calculateTimeRemaining(endDate: string): string {
  const now = new Date().getTime();
  const end = new Date(endDate).getTime();
  const diff = end - now;

  if (diff <= 0) {
    return "마감";
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) {
    return `${days}일`;
  } else if (hours > 0) {
    return `${hours}시간`;
  } else if (minutes > 0) {
    return `${minutes}분`;
  } else {
    return "1분 미만";
  }
}