import "dotenv/config";
import { db } from "./server/db";
import { assemblyMembers } from "./shared/schema";
import { eq } from "drizzle-orm";

/**
 * 국회의원 상세 정보 업데이트 스크립트
 * 
 * 국회 Open API에서 의원 정보를 가져와서 DB를 업데이트합니다.
 * - 재선 여부 (REELE_GBN_NM)
 * - 당선 대수 (현재 21대)
 * - 주요 상임위원회 (CMIT_NM)
 * - 경력, 학력, 연락처 등
 */

const ASSEMBLY_API_KEY = process.env.ASSEMBLY_API_KEY;
const ASSEMBLY_API_URL = "https://open.assembly.go.kr/portal/openapi/nwvrqwxyaytdsfvhu";

interface AssemblyMemberData {
    HG_NM: string; // 한글명
    HJ_NM?: string; // 한자명
    ENG_NM?: string; // 영문명
    POLY_NM: string; // 정당명
    ORIG_NM: string; // 선거구
    CMIT_NM?: string; // 상임위원회
    CMITS?: string; // 전체 위원회
    REELE_GBN_NM?: string; // 재선구분 (초선, 재선, 3선 등)
    SEX_GBN_NM: string; // 성별
    TEL_NO?: string; // 전화번호
    E_MAIL?: string; // 이메일
    ASSEM_ADDR?: string; // 국회 사무실
    HOMEPAGE?: string; // 홈페이지
    STATUS_CD?: string; // 재직 상태
}

async function fetchAssemblyMembers(): Promise<AssemblyMemberData[]> {
    try {
        const url = `${ASSEMBLY_API_URL}?KEY=${ASSEMBLY_API_KEY}&Type=json&pIndex=1&pSize=300`;

        console.log("🌐 국회 Open API 호출 중...");
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`API 호출 실패: ${response.status}`);
        }

        const data = await response.json();
        const members = data.nwvrqwxyaytdsfvhu?.[1]?.row || [];

        console.log(`✅ ${members.length}명의 의원 정보를 가져왔습니다.`);
        return members;
    } catch (error) {
        console.error("❌ API 호출 오류:", error);
        return [];
    }
}

async function updateAssemblyMemberDetails() {
    try {
        console.log("🚀 국회의원 상세 정보 업데이트 시작\n");

        // 1. API에서 데이터 가져오기
        const apiMembers = await fetchAssemblyMembers();

        if (apiMembers.length === 0) {
            console.log("⚠️ API에서 데이터를 가져오지 못했습니다.");
            return;
        }

        // 2. DB의 모든 의원 조회
        const dbMembers = await db
            .select()
            .from(assemblyMembers)
            .where(eq(assemblyMembers.isActive, true));

        console.log(`📊 DB에 ${dbMembers.length}명의 의원이 있습니다.\n`);

        let updateCount = 0;
        let skipCount = 0;

        // 3. 각 의원 정보 업데이트
        for (const dbMember of dbMembers) {
            // API 데이터에서 해당 의원 찾기
            const apiMember = apiMembers.find(m => m.HG_NM === dbMember.name);

            if (!apiMember) {
                console.log(`⏭️  ${dbMember.name}: API 데이터 없음`);
                skipCount++;
                continue;
            }

            // 업데이트할 데이터 준비
            const updateData: any = {
                nameHanja: apiMember.HJ_NM || null,
                nameEng: apiMember.ENG_NM || null,
                electionTerm: "21대", // 현재 21대 국회
                reelectionStatus: apiMember.REELE_GBN_NM || "초선",
                mainCommittee: apiMember.CMIT_NM || dbMember.committee,
                committees: apiMember.CMITS || null,
                phoneNumber: apiMember.TEL_NO || null,
                email: apiMember.E_MAIL || null,
                officeRoom: apiMember.ASSEM_ADDR || null,
                homepage: apiMember.HOMEPAGE || null,
                status: apiMember.STATUS_CD || "재직",
                updatedAt: new Date(),
            };

            // DB 업데이트
            await db
                .update(assemblyMembers)
                .set(updateData)
                .where(eq(assemblyMembers.id, dbMember.id));

            console.log(`✅ ${dbMember.name} (${apiMember.REELE_GBN_NM || '초선'}, ${apiMember.CMIT_NM || '위원회 미정'})`);
            updateCount++;
        }

        console.log(`\n🎉 업데이트 완료!`);
        console.log(`   - 업데이트: ${updateCount}명`);
        console.log(`   - 스킵: ${skipCount}명`);

        process.exit(0);
    } catch (error) {
        console.error("❌ 오류 발생:", error);
        process.exit(1);
    }
}

updateAssemblyMemberDetails();
