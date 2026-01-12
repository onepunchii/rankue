import "dotenv/config";
import { db } from "./server/db";
import { runAssemblyBillScheduler } from "./server/assemblyBillScheduler";

(async () => {
    console.log("🚀 수동으로 국회 발의법률안 스케줄러를 실행합니다...");
    try {
        const result = await runAssemblyBillScheduler();
        console.log("✅ 실행 결과:", result);
    } catch (error) {
        console.error("❌ 실행 오류:", error);
    }
    process.exit(0);
})();
