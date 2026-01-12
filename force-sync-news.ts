import "dotenv/config";
import { syncNews } from './server/services/newsService';

async function forceSync() {
    console.log("🚀 Manual News Sync Triggered...");
    await syncNews();
    console.log("✅ Sync complete. Check the UI now!");
    process.exit(0);
}

forceSync();
