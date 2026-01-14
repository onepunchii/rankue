import { Express, Request, Response } from "express";
import { db } from "./db.js";
import { surveys } from "../shared/schema.js";
import { eq, and, desc } from "drizzle-orm";
import {
  generateSlug,
  generateSEOTitle,
  generateSEODescription,
  generateSEOKeywords,
  generateCanonicalUrl,
  generateSurveyStructuredData,
  generateBlogStructuredData,
  calculateSitemapPriority,
  calculateChangeFrequency
} from "../shared/seo-utils.js";

export function registerSEORoutes(app: Express) {
  // sitemap.xml 자동 생성
  app.get("/sitemap.xml", async (req: Request, res: Response) => {
    try {
      const baseUrl = "https://polli.replit.app";

      // 메인 페이지들
      const staticPages = [
        { url: "/", priority: 1.0, changefreq: "daily" },
        { url: "/surveys", priority: 0.9, changefreq: "daily" },
        { url: "/results", priority: 0.9, changefreq: "daily" },
        { url: "/category/fun", priority: 0.8, changefreq: "daily" },
        { url: "/category/life", priority: 0.8, changefreq: "daily" },
        { url: "/category/deep", priority: 0.8, changefreq: "daily" },
        { url: "/category/politics", priority: 0.8, changefreq: "daily" },
        { url: "/create", priority: 0.7, changefreq: "weekly" },
        { url: "/news", priority: 0.7, changefreq: "daily" },
        { url: "/enterprise-research", priority: 0.6, changefreq: "monthly" },
        { url: "/statistics", priority: 0.6, changefreq: "weekly" },
        { url: "/blog", priority: 0.7, changefreq: "weekly" },
        { url: "/rss.xml", priority: 0.8, changefreq: "hourly" }
      ];

      // 활성 설문들
      const activeSurveys = await db
        .select({
          id: surveys.id,
          slug: surveys.slug,
          title: surveys.title,
          category: surveys.category,
          participantCount: surveys.participantCount,
          isActive: surveys.isActive,
          createdAt: surveys.createdAt,
          updatedAt: surveys.updatedAt
        })
        .from(surveys)
        .where(eq(surveys.isActive, true))
        .orderBy(desc(surveys.participantCount));

      // 발행된 블로그 포스트들 (나중에 구현)
      // const publishedPosts = await db
      //   .select({
      //     slug: blogPosts.slug,
      //     publishedAt: blogPosts.publishedAt,
      //     updatedAt: blogPosts.updatedAt,
      //     viewCount: blogPosts.viewCount,
      //     isFeatured: blogPosts.isFeatured
      //   })
      //   .from(blogPosts)
      //   .where(eq(blogPosts.status, "published"))
      //   .orderBy(desc(blogPosts.publishedAt));

      let sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n';
      sitemap += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

      // 정적 페이지들 추가
      staticPages.forEach(page => {
        sitemap += '  <url>\n';
        sitemap += `    <loc>${baseUrl}${page.url}</loc>\n`;
        sitemap += `    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>\n`;
        sitemap += `    <changefreq>${page.changefreq}</changefreq>\n`;
        sitemap += `    <priority>${page.priority}</priority>\n`;
        sitemap += '  </url>\n';
      });

      // 활성 설문들 추가
      activeSurveys.forEach(survey => {
        const slug = survey.slug || generateSlug(survey.title);
        const priority = calculateSitemapPriority({
          type: 'survey',
          participantCount: survey.participantCount,
          isActive: survey.isActive,
          createdAt: survey.createdAt
        });
        const changefreq = calculateChangeFrequency({
          type: 'survey',
          isActive: survey.isActive,
          updatedAt: survey.updatedAt,
          createdAt: survey.createdAt
        });

        // 설문 페이지 (ID 기반)
        sitemap += '  <url>\n';
        sitemap += `    <loc>${baseUrl}/surveys/${survey.id}</loc>\n`;
        sitemap += `    <lastmod>${survey.updatedAt?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0]}</lastmod>\n`;
        sitemap += `    <changefreq>${changefreq}</changefreq>\n`;
        sitemap += `    <priority>${priority}</priority>\n`;
        sitemap += '  </url>\n';

        // 설문 페이지 (Slug 기반 - SEO 친화적)
        sitemap += '  <url>\n';
        sitemap += `    <loc>${baseUrl}/poll/${slug}</loc>\n`;
        sitemap += `    <lastmod>${survey.updatedAt?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0]}</lastmod>\n`;
        sitemap += `    <changefreq>${changefreq}</changefreq>\n`;
        sitemap += `    <priority>${priority}</priority>\n`;
        sitemap += '  </url>\n';

        // 결과 페이지 (ID 기반)
        sitemap += '  <url>\n';
        sitemap += `    <loc>${baseUrl}/survey-result/${survey.id}</loc>\n`;
        sitemap += `    <lastmod>${survey.updatedAt?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0]}</lastmod>\n`;
        sitemap += `    <changefreq>${changefreq}</changefreq>\n`;
        sitemap += `    <priority>${Math.max(priority - 0.1, 0.1)}</priority>\n`;
        sitemap += '  </url>\n';

        // 결과 페이지 (Slug 기반)
        sitemap += '  <url>\n';
        sitemap += `    <loc>${baseUrl}/poll/${slug}/result</loc>\n`;
        sitemap += `    <lastmod>${survey.updatedAt?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0]}</lastmod>\n`;
        sitemap += `    <changefreq>${changefreq}</changefreq>\n`;
        sitemap += `    <priority>${Math.max(priority - 0.1, 0.1)}</priority>\n`;
        sitemap += '  </url>\n';
      });

      // 블로그 포스트들 추가 (나중에 구현)
      // publishedPosts.forEach(post => {
      //   const priority = calculateSitemapPriority({
      //     type: 'blog',
      //     viewCount: post.viewCount,
      //     isFeatured: post.isFeatured,
      //     createdAt: post.publishedAt
      //   });
      //   const changefreq = calculateChangeFrequency({
      //     type: 'blog',
      //     updatedAt: post.updatedAt,
      //     createdAt: post.publishedAt
      //   });
      //   
      //   sitemap += '  <url>\n';
      //   sitemap += `    <loc>${baseUrl}/blog/${post.slug}</loc>\n`;
      //   sitemap += `    <lastmod>${post.updatedAt?.toISOString().split('T')[0] || post.publishedAt?.toISOString().split('T')[0]}</lastmod>\n`;
      //   sitemap += `    <changefreq>${changefreq}</changefreq>\n`;
      //   sitemap += `    <priority>${priority}</priority>\n`;
      //   sitemap += '  </url>\n';
      // });

      sitemap += '</urlset>';

      res.set({
        'Content-Type': 'application/xml',
        'Cache-Control': 'public, max-age=3600', // 1시간 캐시
        'Last-Modified': new Date().toUTCString(),
        'ETag': `"sitemap-${Date.now()}"`
      });

      res.send(sitemap);
    } catch (error) {
      console.error("Sitemap generation error:", error);
      res.status(500).send("Internal server error");
    }
  });

  // robots.txt 생성
  app.get("/robots.txt", (req: Request, res: Response) => {
    const robotsTxt = `# Polli - 참여형 여론조사 플랫폼
# https://www.polli.co.kr

User-agent: *
Allow: /

# 크롤링 허용 - 주요 공개 페이지
Allow: /surveys
Allow: /survey-result/
Allow: /results
Allow: /category/
Allow: /poll/*
Allow: /blog/*
Allow: /enterprise-research
Allow: /statistics

# 크롤링 차단 - 비공개/개인정보/관리자 페이지
Disallow: /api/
Disallow: /admin
Disallow: /admin/
Disallow: /profile
Disallow: /persona
Disallow: /test-*
Disallow: /debug-*
Disallow: /private/
Disallow: /*.json$

# 검색엔진별 최적화 설정
User-agent: Googlebot
Allow: /
Crawl-delay: 1

User-agent: Yeti
Allow: /
Crawl-delay: 1

User-agent: Bingbot
Allow: /
Crawl-delay: 1

# Sitemap 위치
Sitemap: https://www.polli.co.kr/sitemap.xml`;

    res.set({
      'Content-Type': 'text/plain',
      'Cache-Control': 'public, max-age=86400' // 24시간 캐시
    });

    res.send(robotsTxt);
  });

  // slug로 설문 조회 API (SEO 친화적 URL 지원)
  app.get("/api/survey/by-slug/:slug", async (req: Request, res: Response) => {
    try {
      const { slug } = req.params;
      const { storage } = await import("./storage");

      const surveyResult = await db
        .select()
        .from(surveys)
        .where(eq(surveys.slug, slug))
        .limit(1);

      if (surveyResult.length === 0) {
        return res.status(404).json({ error: "Survey not found" });
      }

      // 질문까지 포함하여 반환
      const surveyWithQuestions = await storage.getSurveyWithQuestions(surveyResult[0].id);

      if (!surveyWithQuestions) {
        return res.status(404).json({ error: "Survey not found" });
      }

      res.json(surveyWithQuestions);
    } catch (error) {
      console.error("Survey by slug error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // 설문 SEO 메타데이터 생성/업데이트 API
  app.post("/api/survey/:id/generate-seo", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const surveyId = parseInt(id);

      // 현재 설문 정보 조회
      const survey = await db
        .select()
        .from(surveys)
        .where(eq(surveys.id, surveyId))
        .limit(1);

      if (survey.length === 0) {
        return res.status(404).json({ error: "Survey not found" });
      }

      const currentSurvey = survey[0];

      // SEO 데이터 자동 생성
      const slug = currentSurvey.slug || generateSlug(currentSurvey.title);
      const seoTitle = generateSEOTitle(currentSurvey.title, currentSurvey.category);
      const seoDescription = generateSEODescription(currentSurvey.description || "", currentSurvey.title);
      const seoKeywords = generateSEOKeywords(currentSurvey.title, currentSurvey.category, currentSurvey.description || "");
      const canonicalUrl = generateCanonicalUrl(slug);

      // 데이터베이스 업데이트
      await db
        .update(surveys)
        .set({
          slug,
          seoTitle,
          seoDescription,
          seoKeywords,
          canonicalUrl,
          updatedAt: new Date()
        })
        .where(eq(surveys.id, surveyId));

      res.json({
        success: true,
        seoData: {
          slug,
          seoTitle,
          seoDescription,
          seoKeywords,
          canonicalUrl
        }
      });
    } catch (error) {
      console.error("SEO generation error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Open Graph 동적 이미지 생성 API (간단한 텍스트 기반)
  app.get("/api/og-image", async (req: Request, res: Response) => {
    try {
      const { title = "Polli 설문조사", category = "survey" } = req.query;

      // 카테고리별 색상
      const categoryColors: { [key: string]: string } = {
        'fun': '#FFD700',      // 노란색
        'life': '#32CD32',     // 초록색  
        'deep': '#DC143C',     // 빨간색
        'location': '#1E90FF', // 파란색
        'business': '#9932CC'  // 보라색
      };

      const bgColor = categoryColors[category as string] || '#f5499a';

      // SVG 이미지 생성 (1200x630 - OG 표준 크기)
      const svgImage = `
        <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:${bgColor};stop-opacity:1" />
              <stop offset="100%" style="stop-color:#ffffff;stop-opacity:0.8" />
            </linearGradient>
          </defs>
          
          <!-- 배경 -->
          <rect width="1200" height="630" fill="url(#bgGradient)"/>
          
          <!-- 로고 영역 -->
          <rect x="50" y="50" width="120" height="60" fill="white" rx="10" opacity="0.9"/>
          <text x="110" y="90" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" font-weight="bold" fill="${bgColor}">Polli</text>
          
          <!-- 제목 -->
          <text x="600" y="280" text-anchor="middle" font-family="Arial, sans-serif" font-size="48" font-weight="bold" fill="white" text-shadow="2px 2px 4px rgba(0,0,0,0.5)">
            ${String(title).substring(0, 30)}${String(title).length > 30 ? '...' : ''}
          </text>
          
          <!-- 부제목 -->
          <text x="600" y="350" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" fill="white" opacity="0.9">
            블록체인 기반 설문조사 플랫폼
          </text>
          
          <!-- CTA -->
          <rect x="450" y="450" width="300" height="80" fill="white" rx="40" opacity="0.9"/>
          <text x="600" y="500" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="bold" fill="${bgColor}">지금 참여하기</text>
          
          <!-- 장식 요소들 -->
          <circle cx="1050" cy="150" r="80" fill="white" opacity="0.2"/>
          <circle cx="150" cy="500" r="60" fill="white" opacity="0.3"/>
          <circle cx="1100" cy="450" r="40" fill="white" opacity="0.4"/>
        </svg>
      `;

      res.set({
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=3600' // 1시간 캐시
      });

      res.send(svgImage);
    } catch (error) {
      console.error("OG image generation error:", error);
      res.status(500).send("Internal server error");
    }
  });

  // 구조화된 데이터 생성 API
  app.get("/api/survey/:id/structured-data", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const surveyId = parseInt(id);

      const survey = await db
        .select()
        .from(surveys)
        .where(eq(surveys.id, surveyId))
        .limit(1);

      if (survey.length === 0) {
        return res.status(404).json({ error: "Survey not found" });
      }

      const structuredData = generateSurveyStructuredData({
        id: survey[0].id,
        title: survey[0].title,
        description: survey[0].description || "",
        category: survey[0].category,
        slug: survey[0].slug || generateSlug(survey[0].title),
        createdAt: survey[0].createdAt,
        participantCount: survey[0].participantCount
      });

      res.json(structuredData);
    } catch (error) {
      console.error("Structured data error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // 모든 설문에 대한 일괄 SEO 데이터 생성 (관리자용)
  app.post("/api/admin/generate-all-seo", async (req: Request, res: Response) => {
    try {
      // 모든 활성 설문 조회
      const allSurveys = await db
        .select()
        .from(surveys)
        .where(eq(surveys.isActive, true));

      let updated = 0;

      for (const survey of allSurveys) {
        // SEO 데이터가 없는 설문들만 업데이트
        if (!survey.slug || !survey.seoTitle) {
          const slug = generateSlug(survey.title);
          const seoTitle = generateSEOTitle(survey.title, survey.category);
          const seoDescription = generateSEODescription(survey.description || "", survey.title);
          const seoKeywords = generateSEOKeywords(survey.title, survey.category, survey.description || "");
          const canonicalUrl = generateCanonicalUrl(slug);

          await db
            .update(surveys)
            .set({
              slug,
              seoTitle,
              seoDescription,
              seoKeywords,
              canonicalUrl,
              updatedAt: new Date()
            })
            .where(eq(surveys.id, survey.id));

          updated++;
        }
      }

      res.json({
        success: true,
        message: `${updated}개 설문의 SEO 데이터가 생성되었습니다.`,
        totalSurveys: allSurveys.length,
        updatedSurveys: updated
      });
    } catch (error) {
      console.error("Bulk SEO generation error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  console.log("✅ SEO 라우터 등록 완료 (sitemap.xml, robots.txt, OG 이미지, 구조화 데이터)");
}