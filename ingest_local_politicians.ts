import "dotenv/config";
import fs from "fs";
import path from "path";
import { db } from "./server/db";
import { politicians } from "./shared/schema";
import { eq, and } from "drizzle-orm";

async function ingestLocalPoliticians() {
    console.log("🏙️ 기초의원 상세 데이터 통합 인서트 시작...");

    const filePath = path.resolve(process.cwd(), 'attached_assets', '당선인 명부_1754054558898.json');

    if (!fs.existsSync(filePath)) {
        console.error("❌ 파일을 찾을 수 없습니다:", filePath);
        process.exit(1);
    }

    try {
        const fileContent = fs.readFileSync(filePath, 'utf-8').replace(/:\s*NaN/g, ': null');
        const membersData = JSON.parse(fileContent);

        console.log(`📂 로드된 데이터: ${membersData.length}명`);

        // Clear existing local politicians to avoid dupes/stale data during this reconstruction
        console.log("🧹 기존 기초의원 데이터 삭제 중...");
        await db.delete(politicians).where(eq(politicians.level, '기초'));

        const politiciansToInsert = membersData.map((item: any) => {
            const electionName = item['선거명'] || "";

            let type = 'local';
            let level = '기초';
            let role = '의원';

            if (electionName.includes('시·도의회의의원')) {
                level = '광역';
            } else if (electionName.includes('시·도지사')) {
                type = 'head';
                level = '광역';
                role = '시장/지사';
            } else if (electionName.includes('구·시·군의 장')) {
                type = 'head';
                level = '기초';
                role = '구청장/시장/군수';
            }

            return {
                name: item['성명'],
                party: item['소속정당명'],
                type: type,
                level: level,
                role: role,
                region: item['시도명'],
                district: item['구시군명'],
                constituency: item['선거구명'],
                gender: item['성별'],
                birthDate: item['생년월일'],
                age: item['연령'],
                address: item['주소'],
                occupation: item['직업'],
                education: item['학력'],
                career1: item['경력1'],
                career2: item['경력2'],
                propertyAmount: item['재산신고액(천원)'],
                taxArrears: item['최근5년간체납액(천원)'],
                criminalRecord: item['전과기록유무(건수)'],
                candidacyCount: item['입후보횟수'],
                activityScore: 0,
                isActive: true,
            };
        });

        // Batch insert using Drizzle
        const batchSize = 200;
        let successCount = 0;

        for (let i = 0; i < politiciansToInsert.length; i += batchSize) {
            const batch = politiciansToInsert.slice(i, i + batchSize);
            await db.insert(politicians).values(batch);
            successCount += batch.length;
            console.log(`✅ 배치 ${i / batchSize + 1} 성공 (${successCount}/${politiciansToInsert.length}명)`);
        }

        console.log("🎉 기초의원 상세 데이터 통합 업로드 성공!");
        process.exit(0);
    } catch (err) {
        console.error("❌ 오류 발생:", err);
        process.exit(1);
    }
}

ingestLocalPoliticians();
