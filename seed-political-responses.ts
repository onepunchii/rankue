import 'dotenv/config';
import { db } from './server/db';
import { surveys, surveyQuestions, surveyResponses, profiles } from './shared/schema';
import { eq, and, like, desc } from 'drizzle-orm';

async function addSampleResponses() {
    console.log('=== Adding Sample Political Survey Responses ===\n');

    // 1. Get the latest political survey
    const [survey] = await db.select()
        .from(surveys)
        .where(and(
            eq(surveys.category, 'politics'),
            like(surveys.title, '%정기 여론조사%')
        ))
        .orderBy(desc(surveys.createdAt))
        .limit(1);

    if (!survey) {
        console.log('❌ No political survey found!');
        return;
    }

    console.log(`Survey: ${survey.title} (ID: ${survey.id})\n`);

    // 2. Get questions
    const questions = await db.select()
        .from(surveyQuestions)
        .where(eq(surveyQuestions.surveyId, survey.id))
        .orderBy(surveyQuestions.order);

    console.log(`Questions: ${questions.length}\n`);

    // 3. Get a user to attribute responses to (or create sample users)
    const users = await db.select().from(profiles).limit(5);

    if (users.length === 0) {
        console.log('❌ No users found! Please create users first.');
        return;
    }

    console.log(`Found ${users.length} users to simulate responses\n`);

    // 4. Create sample response distributions
    const sampleDistributions = {
        // Q1: Presidential Approval (이재명 대통령 국정수행)
        // 긍정 60% (매우 잘함 25% + 잘하는 편 35%), 부정 35% (잘못함 20% + 매우 잘못함 15%), 중립 5%
        1: [
            { option: '매우 잘하고 있다', weight: 25 },
            { option: '잘하는 편이다', weight: 35 },
            { option: '잘못하는 편이다', weight: 20 },
            { option: '매우 잘못하고 있다', weight: 15 },
            { option: '잘 모름', weight: 5 }
        ],
        // Q2: Party Support (정당 지지)
        // 민주당 45%, 국민의힘 26%, 조국혁신당 11%, 기타
        2: [
            { option: '더불어민주당', weight: 45 },
            { option: '국민의힘', weight: 26 },
            { option: '조국혁신당', weight: 11 },
            { option: '개혁신당', weight: 5 },
            { option: '진보당', weight: 3 },
            { option: '기타 정당', weight: 2 },
            { option: '지지 정당 없음', weight: 8 }
        ],
        // Q3: Presidential Candidate (차기 대통령 적합도)
        3: [
            { option: '이재명', weight: 30 },
            { option: '한동훈', weight: 25 },
            { option: '조국', weight: 14 },
            { option: '오세훈', weight: 11 },
            { option: '홍준표', weight: 7 },
            { option: '김동연', weight: 5 },
            { option: '안철수', weight: 3 },
            { option: '이준석', weight: 2 },
            { option: '기타 인물', weight: 3 }
        ]
    };

    // 5. Generate responses
    const totalResponses = 100; // Generate 100 sample responses
    const responsesToInsert = [];

    for (let i = 0; i < totalResponses; i++) {
        const user = users[i % users.length]; // Cycle through users

        for (const question of questions) {
            const distribution = sampleDistributions[question.order as keyof typeof sampleDistributions];

            // Weighted random selection
            const totalWeight = distribution.reduce((sum, d) => sum + d.weight, 0);
            let random = Math.random() * totalWeight;
            let selectedOption = distribution[0].option;

            for (const dist of distribution) {
                random -= dist.weight;
                if (random <= 0) {
                    selectedOption = dist.option;
                    break;
                }
            }

            responsesToInsert.push({
                surveyId: survey.id,
                questionId: question.id,
                userId: user.id,
                answer: selectedOption,
                createdAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000) // Random time in last week
            });
        }
    }

    // 6. Insert responses
    console.log(`Inserting ${responsesToInsert.length} responses...`);

    try {
        await db.insert(surveyResponses).values(responsesToInsert);
        console.log('✓ Successfully inserted sample responses!\n');

        // 7. Verify
        const count = await db.select()
            .from(surveyResponses)
            .where(eq(surveyResponses.surveyId, survey.id));

        console.log(`Total responses in DB: ${count.length}`);

        // Count per question
        for (const question of questions) {
            const qResponses = count.filter(r => r.questionId === question.id);
            console.log(`  Q${question.order}: ${qResponses.length} responses`);
        }

    } catch (error) {
        console.error('❌ Error inserting responses:', error);
    }
}

addSampleResponses()
    .then(() => {
        console.log('\n✓ Complete');
        process.exit(0);
    })
    .catch(err => {
        console.error('Error:', err);
        process.exit(1);
    });
