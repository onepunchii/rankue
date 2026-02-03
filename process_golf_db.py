import csv
import json

region_mapping = {
    "경기": "경기",
    "서울": "경기",
    "인천": "경기",
    "강원": "강원",
    "충북": "충청",
    "충남": "충청",
    "대전": "충청",
    "세종": "충청",
    "전북": "전라",
    "전남": "전라",
    "광주": "전라",
    "경북": "경상",
    "경남": "경상",
    "부산": "경상",
    "대구": "경상",
    "울산": "경상",
    "제주": "제주"
}

# Rankue 60 List (Partial names for matching)
RANKUE_60_NAMES = [
    # Membership Top 30
    "안양", "나인브릿지", "트리니티", "웰링턴", "해슬리", "잭 니클라우스", "휘슬링락", "제이드팰리스", "우정힐스", "남촌",
    "이스트밸리", "가평베네스트", "남서울", "화산", "비전힐스", "렉스필드", "블랙스톤 리조트 이천", "블랙스톤리조트이천", "서원밸리", "곤지암", "일동레이크",
    "블랙스톤 제주", "블랙스톤리조트", "핀크스", "라온", "에이원", "동래베네스트", "정산", "대구", "88", "레이크사이드", "블루원 디아너스", "디아너스",
    # Public Top 30
    "사우스케이프", "파인비치", "설해원", "세이지우드 홍천", "세이지우드CC홍천", "베어크리크 춘천", "베어크리크 춘천", "성문안", "라비에벨", "베어즈베스트", "페럼",
    "베어크리크 포천", "사우스스프링스", "클럽72", "SKY72", "아일랜드", "레인보우힐스", "롯데스카이힐 제주", "블루원 상주", "파인리즈", "힐드로사이",
    "킹스데일", "오렌지듄스", "서원힐스", "파주", "중문", "엘리시안 제주", "샤인빌", "클럽D", "경주", "그레이스", "에콜리안"
]

def is_rankue_60(name):
    for r_name in RANKUE_60_NAMES:
        if r_name in name:
            return True
    return False

courses = []
with open('/Users/choejeonghwan/Desktop/Antigravity/rankue/golf/golf.csv', 'r', encoding='utf-8-sig') as f:
    reader = csv.DictReader(f)
    for i, row in enumerate(reader):
        name = row['업소명'].strip()
        original_region = row['지역'].strip()
        group_region = region_mapping.get(original_region, "기타")
        
        # Determine Type
        raw_type = row['세부종류'].strip()
        if '회원제' in raw_type:
            course_type = 'Membership'
        else:
            course_type = 'Public'
            
        course = {
            "id": i + 1,
            "name": name,
            "type": course_type,
            "region": group_region,
            "originalRegion": original_region,
            "address": row['소재지'].strip(),
            "area": row['총면적(제곱미터) '].strip(),
            "holes": row['홀수(홀)'].strip(),
            "subType": raw_type,
            "isRankue60": is_rankue_60(name),
            # Mock data matched to existing FILTERS in Passport.tsx
            "rating": 4.5 + (0.4 if is_rankue_60(name) else 0),
            "difficulty": "상" if is_rankue_60(name) else "중",
            "speed": "빠름" if is_rankue_60(name) else "보통",
            "vibe": "비즈니스" if is_rankue_60(name) else "가성비",
            "grass": "벤트" if is_rankue_60(name) else "한국잔디",
            "imageUrl": "https://images.unsplash.com/photo-1587174486073-ae5e5cff02fa?auto=format&fit=crop&q=80&w=800"
        }
        courses.append(course)

with open('/Users/choejeonghwan/Desktop/Antigravity/rankue/client/src/golf/data/golfCourses.ts', 'w', encoding='utf-8') as f:
    f.write("export const COURSES = " + json.dumps(courses, ensure_ascii=False, indent=4) + ";")
