
import { supabaseAdmin } from "./supabase";
import fs from 'fs';
import path from 'path';

export async function initializeAssemblyData() {
  console.log("🏛️ 국회의원 전체 데이터 초기화 시작...");

  const filePath = path.resolve(process.cwd(), 'attached_assets', '국회의원 인적사항_1753877375767.json');

  try {
    if (!fs.existsSync(filePath)) {
      console.warn("⚠️ 초기화할 국회의원 데이터 파일이 없습니다: ", filePath);
      return;
    }

    // Check if data exists
    const { count, error: countError } = await supabaseAdmin
      .from('assembly_members')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      console.warn("⚠️ 국회의원 테이블 확인 실패:", countError.message);
      return;
    }

    if (count && count > 0) {
      console.log(`🏛️ 이미 ${count}명의 국회의원 데이터가 존재합니다. 초기화를 건너뜁니다.`);
      return;
    }

    let fileContent = fs.readFileSync(filePath, 'utf-8');
    // Fix common JSON issues if ary
    fileContent = fileContent.replace(/:\s*NaN/g, ': null');

    const rawData = JSON.parse(fileContent);

    // Skip the first element which describes columns (headers)
    const membersData = rawData.slice(1);

    console.log(`📂 국회의원 파일 로드 완료: ${membersData.length}명의 데이터가 있습니다.`);

    // Helper to calculate age from birthdate (approximate)
    const calculateAge = (birthDateString: string) => {
      if (!birthDateString) return null;
      const year = parseInt(birthDateString.split('-')[0]);
      if (isNaN(year)) return null;
      return new Date().getFullYear() - year;
    };

    // Helper to parse election count (e.g., "초선" -> 1, "재선" -> 2, "3선" -> 3 ...)
    // Or extract from "UNITS" (e.g., "제21대, 제22대" -> count commas + 1)
    const parseElectionCount = (reelectionName: string) => {
      if (!reelectionName) return 1;
      if (reelectionName === '초선') return 1;
      if (reelectionName === '재선') return 2;
      const match = reelectionName.match(/(\d+)선/);
      return match ? parseInt(match[1]) : 1;
    };

    // Transform and Batch Insert
    const batchSize = 100;
    let successCount = 0;
    let failCount = 0;

    const allMembers = membersData.map((item: any) => ({
      name: item['HG_NM'],
      party: item['POLY_NM'],
      constituency: item['ORIG_NM'], // 지역구
      gender: item['SEX_GBN_NM'],
      office_room: item['ASSEM_ADDR'],
      phone_number: item['TEL_NO'],
      email: item['E_MAIL'],
      homepage: item['HOMEPAGE'] !== 'null' ? item['HOMEPAGE'] : null,

      // Mapped fields
      main_committee: item['CMIT_NM'],
      reelection_status: item['REELE_GBN_NM'], // 초선, 재선, 3선...
      election_count: parseElectionCount(item['REELE_GBN_NM']),

      // Derived/Default fields
      is_active: item['STATUS_CD'] === '060001', // Assuming 060001 is active status code based on data
      activity_score: 0, // Default
      attendance_rate: 0, // Default
      bills_proposed: 0, // Default
      bills_cosponsored: 0, // Default
      monthly_rank: null
    }));

    for (let i = 0; i < allMembers.length; i += batchSize) {
      const batch = allMembers.slice(i, i + batchSize);
      const { error } = await supabaseAdmin
        .from('assembly_members')
        .insert(batch);

      if (error) {
        console.error(`❌ 국회의원 배치 ${i / batchSize + 1} 실패:`, error.message);
        failCount += batch.length;
      } else {
        successCount += batch.length;
      }

      if ((i / batchSize) % 2 === 0) console.log(`... ${successCount}명 국회의원 처리 중`);
    }

    console.log(`✅ 국회의원 전체 데이터 초기화 완료: 성공 ${successCount}명, 실패 ${failCount}명`);

  } catch (error) {
    console.error("❌ 국회의원 데이터 초기화 중 치명적 오류:", error);
  }
}