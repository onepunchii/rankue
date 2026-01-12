
import "dotenv/config";
import { db } from "./server/db";
import { politicians } from "./shared/schema";

async function seedLocalCouncil() {
    console.log("🌱 Seeding Local Council Members (기초의원)...");

    const sampleData = [
        {
            name: "김철수",
            party: "더불어민주당",
            region: "서울특별시",
            district: "종로구",
            constituency: "종로구 가선거구",
            gender: "남",
            age: 54,
            education: "서울대학교 정치학과 졸업",
            career1: "전) 종로구 청년위원장",
            imageUrl: "https://randomuser.me/api/portraits/men/1.jpg"
        },
        {
            name: "이영희",
            party: "국민의힘",
            region: "서울특별시",
            district: "종로구",
            constituency: "종로구 나선거구",
            gender: "여",
            age: 48,
            education: "이화여자대학교 졸업",
            career1: "전) 종로구 부의장",
            imageUrl: "https://randomuser.me/api/portraits/women/2.jpg"
        },
        {
            name: "박민수",
            party: "정의당",
            region: "서울특별시",
            district: "종로구",
            constituency: "종로구 다선거구",
            gender: "남",
            age: 39,
            education: "연세대학교 법학과 졸업",
            career1: "현) 종로구 시민단체 활동가",
            imageUrl: "https://randomuser.me/api/portraits/men/3.jpg"
        },
        {
            name: "최강남",
            party: "국민의힘",
            region: "서울특별시",
            district: "강남구",
            constituency: "강남구 가선거구",
            gender: "남",
            age: 61,
            education: "고려대학교 경영학과 졸업",
            career1: "현) 강남구의회 의장",
            imageUrl: "https://randomuser.me/api/portraits/men/4.jpg"
        },
        {
            name: "정아름",
            party: "더불어민주당",
            region: "서울특별시",
            district: "강남구",
            constituency: "강남구 나선거구",
            gender: "여",
            age: 42,
            education: "한양대학교 행정학과 졸업",
            career1: "전) 서울시당 부위원장",
            imageUrl: "https://randomuser.me/api/portraits/women/5.jpg"
        },
        {
            name: "장해운",
            party: "국민의힘",
            region: "부산광역시",
            district: "해운대구",
            constituency: "해운대구 가선거구",
            gender: "남",
            age: 55,
            education: "부산대학교 졸업",
            career1: "전) 해운대구체육회 이사",
            imageUrl: "https://randomuser.me/api/portraits/men/6.jpg"
        },
        {
            name: "송바다",
            party: "더불어민주당",
            region: "부산광역시",
            district: "해운대구",
            constituency: "해운대구 나선거구",
            gender: "여",
            age: 45,
            education: "동아대학교 졸업",
            career1: "현) 해운대구 여성위원회 위원장",
            imageUrl: "https://randomuser.me/api/portraits/women/7.jpg"
        },
        {
            name: "류경기",
            party: "더불어민주당",
            region: "경기도",
            district: "수원시",
            constituency: "수원시 가선거구",
            gender: "남",
            age: 50,
            education: "아주대학교 대학원 졸업",
            career1: "현) 수원시의회 의원",
            imageUrl: "https://randomuser.me/api/portraits/men/8.jpg"
        },
        {
            name: "신수원",
            party: "국민의힘",
            region: "경기도",
            district: "수원시",
            constituency: "수원시 나선거구",
            gender: "여",
            age: 52,
            education: "경기대학교 졸업",
            career1: "전) 경기도당 대변인",
            imageUrl: "https://randomuser.me/api/portraits/women/9.jpg"
        },
        {
            name: "황대구",
            party: "국민의힘",
            region: "대구광역시",
            district: "수성구",
            constituency: "수성구 가선거구",
            gender: "남",
            age: 58,
            education: "경북대학교 졸업",
            career1: "현) 수성구의회 부의장",
            imageUrl: "https://randomuser.me/api/portraits/men/10.jpg"
        },
        {
            name: "오광주",
            party: "더불어민주당",
            region: "광주광역시",
            district: "북구",
            constituency: "북구 가선거구",
            gender: "여",
            age: 47,
            education: "전남대학교 졸업",
            career1: "현) 북구의회 의원",
            imageUrl: "https://randomuser.me/api/portraits/women/11.jpg"
        }
    ];

    try {
        const values = sampleData.map(d => ({
            name: d.name,
            party: d.party,
            type: 'local',
            level: '기초', // Critical identifier
            role: '의원',
            region: d.region,
            district: d.district,
            constituency: d.constituency,
            gender: d.gender,
            age: d.age,
            education: d.education,
            career1: d.career1,
            imageUrl: d.imageUrl,
            isActive: true,
            activityScore: Math.floor(Math.random() * 50) + 50, // 50-100 random score
            billsProposed: Math.floor(Math.random() * 10),
            attendanceRate: (Math.random() * 0.2 + 0.8).toFixed(2) // 0.80 - 1.00
        }));

        await db.insert(politicians).values(values);
        console.log(`✅ ${values.length} Local Council Members seeded successfully.`);
        process.exit(0);
    } catch (error) {
        console.error("❌ Failed to seed local council members:", error);
        process.exit(1);
    }
}

seedLocalCouncil();
