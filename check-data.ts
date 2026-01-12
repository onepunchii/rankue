import "dotenv/config";
import { db } from "./server/db";
import { assemblyMembers, localCouncilMembers } from "./shared/schema";
import { eq } from "drizzle-orm";

async function checkData() {
    try {
        console.log("🔍 Checking data in database...\n");

        // Count assembly members
        const assemblyCount = await db
            .select()
            .from(assemblyMembers)
            .where(eq(assemblyMembers.isActive, true));

        console.log(`📊 Assembly Members: ${assemblyCount.length} active`);

        if (assemblyCount.length > 0) {
            console.log("\n📋 First 5 assembly members:");
            assemblyCount.slice(0, 5).forEach((member, idx) => {
                console.log(`   ${idx + 1}. ID: ${member.id}, Name: ${member.name}, Party: ${member.party}`);
            });
        }

        // Count local council members
        const localCount = await db
            .select()
            .from(localCouncilMembers)
            .where(eq(localCouncilMembers.isActive, true));

        console.log(`\n📊 Local Council Members: ${localCount.length} active`);

        if (localCount.length > 0) {
            console.log("\n📋 First 5 local council members:");
            localCount.slice(0, 5).forEach((member, idx) => {
                console.log(`   ${idx + 1}. ID: ${member.id}, Name: ${member.name}, Party: ${member.party}, Location: ${member.cityProvince} ${member.district || ''}`);
            });
        }

        console.log("\n💡 Test URLs:");
        if (assemblyCount.length > 0) {
            console.log(`   Assembly: http://localhost:5001/politician/assembly/${assemblyCount[0].id}`);
        }
        if (localCount.length > 0) {
            console.log(`   Local: http://localhost:5001/politician/local_council/${localCount[0].id}`);
        }

        process.exit(0);
    } catch (error) {
        console.error("❌ Error:", error);
        process.exit(1);
    }
}

checkData();
