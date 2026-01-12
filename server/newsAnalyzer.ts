import axios from 'axios';
import * as cheerio from 'cheerio';
import OpenAI from 'openai';
import iconv from 'iconv-lite';
import jschardet from 'jschardet';
import TurndownService from 'turndown';

// Naver API Config
const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID;
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;

// OpenAI Config
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export interface NewsItem {
    title: string;
    originallink: string;
    link: string;
    description: string;
    pubDate: string;
}

export interface NewsAnalysisResult {
    hidden_intent: string;  // 진짜 속뜻
    fact_check: string;     // 팩트와 뇌피셜 구분 / 기사의 숨은 의도
    one_liner: string;      // 한 줄 요약
    content?: string;       // 기사 원문 내용
}

/**
 * Naver News Search API (Fallback)
 */
export async function searchNews(keyword: string): Promise<NewsItem[]> {
    try {
        if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) {
            console.warn('⚠️ Naver API credentials not found.');
            return [];
        }

        const response = await axios.get('https://openapi.naver.com/v1/search/news.json', {
            params: {
                query: keyword,
                display: 10,
                start: 1,
                sort: 'sim' // or 'date'
            },
            headers: {
                'X-Naver-Client-Id': NAVER_CLIENT_ID,
                'X-Naver-Client-Secret': NAVER_CLIENT_SECRET
            }
        });

        return response.data.items;
    } catch (error) {
        console.error('❌ Naver News Search Error:', error);
        return [];
    }
}

/**
 * Crawl Naver News Section Headlines directly
 */
export async function crawlNaverHeadlines(sectionId: string): Promise<NewsItem[]> {
    try {
        const url = sectionId === 'ranking'
            ? 'https://news.naver.com/main/ranking/popularDay.naver'
            : `https://news.naver.com/section/${sectionId}`;

        console.log(`📡 Crawling Naver Headlines from: ${url}`);

        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 5000
        });

        // Detect Encoding using jschardet
        const buffer = Buffer.from(response.data);
        const detected = jschardet.detect(buffer);
        let encoding = detected.encoding || 'utf-8';

        // Convert to UTF-8
        let html = iconv.decode(buffer, encoding);

        // Fallback check: if we see replacement characters, try EUC-KR
        if (html.includes('\uFFFD') && encoding.toLowerCase() !== 'euc-kr' && encoding.toLowerCase() !== 'cp949') {
            const eucDecoded = iconv.decode(buffer, 'euc-kr');
            const originalErrors = (html.match(/\uFFFD/g) || []).length;
            const newErrors = (eucDecoded.match(/\uFFFD/g) || []).length;
            if (newErrors < originalErrors) {
                html = eucDecoded;
            }
        }

        const $ = cheerio.load(html);
        const headlines: NewsItem[] = [];

        // Naver News Section Page Selectors (sa_item)
        $('.sa_item').each((i, el) => {
            if (headlines.length >= 15) return false;

            const title = $(el).find('.sa_text_title, .rankingnews_box_inner .list_title, .sh_text_headline').text().trim();
            const link = $(el).find('a').attr('href');
            const description = $(el).find('.sa_text_lede, .sh_text_lede').text().trim();

            if (title && link) {
                headlines.push({
                    title,
                    originallink: link.startsWith('http') ? link : `https://news.naver.com${link}`,
                    link: link.startsWith('http') ? link : `https://news.naver.com${link}`,
                    description: description || "",
                    pubDate: new Date().toISOString()
                });
            }
        });

        // Specific Selector for Ranking Page (Most Viewed)
        if (headlines.length < 5) {
            $('.rankingnews_list li').each((i, el) => {
                if (headlines.length >= 20) return false;
                const titleEl = $(el).find('.list_title, a');
                const title = titleEl.text().trim();
                const link = $(el).find('a').attr('href');

                if (title && link && title.length > 5) {
                    headlines.push({
                        title,
                        originallink: link.startsWith('http') ? link : `https://news.naver.com${link}`,
                        link: link.startsWith('http') ? link : `https://news.naver.com${link}`,
                        description: "",
                        pubDate: new Date().toISOString()
                    });
                }
            });
        }

        // If specific selectors fail, try generic headline classes
        if (headlines.length === 0) {
            $('.sh_item').each((i, el) => {
                if (headlines.length >= 10) return false;
                const title = $(el).find('a').text().trim();
                const link = $(el).find('a').attr('href');
                if (title && link) {
                    headlines.push({
                        title,
                        originallink: link,
                        link,
                        description: "",
                        pubDate: new Date().toISOString()
                    });
                }
            });
        }

        return headlines;
    } catch (error) {
        console.error(`❌ Naver Section Crawl Error (${sectionId}):`, error);
        return [];
    }
}

import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

/**
 * Crawl News Content using Readability and JSDOM
 * Robust extraction for various news sites.
 */
export async function crawlNewsContent(url: string): Promise<string> {
    try {
        console.log(`🌐 Crawling content from: ${url}`);

        // Fetch as arraybuffer to handle different encodings
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        // Detect Encoding using jschardet
        const buffer = Buffer.from(response.data);
        const detected = jschardet.detect(buffer);
        let encoding = detected.encoding || 'utf-8';

        // Convert to UTF-8
        let contentHtml = iconv.decode(buffer, encoding);

        // Fallback check: if we see replacement characters, try EUC-KR
        if (contentHtml.includes('\uFFFD') && encoding.toLowerCase() !== 'euc-kr' && encoding.toLowerCase() !== 'cp949') {
            const eucDecoded = iconv.decode(buffer, 'euc-kr');
            const originalErrors = (contentHtml.match(/\uFFFD/g) || []).length;
            const newErrors = (eucDecoded.match(/\uFFFD/g) || []).length;
            if (newErrors < originalErrors) {
                contentHtml = eucDecoded;
            }
        }

        // Use JSDOM and Readability
        const dom = new JSDOM(contentHtml, { url });
        const reader = new Readability(dom.window.document);
        const article = reader.parse();

        if (!article || !article.content || (article.textContent?.trim().length ?? 0) < 100) {
            console.warn(`⚠️ Readability failed or content too short for ${url}. Trying fallback.`);
            // Basic fallback using Cheerio if readability fails
            const $ = cheerio.load(contentHtml);
            $('script, style, iframe, nav, header, footer, aside').remove();
            const text = $('body').text().replace(/\s+/g, ' ').trim();
            if (text.length > 100) return text.substring(0, 5000);
            return "기사 내용을 추출하지 못했습니다.";
        }

        // Convert cleaned HTML to Markdown
        const turndownService = new TurndownService({
            headingStyle: 'atx',
            codeBlockStyle: 'fenced'
        });

        // Remove images and other junk from the readability content if needed
        let cleanedHtml = article.content;
        const $final = cheerio.load(cleanedHtml);
        $final('img, video, audio, source, iframe, button, input').remove();

        let markdown = turndownService.turndown($final.html());

        // Post-processing
        markdown = markdown
            .replace(/\n{3,}/g, '\n\n')
            .replace(/\[\s*\]/g, '')
            .trim();

        return markdown;
    } catch (error) {
        console.error('❌ Crawling Error:', error);
        throw new Error('Failed to crawl the news content.');
    }
}

/**
 * Analyze News using OpenAI with Veteran Reporter Persona
 */
export async function analyzeNews(url: string, cachedContent?: string): Promise<NewsAnalysisResult | null> {
    try {
        console.log(`🕵️‍♂️ Analyzing news content from: ${url}`);

        let content = cachedContent;
        if (!content) {
            content = await crawlNewsContent(url);
        }

        if (!content || content.length < 50) {
            console.warn('⚠️ Content too short or empty.');
            return null;
        }

        const systemPrompt = `너는 30년 차 베테랑 정치부 기자이자, 행간을 읽는 심리 분석가다. 
기사의 겉치레 문구는 무시하고, 이 기사가 나온 진짜 정치적/경제적 의도, 팩트와 뇌피셜의 구분, 그리고 향후 예측을 아주 냉소적이고 직설적인 말투로 3줄 요약해라.

반드시 다음 JSON 형식으로만 응답해라:
{
  "hidden_intent": "기사의 진짜 속뜻 (냉소적 어조)",
  "fact_check": "팩트와 기자의 뇌피셜 구분 및 숨은 의도",
  "one_liner": "직설적인 한 줄 요약"
}
`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `다음 기사 내용을 분석해줘:\n\n${content}` }
            ],
            response_format: { type: "json_object" },
            temperature: 0.8, // Slightly more creative/cynical
        });

        const result = JSON.parse(completion.choices[0].message.content || '{}');
        return {
            hidden_intent: result.hidden_intent || "분석 실패",
            fact_check: result.fact_check || "분석 실패",
            one_liner: result.one_liner || "분석 실패",
            content: content
        };

    } catch (error) {
        console.error('❌ Analysis Error:', error);
        return null;
    }
}
