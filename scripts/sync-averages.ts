
import { storage } from "../server/storage";

async function syncAllAverages() {
    console.log("🚀 Starting global average synchronization...");

    try {
        // storage 객체에 접근하여 모든 멤버 가져오기 (hiqStorage.ts 내부 함수 활용)
        // 직접 db를 써서 모든 멤버 ID 조회
        const members = await (storage as any).getAllMembersGlobal();
        console.log(`📡 Found ${members.length} members to sync.`);

        for (const member of members) {
            console.log(`🔄 Syncing for ${member.name} (${member.id})...`);
            // 제가 방금 만든 전용 업데이트 함수 호출
            await (storage as any)._updateUserAverage(member.id, "3c");
            await (storage as any)._updateUserAverage(member.id, "4c");
        }

        console.log("✅ Global sync completed successfully!");
        process.exit(0);
    } catch (error) {
        console.error("❌ Sync failed:", error);
        process.exit(1);
    }
}

syncAllAverages();
