import type { Express } from "express";
import { storage } from "./storage.js"; // Use storage interface which will use Supabase
import { db } from "./db.js";
import { localCouncilMembers } from "../shared/schema.js";
import { eq, and, ilike, sql } from "drizzle-orm";

export function registerLocalCouncilRoutes(app: Express) {
  // 지역별 기초의원 조회
  // 지역별 기초의원 조회
  app.get("/api/local-council/by-district", async (req, res) => {
    try {
      const cityProvince = req.query.cityProvince as string;
      const district = req.query.district as string;

      console.log(`🔍 기초의원 조회 - 시도: ${cityProvince}, 구시군: ${district}`);

      if (!cityProvince || cityProvince === '전체 지역' || cityProvince === '전체') {
        const members = await storage.getPoliticians('local', undefined, 5000);
        console.log(`✅ 전체 기초의원 ${members.length}명 조회 완료 (필터 없음)`);
        return res.json(members);
      }

      const members = await storage.getLocalCouncilMembers(cityProvince, district);
      console.log(`✅ 기초의원 ${members.length}명 조회 완료`);
      res.json(members);
    } catch (error) {
      console.error("❌ 기초의원 조회 오류:", error);
      res.status(500).json({ error: "기초의원 데이터 조회 중 오류가 발생했습니다." });
    }
  });

  // 기초의원 검색
  app.get("/api/local-council/search", async (req, res) => {
    try {
      const { query: searchQuery, cityProvince, district, party } = req.query;

      let conditions = [
        eq(localCouncilMembers.isActive, true),
        // eq(localCouncilMembers.type, 'local_council') // Assuming table only contains relevant or we filter types if needed. Schema says 'type'.
      ];

      if (searchQuery) conditions.push(ilike(localCouncilMembers.name, `%${searchQuery}%`));
      if (cityProvince) conditions.push(eq(localCouncilMembers.cityProvince, cityProvince as string));
      if (district) conditions.push(eq(localCouncilMembers.district, district as string));
      if (party) conditions.push(eq(localCouncilMembers.party, party as string));

      // Drizzle doesn't support array spread in where() nicely if array is empty?, actually and(...conditions) works.
      const members = await db.select()
        .from(localCouncilMembers)
        .where(and(...conditions))
        //.limit(50); // limit removed or kept?
        .limit(50);

      // Map to frontend expected structure if needed, or return as is.
      // Frontend expects: id, name, party, cityProvince, district, ward, etc.
      // Drizzle returns camelCase keys from schema.
      const mappedMembers = members.map(m => ({
        ...m,
        ward: m.constituency, // Mapping for frontend compatibility
        electedCount: m.candidacyCount,
        imageUrl: m.profileImage
      }));

      res.json(mappedMembers);
    } catch (error) {
      console.error("❌ 기초의원 검색 오류:", error);
      res.status(500).json({ error: "기초의원 검색 중 오류가 발생했습니다." });
    }
  });

  // 특정 기초의원 상세 정보
  app.get("/api/local-council/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

      const member = await storage.getPolitician(id, 'local');

      if (!member) {
        return res.status(404).json({ error: "기초의원을 찾을 수 없습니다." });
      }

      // Map fields for frontend compatibility
      const response = {
        ...member,
        ward: member.constituency,
        electedCount: member.candidacyCount,
        imageUrl: member.profileImage,
        region: member.cityProvince, // Frontend might check 'region'
        phone: member.contact || "", // Schema doesn't have phone? It has 'address', 'profileImage'. It doesn't seem to have phone.
        // wait, I don't see phone in schema.
      };

      res.json(response);
    } catch (error) {
      console.error("❌ 기초의원 상세 조회 오류:", error);
      res.status(500).json({ error: "기초의원 상세 정보 조회 중 오류가 발생했습니다." });
    }
  });

  // 정당별 기초의원 통계
  app.get("/api/local-council/stats/by-party", async (req, res) => {
    try {
      const { cityProvince, district } = req.query;

      let conditions = [eq(localCouncilMembers.isActive, true)];
      if (cityProvince && cityProvince !== '전체 지역' && cityProvince !== '전체') {
        conditions.push(eq(localCouncilMembers.cityProvince, cityProvince as string));
      }
      if (district && district !== '전체 지역' && district !== '전체') {
        conditions.push(eq(localCouncilMembers.district, district as string));
      }

      // Aggregate manually or via SQL
      const members = await db.select({
        party: localCouncilMembers.party,
        age: localCouncilMembers.age
      }).from(localCouncilMembers).where(and(...conditions));

      const partyStats: Record<string, { count: number, totalAge: number }> = {};
      members.forEach(m => {
        const party = m.party || '무소속';
        if (!partyStats[party]) partyStats[party] = { count: 0, totalAge: 0 };
        partyStats[party].count++;
        if (m.age) partyStats[party].totalAge += m.age;
      });

      const result = Object.entries(partyStats)
        .map(([party, stat]) => ({
          party,
          count: stat.count,
          avg_age: stat.count > 0 ? parseFloat((stat.totalAge / stat.count).toFixed(1)) : 0
        }))
        .sort((a, b) => b.count - a.count);

      res.json(result);
    } catch (error) {
      console.error("❌ 기초의원 정당별 통계 오류:", error);
      res.status(500).json({ error: "정당별 통계 조회 중 오류가 발생했습니다." });
    }
  });

  // 지역별 기초의원 통계
  app.get("/api/local-council/stats/by-region", async (req, res) => {
    try {
      const members = await db.select({
        cityProvince: localCouncilMembers.cityProvince,
        district: localCouncilMembers.district,
        age: localCouncilMembers.age,
        gender: localCouncilMembers.gender
      })
        .from(localCouncilMembers)
        .where(eq(localCouncilMembers.isActive, true))
        .limit(5000);

      const regionStats: Record<string, any> = {};

      members.forEach(m => {
        const key = `${m.cityProvince}|${m.district}`;
        if (!regionStats[key]) {
          regionStats[key] = {
            city_province: m.cityProvince,
            district: m.district,
            count: 0,
            totalAge: 0,
            female_count: 0,
            male_count: 0
          };
        }

        regionStats[key].count++;
        if (m.age) regionStats[key].totalAge += m.age;
        if (m.gender === '여' || m.gender === '여성') regionStats[key].female_count++;
        if (m.gender === '남' || m.gender === '남성') regionStats[key].male_count++;
      });

      const result = Object.values(regionStats)
        .map((stat: any) => ({
          ...stat,
          avg_age: stat.count > 0 ? parseFloat((stat.totalAge / stat.count).toFixed(1)) : 0
        }))
        .sort((a: any, b: any) => {
          if (a.city_province !== b.city_province) return a.city_province.localeCompare(b.city_province);
          return (a.district || "").localeCompare(b.district || "");
        });

      res.json(result);
    } catch (error) {
      console.error("❌ 기초의원 지역별 통계 오류:", error);
      res.status(500).json({ error: "지역별 통계 조회 중 오류가 발생했습니다." });
    }
  });
}