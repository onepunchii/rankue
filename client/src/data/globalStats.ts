import { GlobalStatItem } from "../types/GlobalStat";

export const globalStats: GlobalStatItem[] = [
    {
        "id": "coffee",
        "category": "LIFESTYLE",
        "stat_type": "stamina",
        "title": "카페인 농도 ☕",
        "question": "하루에 커피를 몇 잔 마시나요?",
        "unit": "잔",
        "levels": [
            { "min": 5, "tier": "카페인 폭주기관차", "desc": "핀란드인(세계 1위)보다 많이 마셔요! 심장 괜찮으세요?", "country": "🇫🇮 핀란드 (4잔)" },
            { "min": 3, "tier": "헤비 드링커", "desc": "혈관에 아메리카노가 흐르는 한국 직장인 표본입니다.", "country": "🇰🇷 한국 (2.5잔)" },
            { "min": 1, "tier": "모닝 커피족", "desc": "세계 평균 수준으로 적당히 즐기고 계시네요.", "country": "🌍 세계 평균 (1.5잔)" },
            { "min": 0, "tier": "순수 청정 구역", "desc": "카페인 없이 사는 당신, 혹시 찻잎만 드시나요?", "country": "🇨🇳 중국 (차 문화)" }
        ]
    },
    {
        "id": "sleep",
        "category": "HEALTH",
        "stat_type": "health",
        "title": "잠만보 레벨 🛌",
        "question": "하루 평균 몇 시간 주무세요?",
        "unit": "시간",
        "levels": [
            { "min": 9, "tier": "전생에 코알라", "desc": "프랑스인보다 더 많이 잡니다. 미인은 잠꾸러기라던데!", "country": "🇫🇷 프랑스 (8.8시간)" },
            { "min": 7, "tier": "건강한 시민", "desc": "세계 표준 수면 시간을 준수하고 계시네요.", "country": "🇬🇧 영국 (7.6시간)" },
            { "min": 5, "tier": "좀비 모드", "desc": "OECD 꼴찌 수준... 한국인다운 삶을 살고 계시군요.", "country": "🇰🇷 한국 (6.3시간)" },
            { "min": 0, "tier": "걸어다니는 시체", "desc": "일본 수험생보다 적게 잡니다. 생존이 걱정됩니다.", "country": "🇯🇵 일본 (6.1시간)" }
        ]
    },
    {
        "id": "smartphone",
        "category": "DIGITAL",
        "stat_type": "tech",
        "title": "스마트폰 중독 📱",
        "question": "하루 스크린 타임이 몇 시간인가요?",
        "unit": "시간",
        "levels": [
            { "min": 7, "tier": "디지털 망령", "desc": "눈 떠있는 시간의 반을 폰만 보시네요! (필리핀급)", "country": "🇵🇭 필리핀 (5.5시간)" },
            { "min": 5, "tier": "도파민 중독", "desc": "브라질 사람들의 열정만큼 폰을 사랑하시는군요.", "country": "🇧🇷 브라질 (5.4시간)" },
            { "min": 3, "tier": "적당한 유저", "desc": "독일인처럼 절제력이 있으시네요.", "country": "🇩🇪 독일 (3.4시간)" },
            { "min": 0, "tier": "원시인", "desc": "혹시 2G폰 쓰세요? 디지털 디톡스 고수시네요.", "country": "🇯🇵 일본 (1.5시간)" }
        ]
    },
    {
        "id": "alcohol",
        "category": "LIFESTYLE",
        "stat_type": "social",
        "title": "알코올 전투력 🍺",
        "question": "일주일에 술을 몇 번 드시나요?",
        "unit": "회",
        "levels": [
            { "min": 5, "tier": "간이 강철", "desc": "러시아 형님들과 대작 가능한 수준입니다.", "country": "🇷🇺 러시아" },
            { "min": 3, "tier": "애주가", "desc": "한국 회식 문화의 중심에 서 계시군요.", "country": "🇰🇷 한국" },
            { "min": 1, "tier": "즐기는 자", "desc": "가볍게 한잔 즐기는 유럽 스타일이네요.", "country": "🇮🇹 이탈리아" },
            { "min": 0, "tier": "알코올 프리", "desc": "술 없이도 분위기에 취하는 당신은 진정한 챔피언!", "country": "🇮🇩 인도네시아" }
        ]
    },
    {
        "id": "walking",
        "category": "HEALTH",
        "stat_type": "stamina",
        "title": "뚜벅이 지수 👟",
        "question": "하루 평균 몇 걸음 걸으세요?",
        "unit": "걸음",
        "levels": [
            { "min": 10000, "tier": "인간 네비게이션", "desc": "홍콩 사람들만큼 부지런히 걷고 있군요!", "country": "🇭🇰 홍콩 (6880보)" },
            { "min": 6000, "tier": "산책 마스터", "desc": "일본인 평균 수준으로 건강하게 걷고 계십니다.", "country": "🇯🇵 일본 (6010보)" },
            { "min": 4000, "tier": "동네 마실러", "desc": "미국인 평균보다는 많이 걷네요.", "country": "🇺🇸 미국 (4774보)" },
            { "min": 0, "tier": "침대와 한몸", "desc": "인도네시아 평균보다 적습니다. 조금만 더 움직여요!", "country": "🇮🇩 인도네시아 (3513보)" }
        ]
    },
    {
        "id": "work_hours",
        "category": "WORK",
        "stat_type": "patience",
        "title": "노비 문서 레벨 💼",
        "question": "일주일에 몇 시간 일(공부) 하시나요?",
        "unit": "시간",
        "levels": [
            { "min": 55, "tier": "현대판 노예", "desc": "멕시코 사람보다 더 많이 일하고 계시네요... 😭", "country": "🇲🇽 멕시코 (주 48시간+)" },
            { "min": 45, "tier": "K-직장인", "desc": "야근이 일상인 한국 평균입니다.", "country": "🇰🇷 한국 (주 40~52시간)" },
            { "min": 35, "tier": "워라밸 요정", "desc": "유럽 선진국 수준의 근무 환경이군요! 부럽습니다.", "country": "🇩🇪 독일 (주 34시간)" },
            { "min": 0, "tier": "갓수", "desc": "일주일에 30시간 미만? 진정한 자유인입니다.", "country": "🇳🇱 네덜란드 (주 29시간)" }
        ]
    },
    {
        "id": "height",
        "category": "HEALTH",
        "stat_type": "physique",
        "title": "글로벌 키 🦒",
        "question": "키가 몇 cm 인가요?",
        "unit": "cm",
        "levels": [
            { "min": 183, "tier": "네덜란드인", "desc": "거인국 네덜란드에 가도 꿀리지 않는 피지컬!", "country": "🇳🇱 네덜란드 (183.8cm)" },
            { "min": 175, "tier": "위너", "desc": "미국 평균보다 크시네요. 옷 핏이 좋으시겠어요.", "country": "🇺🇸 미국 (177cm)" },
            { "min": 170, "tier": "아시아 평균", "desc": "한국/중국 평균 키와 비슷합니다.", "country": "🇰🇷 한국 (174cm)" },
            { "min": 0, "tier": "귀요미", "desc": "동티모르에 가면 당신도 농구선수!", "country": "🇹🇱 동티모르 (160cm)" }
        ]
    },
    {
        "id": "meat",
        "category": "LIFESTYLE",
        "stat_type": "physique",
        "title": "육식 공룡 지수 🍖",
        "question": "일주일에 고기를 몇 번 드시나요?",
        "unit": "회",
        "levels": [
            { "min": 7, "tier": "티라노사우루스", "desc": "미국인 수준의 육식 본능! 채소도 좀 드세요.", "country": "🇺🇸 미국 (연 124kg)" },
            { "min": 4, "tier": "고기 러버", "desc": "한국인의 소울푸드 삼겹살을 사랑하시는군요.", "country": "🇦🇷 아르헨티나" },
            { "min": 2, "tier": "잡식성", "desc": "지구 환경을 생각하는 적당한 육식입니다.", "country": "🇯🇵 일본" },
            { "min": 0, "tier": "비건 지망생", "desc": "인도 사람처럼 채식 위주의 식단이시네요.", "country": "🇮🇳 인도" }
        ]
    },
    {
        "id": "book",
        "category": "MIND",
        "stat_type": "wisdom",
        "title": "지식인 레벨 📚",
        "question": "한 달에 책을 몇 권 읽으세요?",
        "unit": "권",
        "levels": [
            { "min": 4, "tier": "걸어다니는 도서관", "desc": "인도 사람(세계 1위)만큼 책을 많이 읽으시네요!", "country": "🇮🇳 인도 (주 10시간)" },
            { "min": 2, "tier": "교양인", "desc": "중국인 평균 독서량과 비슷합니다.", "country": "🇨🇳 중국 (주 8시간)" },
            { "min": 1, "tier": "마음의 양식", "desc": "한국 성인 평균(연 4.5권)보다는 훨씬 훌륭합니다.", "country": "🇺🇸 미국" },
            { "min": 0, "tier": "책보단 유튜브", "desc": "한국 성인의 절반은 1년에 책을 한 권도 안 읽는대요. (동지!)", "country": "🇰🇷 한국 (평균 이하)" }
        ]
    },
    {
        "id": "water",
        "category": "HEALTH",
        "stat_type": "health",
        "title": "수분 충전율 💧",
        "question": "하루에 물을 몇 잔 마시나요?",
        "unit": "잔",
        "levels": [
            { "min": 8, "tier": "물 먹는 하마", "desc": "피부가 투명해지겠어요! 권장량을 완벽히 채우셨습니다.", "country": "🌊 WHO 권장" },
            { "min": 5, "tier": "촉촉한 시민", "desc": "독일 사람들처럼 물을 잘 챙겨 드시네요.", "country": "🇩🇪 독일" },
            { "min": 3, "tier": "약간 건조함", "desc": "커피 대신 물을 한 잔 더 드시는 건 어때요?", "country": "🇬🇧 영국" },
            { "min": 0, "tier": "사막의 선인장", "desc": "이러다 말라버려요... 당장 물 한 잔 하세요!", "country": "🌵 사막" }
        ]
    },
    {
        "id": "vacation",
        "category": "WORK",
        "stat_type": "money",
        "title": "휴가 부자 ✈️",
        "question": "1년에 유급 휴가를 며칠 쓰시나요?",
        "unit": "일",
        "levels": [
            { "min": 30, "tier": "신의 직장", "desc": "오스트리아, 프랑스 급의 복지네요. 채용 공고 떴나요?", "country": "🇦🇹 오스트리아 (38일)" },
            { "min": 20, "tier": "워라밸 중수", "desc": "영국 직장인만큼 쉽니다. 나쁘지 않아요!", "country": "🇬🇧 영국 (28일)" },
            { "min": 15, "tier": "평범한 회사원", "desc": "한국 법정 연차 수준이네요. 힘내세요.", "country": "🇰🇷 한국 (15일)" },
            { "min": 0, "tier": "일개미", "desc": "미국은 법정 유급휴가가 0일이래요. 위로가 될까요?", "country": "🇺🇸 미국 (0일)" }
        ]
    },
    {
        "id": "commute",
        "category": "WORK",
        "stat_type": "patience",
        "title": "길바닥 인내심 🚌",
        "question": "편도 출퇴근(등하교) 시간이 몇 분인가요?",
        "unit": "분",
        "levels": [
            { "min": 90, "tier": "해탈의 경지", "desc": "왕복 3시간? 이 정도면 서울-대전 거리인데요...", "country": "🇰🇷 수도권 광역러" },
            { "min": 60, "tier": "인내심 마스터", "desc": "나이지리아 라고스 시민(세계 최악)과 맘먹는 수준입니다.", "country": "🇳🇬 나이지리아" },
            { "min": 30, "tier": "평균 직장인", "desc": "런던이나 파리 직장인들도 이 정도 걸려요.", "country": "🇬🇧 런던 (45분)" },
            { "min": 0, "tier": "축복받은 거리", "desc": "직주근접의 꿈을 이루셨군요!", "country": "🇮🇹 이탈리아 (20분)" }
        ]
    },
    {
        "id": "ott",
        "category": "DIGITAL",
        "stat_type": "tech",
        "title": "넷플릭스 고인물 🎬",
        "question": "주말에 영상(유튜브/OTT)을 몇 시간 보세요?",
        "unit": "시간",
        "levels": [
            { "min": 6, "tier": "소파와 한몸", "desc": "미국인 평균 시청 시간을 넘겼습니다! 빈지워칭 장인이시네요.", "country": "🇺🇸 미국 (일 4시간+)" },
            { "min": 4, "tier": "영상 매니아", "desc": "영국 사람들만큼 영상을 즐겨 보시는군요.", "country": "🇬🇧 영국" },
            { "min": 2, "tier": "라이트 유저", "desc": "한국인 평균보다 적게 봅니다. 야외 활동파이신가요?", "country": "🇰🇷 한국" },
            { "min": 0, "tier": "아날로그 감성", "desc": "영상 볼 시간에 책을 읽거나 산책하시나 봐요!", "country": "🇩🇪 독일" }
        ]
    },
    {
        "id": "shower",
        "category": "LIFESTYLE",
        "stat_type": "health",
        "title": "깔끔쟁이 지수 🚿",
        "question": "일주일에 샤워를 몇 번 하시나요?",
        "unit": "회",
        "levels": [
            { "min": 10, "tier": "인간 세탁기", "desc": "브라질 사람(세계 1위)만큼 씻으시네요! 향기가 여기까지 나요.", "country": "🇧🇷 브라질 (주 12회)" },
            { "min": 7, "tier": "깔끔쟁이", "desc": "매일 씻는 당신, 한국/미국 평균입니다.", "country": "🇰🇷 한국 (주 7회)" },
            { "min": 4, "tier": "친환경주의자", "desc": "영국/중국 평균 수준입니다. 물을 아끼시는군요.", "country": "🇬🇧 영국 (주 5회)" },
            { "min": 0, "tier": "자연인", "desc": "혹시... 머리만 감으시는 건 아니죠?", "country": "🌍 세계 일부" }
        ]
    },
    {
        "id": "fastfood",
        "category": "LIFESTYLE",
        "stat_type": "health",
        "title": "패스트푸드 레벨 🍔",
        "question": "일주일에 햄버거/피자를 몇 번 드시나요?",
        "unit": "회",
        "levels": [
            { "min": 4, "tier": "혈관 파괴자", "desc": "미국인보다 패스트푸드를 더 많이 드십니다! 건강 조심!", "country": "🇺🇸 미국" },
            { "min": 2, "tier": "도시의 맛", "desc": "영국/호주 사람들과 비슷한 식습관이네요.", "country": "🇬🇧 영국" },
            { "min": 1, "tier": "어쩌다 한끼", "desc": "일본/한국 평균 수준입니다. 적당히 즐기시네요.", "country": "🇯🇵 일본" },
            { "min": 0, "tier": "슬로우 푸드", "desc": "집밥을 사랑하는 당신, 프랑스인 식습관을 가지셨군요.", "country": "🇫🇷 프랑스" }
        ]
    }
];
