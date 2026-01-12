// SEO 유틸리티 함수들 - 자동 slug 생성, 메타데이터 생성 등

/**
 * 한글 제목을 SEO 친화적인 URL slug로 변환
 * 예시: "2025년 골프장 지도 투표" → "2025-golf-map-vote"
 */
export function generateSlug(title: string, maxLength: number = 100): string {
  // 한글을 영어로 변환하는 매핑
  const koreanToEnglish: { [key: string]: string } = {
    // 기본 키워드
    '투표': 'vote',
    '설문': 'survey',
    '조사': 'research',
    '분석': 'analysis',
    '결과': 'result',
    '참여': 'participate',
    '선택': 'choice',
    '의견': 'opinion',
    '평가': 'evaluation',
    '후기': 'review',
    
    // 카테고리
    '재미': 'fun',
    '생활': 'life',
    '심층': 'deep',
    '지역': 'local',
    '비즈니스': 'business',
    '기업': 'enterprise',
    
    // 일반적인 단어들
    '최고': 'best',
    '인기': 'popular',
    '신규': 'new',
    '최신': 'latest',
    '추천': 'recommend',
    '비교': 'compare',
    '선호': 'prefer',
    '트렌드': 'trend',
    '순위': 'ranking',
    '리스트': 'list',
    
    // 숫자
    '첫번째': 'first',
    '두번째': 'second',
    '세번째': 'third',
    '하나': 'one',
    '둘': 'two',
    '셋': 'three',
    
    // 시간
    '오늘': 'today',
    '어제': 'yesterday',
    '내일': 'tomorrow',
    '이번주': 'this-week',
    '다음주': 'next-week',
    '이번달': 'this-month',
    '올해': 'this-year',
    '내년': 'next-year',
    
    // 장소
    '서울': 'seoul',
    '부산': 'busan',
    '대구': 'daegu',
    '인천': 'incheon',
    '광주': 'gwangju',
    '대전': 'daejeon',
    '울산': 'ulsan',
    '세종': 'sejong',
    '경기': 'gyeonggi',
    '강원': 'gangwon',
    '충북': 'chungbuk',
    '충남': 'chungnam',
    '전북': 'jeonbuk',
    '전남': 'jeonnam',
    '경북': 'gyeongbuk',
    '경남': 'gyeongnam',
    '제주': 'jeju',
    
    // 일반 명사
    '음식': 'food',
    '카페': 'cafe',
    '영화': 'movie',
    '음악': 'music',
    '게임': 'game',
    '스포츠': 'sports',
    '여행': 'travel',
    '쇼핑': 'shopping',
    '패션': 'fashion',
    '뷰티': 'beauty',
    '건강': 'health',
    '운동': 'exercise',
    '교육': 'education',
    '직업': 'job',
    '연애': 'dating',
    '결혼': 'marriage',
    '가족': 'family',
    '친구': 'friend',
    '학교': 'school',
    '회사': 'company',
    '정치': 'politics',
    '경제': 'economy',
    '사회': 'society',
    '문화': 'culture',
    '기술': 'tech',
    '인터넷': 'internet',
    '모바일': 'mobile',
    '앱': 'app',
    '웹사이트': 'website',
    '소셜미디어': 'social-media',
    '유튜브': 'youtube',
    '인스타그램': 'instagram',
    '페이스북': 'facebook',
    '카카오톡': 'kakaotalk',
    '네이버': 'naver',
    '구글': 'google',
    
    // 브랜드/기업
    '삼성': 'samsung',
    '엘지': 'lg',
    '현대': 'hyundai',
    '기아': 'kia',
    '스타벅스': 'starbucks',
    '맥도날드': 'mcdonalds',
    '버거킹': 'burgerking',
    '롯데': 'lotte',
    '신세계': 'shinsegae',
    
    // 동사
    '하다': 'do',
    '가다': 'go',
    '오다': 'come',
    '보다': 'see',
    '듣다': 'hear',
    '먹다': 'eat',
    '마시다': 'drink',
    '사다': 'buy',
    '팔다': 'sell',
    '만들다': 'make',
    '찾다': 'find',
    '생각하다': 'think',
    '좋아하다': 'like',
    '싫어하다': 'dislike',
    '원하다': 'want',
    '필요하다': 'need',
    
    // 형용사
    '좋은': 'good',
    '나쁜': 'bad',
    '큰': 'big',
    '작은': 'small',
    '많은': 'many',
    '적은': 'few',
    '높은': 'high',
    '낮은': 'low',
    '빠른': 'fast',
    '느린': 'slow',
    '새로운': 'new',
    '오래된': 'old',
    '쉬운': 'easy',
    '어려운': 'difficult',
    '예쁜': 'pretty',
    '멋진': 'cool',
    '재미있는': 'interesting',
    '지루한': 'boring',
  };

  let slug = title.toLowerCase();
  
  // 한글 단어를 영어로 변환
  Object.entries(koreanToEnglish).forEach(([korean, english]) => {
    slug = slug.replace(new RegExp(korean, 'g'), english);
  });
  
  // 남은 한글을 로마자로 변환 (간단한 변환)
  slug = slug
    .replace(/[ㄱ-ㅎㅏ-ㅣ가-힣]/g, '') // 변환되지 않은 한글 제거
    .replace(/[^a-z0-9\s-]/g, '') // 특수문자 제거
    .trim()
    .replace(/\s+/g, '-') // 공백을 하이픈으로
    .replace(/-+/g, '-') // 연속된 하이픈을 하나로
    .replace(/^-|-$/g, ''); // 시작/끝 하이픈 제거
  
  // 현재 연도 추가 (SEO에 유리)
  const currentYear = new Date().getFullYear();
  if (!slug.includes(currentYear.toString())) {
    slug = `${currentYear}-${slug}`;
  }
  
  // 최대 길이 제한
  if (slug.length > maxLength) {
    slug = slug.substring(0, maxLength).replace(/-[^-]*$/, '');
  }
  
  return slug || 'survey-' + Date.now(); // fallback
}

/**
 * 설문 제목으로부터 SEO 최적화된 메타 제목 생성 (60자 제한)
 */
export function generateSEOTitle(title: string, category?: string): string {
  const categoryMap: { [key: string]: string } = {
    'fun': '재미투표',
    'life': '생활설문',
    'deep': '심층조사',
    'location': '지역투표',
    'business': '기업조사'
  };
  
  let seoTitle = title;
  
  // 카테고리 추가
  if (category && categoryMap[category]) {
    seoTitle = `${title} | ${categoryMap[category]}`;
  }
  
  // Polli 브랜딩 추가
  if (!seoTitle.includes('Polli') && seoTitle.length < 45) {
    seoTitle += ' - Polli';
  }
  
  // 60자 제한
  if (seoTitle.length > 60) {
    seoTitle = seoTitle.substring(0, 57) + '...';
  }
  
  return seoTitle;
}

/**
 * 설문 설명으로부터 SEO 최적화된 메타 설명 생성 (160자 제한)
 */
export function generateSEODescription(description: string, title: string): string {
  let seoDescription = description || `${title}에 대한 설문조사에 참여해보세요.`;
  
  // 필수 키워드 추가
  const keywords = ['설문조사', '투표', '참여', 'Polli'];
  let hasKeyword = false;
  
  keywords.forEach(keyword => {
    if (seoDescription.includes(keyword)) {
      hasKeyword = true;
    }
  });
  
  if (!hasKeyword && seoDescription.length < 140) {
    seoDescription += ' Polli에서 간편하게 참여하고 포인트를 받으세요!';
  }
  
  // 160자 제한
  if (seoDescription.length > 160) {
    seoDescription = seoDescription.substring(0, 157) + '...';
  }
  
  return seoDescription;
}

/**
 * 카테고리별 기본 키워드 생성
 */
export function generateSEOKeywords(title: string, category: string, description?: string): string {
  const baseKeywords = ['설문조사', '투표', '참여', 'Polli', '온라인설문', '익명투표'];
  
  const categoryKeywords: { [key: string]: string[] } = {
    'fun': ['재미있는투표', '엔터테인먼트설문', '트렌드조사', '인기투표'],
    'life': ['생활설문', '라이프스타일', '일상투표', '실용설문'],
    'deep': ['심층조사', '사회조사', '의견조사', '익명설문'],
    'location': ['지역설문', '지역조사', '로컬투표', '동네설문'],
    'business': ['기업조사', '비즈니스설문', '시장조사', '업무관련']
  };
  
  let keywords = [...baseKeywords];
  
  // 카테고리별 키워드 추가
  if (categoryKeywords[category]) {
    keywords.push(...categoryKeywords[category]);
  }
  
  // 제목에서 중요 단어 추출
  const titleWords = title.split(/\s+/).filter(word => word.length > 1);
  keywords.push(...titleWords);
  
  // 설명에서 중요 단어 추출
  if (description) {
    const descWords = description.split(/\s+/).filter(word => word.length > 2);
    keywords.push(...descWords.slice(0, 3)); // 상위 3개만
  }
  
  // 중복 제거 및 쉼표로 연결
  const uniqueKeywords = [...new Set(keywords)];
  return uniqueKeywords.slice(0, 15).join(', '); // 최대 15개
}

/**
 * Open Graph 이미지 URL 생성 (동적 이미지 생성용)
 */
export function generateOGImageUrl(title: string, category: string): string {
  const baseUrl = 'https://polli.replit.app';
  const encodedTitle = encodeURIComponent(title);
  const encodedCategory = encodeURIComponent(category);
  
  // 동적 OG 이미지 생성 API 엔드포인트
  return `${baseUrl}/api/og-image?title=${encodedTitle}&category=${encodedCategory}`;
}

/**
 * 정규 URL 생성
 */
export function generateCanonicalUrl(slug: string, type: 'survey' | 'blog' = 'survey'): string {
  const baseUrl = 'https://polli.replit.app';
  
  if (type === 'blog') {
    return `${baseUrl}/blog/${slug}`;
  }
  
  return `${baseUrl}/poll/${slug}`;
}

/**
 * 구조화된 데이터 생성 (JSON-LD)
 */
export function generateSurveyStructuredData(survey: {
  id: number;
  title: string;
  description?: string;
  category: string;
  slug?: string;
  createdAt?: Date;
  participantCount?: number;
}) {
  const canonicalUrl = generateCanonicalUrl(survey.slug || survey.id.toString());
  
  return {
    "@context": "https://schema.org",
    "@type": "Survey",
    "name": survey.title,
    "description": survey.description || `${survey.title}에 대한 설문조사`,
    "url": canonicalUrl,
    "creator": {
      "@type": "Organization",
      "name": "Polli",
      "url": "https://polli.replit.app"
    },
    "dateCreated": survey.createdAt?.toISOString(),
    "interactionStatistic": {
      "@type": "InteractionCounter",
      "interactionType": "https://schema.org/CommentAction",
      "userInteractionCount": survey.participantCount || 0
    },
    "category": survey.category,
    "isAccessibleForFree": true,
    "inLanguage": "ko-KR"
  };
}

/**
 * 블로그 포스트용 구조화된 데이터 생성
 */
export function generateBlogStructuredData(post: {
  title: string;
  excerpt?: string;
  slug: string;
  authorName?: string;
  publishedAt?: Date;
  updatedAt?: Date;
  category: string;
  tags?: string[];
}) {
  const canonicalUrl = generateCanonicalUrl(post.slug, 'blog');
  
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": post.title,
    "description": post.excerpt || `${post.title} - Polli 블로그`,
    "url": canonicalUrl,
    "datePublished": post.publishedAt?.toISOString(),
    "dateModified": post.updatedAt?.toISOString(),
    "author": {
      "@type": "Person",
      "name": post.authorName || "Polli Team"
    },
    "publisher": {
      "@type": "Organization",
      "name": "Polli",
      "url": "https://polli.replit.app",
      "logo": {
        "@type": "ImageObject",
        "url": "https://polli.replit.app/logo.png"
      }
    },
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": canonicalUrl
    },
    "articleSection": post.category,
    "keywords": post.tags?.join(', '),
    "inLanguage": "ko-KR"
  };
}

/**
 * 사이트맵 생성용 URL 우선순위 계산
 */
export function calculateSitemapPriority(data: {
  type: 'survey' | 'blog' | 'page';
  participantCount?: number;
  viewCount?: number;
  isActive?: boolean;
  isFeatured?: boolean;
  createdAt?: Date;
}): number {
  let priority = 0.5; // 기본값
  
  if (data.type === 'page') {
    priority = 1.0; // 메인 페이지들은 최고 우선순위
  } else if (data.type === 'survey') {
    priority = 0.7; // 설문 기본
    
    if (data.participantCount && data.participantCount > 100) priority += 0.1;
    if (data.participantCount && data.participantCount > 500) priority += 0.1;
    if (data.isActive) priority += 0.1;
    
    // 최근 생성된 설문은 우선순위 높임
    if (data.createdAt && Date.now() - data.createdAt.getTime() < 7 * 24 * 60 * 60 * 1000) {
      priority += 0.1;
    }
  } else if (data.type === 'blog') {
    priority = 0.6; // 블로그 기본
    
    if (data.isFeatured) priority += 0.2;
    if (data.viewCount && data.viewCount > 1000) priority += 0.1;
    
    // 최근 발행된 포스트는 우선순위 높임
    if (data.createdAt && Date.now() - data.createdAt.getTime() < 30 * 24 * 60 * 60 * 1000) {
      priority += 0.1;
    }
  }
  
  return Math.min(priority, 1.0); // 최대값 1.0으로 제한
}

/**
 * 변경 빈도 계산
 */
export function calculateChangeFrequency(data: {
  type: 'survey' | 'blog' | 'page';
  isActive?: boolean;
  updatedAt?: Date;
  createdAt?: Date;
}): 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never' {
  if (data.type === 'page') {
    return 'weekly'; // 메인 페이지들
  }
  
  if (data.type === 'survey' && data.isActive) {
    // 활성 설문은 자주 업데이트
    return 'daily';
  }
  
  if (data.type === 'survey' && !data.isActive) {
    // 비활성 설문은 거의 변경되지 않음
    return 'never';
  }
  
  if (data.type === 'blog') {
    // 블로그는 월별 업데이트
    return 'monthly';
  }
  
  return 'weekly';
}