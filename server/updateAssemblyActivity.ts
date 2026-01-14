import { db } from "./db.js";
import { assemblyMembers } from "../shared/schema.js";
import { batchCollectActivity } from "./assemblyApi.js";
import { eq, desc } from "drizzle-orm";

export async function updateAllMembersActivity() {
  try {
    console.log('🚀 국회의원 활동지수 업데이트 시작...');

    // 1. 현재 DB의 모든 국회의원 조회
    const members = await db.select({
      id: assemblyMembers.id,
      name: assemblyMembers.name
    }).from(assemblyMembers);

    console.log(`📋 총 ${members.length}명의 국회의원 발견`);

    // 2. 이름 목록 추출
    const memberNames = members.map(m => m.name);

    // 3. API를 통해 활동 정보 수집
    console.log('📊 국회 API를 통한 활동 정보 수집 시작...');
    const activities = await batchCollectActivity(memberNames, 1500);

    // 4. DB 업데이트
    console.log('💾 데이터베이스 업데이트 시작...');
    let updateCount = 0;

    for (const activity of activities) {
      try {
        const member = members.find(m => m.name === activity.name);
        if (!member) {
          console.warn(`⚠️  ${activity.name} 의원을 DB에서 찾을 수 없음`);
          continue;
        }

        await db.update(assemblyMembers)
          .set({
            billsProposed: activity.billsProposed,
            attendanceRate: activity.attendanceRate.toString(),
            activityScore: activity.activityScore
          })
          .where(eq(assemblyMembers.id, member.id));

        updateCount++;

        if (updateCount % 20 === 0) {
          console.log(`   ✓ ${updateCount}명 업데이트 완료...`);
        }

      } catch (error) {
        console.error(`❌ ${activity.name} 업데이트 실패:`, error);
      }
    }

    console.log(`✅ 활동지수 업데이트 완료: ${updateCount}명`);

    // 5. 상위 10명 출력
    const topMembers = await db.select({
      name: assemblyMembers.name,
      party: assemblyMembers.party,
      billsProposed: assemblyMembers.billsProposed,
      activityScore: assemblyMembers.activityScore
    })
      .from(assemblyMembers)
      .orderBy(desc(assemblyMembers.activityScore))
      .limit(10);

    console.log('\n🏆 활동지수 상위 10명:');
    topMembers.forEach((member, index) => {
      console.log(`   ${index + 1}. ${member.name} (${member.party}) - ${member.activityScore}점 (발의 ${member.billsProposed}건)`);
    });

    return {
      totalMembers: members.length,
      updatedMembers: updateCount,
      topMembers
    };

  } catch (error) {
    console.error('❌ 활동지수 업데이트 중 오류:', error);
    throw error;
  }
}

// 샘플 테스트용 함수
export async function updateSampleMembersActivity(sampleSize: number = 10) {
  try {
    console.log(`🧪 샘플 ${sampleSize}명 활동지수 테스트 업데이트 시작...`);

    const members = await db.select({
      id: assemblyMembers.id,
      name: assemblyMembers.name,
      party: assemblyMembers.party
    })
      .from(assemblyMembers)
      .limit(sampleSize);

    console.log('📋 선택된 샘플 의원:');
    members.forEach(m => console.log(`   - ${m.name} (${m.party})`));

    const memberNames = members.map(m => m.name);
    const activities = await batchCollectActivity(memberNames, 2000);

    let updateCount = 0;
    for (const activity of activities) {
      const member = members.find(m => m.name === activity.name);
      if (member) {
        await db.update(assemblyMembers)
          .set({
            billsProposed: activity.billsProposed,
            attendanceRate: activity.attendanceRate.toString(),
            activityScore: activity.activityScore
          })
          .where(eq(assemblyMembers.id, member.id));

        updateCount++;
        console.log(`   ✓ ${activity.name}: ${activity.activityScore}점 (발의 ${activity.billsProposed}건)`);
      }
    }

    console.log(`✅ 샘플 업데이트 완료: ${updateCount}명`);
    return { updatedMembers: updateCount, activities };

  } catch (error) {
    console.error('❌ 샘플 업데이트 중 오류:', error);
    throw error;
  }
}