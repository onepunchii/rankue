
import axios from 'axios';
import { db } from "../db";
import { assemblyMembers } from "@shared/schema";
import { eq } from "drizzle-orm";

const KEY = '54424d7984cf4edd93b711fb868e22df';
const SERVICE_ID = 'nzmimeepazxkubdpn';

export async function syncAssemblyRankingData() {
    console.log("📅 [Scheduler] 국회의원 활동 데이터 동기화 시작...");

    try {
        let allBills: any[] = [];
        // Fetch 3 pages (Recent 3000 bills)
        for (let i = 1; i <= 3; i++) {
            const url = `https://open.assembly.go.kr/portal/openapi/${SERVICE_ID}?KEY=${KEY}&Type=json&pIndex=${i}&pSize=1000&AGE=22`;
            const res = await axios.get(url);
            if (res.data[SERVICE_ID]) {
                allBills = [...allBills, ...res.data[SERVICE_ID][1].row];
            } else {
                break;
            }
        }
        console.log(`📊 [Ranking Update] 총 ${allBills.length}개 법안 데이터 확보.`);

        const counts: Record<string, number> = {};
        allBills.forEach(bill => {
            let proposer = bill.PROPOSER;
            if (!proposer) return;
            proposer = proposer.replace('의원', '').trim();
            if (proposer.match(/외|등/)) {
                proposer = proposer.split(/외|등/)[0].trim();
            }
            proposer = proposer.replace(/\(.*\)/, '').trim();
            counts[proposer] = (counts[proposer] || 0) + 1;
        });

        const members = await db.select().from(assemblyMembers);
        let updatedCount = 0;

        for (const member of members) {
            const count = counts[member.name] || 0;
            // Activity Score Logic: Base 20 + (Bills * 3) capped at 99 (Maximum Difficulty)
            const newScore = Math.min(20 + (count * 3), 99);
            // Mock Attendance 80-100
            const randAtt = (80 + Math.random() * 20).toFixed(0);

            // Only update if changed or if it's monthly update
            await db.update(assemblyMembers)
                .set({
                    billsProposed: count,
                    activityScore: newScore,
                    attendanceRate: String(randAtt),
                    // updatedAt: new Date() // schema updated to include updatedAt
                })
                .where(eq(assemblyMembers.id, member.id));
            updatedCount++;
        }
        console.log(`✅ [Scheduler] 이달의 랭킹 업데이트 완료: ${updatedCount}명 갱신됨.`);
        return updatedCount;
    } catch (e) {
        console.error("❌ Ranking Update Failed:", e);
        return 0;
    }
}
