import "dotenv/config";
import { db } from "./db";
import { musicCategories } from "@shared/schema";
import { inArray } from "drizzle-orm";

async function disableCategories() {
    console.log("🚀 Disabling specified categories...");

    try {
        const categoriesToRemove = [
            "혼성 그룹",
            "밴드/락",
            "힙합/R&B",
            "모델",
            "정치인",
            "작가"
        ];

        // 이름으로 찾아서 비활성화
        await db
            .update(musicCategories)
            .set({ isActive: false })
            .where(inArray(musicCategories.name, categoriesToRemove));

        console.log(`✅ Disabled categories: ${categoriesToRemove.join(", ")}`);
    } catch (error) {
        console.error("❌ Error disabling categories:", error);
    }

    process.exit(0);
}

disableCategories();
