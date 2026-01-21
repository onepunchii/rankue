export type CategoryType = 'HEALTH' | 'LIFESTYLE' | 'WORK' | 'DIGITAL' | 'MIND';
export type StatType = 'stamina' | 'wisdom' | 'tech' | 'social' | 'money' | 'health' | 'physique' | 'patience';

export interface StatLevel {
    min: number;          // 최소 충족 값 (이 값 이상이면 해당 티어)
    tier: string;         // 티어 이름 (예: 카페인 폭주기관차)
    desc: string;         // 설명 멘트
    country: string;      // 비교 국가 텍스트
}

export interface GlobalStatItem {
    id: string;
    category: CategoryType;
    stat_type: StatType;  // 육각형 그래프용 스탯 종류
    title: string;        // 표시 제목
    question: string;     // 사용자에게 던질 질문
    unit: string;         // 단위 (잔, 시간, cm 등)
    levels: StatLevel[];  // 레벨 정보 (내림차순 정렬됨)
}
