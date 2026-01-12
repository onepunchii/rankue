import cron from "node-cron";
import { resetMonthlyVotes } from "./musicRoutes";
import { db } from "./db";
import { musicCategories, musicArtists } from "@shared/schema";
import { eq } from "drizzle-orm";

class MusicScheduler {
  private schedulerRunning = false;

  constructor() {
    this.initializeData();
    this.setupScheduler();
  }

  // 기본 카테고리와 아티스트 데이터 초기화
  private async initializeData() {
    try {
      console.log("🎵 음악 투표 시스템 데이터 초기화 시작");

      // 기본 카테고리 데이터
      const categories = [
        {
          name: "남자 아이돌",
          description: "K-POP 남성 그룹",
          icon: "fas fa-male",
          color: "blue",
          sortOrder: 1
        },
        {
          name: "여자 아이돌",
          description: "K-POP 여성 그룹",
          icon: "fas fa-female",
          color: "pink",
          sortOrder: 2
        },
        {
          name: "혼성 그룹",
          description: "혼성 아이돌 그룹",
          icon: "fas fa-users",
          color: "purple",
          sortOrder: 3
        },
        {
          name: "남자 솔로",
          description: "남성 솔로 가수",
          icon: "fas fa-user",
          color: "indigo",
          sortOrder: 4
        },
        {
          name: "여자 솔로",
          description: "여성 솔로 가수",
          icon: "fas fa-user-circle",
          color: "rose",
          sortOrder: 5
        },
        {
          name: "밴드/락",
          description: "밴드 및 락 음악",
          icon: "fas fa-guitar",
          color: "orange",
          sortOrder: 6
        },
        {
          name: "힙합/R&B",
          description: "힙합 및 R&B",
          icon: "fas fa-music",
          color: "red",
          sortOrder: 7
        },
        {
          name: "트로트",
          description: "한국 트로트 가수",
          icon: "fas fa-microphone",
          color: "yellow",
          sortOrder: 8
        },
        {
          name: "팝/외국 아티스트",
          description: "해외 팝 아티스트",
          icon: "fas fa-globe",
          color: "green",
          sortOrder: 9
        }
      ];

      // 카테고리 삽입 (중복 제거)
      for (const category of categories) {
        const existing = await db
          .select()
          .from(musicCategories)
          .where(eq(musicCategories.name, category.name))
          .limit(1);

        if (existing.length === 0) {
          await db.insert(musicCategories).values(category);
          console.log(`✅ 카테고리 추가됨: ${category.name}`);
        }
      }

      // 각 카테고리별 기본 아티스트 데이터
      const maleIdolArtists = [
        { name: "BTS", agency: "HYBE", debutYear: 2013 },
        { name: "SEVENTEEN", agency: "PLEDIS", debutYear: 2015 },
        { name: "Stray Kids", agency: "JYP", debutYear: 2018 },
        { name: "ENHYPEN", agency: "BELIFT", debutYear: 2020 },
        { name: "TXT", agency: "HYBE", debutYear: 2019 },
        { name: "NCT", agency: "SM", debutYear: 2016 },
        { name: "RIIZE", agency: "SM", debutYear: 2023 },
        { name: "BOYNEXTDOOR", agency: "KOZ ENT", debutYear: 2023 }
      ];

      const femaleIdolArtists = [
        { name: "NewJeans", agency: "ADOR", debutYear: 2022 },
        { name: "IVE", agency: "Starship", debutYear: 2021 },
        { name: "LE SSERAFIM", agency: "HYBE", debutYear: 2022 },
        { name: "aespa", agency: "SM", debutYear: 2020 },
        { name: "(G)I-DLE", agency: "CUBE", debutYear: 2018 },
        { name: "ITZY", agency: "JYP", debutYear: 2019 },
        { name: "BLACKPINK", agency: "YG", debutYear: 2016 },
        { name: "Red Velvet", agency: "SM", debutYear: 2014 }
      ];

      const trotArtists = [
        { name: "임영웅", agency: "물고기뮤직", debutYear: 2016 },
        { name: "영탁", agency: "미스틱스토리", debutYear: 2007 },
        { name: "이찬원", agency: "뮤직웍스", debutYear: 2020 },
        { name: "장민호", agency: "아이스크림", debutYear: 2008 },
        { name: "정동원", agency: "탑클래스", debutYear: 2018 },
        { name: "김호중", agency: "생각", debutYear: 2014 },
        { name: "송가인", agency: "포켓돌", debutYear: 2019 },
        { name: "홍자", agency: "쇼플레이", debutYear: 2016 }
      ];

      // Define new artist arrays (example data)
      const coedArtists = [
          { name: "AKMU", agency: "YG", debutYear: 2014 },
          { name: "KARD", agency: "DSP Media", debutYear: 2017 }
      ];

      const maleSoloArtists = [
          { name: "G-Dragon", agency: "YG", debutYear: 2006 },
          { name: "Taemin", agency: "SM", debutYear: 2008 }
      ];

      const femaleSoloArtists = [
          { name: "IU", agency: "EDAM Entertainment", debutYear: 2008 },
          { name: "Sunmi", agency: "Abyss Company", debutYear: 2013 }
      ];

      const bandRockArtists = [
          { name: "DAY6", agency: "JYP", debutYear: 2015 },
          { name: "Buzz", agency: "Santa Music", debutYear: 2003 }
      ];

      const hiphopRnbArtists = [
          { name: "Jay Park", agency: "MORE VISION", debutYear: 2008 },
          { name: "Heize", agency: "P NATION", debutYear: 2014 }
      ];

      const popForeignArtists = [
          { name: "Taylor Swift", agency: "Republic", debutYear: 2006 },
          { name: "Justin Bieber", agency: "Def Jam", debutYear: 2009 }
      ];

      // 카테고리별 아티스트 추가
      const categoriesData = await db.select().from(musicCategories);

      for (const category of categoriesData) {
        let artists: any[] = [];

        switch (category.name) {
          case "남자 아이돌":
            artists = maleIdolArtists;
            break;
          case "여자 아이돌":
            artists = femaleIdolArtists;
            break;
          case "혼성 그룹":
            artists = coedArtists;
            break;
          case "남자 솔로":
            artists = maleSoloArtists;
            break;
          case "여자 솔로":
            artists = femaleSoloArtists;
            break;
          case "밴드/락":
            artists = bandRockArtists;
            break;
          case "힙합/R&B":
            artists = hiphopRnbArtists;
            break;
          case "트로트":
            artists = trotArtists;
            break;
          case "팝/외국 아티스트":
            artists = popForeignArtists;
            break;
          default:
            continue;
        }

        for (const artist of artists) {
          const existing = await db
            .select()
            .from(musicArtists)
            .where(eq(musicArtists.name, artist.name))
            .limit(1);

          if (existing.length === 0) {
            try {
              await db.insert(musicArtists).values({
                ...artist,
                categoryId: category.id,
                currentRank: 0,
                previousRank: 0
              });
              console.log(`✅ 아티스트 추가됨: ${artist.name} (${category.name})`);
            } catch (error) {
              console.error(`❌ 아티스트 추가 실패: ${artist.name}`, error);
              console.error('데이터:', JSON.stringify({ ...artist, categoryId: category.id }, null, 2));
            }
          }
        }
      }

      console.log("🎵 음악 투표 시스템 데이터 초기화 완료");
    } catch (error) {
      console.error("❌ 음악 투표 시스템 초기화 오류:", error);
    }
  }

  // 월별 리셋 스케줄러 설정 (매월 1일 00:00)
  private setupScheduler() {
    // 매월 1일 00:00 (KST)에 실행
    cron.schedule('0 0 1 * *', async () => {
      try {
        if (this.schedulerRunning) {
          console.log("🎵 음악 투표 리셋이 이미 실행 중입니다.");
          return;
        }

        this.schedulerRunning = true;
        console.log("🎵 월별 음악 투표 리셋 시작");

        await resetMonthlyVotes();

        console.log("🎵 월별 음악 투표 리셋 완료");
      } catch (error) {
        console.error("❌ 월별 음악 투표 리셋 오류:", error);
      } finally {
        this.schedulerRunning = false;
      }
    }, {
      timezone: "Asia/Seoul"
    });

    console.log("🎵 음악 투표 월별 리셋 스케줄러 활성화 (매월 1일 00:00 KST)");
  }

  // 수동 리셋 (테스트용)
  public async manualReset() {
    try {
      if (this.schedulerRunning) {
        throw new Error("리셋이 이미 실행 중입니다.");
      }

      this.schedulerRunning = true;
      console.log("🎵 수동 음악 투표 리셋 시작");

      await resetMonthlyVotes();

      console.log("🎵 수동 음악 투표 리셋 완료");
      return { success: true, message: "음악 투표가 성공적으로 리셋되었습니다." };
    } catch (error) {
      console.error("❌ 수동 음악 투표 리셋 오류:", error);
      throw error;
    } finally {
      this.schedulerRunning = false;
    }
  }

  // 스케줄러 상태 확인
  public getStatus() {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    return {
      isRunning: this.schedulerRunning,
      currentMonth: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      nextResetDate: nextMonth.toISOString(),
      daysUntilReset: Math.ceil((nextMonth.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    };
  }
}

export default MusicScheduler;