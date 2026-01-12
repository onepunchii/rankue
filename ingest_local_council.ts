
import "dotenv/config";
import fs from "fs";
import path from "path";
import { db } from "./server/db";
import { localCouncilMembers } from "./shared/schema";
import { eq } from "drizzle-orm";

async function ingestLocalCouncil() {
    console.log("🏛️ 기초의원(당선인 명부) 데이터 통합 인서트 시작...");

    const filePath = path.resolve(process.cwd(), 'attached_assets', '당선인 명부_1754054558898.json');

    if (!fs.existsSync(filePath)) {
        console.error("❌ 파일을 찾을 수 없습니다:", filePath);
        process.exit(1);
    }

    try {
        let fileContent = fs.readFileSync(filePath, 'utf-8');
        fileContent = fileContent.replace(/:\s*NaN/g, ': null');

        const rawData = JSON.parse(fileContent);
        const membersData = Array.isArray(rawData) ? rawData : (rawData.response?.body?.items?.item || rawData.items || []);

        console.log(`📂 로드된 데이터: ${membersData.length}명`);

        console.log("🧹 기존 기초/광역 의원 및 단체장 데이터 정리 중...");
        await db.delete(localCouncilMembers);

        const politiciansToInsert: any[] = [];

        for (const item of membersData) {
            const electionName = item['선거명'];
            let type = 'local_council';

            if (electionName.includes('구·시·군의회의원')) {
                type = 'local_council';
            } else if (electionName.includes('시·도의회의원')) {
                type = 'metro_council';
            } else if (electionName.includes('구·시·군의 장')) {
                type = 'local_head'; // 기초단체장
            } else if (electionName.includes('시·도지사')) {
                type = 'metro_head'; // 광역단체장
            } else if (electionName.includes('교육감')) {
                type = 'metro_head'; // 교육감 -> 광역
            } else if (electionName.includes('교육의원')) {
                type = 'metro_council'; // 교육의원 -> 광역
            } else {
                continue;
            }

            politiciansToInsert.push({
                name: item['성명'],
                party: item['소속정당명'],
                type: type,
                cityProvince: item['시도명'],
                district: item['구시군명'],
                constituency: item['선거구명'],
                gender: item['성별'],
                birthDate: item['생년월일'],
                age: typeof item['연령'] === 'number' ? item['연령'] : parseInt(item['연령']) || 0,
                address: item['주소'],
                job: item['직업'],
                education: item['학력'],
                career1: item['경력1'],
                career2: item['경력2'],
                property: typeof item['재산신고액(천원)'] === 'number' ? item['재산신고액(천원)'] : parseInt(item['재산신고액(천원)']) || 0,
                taxArrears: typeof item['최근5년간체납액(천원)'] === 'number' ? item['최근5년간체납액(천원)'] : parseInt(item['최근5년간체납액(천원)']) || 0,
                criminalHistory: item['전과기록유무(건수)'],
                candidacyCount: item['입후보횟수'],
                profileImage: null,
                isActive: true
            });
        }

        if (politiciansToInsert.length > 0) {
            const chunkSize = 1000;
            for (let i = 0; i < politiciansToInsert.length; i += chunkSize) {
                const chunk = politiciansToInsert.slice(i, i + chunkSize);
                await db.insert(localCouncilMembers).values(chunk);
                console.log(`✅ ${i + chunk.length} / ${politiciansToInsert.length} 명 데이터 삽입 완료`);
            }
        }

        console.log("🎉 당선인 명부 상세 데이터 업로드 성공!");
        process.exit(0);
    } catch (err) {
        console.error("❌ 오류 발생:", err);
        process.exit(1);
    }
}

ingestLocalCouncil();
