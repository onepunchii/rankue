import "dotenv/config";
import fs from "fs";
import path from "path";
import { db } from "./server/db";
import { assemblyMembers } from "./shared/schema";
import { eq } from "drizzle-orm";

async function ingestPoliticians() {
    console.log("🏛️ 국회의원 상세 데이터 통합 인서트 시작...");

    const filePath = path.resolve(process.cwd(), 'attached_assets', '국회의원 인적사항_1753877375767.json');

    if (!fs.existsSync(filePath)) {
        console.error("❌ 파일을 찾을 수 없습니다:", filePath);
        process.exit(1);
    }

    try {
        const fileContent = fs.readFileSync(filePath, 'utf-8').replace(/:\s*NaN/g, ': null');
        const rawData = JSON.parse(fileContent);
        const membersData = Array.isArray(rawData) ? (rawData[0].HG_NM ? rawData : rawData.slice(1)) : [];

        console.log(`📂 로드된 데이터: ${membersData.length}명`);

        // Clear existing politicians
        console.log("🧹 기존 국회의원 데이터 삭제 중...");
        await db.delete(assemblyMembers);

        const politiciansToInsert: any[] = membersData.map((item: any) => {
            const origNm = item['ORIG_NM'] || "";
            const parts = origNm.split(" ");

            let region = null;
            let district = null;
            let constituency = origNm;

            if (origNm === "비례대표") {
                region = "비례대표";
            } else if (parts.length >= 1) {
                region = parts[0];
                district = parts.slice(1).join(" ");
            }

            return {
                name: item['HG_NM'],
                party: item['POLY_NM'],
                region: region,
                district: district,
                constituency: constituency,
                gender: item['SEX_GBN_NM'],
                birthDate: item['BTH_DATE'],
                committee: item['CMIT_NM'],
                polyImage: `https://www.assembly.go.kr/static/portal/img/open_data/member/${item['MONA_CD']}.jpg`,
                activityScore: 0,
                isActive: item['STATUS_CD'] === '060001' || true
            };
        });

        if (politiciansToInsert.length > 0) {
            await db.insert(assemblyMembers).values(politiciansToInsert);
            console.log(`✅ ${politiciansToInsert.length}명 국회의원 업로드 완료`);
        }

        console.log("🎉 국회의원 상세 데이터 업로드 성공!");
        process.exit(0);
    } catch (err) {
        console.error("❌ 오류 발생:", err);
        process.exit(1);
    }
}

ingestPoliticians();
