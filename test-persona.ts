import "dotenv/config";
import { db } from "./server/db";
import { assemblyMembers, localCouncilMembers } from "./shared/schema";
import { eq } from "drizzle-orm";

async function testPersonaGeneration() {
    try {
        console.log("🔍 Fetching a sample assembly member...");

        const [assemblyMember] = await db
            .select()
            .from(assemblyMembers)
            .where(eq(assemblyMembers.isActive, true))
            .limit(1);

        if (assemblyMember) {
            console.log(`\n📋 Found: ${assemblyMember.name} (${assemblyMember.party})`);
            console.log(`   Constituency: ${assemblyMember.constituency || 'N/A'}`);
            console.log(`   Committee: ${assemblyMember.committee || 'N/A'}`);
            console.log(`   Current aiPersona:`, assemblyMember.aiPersona ? '✅ Exists' : '❌ Not generated yet');

            if (assemblyMember.aiPersona) {
                console.log(`\n   Persona data:`, JSON.stringify(assemblyMember.aiPersona, null, 2));
            }
        } else {
            console.log("❌ No assembly members found in database");
        }

        console.log("\n🔍 Fetching a sample local council member...");

        const [localMember] = await db
            .select()
            .from(localCouncilMembers)
            .where(eq(localCouncilMembers.isActive, true))
            .limit(1);

        if (localMember) {
            console.log(`\n📋 Found: ${localMember.name} (${localMember.party})`);
            console.log(`   Location: ${localMember.cityProvince} ${localMember.district || ''}`);
            console.log(`   Type: ${localMember.type}`);
            console.log(`   Current aiPersona:`, localMember.aiPersona ? '✅ Exists' : '❌ Not generated yet');

            if (localMember.aiPersona) {
                console.log(`\n   Persona data:`, JSON.stringify(localMember.aiPersona, null, 2));
            }
        } else {
            console.log("❌ No local council members found in database");
        }

        console.log("\n💡 Tip: AI personas are generated on-demand when you visit a politician's detail page.");
        console.log("   Visit: http://localhost:5001/politician/assembly/{id}");
        console.log("   Or: http://localhost:5001/politician/local_council/{id}");

        process.exit(0);
    } catch (error) {
        console.error("❌ Error:", error);
        process.exit(1);
    }
}

testPersonaGeneration();
