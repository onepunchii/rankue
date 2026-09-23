import { GOLF_REGION_OPTIONS } from '@shared/golfRegions';
import { JOIN_OPTIONS } from '@shared/golfJoin';

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
    { id: 'over_20', label: '20만원 초과' },
    { id: 'sort_low', label: '가격 낮은순' },
    { id: 'sort_discount', label: '할인율 높은순' }
];

/**
 * 인원 축 — **서로 대안**이다. 셋이 와서 '2인 플레이' 와 '3인 가능' 을 같이 고르면
 * "둘도 되고 셋도 되는 곳" 을 찾는 게 아니라 "둘이든 셋이든 칠 수 있는 곳" 을 찾는 것이다 → **OR**.
 */
export const PARTY_OPTIONS = [
    { id: 'couple_2', label: '2인 플레이' },
    { id: 'player_3', label: '3인 가능' }
];

/**
 * 조건 축 — 각각 **독립된 요구**다 → **AND**.
 * OR 이면 '노캐디' 를 고른 사람 앞에 캐디 있는 매물이 '식사 제공' 이라는 이유만으로 끼어든다
 * (2026-09-23 전까지의 동작이었다 — BookingList 의 `.some()`).
 */
export const CONDITION_OPTIONS = [
    { id: 'no_caddie', label: '노캐디' },
    { id: 'marshal', label: '마샬/드라이빙 캐디' },
    { id: 'meal_inc', label: '식사 제공' },
    { id: 'cart_free', label: '카트비 무료/할인' }
];

/**
 * 부킹 매물의 options. 인원 둘 + 조건 넷을 한 배열로 합친 것 — 순서·값은 예전과 같다
 * (BookingCreateSheet 의 체크 목록과 BookingCard 의 라벨 찾기가 이걸 그대로 쓴다).
 */
export const SPECIAL_OPTIONS = [...PARTY_OPTIONS, ...CONDITION_OPTIONS];

/**
 * **어느 id 가 인원이고 어느 id 가 조건인지는 여기 한 곳에서만 정한다.**
 * 상태 훅(useBookingFilters)의 `special` 배열은 두 무리를 **섞어서** 갖고 있다 — 모양을 바꾸면
 * 저장된 상태를 옮겨야 하므로 배열은 그대로 두고, 판정(BookingList.filteredTimes)과
 * 화면(FilterBar 의 시트 섹션)이 이 표를 같이 본다.
 *
 * 조인 매물의 options 는 JOIN_OPTIONS(shared/golfJoin.ts)에서 오는데, 같은 `special` 배열에 들어온다.
 * 그중 solo_ok(1인 신청 가능)·three_ok(3인도 진행)도 "몇 명이 갈 수 있나" 를 묻는 대안이라 인원 축이다.
 */
export const PARTY_OPTION_IDS: string[] = [...PARTY_OPTIONS.map(o => o.id), 'solo_ok', 'three_ok'];

/** 인원 축이면 true(→ OR), 아니면 조건 축(→ AND). */
export const isPartyOption = (id: string) => PARTY_OPTION_IDS.includes(id);

/**
 * ⚠️ **지금 화면 어디에도 안 그려진다.** 필터 줄이 A안으로 바뀌면서(2026-09-23) 시간대 셋이 빠른 칩으로
 * 바깥에 나왔고, 상세필터 시트에 시간 섹션이 없어졌다. 칩 라벨('1부')은 FilterBar 가 직접 갖고 있고,
 * 빈 화면은 TIME_SHORT_LABEL 을 쓴다. 이 긴 라벨은 **나중에 시간 섹션이 다시 생길 때를 위해** 남겨 둔 것이다.
 * 경계 숫자는 golfTimeSpan(bookingFilter.ts)·서버 SQL(golf.repo.ts)과 맞춰 뒀으니, 되살릴 때 셋을 같이 봐라.
 */
export const TIME_OPTIONS = [
    { id: 'all', label: '전체 시간' },
    { id: 'morning', label: '1부 (새벽 ~ 11:00)' },
    { id: 'afternoon', label: '2부 (11:00 ~ 15:00)' },
    { id: 'night', label: '3부 (15:00 ~ 이후)' }
];

/**
 * 짧은 이름. TIME_OPTIONS 의 라벨은 시각까지 달고 있어("1부 (새벽 ~ 11:00)") 칩 한 줄에 못 들어간다.
 * 빠른 칩과 빈 화면의 '걸린 필터' 칩이 이걸 쓴다.
 */
export const TIME_SHORT_LABEL: Record<string, string> = {
    all: '전체 시간',
    morning: '1부',
    afternoon: '2부',
    night: '3부'
};

/**
 * 걸린 필터 하나를 사람 말로. 빈 화면이 "무엇 때문에 0건인지" 를 실제 이름으로 말하는 데 쓴다.
 * 조인 매물의 옵션(JOIN_OPTIONS)도 같은 `special` 칸에 들어오므로 둘 다 찾아본다.
 */
export function filterLabel(category: string, id: string): string {
    if (category === 'time') return TIME_SHORT_LABEL[id] ?? id;
    if (category === 'region') return REGION_OPTIONS.find(o => o.id === id)?.label ?? id;
    if (category === 'price') return PRICE_OPTIONS.find(o => o.id === id)?.label ?? id;
    if (category === 'special') {
        return SPECIAL_OPTIONS.find(o => o.id === id)?.label
            ?? JOIN_OPTIONS.find(o => o.id === id)?.label
            ?? id;
    }
    return id;
}

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
