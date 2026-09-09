import { GOLF_REGION_OPTIONS } from '@shared/golfRegions';

/**
 * 지역 칩. 정의는 shared/golfRegions.ts 하나뿐이다 — 여기에 따로 적어 두면 칩 id 와 서버의
 * 판정 규칙이 조용히 어긋난다(예전에 경기 남/북/동이 서버에서 전부 '경기' 하나로 뭉개져 있었다).
 */
export const REGION_OPTIONS = GOLF_REGION_OPTIONS;

/**
 * 날짜 띠에 그리는 칸 수 = 목록·검색·티커가 불러오는 날 수. 한 곳에서만 정한다.
 * 예전엔 띠는 30칸(오늘~+29)인데 검색·티커는 +30일까지 불러와, 마지막 하루 결과를 눌러도
 * 갈 칩이 없어 아무 일도 안 일어났다(2026-09-10 검토).
 */
export const DATE_STRIP_DAYS = 30;

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
