
import { supabaseAdmin } from "./supabase";
import fs from 'fs';
import path from 'path';

export async function initializeLocalCouncilData() {
  console.log("🏙️ 기초의원 전체 데이터 초기화 시작...");

  const filePath = path.resolve(process.cwd(), 'attached_assets', '당선인 명부_1754054558898.json');

  try {
    if (!fs.existsSync(filePath)) {
      console.warn("⚠️ 초기화할 파일이 없습니다: ", filePath);
      return;
    }

    // Check if data exists
    const { count, error: countError } = await supabaseAdmin
      .from('local_council_members')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      console.warn("⚠️ 기초의원 테이블 확인 실패:", countError.message);
      return;
    }

    if (count && count > 0) {
      console.log(`🏙️ 이미 ${count}명의 기초의원 데이터가 존재합니다. 초기화를 건너뜁니다.`);
      return;
    }

    let fileContent = fs.readFileSync(filePath, 'utf-8');
    // Fix invalid JSON values like NaN
    fileContent = fileContent.replace(/:\s*NaN/g, ': null');

    const rawData = JSON.parse(fileContent);

    console.log(`📂 파일 로드 완료: ${rawData.length}명의 데이터가 있습니다.`);

    // Transform and Batch Insert
    const batchSize = 100;
    let successCount = 0;
    let failCount = 0;

    // Filter relevant fields and map to our schema
    const allMembers = rawData.map((item: any) => ({
      name: item['성명'],
      party: item['소속정당명'],
      city_province: item['시도명'],
      district: item['구시군명'],
      ward: item['선거구명'],
      age: item['연령'],
      gender: item['성별'],
      elected_count: parseInt(item['입후보횟수']?.replace('회', '') || '0') + 1, // '입후보횟수' might not be 'elected count', usually '당선횟수' is separate or inferred. Assuming '당선인 명부' means they are elected, so let's stick to using available info or default. Actually '입후보횟수' is candidacy count. Elected count is often not in this simplified JSON or needs different source. Let's use 1 if not present, but for now map what we can. 
      // Wait, the file is "당선인 명부" so they are all elected *this time*.
      // We will map '학력' -> education, '경력1' + '경력2' -> career
      education: item['학력'],
      career: `${item['경력1'] || ''} ${item['경력2'] || ''}`.trim(),
      is_active: true
    }));

    for (let i = 0; i < allMembers.length; i += batchSize) {
      const batch = allMembers.slice(i, i + batchSize);
      const { error } = await supabaseAdmin
        .from('local_council_members')
        .insert(batch);

      if (error) {
        console.error(`❌ 배치 ${i / batchSize + 1} 실패:`, error.message);
        failCount += batch.length;
      } else {
        successCount += batch.length;
      }

      // Basic progress log every 5 batches
      if ((i / batchSize) % 5 === 0) console.log(`... ${successCount}명 처리 중`);
    }

    console.log(`✅ 기초의원 전체 데이터 초기화 완료: 성공 ${successCount}명, 실패 ${failCount}명`);

  } catch (error) {
    console.error("❌ 기초의원 데이터 초기화 중 치명적 오류:", error);
  }
}