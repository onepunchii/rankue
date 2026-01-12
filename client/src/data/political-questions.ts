export interface QuestionOption {
    text: string;
    score: number;
}

export interface PoliticalQuestion {
    id: number;
    category: string;
    axis: 'Economy' | 'Social' | 'Diplomacy' | 'Governance' | 'Participation';
    question: string;
    options: QuestionOption[];
}

export const politicalQuestions: PoliticalQuestion[] = [
    {
        id: 0,
        category: "경제관",
        axis: "Economy",
        question: "부유층에 대한 증세는 정당하다고 보시나요?",
        options: [
            { text: "매우 찬성", score: 2 },
            { text: "어느 정도 찬성", score: 1 },
            { text: "반대", score: -1 },
            { text: "매우 반대", score: -2 }
        ]
    },
    {
        id: 1,
        category: "경제관",
        axis: "Economy",
        question: "최저임금은 어느 방향이 바람직하다고 보시나요?",
        options: [
            { text: "대폭 인상 필요", score: 2 },
            { text: "물가 대비 점진적 인상", score: 1 },
            { text: "동결", score: -1 },
            { text: "오히려 인하 필요", score: -2 }
        ]
    },
    {
        id: 2,
        category: "경제관",
        axis: "Economy",
        question: "부동산 시장에 대한 정부의 개입은 어느 정도가 적절하다고 보시나요?",
        options: [
            { text: "적극적인 개입 필요", score: 2 },
            { text: "일정 부분 개입 필요", score: 1 },
            { text: "시장 자율에 맡겨야 함", score: -1 },
            { text: "정부 개입은 부작용이 크다", score: -2 }
        ]
    },
    {
        id: 3,
        category: "사회관",
        axis: "Social",
        question: "동성결혼의 합법화에 대해 어떻게 생각하시나요?",
        options: [
            { text: "적극 찬성", score: 2 },
            { text: "찬성", score: 1 },
            { text: "반대", score: -1 },
            { text: "적극 반대", score: -2 }
        ]
    },
    {
        id: 4,
        category: "사회관",
        axis: "Social",
        question: "이민자나 외국인 노동자의 국내 유입에 대해 어떻게 생각하시나요?",
        options: [
            { text: "적극 환영", score: 2 },
            { text: "어느 정도는 필요", score: 1 },
            { text: "신중하게 제한", score: -1 },
            { text: "강력히 제한", score: -2 }
        ]
    },
    {
        id: 5,
        category: "사회관",
        axis: "Social",
        question: "낙태는 개인의 선택이어야 한다고 보시나요?",
        options: [
            { text: "전적으로 동의함", score: 2 },
            { text: "어느 정도 동의함", score: 1 },
            { text: "반대함", score: -1 },
            { text: "강하게 반대함", score: -2 }
        ]
    },
    {
        id: 6,
        category: "외교안보",
        axis: "Diplomacy",
        question: "북한과의 대화와 교류는 필요하다고 생각하시나요?",
        options: [
            { text: "매우 그렇다", score: 2 },
            { text: "가능하면 그렇다", score: 1 },
            { text: "잘 모르겠다", score: 0 },
            { text: "불필요하다", score: -2 }
        ]
    },
    {
        id: 7,
        category: "외교안보",
        axis: "Diplomacy",
        question: "한미동맹은 앞으로도 유지되어야 한다고 생각하시나요?",
        options: [
            { text: "강력하게 유지해야 한다", score: -2 },
            { text: "기본적으로 유지하되 자주성 강화", score: -1 },
            { text: "다른 외교 옵션도 검토 필요", score: 1 },
            { text: "약화 혹은 재조정 필요", score: 2 }
        ]
    },
    {
        id: 8,
        category: "외교안보",
        axis: "Diplomacy",
        question: "국방비 증액에 대해 어떻게 생각하시나요?",
        options: [
            { text: "대폭 증액 필요", score: -2 },
            { text: "점진적 증액", score: -1 },
            { text: "현재 수준 유지", score: 0 },
            { text: "사회복지로 예산 전환", score: 2 }
        ]
    },
    {
        id: 9,
        category: "국가관",
        axis: "Governance",
        question: "자유민주주의는 현 시대에 가장 이상적인 체제라고 생각하시나요?",
        options: [
            { text: "매우 동의", score: -1 }, // Assuming Conservative
            { text: "동의", score: 0 },
            { text: "회의적", score: 1 },
            { text: "반대", score: 2 }
        ]
    },
    {
        id: 10,
        category: "국가관",
        axis: "Governance",
        question: "대한민국은 복지 확대가 더 필요하다고 생각하시나요?",
        options: [
            { text: "매우 그렇다", score: 2 },
            { text: "일정 부분 동의", score: 1 },
            { text: "재정 부담 때문에 신중해야", score: -1 },
            { text: "오히려 줄여야 한다", score: -2 }
        ]
    },
    {
        id: 11,
        category: "국가관",
        axis: "Governance",
        question: "정부의 역할은 어디까지여야 한다고 생각하시나요?",
        options: [
            { text: "적극적으로 사회문제 해결", score: 2 },
            { text: "필요한 분야만 개입", score: 1 },
            { text: "최소한의 역할만", score: -1 },
            { text: "민간에 최대한 위임", score: -2 }
        ]
    },
    {
        id: 12,
        category: "정치참여",
        axis: "Participation",
        question: "정치 뉴스나 시사 이슈에 관심이 많으신가요?",
        options: [
            { text: "매우 관심 많음", score: 2 },
            { text: "어느 정도 관심 있음", score: 1 },
            { text: "거의 관심 없음", score: -1 },
            { text: "전혀 관심 없음", score: -2 }
        ]
    },
    {
        id: 13,
        category: "정치참여",
        axis: "Participation",
        question: "선거에 얼마나 자주 참여하시나요?",
        options: [
            { text: "항상 참여한다", score: 2 },
            { text: "중요한 선거에만 참여한다", score: 1 },
            { text: "잘 안 한다", score: -1 },
            { text: "한 번도 한 적 없다", score: -2 }
        ]
    },
    {
        id: 14,
        category: "정치참여",
        axis: "Participation",
        question: "정치인을 평가할 때 가장 중요하게 보는 요소는?",
        options: [
            { text: "정책과 공약", score: 2 },
            { text: "도덕성과 청렴", score: 1 },
            { text: "정치 경험 및 경력", score: -1 },
            { text: "정당 소속", score: -2 }
        ]
    }
];
