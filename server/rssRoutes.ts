import { Express } from 'express';
import { db } from './db.js';
import { surveys } from '../shared/schema.js';
import { desc } from 'drizzle-orm';

export function registerRSSRoutes(app: Express) {
  // RSS 피드 생성
  app.get('/rss.xml', async (req, res) => {
    try {
      // 최신 설문 10개 가져오기
      const latestSurveys = await db
        .select({
          id: surveys.id,
          title: surveys.title,
          description: surveys.description,
          slug: surveys.slug,
          category: surveys.category,
          createdAt: surveys.createdAt,
          votingEndDate: surveys.votingEndDate
        })
        .from(surveys)
        .where(surveys.isActive)
        .orderBy(desc(surveys.createdAt))
        .limit(10);

      // RSS XML 생성
      const rssXml = generateRSSXML(latestSurveys);
      
      res.setHeader('Content-Type', 'application/rss+xml; charset=UTF-8');
      res.setHeader('Cache-Control', 'public, max-age=3600'); // 1시간 캐시
      res.send(rssXml);
    } catch (error) {
      console.error('RSS 피드 생성 오류:', error);
      res.status(500).send('RSS 피드를 생성할 수 없습니다.');
    }
  });
}

function generateRSSXML(surveys: any[]): string {
  const now = new Date();
  const pubDate = now.toUTCString();
  
  const categoryLabels = {
    fun: '재미투표',
    life: '생활투표', 
    deep: '심층투표',
    location: '지역투표'
  };

  const items = surveys.map(survey => {
    const endDate = new Date(survey.votingEndDate);
    const formattedEndDate = endDate.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long', 
      day: 'numeric'
    });
    
    const categoryLabel = categoryLabels[survey.category as keyof typeof categoryLabels] || survey.category;
    const pollUrl = `https://www.polli.co.kr/poll/${survey.slug}`;
    
    return `
    <item>
      <title><![CDATA[${survey.title}]]></title>
      <link>${pollUrl}</link>
      <description><![CDATA[${survey.description} (${categoryLabel} - ${formattedEndDate}까지)]]></description>
      <pubDate>${new Date(survey.createdAt).toUTCString()}</pubDate>
      <guid>${pollUrl}</guid>
      <category>${categoryLabel}</category>
    </item>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Polli 설문 업데이트</title>
    <link>https://www.polli.co.kr</link>
    <description>최신 설문 및 투표를 확인하고 참여하세요. 참여형 여론조사 플랫폼</description>
    <language>ko-KR</language>
    <pubDate>${pubDate}</pubDate>
    <lastBuildDate>${pubDate}</lastBuildDate>
    <generator>Polli Survey Platform</generator>
    <image>
      <url>https://www.polli.co.kr/polli_og_image.png</url>
      <title>Polli</title>
      <link>https://www.polli.co.kr</link>
    </image>
    <atom:link href="https://www.polli.co.kr/rss.xml" rel="self" type="application/rss+xml" />${items}
  </channel>
</rss>`;
}