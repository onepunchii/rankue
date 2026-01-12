import axios from 'axios';

interface NaverNewsItem {
  title: string;
  originallink: string;
  link: string;
  description: string;
  pubDate: string;
}

interface NaverNewsResponse {
  lastBuildDate: string;
  total: number;
  start: number;
  display: number;
  items: NaverNewsItem[];
}

export interface NewsArticle {
  id: string;
  title: string;
  description: string;
  link: string;
  provider: string;
  pubDate: string;
  category: string;
}

// 네이버 뉴스 API 호출 함수
export async function fetchNaverNews(query: string = "정치", display: number = 10): Promise<NewsArticle[]> {
  const CLIENT_ID = process.env.NAVER_CLIENT_ID;
  const CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;

  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('네이버 API 키가 설정되지 않았습니다.');
  }

  const api_url = 'https://openapi.naver.com/v1/search/news.json';

  try {
    const response = await axios.get<NaverNewsResponse>(api_url, {
      params: {
        query,
        display,
        sort: 'date', // 최신 뉴스순으로 정렬
        start: 1
      },
      headers: {
        'X-Naver-Client-Id': CLIENT_ID,
        'X-Naver-Client-Secret': CLIENT_SECRET,
        'Accept': 'application/json',
        'Accept-Charset': 'utf-8'
      },
      responseType: 'json',
      responseEncoding: 'utf8'
    });

    const newsItems = response.data.items;

    // 네이버 뉴스 데이터를 우리 앱 형식으로 변환
    const articles: NewsArticle[] = newsItems.map((item, index) => {
      // HTML 태그 제거
      const cleanTitle = item.title.replace(/(<([^>]+)>)/gi, '').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
      const cleanDescription = item.description.replace(/(<([^>]+)>)/gi, '').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
      
      // 카테고리 결정 (키워드 기반)
      let category = '일반';
      const titleLower = cleanTitle.toLowerCase();
      if (titleLower.includes('정치') || titleLower.includes('대통령') || titleLower.includes('국회') || titleLower.includes('정부')) {
        category = '정치';
      } else if (titleLower.includes('경제') || titleLower.includes('주식') || titleLower.includes('증시') || titleLower.includes('금리')) {
        category = '경제';
      } else if (titleLower.includes('사회') || titleLower.includes('사건') || titleLower.includes('사고') || titleLower.includes('범죄')) {
        category = '사회';
      } else if (titleLower.includes('국제') || titleLower.includes('해외') || titleLower.includes('미국') || titleLower.includes('중국')) {
        category = '국제';
      } else if (titleLower.includes('스포츠') || titleLower.includes('야구') || titleLower.includes('축구') || titleLower.includes('올림픽')) {
        category = '스포츠';
      } else if (titleLower.includes('연예') || titleLower.includes('k팝') || titleLower.includes('드라마') || titleLower.includes('영화')) {
        category = '연예';
      }

      return {
        id: `naver-${index}-${Date.now()}`,
        title: cleanTitle,
        description: cleanDescription,
        link: item.link,
        provider: '네이버뉴스',
        pubDate: item.pubDate,
        category
      };
    });

    return articles;
  } catch (error: any) {
    console.error('네이버 뉴스 API 요청 중 오류 발생:', error.response?.data || error.message);
    throw new Error('뉴스를 가져오는 중 오류가 발생했습니다.');
  }
}

// 다양한 주제의 뉴스를 가져오는 함수
export async function fetchMixedNews(): Promise<NewsArticle[]> {
  const topics = ['정치', '경제', '사회', '국제', '스포츠'];
  const allNews: NewsArticle[] = [];

  try {
    // 각 주제별로 2개씩 뉴스 가져오기
    for (const topic of topics) {
      try {
        const news = await fetchNaverNews(topic, 2);
        allNews.push(...news);
      } catch (error) {
        console.warn(`${topic} 뉴스를 가져오는 중 오류:`, error);
      }
    }

    // 시간순으로 정렬 (최신순)
    allNews.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

    return allNews.slice(0, 10); // 최대 10개만 반환
  } catch (error) {
    console.error('혼합 뉴스를 가져오는 중 오류:', error);
    return [];
  }
}