export const REGION_OPTIONS = [
    { id: 'kyunggi_south', label: '경기 남부 (한강 이남)' },
    { id: 'kyunggi_north', label: '경기 북부 (한강 이북)' },
    { id: 'kyunggi_east', label: '경기 동부 (남양주/가평)' },
    { id: 'incheon_west', label: '인천 / 경기 서부' },
    { id: 'gangwon', label: '강원권' },
    { id: 'chungcheong', label: '충청권' },
    { id: 'jeolla', label: '전라권' },
    { id: 'gyeongsang', label: '경상권' },
    { id: 'jeju', label: '제주' }
];

export const PRICE_OPTIONS = [
    { id: 'under_10', label: '10만원 이하' },
    { id: 'range_10_15', label: '10 ~ 15만원' },
    { id: 'range_15_20', label: '15 ~ 20만원' },
    { id: 'over_20', label: '20만원 이상' },
    { id: 'sort_low', label: '가격 낮은순' },
    { id: 'sort_discount', label: '할인율 높은순' }
];

export const SPECIAL_OPTIONS = [
    { id: 'couple_2', label: '2인 플레이' },
    { id: 'player_3', label: '3인 가능' },
    { id: 'no_caddie', label: '노캐디' },
    { id: 'marshal', label: '마샬/드라이빙 캐디' },
    { id: 'meal_inc', label: '식사 제공' },
    { id: 'cart_free', label: '카트비 무료/할인' }
];

export const TIME_OPTIONS = [
    { id: 'all', label: '전체 시간' },
    { id: 'morning', label: '1부 (06:00 ~ 11:59)' },
    { id: 'afternoon', label: '2부 (12:00 ~ 16:59)' },
    { id: 'night', label: '3부 (17:00 ~ 이후)' }
];

export const THEME_COLORS = {
    BOOKING: {
        text: 'text-[#64DD17]',
        bg: 'bg-[#64DD17]',
        border: 'border-[#64DD17]',
        shadow: 'shadow-[#64DD17]/20'
    },
    JOIN: {
        text: 'text-[#FF6B00]',
        bg: 'bg-[#FF6B00]',
        border: 'border-[#FF6B00]',
        shadow: 'shadow-[#FF6B00]/20'
    }
};
