import "dotenv/config";
import { supabaseAdmin } from "./supabase";
import { db } from "./db";
import { musicArtists, musicCategories } from "@shared/schema";
import { eq } from "drizzle-orm";

// Supabase celebrities를 musicArtists로 마이그레이션
async function migrateCelebritiesToMusicArtists() {
    console.log("🚀 Starting celebrity migration...");

    try {
        // 0. 카테고리 시딩
        console.log("📦 Seeding categories...");
        const categoriesToSeed = [
            { id: 1, name: '남자 아이돌', icon: '🎤', sortOrder: 1 },
            { id: 2, name: '여자 아이돌', icon: '✨', sortOrder: 2 },
            { id: 3, name: '트로트', icon: '🎵', sortOrder: 3 },
            { id: 4, name: '혼성 그룹', icon: '👥', sortOrder: 4 },
            { id: 5, name: '남자 솔로', icon: '🎸', sortOrder: 5 },
            { id: 6, name: '여자 솔로', icon: '🌟', sortOrder: 6 },
            { id: 7, name: '밴드/락', icon: '🎸', sortOrder: 7 },
            { id: 8, name: '힙합/R&B', icon: '🎧', sortOrder: 8 },
            { id: 9, name: '팝/외국 아티스트', icon: '🌍', sortOrder: 9 },
            { id: 10, name: '배우', icon: '🎬', sortOrder: 10 },
            { id: 11, name: '개그맨', icon: '😂', sortOrder: 11 },
            { id: 12, name: '정치인', icon: '🏛️', sortOrder: 12 },
            { id: 13, name: '스포츠', icon: '⚽', sortOrder: 13 },
            { id: 14, name: '방송인', icon: '📺', sortOrder: 14 },
            { id: 15, name: '모델', icon: '📸', sortOrder: 15 },
            { id: 16, name: '요리사', icon: '👨‍🍳', sortOrder: 16 },
            { id: 17, name: '작가', icon: '✍️', sortOrder: 17 },
        ];

        for (const cat of categoriesToSeed) {
            await db
                .insert(musicCategories)
                .values(cat)
                .onConflictDoNothing(); // 이미 있으면 건너뜀
        }
        console.log("✅ Categories seeded!");

        // 1. Supabase에서 모든 celebrities 가져오기
        const { data: celebrities, error } = await supabaseAdmin
            .from('celebrities')
            .select('*');

        if (error) {
            console.error("❌ Error fetching celebrities:", error);
            return;
        }

        console.log(`✅ Fetched ${celebrities?.length || 0} celebrities from Supabase`);

        // 2. 카테고리 매핑 (Supabase category -> musicCategories id)
        const categoryMapping: Record<string, number> = {
            'male_solo': 5,      // 남자 솔로
            'female_solo': 6,    // 여자 솔로
            'boy_group': 1,      // 남자 아이돌
            'girl_group': 2,     // 여자 아이돌
            'trot_singer': 3,    // 트로트
            'global_idol': 9,    // 팝/외국 아티스트
            'actor_male': 10,    // 배우
            'actor_female': 10,  // 배우
            'sports_player': 13, // 스포츠
            'comedian': 11,      // 개그맨
            'influencer': 14,    // 방송인
        };

        // 3. 각 celebrity를 musicArtists에 삽입
        let inserted = 0;
        let skipped = 0;

        for (const celeb of celebrities || []) {
            const categoryId = categoryMapping[celeb.category];

            if (!categoryId) {
                // 매핑되지 않은 카테고리는 건너뛰거나 기본값 처리
                skipped++;
                continue;
            }

            try {
                // 이미 존재하는지 확인
                const existing = await db
                    .select()
                    .from(musicArtists)
                    .where(eq(musicArtists.name, celeb.name))
                    .limit(1);

                if (existing.length > 0) {
                    skipped++;
                    continue;
                }

                // 삽입
                await db.insert(musicArtists).values({
                    name: celeb.name,
                    categoryId: categoryId,
                    agency: celeb.gender || celeb.type || null, // gender 필드에 그룹명 또는 type 정보 저장
                    description: celeb.type || null,
                    currentMonthVotes: 0,
                    totalVotes: 0,
                    currentRank: 0,
                    previousRank: 0,
                    isActive: true,
                });

                inserted++;
            } catch (err) {
                console.error(`❌ Error inserting ${celeb.name}:`, err);
            }
        }

        console.log("\n📊 Migration Summary:");
        console.log(`   ✅ Inserted: ${inserted}`);
        console.log(`   ⏭️  Skipped: ${skipped}`);
        console.log(`   📝 Total: ${celebrities?.length || 0}`);

    } catch (error) {
        console.error("❌ Migration failed:", error);
    }
}

// 스크립트 실행
migrateCelebritiesToMusicArtists()
    .then(() => {
        console.log("\n✨ Migration complete!");
        process.exit(0);
    })
    .catch((error) => {
        console.error("\n💥 Migration error:", error);
        process.exit(1);
    });
