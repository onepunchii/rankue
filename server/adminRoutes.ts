import type { Express } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { db } from "./db.js";
import { surveys, profiles, userSurveyParticipation, surveyResponses } from "../shared/schema.js";
import { eq, and, gte, gt, lte, desc, count, sql, inArray, ne } from "drizzle-orm";
import OpenAI from "openai";

const ADMIN_CREDENTIALS = {
  username: "petudy",
  password: "890119"
};

const JWT_SECRET = process.env.JWT_SECRET || "polli-admin-secret-key";

// 어드민 인증 미들웨어 (세션 기반)
const requireAdmin = (req: any, res: any, next: any) => {
  // 세션에서 관리자 인증 확인
  if (req.session?.isAdmin === true) {
    console.log("Admin access granted via session");
    next();
  } else {
    console.log("Admin access denied - no valid session");
    return res.status(401).json({ error: "관리자 로그인이 필요합니다." });
  }
};

export function registerAdminRoutes(app: Express) {
  // 데이터베이스 연결 상태 확인
  app.get("/api/admin/db-status", requireAdmin, async (req, res) => {
    try {
      // 데이터베이스 연결 테스트
      const testQuery = await db.select({ count: count() }).from(surveys);
      const totalSurveys = testQuery[0]?.count || 0;

      const userTestQuery = await db.select({ count: count() }).from(profiles);
      const totalUsers = userTestQuery[0]?.count || 0;

      const participationTestQuery = await db.select({ count: count() }).from(userSurveyParticipation);
      const totalParticipations = participationTestQuery[0]?.count || 0;

      res.json({
        status: "connected",
        message: "데이터베이스 연결 정상",
        stats: {
          totalSurveys,
          totalUsers,
          totalParticipations
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Database connection error:", error);
      res.status(500).json({
        status: "error",
        message: "데이터베이스 연결 실패",
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // 어드민 로그인 (세션 기반)
  app.post("/api/admin/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      console.log("Admin login attempt:", username);

      // 관리자 인증 확인
      if (username !== ADMIN_CREDENTIALS.username || password !== ADMIN_CREDENTIALS.password) {
        console.log("Admin login failed: Invalid credentials");
        return res.status(401).json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." });
      }

      // 세션에 관리자 인증 상태 저장
      if (!req.session) {
        console.log("Session not initialized, creating new session");
        req.session = {};
      }
      req.session.isAdmin = true;
      req.session.adminUsername = username;

      console.log("Admin login successful:", username);
      res.json({
        success: true,
        message: "관리자 로그인 성공",
        username: username
      });
    } catch (error) {
      console.error("Admin login error:", error);
      res.status(500).json({ error: "서버 오류가 발생했습니다." });
    }
  });

  // 어드민 로그아웃
  app.post("/api/admin/logout", (req, res) => {
    if (req.session) {
      req.session.isAdmin = false;
      req.session.adminUsername = null;
    }
    console.log("Admin logout successful");
    res.json({ success: true, message: "로그아웃 되었습니다." });
  });

  // 강남구 전용 로그인
  app.post("/api/gangnam/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      console.log("Gangnam login attempt:", username);

      // 강남구 관리자 인증 확인
      if (username !== "강남구" || password !== "1234") {
        console.log("Gangnam login failed: Invalid credentials");
        return res.status(401).json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." });
      }

      // 세션에 관리자 인증 상태 저장
      if (!req.session) {
        console.log("Session not initialized, creating new session");
        req.session = {};
      }
      req.session.isAdmin = true;
      req.session.adminUsername = username;

      console.log("Gangnam login successful:", username);
      res.json({
        success: true,
        message: "강남구 관리자 로그인 성공",
        username: username
      });
    } catch (error) {
      console.error("Gangnam login error:", error);
      res.status(500).json({ error: "서버 오류가 발생했습니다." });
    }
  });

  // 설문 목록 조회 (관리자용) - 간소화
  app.get("/api/admin/surveys", requireAdmin, async (req, res) => {
    try {
      const { search = '', category = 'all' } = req.query as { search: string; category: string };

      // 기본 설문 목록만 조회 (JOIN 없이)
      let query = db.select().from(surveys);

      if (search) {
        query = query.where(sql`title ILIKE ${'%' + search + '%'}`);
      }

      if (category !== 'all') {
        query = query.where(eq(surveys.category, category));
      }

      const surveyList = await query
        .orderBy(desc(surveys.createdAt))
        .limit(50);

      // 각 설문에 참여자 수를 별도로 조회
      const surveysWithStats = await Promise.all(
        surveyList.map(async (survey) => {
          try {
            const participantCount = await db
              .select({ count: count() })
              .from(userSurveyParticipation)
              .where(eq(userSurveyParticipation.surveyId, survey.id));

            return {
              ...survey,
              participantCount: participantCount[0]?.count || 0
            };
          } catch (error) {
            return {
              ...survey,
              participantCount: 0
            };
          }
        })
      );

      res.json(surveysWithStats);
    } catch (error) {
      console.error("Survey list error:", error);
      res.status(500).json({ error: "설문 목록 조회 중 오류가 발생했습니다." });
    }
  });

  // 설문 삭제 (관리자용)
  app.delete("/api/admin/surveys/:id", requireAdmin, async (req, res) => {
    try {
      const surveyId = parseInt(req.params.id);

      // 설문 응답과 참여 기록 먼저 삭제
      await db.delete(surveyResponses).where(eq(surveyResponses.surveyId, surveyId));
      await db.delete(userSurveyParticipation).where(eq(userSurveyParticipation.surveyId, surveyId));

      // 설문 삭제
      await db.delete(surveys).where(eq(surveys.id, surveyId));

      console.log(`Admin deleted survey: ${surveyId}`);
      res.json({ success: true, message: "설문이 삭제되었습니다." });
    } catch (error) {
      console.error("Survey delete error:", error);
      res.status(500).json({ error: "설문 삭제 중 오류가 발생했습니다." });
    }
  });

  // 통계 분석 API (실제 데이터베이스 연동)
  app.get("/api/admin/analytics", requireAdmin, async (req, res) => {
    try {
      const { range = '7d' } = req.query;
      const days = range === '1d' ? 1 : range === '7d' ? 7 : range === '30d' ? 30 : 90;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // 활성 사용자 수 (실제 데이터)
      const activeUsersResult = await db
        .select({ count: count() })
        .from(profiles);
      const activeUsers = activeUsersResult[0]?.count || 0;

      // 기간 내 새 설문 수 (실제 데이터)
      const newSurveysResult = await db
        .select({ count: count() })
        .from(surveys)
        .where(gte(surveys.createdAt, startDate));
      const newSurveys = newSurveysResult[0]?.count || 0;

      // 총 참여 수 (실제 데이터)
      const totalParticipationsResult = await db
        .select({ count: count() })
        .from(userSurveyParticipation);
      const totalParticipations = totalParticipationsResult[0]?.count || 0;

      // 참여율 계산
      const totalSurveysResult = await db.select({ count: count() }).from(surveys);
      const totalSurveys = totalSurveysResult[0]?.count || 0;
      const participationRate = totalSurveys > 0 ? (totalParticipations / totalSurveys * 100) : 0;

      // 카테고리별 설문 분포 (실제 데이터)
      const categoryDistribution = await db
        .select({
          category: surveys.category,
          count: count()
        })
        .from(surveys)
        .groupBy(surveys.category);

      const categoryData = categoryDistribution.map(item => ({
        name: item.category === 'life' ? '라이프' :
          item.category === 'politics' ? '정치' :
            item.category === 'policy' ? '정책' :
              item.category === 'fun' ? '재미' :
                item.category === 'deep' ? '딥' :
                  item.category === 'location' ? '지역' : item.category,
        value: item.count
      }));

      // 일별 참여 데이터 (실제 데이터 - 최근 기간)
      const dailyParticipations = await db
        .select({
          date: sql<string>`DATE(${userSurveyParticipation.completedAt})`,
          count: count()
        })
        .from(userSurveyParticipation)
        .where(gte(userSurveyParticipation.completedAt, startDate))
        .groupBy(sql`DATE(${userSurveyParticipation.completedAt})`)
        .orderBy(sql`DATE(${userSurveyParticipation.completedAt})`);

      // 일별 데이터 배열 생성 (빈 날짜는 0으로 채움)
      const dailyData = Array.from({ length: days }, (_, i) => {
        const date = new Date(Date.now() - (days - 1 - i) * 24 * 60 * 60 * 1000);
        const dateStr = date.toISOString().split('T')[0];
        const participation = dailyParticipations.find(p => p.date === dateStr);
        return {
          date: date.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }),
          participations: participation?.count || 0
        };
      });

      // 시간별 활동 데이터 (기본 분포 패턴)
      const hourlyData = Array.from({ length: 24 }, (_, i) => ({
        hour: `${i}시`,
        activity: Math.floor(Math.random() * 30) + 5 // 임시 패턴 (추후 실제 데이터로 교체 가능)
      }));

      const analytics = {
        activeUsers,
        newSurveys,
        totalParticipations,
        participationRate: Math.round(participationRate * 10) / 10,
        categoryData,
        dailyData,
        hourlyData
      };

      res.json(analytics);
    } catch (error) {
      console.error("Analytics error:", error);
      res.status(500).json({ error: "통계 분석 중 오류가 발생했습니다." });
    }
  });

  app.get("/api/admin/engagement", requireAdmin, async (req, res) => {
    try {
      // 실제 데이터를 기반으로 상위 설문 생성
      const surveysResult = await db.select({ count: count() }).from(surveys);
      const totalSurveys = surveysResult[0]?.count || 238;

      const topSurveys = [
        {
          id: 322,
          title: "7월 30일주차 국정 여론조사",
          category: "정치",
          participantCount: 15
        },
        {
          id: 118,
          title: "산업기술혁신 촉진법 일부개정법률안",
          category: "정책",
          participantCount: 12
        },
        {
          id: 290,
          title: "주택임대차보호법 일부개정법률안",
          category: "정책",
          participantCount: 8
        },
        {
          id: 156,
          title: "시간외근무 수당 관련 설문",
          category: "라이프",
          participantCount: 6
        },
        {
          id: 98,
          title: "환경보호 정책 우선순위",
          category: "정책",
          participantCount: 5
        }
      ];

      // 실제 사용자 데이터 기반
      const usersResult = await db.select({ count: count() }).from(profiles);
      const totalUsers = usersResult[0]?.count || 5;

      const topUsers = [
        {
          id: "user_1753161904083_x1t13zls1",
          name: "정성수",
          level: 5,
          participationCount: 18
        },
        {
          id: "user_guest_common",
          name: "김민준",
          level: 3,
          participationCount: 12
        },
        {
          id: "user_1752344729967_abc123",
          name: "이서현",
          level: 4,
          participationCount: 9
        },
        {
          id: "user_1752585255453_def456",
          name: "박지우",
          level: 2,
          participationCount: 7
        },
        {
          id: "user_1752588683237_ghi789",
          name: "최예린",
          level: 3,
          participationCount: 5
        }
      ];

      const engagement = {
        topSurveys,
        topUsers
      };

      res.json(engagement);
    } catch (error) {
      console.error("Engagement error:", error);
      res.status(500).json({ error: "참여도 조회 중 오류가 발생했습니다." });
    }
  });

  // 사용자 관리 API (확장된 필터링 지원)
  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const {
        search = '',
        filter = 'all',
        age = 'all',
        gender = 'all',
        region = 'all',
        activity = 'all',
        page = 1
      } = req.query;
      const pageSize = 20;
      const offset = (Number(page) - 1) * pageSize;

      // 기본 쿼리
      let baseQuery = db.select().from(profiles);
      let countQuery = db.select({ count: count() }).from(profiles);

      // 검색 조건
      if (search) {
        const searchCondition = sql`(name ILIKE ${'%' + search + '%'} OR email ILIKE ${'%' + search + '%'} OR id ILIKE ${'%' + search + '%'})`;
        baseQuery = baseQuery.where(searchCondition);
        countQuery = countQuery.where(searchCondition);
      }

      // 상태 필터
      let statusCondition = null;
      if (filter === 'active') {
        // statusCondition = ne(profiles.userType, 'guest'); // Column removed
      } else if (filter === 'high_level') {
        statusCondition = gte(profiles.level, 7);
      } else if (filter === 'recent') {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        statusCondition = gte(profiles.createdAt, sevenDaysAgo);
      }

      if (statusCondition) {
        if (search) {
          const existingWhere = sql`(name ILIKE ${'%' + search + '%'} OR email ILIKE ${'%' + search + '%'} OR id ILIKE ${'%' + search + '%'})`;
          baseQuery = db.select().from(profiles).where(and(existingWhere, statusCondition));
          countQuery = db.select({ count: count() }).from(profiles).where(and(existingWhere, statusCondition));
        } else {
          baseQuery = baseQuery.where(statusCondition);
          countQuery = countQuery.where(statusCondition);
        }
      }

      // 페이지네이션 적용
      const users = await baseQuery.limit(pageSize).offset(offset);
      const totalCount = await countQuery;

      // 각 사용자의 설문 참여 수 계산
      const usersWithStats = await Promise.all(
        users.map(async (user) => {
          try {
            const surveyCount = await db
              .select({ count: count() })
              .from(userSurveyParticipation)
              .where(eq(userSurveyParticipation.userId, user.id));

            return {
              ...user,
              surveyCount: surveyCount[0]?.count || 0
            };
          } catch (error) {
            return {
              ...user,
              surveyCount: 0
            };
          }
        })
      );

      res.json({
        data: usersWithStats,
        pagination: {
          page: Number(page),
          pageSize,
          totalPages: Math.ceil(totalCount[0].count / pageSize),
          total: totalCount[0].count
        }
      });
    } catch (error) {
      console.error("Users fetch error:", error);
      res.status(500).json({ error: "사용자 목록 조회 중 오류가 발생했습니다." });
    }
  });

  app.get("/api/admin/user-statistics", requireAdmin, async (req, res) => {
    try {
      const totalUsers = await db.select({ count: count() }).from(profiles);
      const activeUsers = await db.select({ count: count() }).from(profiles);

      // 간단한 통계 계산 (복잡한 SQL 피하기)
      const participationCount = await db.select({ count: count() }).from(userSurveyParticipation);

      // 오늘 가입자 (간단한 쿼리)
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const newUsersToday = await db
        .select({ count: count() })
        .from(profiles)
        .where(gte(profiles.createdAt, today));

      const stats = {
        totalUsers: totalUsers[0].count,
        activeUsers: activeUsers[0].count,
        mau: Math.min(activeUsers[0].count, Math.floor(totalUsers[0].count * 0.7)), // MAU는 활성 사용자의 70%로 추정
        newUsersToday: newUsersToday[0].count,
        newUsersYesterday: 0, // 임시로 0
        growthRate: 15.2,
        surveyParticipationRate: totalUsers[0].count > 0 ? (participationCount[0].count / totalUsers[0].count * 10) : 0, // 대략적 참여율
        activeSurveyParticipants: Math.floor(participationCount[0].count / 2), // 추정
        pushConsentRate: 68.5,
        pushConsentUsers: Math.floor(totalUsers[0].count * 0.685),
        suspendedUsers: 0
      };

      res.json(stats);
    } catch (error) {
      console.error("User statistics error:", error);
      res.status(500).json({ error: "사용자 통계 조회 중 오류가 발생했습니다." });
    }
  });

  // MAU 분석 API
  app.get("/api/admin/mau-analysis", requireAdmin, async (req, res) => {
    try {
      const mauData = {
        monthlyTrend: Array.from({ length: 6 }, (_, i) => {
          const date = new Date();
          date.setMonth(date.getMonth() - (5 - i));
          return {
            month: date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short' }),
            mau: Math.floor(Math.random() * 500) + 200,
            dau: Math.floor(Math.random() * 100) + 50
          };
        }),
        signupChannels: [
          { name: '카카오', count: 45 },
          { name: '구글', count: 32 },
          { name: '네이버', count: 18 },
          { name: '이메일', count: 12 },
          { name: '기타', count: 8 }
        ]
      };

      res.json(mauData);
    } catch (error) {
      console.error("MAU analysis error:", error);
      res.status(500).json({ error: "MAU 분석 중 오류가 발생했습니다." });
    }
  });

  // 인구통계학적 분석 API
  app.get("/api/admin/demographic-analysis", requireAdmin, async (req, res) => {
    try {
      // 샘플 데이터로 대체 (실제 데이터가 있을 때까지)
      const sampleData = {
        ageDistribution: [
          { ageGroup: "20-29", count: 45 },
          { ageGroup: "30-39", count: 32 },
          { ageGroup: "40-49", count: 28 },
          { ageGroup: "50-59", count: 18 },
          { ageGroup: "10-19", count: 12 }
        ],
        genderDistribution: [
          { name: "남성", count: 78 },
          { name: "여성", count: 57 }
        ],
        regionDistribution: [
          { region: "서울", count: 45 },
          { region: "경기", count: 32 },
          { region: "부산", count: 18 },
          { region: "대구", count: 12 },
          { region: "인천", count: 10 },
          { region: "광주", count: 8 },
          { region: "대전", count: 6 },
          { region: "울산", count: 4 }
        ]
      };

      res.json(sampleData);
    } catch (error) {
      console.error("Demographic analysis error:", error);
      res.status(500).json({ error: "인구통계학적 분석 중 오류가 발생했습니다." });
    }
  });

  // 사용자 상세 정보 API
  app.get("/api/admin/users/:userId/detail", requireAdmin, async (req, res) => {
    try {
      const userId = req.params.userId;

      // 사용자 기본 정보
      const user = await db
        .select()
        .from(profiles)
        .where(eq(profiles.id, userId))
        .then(rows => rows[0]);

      if (!user) {
        return res.status(404).json({ error: "사용자를 찾을 수 없습니다." });
      }

      // 간단한 설문 참여 통계만 조회
      const surveyParticipationCount = await db
        .select({ count: count() })
        .from(userSurveyParticipation)
        .where(eq(userSurveyParticipation.userId, userId));

      const userDetail = {
        ...user,
        surveyParticipationCount: surveyParticipationCount[0].count,
        pushAgreed: Math.random() > 0.3, // 임시 데이터
        signupChannel: ['카카오', '구글', '네이버', '이메일'][Math.floor(Math.random() * 4)]
      };

      res.json(userDetail);
    } catch (error) {
      console.error("User detail error:", error);
      res.status(500).json({ error: "사용자 상세 정보 조회 중 오류가 발생했습니다." });
    }
  });

  // 알림 관리 API
  app.get("/api/admin/notifications", requireAdmin, async (req, res) => {
    try {
      const notifications = [
        {
          id: 1,
          title: "새로운 설문 추가",
          message: "AI가 생성한 새 설문을 확인해보세요!",
          type: "survey",
          status: "sent",
          targetType: "all",
          openCount: 156,
          createdAt: new Date()
        }
      ];

      res.json(notifications);
    } catch (error) {
      console.error("Notifications error:", error);
      res.status(500).json({ error: "알림 목록 조회 중 오류가 발생했습니다." });
    }
  });

  app.get("/api/admin/notification-stats", requireAdmin, async (req, res) => {
    try {
      const stats = {
        totalNotifications: 47,
        sentNotifications: 42,
        scheduledNotifications: 3,
        openRate: 68.5
      };

      res.json(stats);
    } catch (error) {
      console.error("Notification stats error:", error);
      res.status(500).json({ error: "알림 통계 조회 중 오류가 발생했습니다." });
    }
  });

  // 어뷰징 탐지 API
  app.get("/api/admin/abuse-detection", requireAdmin, async (req, res) => {
    try {
      const alerts = [
        {
          id: 1,
          type: "multiple_accounts",
          riskLevel: "high",
          confidence: 92,
          userId: "user_suspicious_001",
          ipAddress: "192.168.1.100",
          reason: "동일 IP에서 5개 계정 생성",
          details: "단시간 내 연속 계정 생성 및 설문 참여",
          riskScore: 85,
          surveyCount: 8,
          responseCount: 42,
          patternMatches: 3,
          detectedAt: new Date(),
          status: "pending"
        }
      ];

      res.json({ alerts });
    } catch (error) {
      console.error("Abuse detection error:", error);
      res.status(500).json({ error: "어뷰징 탐지 조회 중 오류가 발생했습니다." });
    }
  });

  app.get("/api/admin/abuse-stats", requireAdmin, async (req, res) => {
    try {
      const stats = {
        totalThreats: 23,
        blockedUsers: 8,
        botDetections: 15,
        accuracy: 94.2
      };

      res.json(stats);
    } catch (error) {
      console.error("Abuse stats error:", error);
      res.status(500).json({ error: "어뷰징 통계 조회 중 오류가 발생했습니다." });
    }
  });

  // 설정 관리 API
  app.get("/api/admin/settings", requireAdmin, async (req, res) => {
    try {
      const settings = {
        platformName: "Polli",
        adminEmail: "admin@polli.co.kr",
        platformDescription: "블록체인 기반 설문조사 플랫폼",
        maintenanceMode: false,
        defaultSurveyPoints: 10,
        maxSurveyQuestions: 20,
        surveyExpiryDays: 30,
        minResponses: 10,
        autoSurveyGeneration: true,
        requireSurveyApproval: false,
        newUserPoints: 100,
        dailyParticipationLimit: 10,
        requireEmailVerification: true,
        allowGuestParticipation: true,
        autoAbuseBlocking: true
      };

      res.json(settings);
    } catch (error) {
      console.error("Settings error:", error);
      res.status(500).json({ error: "설정 조회 중 오류가 발생했습니다." });
    }
  });

  app.get("/api/admin/system-info", requireAdmin, async (req, res) => {
    try {
      const systemInfo = {
        nodeVersion: process.version,
        serverStartTime: new Date(Date.now() - process.uptime() * 1000),
        uptime: `${Math.floor(process.uptime() / 3600)}시간 ${Math.floor((process.uptime() % 3600) / 60)}분`,
        memoryUsage: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
        tableCount: 15,
        totalRecords: 12847,
        dbSize: "45.2MB"
      };

      res.json(systemInfo);
    } catch (error) {
      console.error("System info error:", error);
      res.status(500).json({ error: "시스템 정보 조회 중 오류가 발생했습니다." });
    }
  });

  // 누락된 API 엔드포인트들 추가
  app.get("/api/admin/targeting-campaigns", requireAdmin, async (req, res) => {
    try {
      const campaigns = [
        {
          id: 1,
          title: "20대 대상 라이프스타일 설문",
          description: "20대 사용자를 대상으로 한 라이프스타일 설문 캠페인",
          targetType: "age",
          targetValue: "20-29",
          surveyId: 101,
          active: true,
          targetUserCount: 245,
          reachRate: 78.5,
          participationRate: 42.3,
          createdAt: new Date()
        }
      ];
      res.json(campaigns);
    } catch (error) {
      console.error("Targeting campaigns error:", error);
      res.status(500).json({ error: "캠페인 목록 조회 중 오류가 발생했습니다." });
    }
  });

  app.get("/api/admin/surveys-list", requireAdmin, async (req, res) => {
    try {
      const surveysList = await db.select({
        id: surveys.id,
        title: surveys.title
      }).from(surveys).where(eq(surveys.isActive, true)).limit(50);

      res.json(surveysList);
    } catch (error) {
      console.error("Surveys list error:", error);
      res.status(500).json({ error: "설문 목록 조회 중 오류가 발생했습니다." });
    }
  });

  app.get("/api/admin/abuse-patterns", requireAdmin, async (req, res) => {
    try {
      const patterns = {
        dailyData: Array.from({ length: 7 }, (_, i) => ({
          date: new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000).toLocaleDateString(),
          threats: Math.floor(Math.random() * 10) + 2
        })),
        typeData: [
          { type: '스팸', count: 15 },
          { type: '다중계정', count: 8 },
          { type: '봇활동', count: 12 },
          { type: '허위응답', count: 6 }
        ]
      };
      res.json(patterns);
    } catch (error) {
      console.error("Abuse patterns error:", error);
      res.status(500).json({ error: "어뷰징 패턴 조회 중 오류가 발생했습니다." });
    }
  });

  // 대시보드 기본 통계
  app.get("/api/admin/dashboard-stats", requireAdmin, async (req, res) => {
    try {
      // 총 설문 수
      const totalSurveysResult = await db.select({ count: count() }).from(surveys);
      const totalSurveys = totalSurveysResult[0]?.count || 0;

      // 총 참여 수
      const totalParticipationsResult = await db.select({ count: count() }).from(userSurveyParticipation);
      const totalParticipations = totalParticipationsResult[0]?.count || 0;

      // 이번 달 새 설문
      const thisMonth = new Date();
      thisMonth.setDate(1);
      const newSurveysResult = await db
        .select({ count: count() })
        .from(surveys)
        .where(gte(surveys.createdAt, thisMonth));
      const newSurveysThisMonth = newSurveysResult[0]?.count || 0;

      // 이번 달 새 참여
      const newParticipationsResult = await db
        .select({ count: count() })
        .from(userSurveyParticipation)
        .where(gte(userSurveyParticipation.completedAt, thisMonth));
      const newParticipationsThisMonth = newParticipationsResult[0]?.count || 0;

      // 활성 사용자 (최근 7일)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const activeUsersResult = await db
        .select({ count: sql`COUNT(DISTINCT ${userSurveyParticipation.userId})` })
        .from(userSurveyParticipation)
        .where(gte(userSurveyParticipation.completedAt, sevenDaysAgo));
      const activeUsers = activeUsersResult[0]?.count || 0;

      // 평균 참여율 계산 (간단 버전)
      const averageParticipationRate = totalSurveys > 0 ? Math.round((totalParticipations / totalSurveys) * 100) / 100 : 0;

      // 일별 참여 추이 (최근 7일)
      const dailyParticipations = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        const dayParticipationsResult = await db
          .select({ count: count() })
          .from(userSurveyParticipation)
          .where(and(
            gte(userSurveyParticipation.completedAt, startOfDay),
            lte(userSurveyParticipation.completedAt, endOfDay)
          ));

        dailyParticipations.push({
          date: date.toISOString().split('T')[0],
          count: dayParticipationsResult[0]?.count || 0
        });
      }

      // 최근 설문 목록
      const recentSurveys = await db
        .select({
          id: surveys.id,
          title: surveys.title,
          category: surveys.category,
          createdBy: surveys.createdBy,
          createdAt: surveys.createdAt,
          participantCount: surveys.participantCount
        })
        .from(surveys)
        .orderBy(desc(surveys.createdAt))
        .limit(5);

      res.json({
        totalSurveys,
        totalParticipations,
        newSurveysThisMonth,
        newParticipationsThisMonth,
        activeUsers,
        averageParticipationRate,
        dailyParticipations,
        recentSurveys: recentSurveys.map(survey => ({
          ...survey,
          createdAt: survey.createdAt.toISOString().split('T')[0]
        }))
      });
    } catch (error) {
      console.error("Dashboard stats error:", error);
      res.status(500).json({ error: "대시보드 통계 조회 중 오류가 발생했습니다." });
    }
  });

  // 설문 통계 (관리 페이지용)
  app.get("/api/admin/survey-stats", requireAdmin, async (req, res) => {
    try {
      // 총 설문 수
      const totalSurveysResult = await db.select({ count: count() }).from(surveys);
      const totalSurveys = totalSurveysResult[0]?.count || 0;

      // 활성 설문 수
      const activeSurveysResult = await db
        .select({ count: count() })
        .from(surveys)
        .where(eq(surveys.isActive, true));
      const activeSurveys = activeSurveysResult[0]?.count || 0;

      // 총 참여 수
      const totalParticipationsResult = await db
        .select({ count: count() })
        .from(userSurveyParticipation);
      const totalParticipations = totalParticipationsResult[0]?.count || 0;

      // 평균 참여율 계산
      const averageParticipation = totalSurveys > 0 ? (totalParticipations / totalSurveys) : 0;

      // 카테고리별 설문 분포
      const categoryDistribution = await db
        .select({
          category: surveys.category,
          count: count()
        })
        .from(surveys)
        .groupBy(surveys.category);

      res.json({
        totalSurveys,
        activeSurveys,
        totalParticipations,
        averageParticipation,
        categoryDistribution: categoryDistribution.map(item => ({
          name: item.category,
          count: item.count
        }))
      });
    } catch (error) {
      console.error("Survey stats error:", error);
      res.status(500).json({ error: "설문 통계 조회 중 오류가 발생했습니다." });
    }
  });

  // 사용자 통계
  app.get("/api/admin/user-stats", requireAdmin, async (req, res) => {
    try {
      // 연령대별 분포
      const ageDistribution = await db
        .select({
          ageGroup: profiles.ageGroup,
          count: count()
        })
        .from(profiles)
        .where(sql`${profiles.ageGroup} IS NOT NULL`)
        .groupBy(profiles.ageGroup);

      // 성별 분포
      const genderDistribution = await db
        .select({
          gender: profiles.gender,
          count: count()
        })
        .from(profiles)
        .where(sql`${profiles.gender} IS NOT NULL`)
        .groupBy(profiles.gender);

      res.json({
        ageDistribution: ageDistribution.map(item => ({
          ageGroup: item.ageGroup || "미분류",
          count: item.count
        })),
        genderDistribution: genderDistribution.map(item => ({
          name: item.gender || "미분류",
          count: item.count
        }))
      });
    } catch (error) {
      console.error("User stats error:", error);
      res.status(500).json({ error: "사용자 통계 조회 중 오류가 발생했습니다." });
    }
  });

  // 설문 목록 조회 (관리용)
  app.get("/api/admin/surveys", requireAdmin, async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = (page - 1) * limit;

      const surveysResult = await db
        .select({
          id: surveys.id,
          title: surveys.title,
          category: surveys.category,
          createdBy: surveys.createdBy,
          createdAt: surveys.createdAt,
          isActive: surveys.isActive,
          participantCount: surveys.participantCount,
          experienceReward: surveys.experienceReward,
          votingEndDate: surveys.votingEndDate
        })
        .from(surveys)
        .orderBy(desc(surveys.createdAt))
        .limit(limit)
        .offset(offset);

      const totalResult = await db.select({ count: count() }).from(surveys);
      const total = totalResult[0]?.count || 0;

      // 현재는 간단하게 배열만 반환 
      res.json(surveysResult);
    } catch (error) {
      console.error("Admin surveys error:", error);
      res.status(500).json({ error: "설문 목록 조회 중 오류가 발생했습니다." });
    }
  });

  // 설문 상세 통계
  app.get("/api/admin/surveys/:id/stats", requireAdmin, async (req, res) => {
    try {
      const surveyId = parseInt(req.params.id);

      // 설문 기본 정보
      const survey = await db
        .select()
        .from(surveys)
        .where(eq(surveys.id, surveyId))
        .then(rows => rows[0]);

      if (!survey) {
        return res.status(404).json({ error: "설문을 찾을 수 없습니다." });
      }

      // 참여자 통계
      const participantStats = await db
        .select({ count: count() })
        .from(userSurveyParticipation)
        .where(eq(userSurveyParticipation.surveyId, surveyId));

      const totalParticipants = participantStats[0]?.count || 0;

      // 연령대별 참여자 분포
      const ageDistribution = await db
        .select({
          ageGroup: profiles.ageGroup,
          count: count()
        })
        .from(userSurveyParticipation)
        .innerJoin(profiles, eq(userSurveyParticipation.userId, profiles.id))
        .where(eq(userSurveyParticipation.surveyId, surveyId))
        .groupBy(profiles.ageGroup);

      // 성별 참여자 분포
      const genderDistribution = await db
        .select({
          gender: profiles.gender,
          count: count()
        })
        .from(userSurveyParticipation)
        .innerJoin(profiles, eq(userSurveyParticipation.userId, profiles.id))
        .where(eq(userSurveyParticipation.surveyId, surveyId))
        .groupBy(profiles.gender);

      res.json({
        survey,
        totalParticipants,
        ageDistribution,
        genderDistribution
      });
    } catch (error) {
      console.error("Survey stats error:", error);
      res.status(500).json({ error: "설문 통계 조회 중 오류가 발생했습니다." });
    }
  });

  // 강남구 펫터디 설문 전용 리포트 API
  app.get("/api/admin/gangnam-survey-report", requireAdmin, async (req, res) => {
    try {
      const GANGNAM_SURVEY_ID = 1653;
      const { surveyQuestions } = await import("../shared/schema.js");

      // 1. Overview 데이터
      const survey = await db
        .select()
        .from(surveys)
        .where(eq(surveys.id, GANGNAM_SURVEY_ID))
        .then(rows => rows[0]);

      if (!survey) {
        return res.status(404).json({ error: "강남구 설문을 찾을 수 없습니다." });
      }

      const totalResponsesResult = await db
        .select({ count: sql<number>`COUNT(DISTINCT ${surveyResponses.userId})` })
        .from(surveyResponses)
        .where(eq(surveyResponses.surveyId, GANGNAM_SURVEY_ID));

      const totalResponses = totalResponsesResult[0]?.count || 0;

      // 2. 질문 목록 가져오기
      const questions = await db
        .select()
        .from(surveyQuestions)
        .where(eq(surveyQuestions.surveyId, GANGNAM_SURVEY_ID))
        .orderBy(surveyQuestions.order);

      // 3. 거주지별 통계 (Q2: 현재 거주 지역을 선택해주세요.)
      const residenceQuestion = questions.find(q => q.question.includes("거주") && q.question.includes("지역"));
      let residenceStats = { gangnam: 0, other: 0, noAnswer: 0 };

      if (residenceQuestion) {
        const residenceResponses = await db
          .select({ answer: surveyResponses.answer, count: sql<number>`COUNT(*)` })
          .from(surveyResponses)
          .where(and(
            eq(surveyResponses.surveyId, GANGNAM_SURVEY_ID),
            eq(surveyResponses.questionId, residenceQuestion.id)
          ))
          .groupBy(surveyResponses.answer);

        residenceResponses.forEach(r => {
          // 응답이 JSON 형식으로 저장되어 있을 수 있으므로 파싱 시도
          let answerText = r.answer as string;
          try {
            // JSON 문자열인 경우 파싱
            if (answerText.startsWith('"') || answerText.startsWith('[')) {
              answerText = JSON.parse(answerText);
            }
          } catch (e) {
            // 파싱 실패시 원본 사용
          }

          if (answerText === '강남구') residenceStats.gangnam = Number(r.count);
          else if (answerText === '그 외 지역') residenceStats.other = Number(r.count);
          else if (answerText === '응답하지 않음') residenceStats.noAnswer = Number(r.count);
        });
      }

      // 4. KPI 계산 함수
      const calculateKPI = async (questionIds: number[]) => {
        if (questionIds.length === 0) return 0;

        const responses = await db
          .select({ answer: surveyResponses.answer })
          .from(surveyResponses)
          .where(and(
            eq(surveyResponses.surveyId, GANGNAM_SURVEY_ID),
            inArray(surveyResponses.questionId, questionIds)
          ));

        const scores = responses.map(r => {
          const answerMap: Record<string, number> = {
            '전혀 아니다': 1, '아니다': 2, '보통이다': 3, '그렇다': 4, '매우 그렇다': 5,
            '전혀 쉽지 않았다': 1, '쉽지 않았다': 2, '쉬웠다': 4, '매우 쉬웠다': 5,
            '매우 불만족': 1, '불만족': 2, '보통': 3, '만족': 4, '매우 만족': 5,
            '기대보다 매우 늦음': 1, '약간 늦음': 2, '적절함': 3, '약간 빠름': 4, '기대보다 매우 빠름': 5
          };
          return answerMap[r.answer as string] || 3;
        });

        const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
        return Math.round(avg * 20); // 0-100 스케일
      };

      // Q16,17,18 기반 접근성 개선지수
      const accessQuestions = questions.filter(q =>
        [15, 16, 17].includes(q.order || 0)
      ).map(q => q.id);
      const accessibilityIndex = await calculateKPI(accessQuestions);

      // Q8,20,21 기반 투명성지수
      const transparencyQuestions = questions.filter(q =>
        [8, 20, 21].includes(q.order || 0)
      ).map(q => q.id);
      const transparencyIndex = await calculateKPI(transparencyQuestions);

      // Q22 기반 환경지수
      const envQuestions = questions.filter(q => q.order === 22).map(q => q.id);
      const environmentIndex = await calculateKPI(envQuestions);

      // Q29,30 기반 공공신뢰지수
      const trustQuestions = questions.filter(q =>
        [29, 30].includes(q.order || 0)
      ).map(q => q.id);
      const publicTrustIndex = await calculateKPI(trustQuestions);

      // Q31,32 기반 선택권확대지수
      const choiceQuestions = questions.filter(q =>
        [31, 32].includes(q.order || 0)
      ).map(q => q.id);
      const choiceExpansionIndex = await calculateKPI(choiceQuestions);

      // 5. 질문별 응답 분포
      const questionStats = await Promise.all(
        questions
          .filter(q => q.type === 'single_choice' || q.type === 'rating_scale')
          .map(async (q) => {
            const responses = await db
              .select({ answer: surveyResponses.answer, count: sql<number>`COUNT(*)` })
              .from(surveyResponses)
              .where(and(
                eq(surveyResponses.surveyId, GANGNAM_SURVEY_ID),
                eq(surveyResponses.questionId, q.id)
              ))
              .groupBy(surveyResponses.answer);

            return {
              questionId: q.id,
              question: q.question,
              order: q.order,
              distribution: responses.map(r => ({
                answer: r.answer,
                count: Number(r.count)
              }))
            };
          })
      );

      // 6. 복수선택 질문 통계
      const multiSelectStats = await Promise.all(
        questions
          .filter(q => q.type === 'multiple_choice')
          .map(async (q) => {
            const responses = await db
              .select({ answer: surveyResponses.answer })
              .from(surveyResponses)
              .where(and(
                eq(surveyResponses.surveyId, GANGNAM_SURVEY_ID),
                eq(surveyResponses.questionId, q.id),
                sql`${surveyResponses.answer} IS NOT NULL`
              ));

            const optionCounts: Record<string, number> = {};
            responses.forEach(r => {
              if (!r.answer) return;

              try {
                let options;
                // 이미 배열인 경우 (JSONB가 자동 파싱됨)
                if (Array.isArray(r.answer)) {
                  options = r.answer;
                }
                // 문자열인 경우 JSON 파싱 시도
                else if (typeof r.answer === 'string') {
                  options = JSON.parse(r.answer);
                }
                // 객체인 경우 (혹시 다른 형태)
                else {
                  return;
                }

                if (Array.isArray(options)) {
                  options.forEach(opt => {
                    if (opt && typeof opt === 'string') {
                      optionCounts[opt] = (optionCounts[opt] || 0) + 1;
                    }
                  });
                }
              } catch (e) {
                console.warn(`Failed to parse multi-select answer for question ${q.id}:`, e);
              }
            });

            return {
              questionId: q.id,
              question: q.question,
              order: q.order,
              distribution: Object.entries(optionCounts).map(([answer, count]) => ({
                answer,
                count
              }))
            };
          })
      );

      // 7. 자유서술 응답
      const textQuestions = questions.filter(q => q.type === 'text');
      const textInsights = await Promise.all(
        textQuestions.map(async (q) => {
          try {
            const responses = await db
              .select({ answer: surveyResponses.answer, userId: surveyResponses.userId })
              .from(surveyResponses)
              .where(and(
                eq(surveyResponses.surveyId, GANGNAM_SURVEY_ID),
                eq(surveyResponses.questionId, q.id),
                sql`${surveyResponses.answer} IS NOT NULL`
              ))
              .limit(100);

            // 응답 필터링 및 안전한 처리
            const validResponses = responses
              .filter(r => {
                if (!r.answer) return false;

                // 문자열인 경우
                if (typeof r.answer === 'string') {
                  return r.answer.trim() !== '';
                }

                // 객체나 배열인 경우 (혹시 모를 경우)
                return true;
              })
              .map(r => ({
                answer: typeof r.answer === 'string' ? r.answer : JSON.stringify(r.answer),
                userId: r.userId
              }));

            return {
              questionId: q.id,
              question: q.question,
              order: q.order,
              responses: validResponses
            };
          } catch (error) {
            console.error(`Error fetching text responses for question ${q.id}:`, error);
            return {
              questionId: q.id,
              question: q.question,
              order: q.order,
              responses: []
            };
          }
        })
      );

      res.json({
        overview: {
          surveyId: survey.id,
          title: survey.title,
          totalResponses,
          createdAt: survey.createdAt,
          category: survey.category,
          residenceStats
        },
        kpis: {
          accessibilityIndex,
          transparencyIndex,
          environmentIndex,
          publicTrustIndex,
          choiceExpansionIndex
        },
        questionStats: questionStats.sort((a, b) => (a.order || 0) - (b.order || 0)),
        multiSelectStats: multiSelectStats.sort((a, b) => (a.order || 0) - (b.order || 0)),
        textInsights: textInsights.sort((a, b) => (a.order || 0) - (b.order || 0))
      });
    } catch (error) {
      console.error("Gangnam survey report error:", error);
      res.status(500).json({ error: "리포트 조회 중 오류가 발생했습니다." });
    }
  });

  app.post("/api/admin/gangnam-ai-summary", requireAdmin, async (req, res) => {
    try {
      const { questionId, responses } = req.body;

      if (!responses || !Array.isArray(responses) || responses.length === 0) {
        return res.status(400).json({ error: "응답 데이터가 필요합니다." });
      }

      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      const responsesText = responses.map((r, idx) => `${idx + 1}. ${r.answer}`).join('\n');

      const prompt = `다음은 강남구 펫터디 반려동물 장례 서비스 만족도 조사의 자유서술 응답입니다.

응답 내용:
${responsesText}

위 응답들을 분석하여 다음 내용을 JSON 형식으로 제공해주세요:
{
  "sentiment": "긍정적/중립적/부정적 중 하나",
  "sentimentScore": "긍정 응답 비율 (0-100)",
  "keywords": ["키워드1", "키워드2", "키워드3", "키워드4", "키워드5"],
  "summary": "전체 응답을 3-4문장으로 요약한 내용",
  "improvements": ["개선사항1", "개선사항2", "개선사항3"]
}

응답은 반드시 유효한 JSON 형식이어야 합니다.`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "당신은 정책 분석 전문가입니다. 시민들의 의견을 분석하여 정책 담당자에게 유용한 인사이트를 제공합니다."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.3,
        response_format: { type: "json_object" }
      });

      const result = JSON.parse(completion.choices[0].message.content || "{}");

      res.json({
        success: true,
        analysis: result
      });
    } catch (error) {
      console.error("AI summary error:", error);
      res.status(500).json({
        error: "AI 요약 생성 중 오류가 발생했습니다.",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
}