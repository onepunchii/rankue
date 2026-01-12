// 한국어 닉네임 생성기
const ADJECTIVES = [
  // 기존 32개
  '활발한', '친근한', '똑똑한', '재미있는', '용감한', '정직한', '따뜻한', '창의적인',
  '행복한', '멋진', '빛나는', '긍정적인', '열정적인', '상냥한', '유쾌한', '편안한',
  '신나는', '밝은', '귀여운', '매력적인', '훌륭한', '특별한', '소중한', '환상적인',
  '놀라운', '기분좋은', '웃음많은', '희망찬', '든든한', '믿음직한', '순수한', '자유로운',
  
  // 추가 68개 (총 100개로 확장)
  '성실한', '차분한', '신중한', '겸손한', '온화한', '꾸준한', '지혜로운', '배려깊은',
  '신뢰할만한', '끈기있는', '솔직한', '개방적인', '협력적인', '책임감있는', '융통성있는', '독립적인',
  '인내심있는', '낙관적인', '분석적인', '실용적인', '혁신적인', '영감을주는', '역동적인', '유연한',
  '도전적인', '탐구하는', '사려깊은', '균형잡힌', '안정적인', '효율적인', '전략적인', '직관적인',
  '논리적인', '체계적인', '목표지향적인', '결과중심의', '미래지향적인', '현실적인', '이상적인', '완벽주의',
  '세심한', '정확한', '신속한', '민첩한', '강인한', '유능한', '숙련된', '경험많은',
  '박식한', '교양있는', '품격있는', '우아한', '단호한', '결단력있는', '추진력있는', '의지력강한',
  '집중력있는', '통찰력있는', '관찰력좋은', '판단력있는', '감성적인', '이성적인', '균형감각있는', '공감능력좋은',
  '소통능력좋은', '리더십있는', '팔로워십좋은', '협상력있는', '문제해결능력좋은', '적응력좋은', '학습능력좋은', '성장지향적인'
];

const NOUNS = [
  // 기존 32개
  '투표왕', '설문러', '의견대왕', '선택자', '결정자', '투표인', '참여자', '의견충',
  '토론가', '생각꾼', '아이디어러', '창의왕', '지혜자', '통찰가', '분석가', '탐구자',
  '발견자', '모험가', '도전자', '개척자', '혁신가', '리더', '행동가', '실천가',
  '꿈꾸는이', '희망가', '응원단', '서포터', '동반자', '친구', '파트너', '동료',
  
  // 추가 68개 (총 100개로 확장)
  '기여자', '멤버', '협력자', '탐험가', '연구원', '전문가', '컨설턴트', '멘토',
  '가이드', '조력자', '후원자', '챔피언', '크리에이터', '기획자', '디자이너', '사상가',
  '철학자', '개혁가', '어드바이저', '코치', '트레이너', '인플루언서', '커뮤니케이터', '네트워커',
  '커넥터', '브릿지', '빌더', '메이커', '엔지니어', '아키텍트', '플래너', '오거나이저',
  '매니저', '코디네이터', '퍼실리테이터', '모더레이터', '중재자', '조정자', '대표자', '스포크스맨',
  '홍보대사', '에반젤리스트', '옵저버', '리포터', '저널리스트', '스토리텔러', '내레이터', '해설자',
  '해석자', '번역자', '교육자', '강사', '튜터', '멘티', '학습자', '수강생',
  '연수생', '인턴', '프로페셔널', '스페셜리스트', '제너럴리스트', '올라운더', '베테랑', '신입',
  '주니어', '시니어', '엑스퍼트', '구루', '마스터', '아마추어', '초보자', '비기너',
  '러너', '워커', '드리머', '비저너리', '아이디어리스트', '컨셉터', '테스터', '유저'
];

const SPECIAL_COMBOS = [
  '투표의달인', '설문박사', '의견마스터', '선택의왕', '참여천재', '토론의신',
  '아이디어뱅크', '창의폭발', '지혜로운올빼미', '통찰력짱', '분석왕', '탐구정신',
  '발견의기쁨', '모험대장', '도전정신', '개척자혼', '혁신리더', '행동파워',
  '꿈의설계자', '희망메이커', '응원대장', '서포트킹', '동반자친구', '파트너십왕'
];

export function generateRandomNickname(): string {
  // 15% 확률로 특별한 조합 사용
  if (Math.random() < 0.15) {
    const randomSpecial = SPECIAL_COMBOS[Math.floor(Math.random() * SPECIAL_COMBOS.length)];
    return randomSpecial;
  }
  
  // 85% 확률로 형용사 + 명사 조합
  const randomAdjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const randomNoun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  
  return `${randomAdjective} ${randomNoun}`;
}

// 고급 닉네임 생성 - 중복 방지용
export function generateUniqueNickname(existingNicknames?: Set<string>): string {
  let nickname = generateRandomNickname();
  
  // 기존 닉네임과 중복되는 경우 숫자 접미사 추가
  if (existingNicknames && existingNicknames.has(nickname)) {
    // 1~9999까지 숫자 접미사 시도
    for (let i = 1; i <= 9999; i++) {
      const numberedNickname = `${nickname}${i}`;
      if (!existingNicknames.has(numberedNickname)) {
        return numberedNickname;
      }
    }
    
    // 만약 9999까지도 중복이면 타임스탬프 추가
    const timestamp = Date.now().toString().slice(-4);
    nickname = `${nickname}${timestamp}`;
  }
  
  return nickname;
}

export function generateNicknameWithSuffix(baseNickname?: string): string {
  const nickname = baseNickname || generateRandomNickname();
  
  // 숫자 접미사 추가 (15% 확률)
  if (Math.random() < 0.15) {
    const randomNumber = Math.floor(Math.random() * 9999) + 1;
    return `${nickname}${randomNumber}`;
  }
  
  return nickname;
}

// 닉네임 통계 정보
export function getNicknameStats(): {
  totalCombinations: number;
  adjectiveCount: number;
  nounCount: number;
  specialCombos: number;
  estimatedCapacity: number;
} {
  const adjectiveCount = ADJECTIVES.length;
  const nounCount = NOUNS.length;
  const specialCombos = SPECIAL_COMBOS.length;
  const basicCombinations = adjectiveCount * nounCount;
  const totalCombinations = basicCombinations + specialCombos;
  
  // 숫자 접미사(1-9999)를 고려한 예상 수용 인원
  const estimatedCapacity = totalCombinations * 10000; // 각 조합당 최대 10000개 변형
  
  return {
    totalCombinations,
    adjectiveCount,
    nounCount,
    specialCombos,
    estimatedCapacity
  };
}

// 프로필 완료 시 사용할 레벨별 닉네임
export function getLevelBasedNickname(level: number): string {
  const baseNicknames = [
    '신참 투표인',      // Level 1
    '열심히 참여자',    // Level 2-3
    '활발한 의견러',    // Level 4-5
    '투표 마니아',      // Level 6-10
    '설문 전문가',      // Level 11-20
    '의견 리더',        // Level 21-30
    '토론의 달인',      // Level 31-50
    '투표계의 전설'     // Level 51+
  ];
  
  if (level <= 1) return baseNicknames[0];
  if (level <= 3) return baseNicknames[1];
  if (level <= 5) return baseNicknames[2];
  if (level <= 10) return baseNicknames[3];
  if (level <= 20) return baseNicknames[4];
  if (level <= 30) return baseNicknames[5];
  if (level <= 50) return baseNicknames[6];
  return baseNicknames[7];
}