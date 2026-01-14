
import type { Express } from "express";
import { storage } from "./storage.js";
import { generatePoliticianPersona } from "./ai.js";
import { z } from "zod";
import { insertAssemblyMemberSchema } from "../shared/schema.js";
import { updateSampleMembersActivity, updateAllMembersActivity } from "./updateAssemblyActivity.js";
import fs from "fs";
import path from "path";

export function registerAssemblyRoutes(app: Express) {
  // 국회의원 랭킹 API (순서 중요: :id 보다 먼저 와야 함)
  app.get("/api/assembly/rankings", async (req, res) => {
    // Cache for 5 minutes
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
    try {
      const allMembers = await storage.getAssemblyMembers(300);

      // 활동지수 랭킹 (내림차순)
      const activityRanking = [...allMembers]
        .sort((a, b) => (b.activityScore || 0) - (a.activityScore || 0))
        .slice(0, 50);

      // 법안발의 랭킹 (내림차순)
      const billsRanking = [...allMembers]
        .sort((a, b) => (b.billsProposed || 0) - (a.billsProposed || 0))
        .slice(0, 50);

      // 출석률 랭킹 (내림차순)
      const attendanceRanking = [...allMembers]
        .sort((a, b) => {
          const rateA = a.attendanceRate ? Number(a.attendanceRate) : 0;
          const rateB = b.attendanceRate ? Number(b.attendanceRate) : 0;
          const validRateA = isNaN(rateA) ? 0 : rateA;
          const validRateB = isNaN(rateB) ? 0 : rateB;
          return validRateB - validRateA;
        })
        .slice(0, 50);

      res.json({
        activityRanking,
        billsRanking,
        attendanceRanking
      });
    } catch (error) {
      console.error("Error fetching assembly rankings:", error);
      res.status(500).json({ message: "Failed to fetch assembly rankings" });
    }
  });

  // 월간 챔피언 API (순서 중요: :id 보다 먼저 와야 함)
  app.get("/api/assembly/monthly-champion", async (req, res) => {
    try {
      const allMembers = await storage.getAssemblyMembers(300);
      if (allMembers.length === 0) {
        return res.json(null);
      }
      const monthlyChampion = allMembers.reduce((champion, member) =>
        (member.activityScore || 0) > (champion.activityScore || 0) ? member : champion
      );

      res.json(monthlyChampion);
    } catch (error) {
      console.error("Error fetching monthly champion:", error);
      res.status(500).json({ message: "Failed to fetch monthly champion" });
    }
  });

  // 추천 국회의원/상위 국회의원 정보를 JSON에서 조회하는 API
  app.get("/api/assembly/top-member-info", async (req, res) => {
    // Cache for 5 minutes
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
    try {
      console.log('🔍 /api/assembly/top-member-info 요청 받음');

      // 1. 현재 랭킹 1위 조회 (활동 지수 기준)
      const allMembers = await storage.getAssemblyMembers(300);
      if (!allMembers || allMembers.length === 0) {
        console.log('⚠️ 국회의원 데이터가 없습니다.');
        return res.json(null);
      }

      const topMember = allMembers.reduce((champion, member) =>
        (member.activityScore || 0) > (champion.activityScore || 0) ? member : champion
      );
      console.log('🏆 현재 1위:', topMember.name);

      // 2. 당선인 명부 JSON 파일 읽기 (attached_assets 폴더)
      const jsonPath = path.join(process.cwd(), "attached_assets", "당선인 명부_1754054558898.json");
      console.log('📂 JSON 경로:', jsonPath);

      if (!fs.existsSync(jsonPath)) {
        console.warn("⚠️ 당선인 명부 파일이 없습니다. 기본 데이터를 반환합니다.");
        return res.json({
          name: topMember.name,
          party: topMember.party,
          constituency: topMember.constituency
        });
      }

      const fileContent = fs.readFileSync(jsonPath, "utf-8");
      const jsonData = JSON.parse(fileContent);

      // 3. 성명 및 정당으로 매칭되는 데이터 찾기 (동명이인 방지)
      const biography = jsonData.find((item: any) =>
        item.성명 === topMember.name &&
        item.소속정당명 === topMember.party
      );

      if (biography) {
        console.log('✅ JSON 매칭 성공:', biography.성명);
        res.json({
          name: biography.성명,
          party: biography.소속정당명,
          constituency: biography.선거구명,
          district: biography.구시군명,
          age: biography.연령
        });
      } else {
        console.log('ℹ️ JSON 매칭 실패 (DB 데이터 반환)');
        res.json({
          name: topMember.name,
          party: topMember.party,
          constituency: topMember.constituency
        });
      }
    } catch (error) {
      console.error("❌ /api/assembly/top-member-info 오류:", error);
      res.status(500).json({ message: "Failed to fetch top member info" });
    }
  });

  // 국회의원 목록 조회 (활동 점수순)
  app.get("/api/assembly/members", async (req, res) => {
    try {
      const limit = Number(req.query.limit) || 50;
      const members = await storage.getAssemblyMembers(limit);
      res.json(members);
    } catch (error) {
      console.error("Error fetching assembly members:", error);
      res.status(500).json({ message: "Failed to fetch assembly members" });
    }
  });

  // 국회 ON 대시보드 통계 데이터 (이 라우트를 :id 보다 먼저 배치)
  app.get("/api/assembly/dashboard-stats", async (req, res) => {
    // Cache for 60 seconds to reduce DB load
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=30');
    try {
      const [allMembers, topMembers] = await Promise.all([
        storage.getAssemblyMembers(300), // 전체 국회의원
        storage.getTopAssemblyMembersByActivity(10)
      ]);

      // 기본 통계 계산
      const totalMembers = allMembers.length;
      const averageActivityScore = allMembers.reduce((sum, member) => sum + (member.activityScore || 0), 0) / totalMembers;
      const averageAttendanceRate = allMembers.reduce((sum, member) => {
        const rate = member.attendanceRate ? Number(member.attendanceRate) : 0;
        return sum + (isNaN(rate) ? 0 : rate);
      }, 0) / totalMembers;

      // 정당별 통계
      const partyStats = allMembers.reduce((acc, member) => {
        const party = member.party || '무소속';
        if (!acc[party]) {
          acc[party] = { count: 0, totalActivity: 0 };
        }
        acc[party].count++;
        acc[party].totalActivity += (member.activityScore || 0);
        return acc;
      }, {} as Record<string, { count: number; totalActivity: number }>);

      // 이번 달 활동 챔피언 (임시로 최고 활동 점수 기준)
      const monthlyChampion = allMembers.reduce((champion, member) =>
        (member.activityScore || 0) > (champion.activityScore || 0) ? member : champion
      );

      res.json({
        basicStats: {
          totalMembers,
          averageActivityScore: Math.round(averageActivityScore),
          averageAttendanceRate: Math.round(averageAttendanceRate * 100) / 100,
          activeMembers: allMembers.filter(m => (m.activityScore || 0) > 50).length
        },
        partyStats,
        topMembers: topMembers.slice(0, 5),
        monthlyChampion,
        recentActivities: await storage.getAssemblyActivities()
      });
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  // 특정 국회의원 상세 정보 조회
  app.get("/api/assembly/members/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);

      // Validate ID is a valid number
      if (isNaN(id) || !isFinite(id) || id <= 0) {
        return res.status(400).json({ message: "Invalid assembly member ID" });
      }

      const member = await storage.getAssemblyMember(id);
      if (!member) {
        return res.status(404).json({ message: "Assembly member not found" });
      }
      res.json(member);
    } catch (error) {
      console.error("Error fetching assembly member:", error);
      res.status(500).json({ message: "Failed to fetch assembly member" });
    }
  });

  // 지역구별 국회의원 API (프로필 기반 지원) - 이 라우트는 :id 보다 먼저 와야 함
  app.get("/api/assembly/by-district", async (req, res) => {
    try {
      const q = req.query;
      const district = q.district as string;
      const cityProvince = q.cityProvince as string;
      const constituency = q.constituency as string;

      const allMembers = await storage.getAssemblyMembers(300);

      console.log(`🏛️ 국회의원 조회 - 지역구: ${district}, 시도: ${cityProvince}, 선거구: ${constituency}`);

      let filteredMembers = allMembers;

      const isAllRegion = !cityProvince || cityProvince === '전체 지역' || cityProvince === '전체';
      const isAllDistrict = !district || district === '전체 지역' || district === '전체';

      if (constituency && constituency !== '전체') {
        filteredMembers = allMembers.filter(member =>
          member.constituency?.includes(constituency)
        );
      } else if (!isAllRegion && cityProvince) {
        const simplifiedCity = cityProvince.replace('특별시', '').replace('광역시', '').replace('특별자치시', '').replace('도', '');

        if (!isAllDistrict && district) {
          const simplifiedDistrict = district.replace('구', '').replace('시', '').replace('군', '');
          filteredMembers = allMembers.filter(member => {
            const mConstituency = member.constituency || '';
            return mConstituency.includes(simplifiedCity) && mConstituency.includes(simplifiedDistrict);
          });
        } else {
          filteredMembers = allMembers.filter(member =>
            member.constituency?.includes(simplifiedCity) || member.constituency?.includes(cityProvince)
          );
        }
      } else if (!isAllDistrict && district) {
        const simplifiedDistrict = district.replace('특별시', '').replace('광역시', '').replace('특별자치시', '').replace('도', '').replace('구', '').replace('시', '').replace('군', '');
        filteredMembers = allMembers.filter(member =>
          member.constituency?.includes(simplifiedDistrict) || member.constituency?.includes(district)
        );
      }

      filteredMembers.sort((a, b) => (b.activityScore || 0) - (a.activityScore || 0));

      console.log(`🏛️ 최종 결과: ${filteredMembers.length}명 조회 완료`);
      res.json(filteredMembers);
    } catch (error: any) {
      console.error("Error fetching assembly members by district:", error);
      res.status(500).json({ message: "Failed to fetch assembly members by district" });
    }
  });

  // 특정 국회의원 상세 정보 조회 (단축 URL)
  app.get("/api/assembly/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);

      // Validate ID is a valid number
      if (isNaN(id) || !isFinite(id) || id <= 0) {
        return res.status(400).json({ message: "Invalid assembly member ID" });
      }

      const member = await storage.getAssemblyMember(id);
      if (!member) {
        return res.status(404).json({ message: "Assembly member not found" });
      }
      res.json(member);
    } catch (error) {
      console.error("Error fetching assembly member:", error);
      res.status(500).json({ message: "Failed to fetch assembly member" });
    }
  });

  // 지역구별 국회의원 조회
  app.get("/api/assembly/members/constituency/:constituency", async (req, res) => {
    try {
      const constituency = req.params.constituency;
      const members = await storage.getAssemblyMembersByConstituency(constituency);
      res.json(members);
    } catch (error) {
      console.error("Error fetching members by constituency:", error);
      res.status(500).json({ message: "Failed to fetch members by constituency" });
    }
  });

  // 활동 지수 상위 국회의원 조회
  app.get("/api/assembly/top-active", async (req, res) => {
    try {
      const limit = Number(req.query.limit) || 10;
      const topMembers = await storage.getTopAssemblyMembersByActivity(limit);
      res.json(topMembers);
    } catch (error) {
      console.error("Error fetching top active members:", error);
      res.status(500).json({ message: "Failed to fetch top active members" });
    }
  });

  // 국회의원 활동 기록 조회
  app.get("/api/assembly/activities", async (req, res) => {
    try {
      const memberId = req.query.memberId ? Number(req.query.memberId) : undefined;
      const activities = await storage.getAssemblyActivities(memberId);
      res.json(activities);
    } catch (error) {
      console.error("Error fetching assembly activities:", error);
      res.status(500).json({ message: "Failed to fetch assembly activities" });
    }
  });



  // 국회의원 등록 (관리자 전용)
  app.post("/api/assembly/members", async (req, res) => {
    try {
      const memberData = insertAssemblyMemberSchema.parse(req.body);
      const newMember = await storage.createAssemblyMember(memberData);
      res.json(newMember);
    } catch (error) {
      console.error("Error creating assembly member:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid member data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create assembly member" });
    }
  });

  // 국회의원 활동 지수 업데이트 (관리자 전용)
  app.patch("/api/assembly/members/:id/activity", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const activityData = req.body;
      const updatedMember = await storage.updateAssemblyMemberActivity(id, activityData);
      res.json(updatedMember);
    } catch (error) {
      console.error("Error updating member activity:", error);
      res.status(500).json({ message: "Failed to update member activity" });
    }
  });

  // 활동지수 업데이트 API (샘플 10명)
  app.post("/api/assembly/update-activity-sample", async (req, res) => {
    try {
      console.log('🧪 샘플 활동지수 업데이트 요청 받음');
      const result = await updateSampleMembersActivity(10);
      res.json({
        message: "샘플 활동지수 업데이트 완료",
        ...result
      });
    } catch (error) {
      console.error("Error updating sample activity:", error);
      res.status(500).json({ message: "Failed to update sample activity" });
    }
  });

  // 전체 활동지수 업데이트 API (전체 298명)
  app.post("/api/assembly/update-activity-all", async (req, res) => {
    try {
      console.log('🚀 전체 활동지수 업데이트 요청 받음');
      const result = await updateAllMembersActivity();
      res.json({
        message: "전체 활동지수 업데이트 완료",
        ...result
      });
    } catch (error) {
      console.error("Error updating all activity:", error);
      res.status(500).json({ message: "Failed to update all activity" });
    }
  });

  // 발의법률안 API (임시 데이터)
  app.get("/api/assembly/bills", async (req, res) => {
    try {
      // 실제 구현에서는 국회 OPEN API나 데이터베이스에서 가져올 예정
      const sampleBills = [
        {
          id: 1,
          title: "디지털플랫폼 공정화에 관한 법률 일부개정법률안",
          proposer: "이재명",
          party: "더불어민주당",
          constituency: "경기 성남시분당구갑",
          committee: "과학기술정보방송통신위원회",
          status: "심사중",
          proposalDate: "2024-11-15",
          billNumber: "2117890",
          category: "과학기술정보통신"
        },
        {
          id: 2,
          title: "소상공인 보호 및 지원에 관한 법률 일부개정법률안",
          proposer: "한동훈",
          party: "국민의힘",
          constituency: "서울 동작구을",
          committee: "중소벤처기업위원회",
          status: "발의",
          proposalDate: "2024-11-10",
          billNumber: "2117845",
          category: "중소벤처기업"
        },
        {
          id: 3,
          title: "근로기준법 일부개정법률안",
          proposer: "정진석",
          party: "국민의힘",
          constituency: "서울 종로구",
          committee: "환경노동위원회",
          status: "통과",
          proposalDate: "2024-10-28",
          billNumber: "2117621",
          category: "환경노동"
        }
      ];

      res.json(sampleBills);
    } catch (error) {
      console.error("Error fetching bills:", error);
      res.status(500).json({ message: "Failed to fetch bills" });
    }
  });

  // 국회의원 데이터 업데이트 API (관리자 전용)
  app.post("/api/assembly/update-members", async (req, res) => {
    try {
      const jsonData = req.body;

      if (!Array.isArray(jsonData)) {
        return res.status(400).json({ message: "Invalid data format. Expected array." });
      }

      console.log(`🏛️ 국회의원 데이터 업데이트 시작: ${jsonData.length}명`);

      let successCount = 0;
      let errorCount = 0;

      for (const memberData of jsonData) {
        try {
          const birthYear = parseInt(memberData.BTH_DATE?.substring(0, 4) || "1970");
          const age = new Date().getFullYear() - birthYear;

          const activityScore = Math.floor(Math.random() * 40) + 60; // 60-100 사이
          const billsProposed = Math.floor(Math.random() * 15) + 5; // 5-20 사이
          const attendanceRate = (Math.random() * 0.2 + 0.8).toFixed(2); // 80-100% 사이

          const assemblyMember = {
            name: memberData.HG_NM,
            nameHanja: memberData.HJ_NM || null,
            nameEng: memberData.ENG_NM || null,
            party: memberData.POLY_NM,
            constituency: memberData.ORIG_NM,
            mainCommittee: memberData.CMIT_NM || null,
            committees: memberData.CMITS || null,
            gender: memberData.SEX_GBN_NM,
            phoneNumber: memberData.TEL_NO || null,
            officeRoom: memberData.ASSEM_ADDR || null,
            email: memberData.E_MAIL || null,
            homepage: memberData.HOMEPAGE || null,
            status: memberData.STATUS_CD || "재직",
            reelectionStatus: memberData.REELE_GBN_NM || "1선",
            activityScore: activityScore,
            billsProposed: billsProposed,
            attendanceRate: attendanceRate,
            education: null
          };

          const existingMember = await storage.getAssemblyMemberByName(memberData.HG_NM);

          if (existingMember) {
            await storage.updateAssemblyMember(existingMember.id, assemblyMember);
            console.log(`✅ 업데이트: ${memberData.HG_NM} (${memberData.POLY_NM})`);
          } else {
            await storage.createAssemblyMember(assemblyMember);
            console.log(`🆕 생성: ${memberData.HG_NM} (${memberData.POLY_NM})`);
          }

          successCount++;
        } catch (error) {
          console.error(`❌ ${memberData.HG_NM} 처리 실패:`, error);
          errorCount++;
        }
      }

      console.log(`🏛️ 국회의원 데이터 업데이트 완료: 성공 ${successCount}명, 실패 ${errorCount}명`);

      res.json({
        message: "국회의원 데이터 업데이트 완료",
        successCount,
        errorCount
      });
    } catch (error) {
      console.error("Error updating assembly members:", error);
      res.status(500).json({ message: "Failed to update assembly members" });
    }
  });
}