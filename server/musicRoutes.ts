import { Router } from "express";
import { db } from "./db.js";
import {
  musicCategories,
  musicArtists,
  musicVotes,
  musicMonthlyRankings,
  profiles,
  type MusicCategory,
  type MusicArtist,
  type InsertMusicVote
} from "../shared/schema.js";
import { eq, and, desc, sql } from "drizzle-orm";

const router = Router();

// 현재 월을 YYYY-MM 형식으로 반환
const getCurrentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

// 카테고리 목록 조회
router.get("/categories", async (req, res) => {
  try {
    const categories = await db
      .select()
      .from(musicCategories)
      .where(eq(musicCategories.isActive, true))
      .orderBy(musicCategories.sortOrder, musicCategories.name);

    res.json(categories);
  } catch (error) {
    console.error("카테고리 조회 오류:", error);
    res.status(500).json({ message: "카테고리를 불러오는데 실패했습니다." });
  }
});

// 전체 아티스트 목록 조회 (검색용)
router.get("/all-artists", async (req, res) => {
  try {
    const artists = await db
      .select({
        id: musicArtists.id,
        name: musicArtists.name,
        categoryId: musicArtists.categoryId,
        agency: musicArtists.agency,
        currentMonthVotes: sql<number>`COALESCE(${musicArtists.currentMonthVotes}, 0)`,
        currentRank: musicArtists.currentRank,
        previousRank: musicArtists.previousRank,
      })
      .from(musicArtists)
      .where(eq(musicArtists.isActive, true))
      .orderBy(desc(musicArtists.currentMonthVotes), musicArtists.name);

    res.json(artists);
  } catch (error) {
    console.error("전체 아티스트 조회 오류:", error);
    res.status(500).json({ message: "전체 아티스트 목록을 불러오는데 실패했습니다." });
  }
});

// 특정 카테고리의 아티스트 랭킹 조회
router.get("/artists/:categoryId", async (req, res) => {
  try {
    const categoryId = parseInt(req.params.categoryId);
    const currentMonth = getCurrentMonth();

    // 현재 월 투표 수를 기준으로 랭킹 계산
    const artists = await db
      .select({
        id: musicArtists.id,
        name: musicArtists.name,
        categoryId: musicArtists.categoryId,
        imageUrl: musicArtists.imageUrl,
        description: musicArtists.description,
        debutYear: musicArtists.debutYear,
        agency: musicArtists.agency,
        currentMonthVotes: sql<number>`COALESCE(${musicArtists.currentMonthVotes}, 0)`,
        totalVotes: sql<number>`COALESCE(${musicArtists.totalVotes}, 0)`,
        currentRank: musicArtists.currentRank,
        previousRank: musicArtists.previousRank,
        isActive: musicArtists.isActive,
      })
      .from(musicArtists)
      .where(
        and(
          eq(musicArtists.categoryId, categoryId),
          eq(musicArtists.isActive, true)
        )
      )
      .orderBy(desc(musicArtists.currentMonthVotes), musicArtists.name);

    res.json(artists);
  } catch (error) {
    console.error("아티스트 목록 조회 오류:", error);
    res.status(500).json({ message: "아티스트 목록을 불러오는데 실패했습니다." });
  }
});

// 사용자 전체 투표 현황 조회 (카테고리 구분 없음)
router.get("/user-votes", async (req, res) => {
  try {
    const userId = req.user?.id || "guest_common";

    const userVotes = await db
      .select({ artistId: musicVotes.artistId })
      .from(musicVotes)
      .where(
        and(
          eq(musicVotes.userId, userId),
          eq(musicVotes.voteMonth, getCurrentMonth())
        )
      );

    // artistId를 키로 하는 객체로 변환
    const voteStatus: Record<number, boolean> = {};
    userVotes.forEach(vote => {
      voteStatus[vote.artistId] = true;
    });

    res.json(voteStatus);
  } catch (error) {
    console.error("사용자 투표 현황 조회 오류:", error);
    res.status(500).json({ message: "투표 현황을 불러오는데 실패했습니다." });
  }
});

// 월별 우승자 조회
router.get("/monthly-winner/:categoryId/:month", async (req, res) => {
  try {
    const categoryId = parseInt(req.params.categoryId);
    const month = req.params.month; // "2025-07" 형식

    // 월별 랭킹 테이블에서 1위 조회
    const winner = await db
      .select({
        id: musicMonthlyRankings.artistId,
        name: musicArtists.name,
        agency: musicArtists.agency,
        totalVotes: musicMonthlyRankings.totalVotes,
        finalRank: musicMonthlyRankings.finalRank,
      })
      .from(musicMonthlyRankings)
      .innerJoin(musicArtists, eq(musicMonthlyRankings.artistId, musicArtists.id))
      .where(
        and(
          eq(musicArtists.categoryId, categoryId),
          eq(musicMonthlyRankings.month, month),
          eq(musicMonthlyRankings.finalRank, 1)
        )
      )
      .limit(1);

    if (winner.length > 0) {
      res.json(winner[0]);
    } else {
      res.json(null);
    }
  } catch (error) {
    console.error("월별 우승자 조회 오류:", error);
    res.status(500).json({ message: "월별 우승자 데이터를 불러오는데 실패했습니다." });
  }
});

// 투표하기
router.post("/vote", async (req, res) => {
  try {
    const { artistId, categoryId } = req.body;
    const userId = req.user?.id || "guest_common";
    const currentMonth = getCurrentMonth();
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];

    if (!artistId || !categoryId) {
      return res.status(400).json({
        success: false,
        message: "아티스트 ID와 카테고리 ID가 필요합니다."
      });
    }

    if (userId === "guest_common") {
      return res.status(401).json({ success: false, message: "로그인이 필요합니다." });
    }

    // 사용자 레벨 및 투표 수 확인
    const [userProfile] = await db.select().from(profiles).where(eq(profiles.id, userId));
    const userLevel = userProfile?.level || 0;

    const [voteCountResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(musicVotes)
      .where(
        and(
          eq(musicVotes.userId, userId),
          eq(musicVotes.voteMonth, currentMonth)
        )
      );

    if (Number(voteCountResult?.count || 0) >= userLevel) {
      return res.status(400).json({ success: false, message: "보유한 투표권을 모두 사용하셨습니다." });
    }

    // 이미 투표했는지 확인
    const existingVote = await db
      .select()
      .from(musicVotes)
      .where(
        and(
          eq(musicVotes.userId, userId),
          eq(musicVotes.artistId, artistId),
          eq(musicVotes.categoryId, categoryId),
          eq(musicVotes.voteMonth, currentMonth)
        )
      )
      .limit(1);

    if (existingVote.length > 0) {
      return res.status(400).json({
        success: false,
        message: "이미 이 아티스트에게 투표하셨습니다."
      });
    }

    // 아티스트가 존재하고 활성 상태인지 확인
    const artist = await db
      .select()
      .from(musicArtists)
      .where(
        and(
          eq(musicArtists.id, artistId),
          eq(musicArtists.categoryId, categoryId),
          eq(musicArtists.isActive, true)
        )
      )
      .limit(1);

    if (artist.length === 0) {
      return res.status(404).json({
        success: false,
        message: "아티스트를 찾을 수 없습니다."
      });
    }

    // 트랜잭션으로 투표 기록 및 카운트 업데이트
    await db.transaction(async (tx) => {
      // 투표 기록 추가
      await tx.insert(musicVotes).values({
        userId,
        artistId,
        categoryId,
        voteMonth: currentMonth,
        ipAddress,
        userAgent
      });

      // 아티스트 투표 카운트 업데이트
      await tx
        .update(musicArtists)
        .set({
          currentMonthVotes: sql`${musicArtists.currentMonthVotes} + 1`,
          totalVotes: sql`${musicArtists.totalVotes} + 1`,
        })
        .where(eq(musicArtists.id, artistId));
    });

    // 랭킹 재계산 (백그라운드에서)
    setTimeout(() => updateCategoryRanking(categoryId), 1000);

    res.json({
      success: true,
      message: `${artist[0].name}에게 투표해주셔서 감사합니다!`
    });

  } catch (error) {
    console.error("투표 처리 오류:", error);
    res.status(500).json({
      success: false,
      message: "투표 처리 중 오류가 발생했습니다."
    });
  }
});

// 카테고리별 랭킹 재계산 함수
async function updateCategoryRanking(categoryId: number) {
  try {
    // 현재 월 투표 수로 정렬된 아티스트 목록 조회
    const artists = await db
      .select({
        id: musicArtists.id,
        currentMonthVotes: musicArtists.currentMonthVotes,
        currentRank: musicArtists.currentRank
      })
      .from(musicArtists)
      .where(
        and(
          eq(musicArtists.categoryId, categoryId),
          eq(musicArtists.isActive, true)
        )
      )
      .orderBy(desc(musicArtists.currentMonthVotes), musicArtists.name);

    // 랭킹 업데이트
    for (let i = 0; i < artists.length; i++) {
      const newRank = i + 1;
      const artist = artists[i];

      if (artist.currentRank !== newRank) {
        await db
          .update(musicArtists)
          .set({
            previousRank: artist.currentRank,
            currentRank: newRank
          })
          .where(eq(musicArtists.id, artist.id));
      }
    }

    console.log(`카테고리 ${categoryId} 랭킹 업데이트 완료`);
  } catch (error) {
    console.error("랭킹 업데이트 오류:", error);
  }
}

// 월별 리셋 함수 (스케줄러에서 호출)
export async function resetMonthlyVotes() {
  try {
    const currentMonth = getCurrentMonth();
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;

    console.log(`월별 투표 리셋 시작: ${currentMonth}`);

    // 모든 카테고리 조회
    const categories = await db.select().from(musicCategories).where(eq(musicCategories.isActive, true));

    for (const category of categories) {
      // 지난 달 최종 랭킹 저장
      const lastMonthArtists = await db
        .select()
        .from(musicArtists)
        .where(
          and(
            eq(musicArtists.categoryId, category.id),
            eq(musicArtists.isActive, true)
          )
        )
        .orderBy(desc(musicArtists.currentMonthVotes));

      // 월별 랭킹 스냅샷 저장
      for (let i = 0; i < lastMonthArtists.length; i++) {
        const artist = lastMonthArtists[i];
        await db.insert(musicMonthlyRankings).values({
          artistId: artist.id,
          categoryId: category.id,
          month: lastMonthStr,
          finalRank: i + 1,
          finalVotes: artist.currentMonthVotes
        }).onConflictDoNothing();
      }

      // 현재 월 투표 수 리셋
      await db
        .update(musicArtists)
        .set({
          currentMonthVotes: 0,
          previousRank: sql`${musicArtists.currentRank}`,
          currentRank: 0
        })
        .where(eq(musicArtists.categoryId, category.id));
    }

    console.log("월별 투표 리셋 완료");
  } catch (error) {
    console.error("월별 리셋 오류:", error);
  }
}

// [Admin] 월별 정산 수동 실행
router.post("/admin/reset-monthly", async (req, res) => {
  try {
    await resetMonthlyVotes();
    res.json({ success: true, message: "월별 리셋이 완료되었습니다." });
  } catch (error) {
    res.status(500).json({ success: false, message: "리셋 실패" });
  }
});

export default router;