import { db } from "./server/db";
import { hiqMembers, hiqGameHistory } from "./shared/schema";
import { eq, desc } from "drizzle-orm";

async function main() {
    // Get the most recently updated member (likely the active user)
    const members = await db.select().from(hiqMembers).orderBy(desc(hiqMembers.updatedAt)).limit(1);
    if (members.length === 0) {
        console.log("No members found");
        return;
    }
    const member = members[0];
    console.log("Active Member:", member.name, member.id);
    console.log("Handicaps:", member.handi3c, member.handi4c);
    console.log("Profile Average:", member.average);

    const history = await db.select().from(hiqGameHistory).where(eq(hiqGameHistory.memberId, member.id));
    console.log("Total History Items:", history.length);

    const match3c = history.filter(h => h.gameType === '3c');
    console.log("3C Games:", match3c.length);
    match3c.forEach((h, i) => {
        console.log(`3C Game ${i}: Score ${h.score}, Innings ${h.innings}`);
    });

    const match4c = history.filter(h => h.gameType === '4c');
    console.log("4C Games:", match4c.length);
    match4c.forEach((h, i) => {
        console.log(`4C Game ${i}: Score ${h.score}, Innings ${h.innings}`);
    });
    
    process.exit(0);
}

main().catch(console.error);
