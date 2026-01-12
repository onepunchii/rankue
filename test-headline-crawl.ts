import "dotenv/config";
import { crawlNaverHeadlines } from './server/newsAnalyzer';

async function testCrawl() {
    console.log("🚀 Testing Naver Headline Crawling...");

    const sections = [
        { id: '100', name: '정치' },
        { id: '101', name: '경제' },
        { id: 'ranking', name: '랭킹' }
    ];

    for (const section of sections) {
        console.log(`\n--- [${section.name}] Section (ID: ${section.id}) ---`);
        const items = await crawlNaverHeadlines(section.id);

        if (items.length === 0) {
            console.log("❌ No headlines found. (Might be blocked or selector changed)");
        } else {
            items.slice(0, 5).forEach((item, index) => {
                console.log(`${index + 1}. ${item.title}`);
                console.log(`   Link: ${item.link.substring(0, 60)}...`);
            });
        }
    }
}

testCrawl();
