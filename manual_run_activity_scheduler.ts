
import "dotenv/config";
import { updateAllMembersActivity } from "./server/updateAssemblyActivity";

(async () => {
    console.log("🚀 수동으로 전체 국회의원(299명) 활동지수 스케줄러를 실행합니다...");
    try {
        const result = await updateAllMembersActivity();
        console.log("✅ 실행 결과:", result);
    } catch (error) {
        console.error("❌ 실행 오류:", error);
    }
    process.exit(0);
})();
