
import { searchNews } from "./server/newsAnalyzer";
import 'dotenv/config';

async function test() {
    console.log("Testing Naver News API...");
    try {
        const results = await searchNews("politics");
        console.log(`Found ${results.length} items.`);
        if (results.length > 0) {
            console.log("First item:", results[0].title);
        }
    } catch (e) {
        console.error("Error:", e);
    }
}

test();
