
import 'dotenv/config'; // Load env vars
import { db } from "./server/db";
import { politicians } from "./shared/schema";
import { sql } from "drizzle-orm";

const parties = ["국민의힘", "더불어민주당", "조국혁신당", "개혁신당", "진보당", "무소속"];
const locations = ["서울 종로구", "경기 성남시분당구갑", "부산 해운대구을", "대구 수성구갑", "인천 연수구을", "광주 서구갑", "대전 유성구을", "울산 남구갑", "제주 제주시갑"];
const names = [
    "김철수", "이영희", "박민수", "정지원", "최영호", "강지민", "윤서연", "장동현", "임수진", "한승우",
    "오지훈", "서미경", "신동엽", "구하리", "백현우", "홍길동", "류승룡", "황정민", "이병헌", "전지현"
];

async function seedRankings() {
    console.log("🌱 [Seeding] 국회의원 랭킹용 가상 데이터 생성 중...");

    try {
        // 기존 데이터 삭제 (옵션)
        // await db.delete(assemblyMembers); 

        const newMembers = [];

        for (let i = 0; i < 30; i++) {
            const name = i < names.length ? names[i] : `의원${i + 1}`;
            const party = parties[Math.floor(Math.random() * parties.length)];
            const location = locations[Math.floor(Math.random() * locations.length)];

            // 점수 생성 로직 (상위권, 중위권, 하위권 분포)
            let activityScore = 0;
            const rand = Math.random();
            if (rand > 0.8) activityScore = Math.floor(Math.random() * 15) + 85; // 85-100 (S급)
            else if (rand > 0.5) activityScore = Math.floor(Math.random() * 20) + 65; // 65-84 (A-B급)
            else activityScore = Math.floor(Math.random() * 30) + 30; // 30-60 (C-F급)

            newMembers.push({
                name: `${name}`,
                type: "국회의원",
                party: party,
                constituency: location,
                status: "재직",
                gender: Math.random() > 0.7 ? "여" : "남",
                reelectionStatus: `${Math.floor(Math.random() * 4) + 1}선`,
                activityScore: activityScore,
                billsProposed: Math.floor(Math.random() * 50),
                attendanceRate: (Math.random() * 30 + 70).toFixed(2), // 70-100%
                aiPersona: null
            });
        }

        console.log(`📝 ${newMembers.length}명의 데이터 생성 완료. DB 삽입 시도...`);

        await db.insert(politicians).values(newMembers);

        console.log("✅ [성공] 가상 국회의원 데이터가 DB에 저장되었습니다!");

    } catch (error) {
        console.error("❌ [실패] 데이터 시딩 중 에러 발생:", error);
    } finally {
        process.exit();
    }
}

seedRankings();
