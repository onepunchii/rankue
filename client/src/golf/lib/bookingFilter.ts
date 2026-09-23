import { isPartyOption } from '../constants/booking';

/**
 * 목록 필터의 **판정**만 떼어낸 순수 함수. 화면(BookingList.filteredTimes)은 이걸 부른다.
 *
 * 왜 떼어냈나: 규칙이 useMemo 안에 있으면 "2인 + 노캐디가 정말 AND 인가" 를 눈으로만 확인할 수 있다.
 * 값을 넣어 돌려 보는 테스트(bookingFilter.test.ts)가 규칙을 굳힌다 — 2026-09-23 전까지 조건 축이
 * `.some()`(OR)이었던 것도, 화면을 열어 보기 전에는 아무도 몰랐다.
 *
 * 규칙(오너 2026-09-23 결정): **같은 축 안에서는 OR, 축과 축 사이는 AND.**
 *   시간  1부·2부·3부              OR   서로 배타적인 구간이다
 *   가격  10만↓·10~15·15~20·20↑    OR   같은 이유
 *   인원  couple_2·player_3        OR   대안이다("둘이든 셋이든 칠 수 있는 곳")
 *         (조인은 solo_ok·three_ok)
 *   조건  no_caddie·marshal·
 *         meal_inc·cart_free       AND  각각 독립된 요구다("노캐디 **그리고** 식사 제공")
 *   축 사이                        AND
 *
 * 날짜·종류(부킹/조인)·조인 종류·정렬·내 주변은 여기 없다 — 목록이 따로 본다.
 */

export type GolfTimeSpan = 'morning' | 'afternoon' | 'night';

/**
 * 한국 시각의 '시' → 시간대. 서버(golf.repo.ts 의 buildGolfFilterConditions)와 **같은 경계**다.
 * 한쪽만 고치면 날짜 띠의 건수 배지(서버가 센다)와 목록(화면이 센다)이 어긋난다.
 *
 * 경계 11시·15시(2026-09-23 오너: "1부 6~11, 2부 11~15, 3부 15시 이후로 보지 않나").
 * 예전 12시·17시는 관행보다 늦었다 — 오후 3시 반 티오프는 현장에서 3부인데 2부로 불렀다.
 *
 * ⚠️ 원래 1·2·3부는 **시계가 아니라 조(組)** 다. 1번홀과 10번홀에서 동시에 나간 한 무리가
 * 한 바퀴 도는 것이 1부이고, 그게 끝나야 2부 첫 티가 나간다. 그래서 실제 시각은 일출과
 * 골프장에 따라 움직인다 — 어떤 숫자로 끊어도 근사치다. 필터로 쓰려면 하나로 굳혀야 해서 굳힌 것뿐이다.
 *
 * 새벽(0~5시)은 1부로 본다 — 여름 첫 티가 05:30 인 코스가 있다. 그래서 라벨도 '06:00' 이 아니라 '새벽' 이다.
 */
export function golfTimeSpan(hour: number): GolfTimeSpan {
    if (hour < 11) return 'morning';
    if (hour < 15) return 'afternoon';
    return 'night';
}

/**
 * 그린피 한 칸. 칸끼리 겹치지 않고 빈 곳도 없다 — **위쪽 끝이 그 칸에 든다**.
 * 100,000 = 10만원 이하 / 150,000 = 10~15만원 / 200,000 = 15~20만원 (정확히 20만원은 '20만원 초과' 가 아니다 — 라벨이 그렇게 적혀 있다).
 * 서버는 같은 경계를 정수로 쓴다(>= 100001 …). green_fee 는 integer 라 두 판정이 같은 답을 낸다.
 */
export function matchesGreenFee(greenFee: number, bucket: string): boolean {
    if (bucket === 'under_10') return greenFee <= 100000;
    if (bucket === 'range_10_15') return greenFee > 100000 && greenFee <= 150000;
    if (bucket === 'range_15_20') return greenFee > 150000 && greenFee <= 200000;
    if (bucket === 'over_20') return greenFee > 200000;
    return false;
}

/** 판정에 필요한 매물의 값만. */
export interface GolfListingFacts {
    /** 한국 시각의 시(0~23). */
    hour: number;
    greenFee: number;
    options: readonly string[];
}

export interface GolfFilterState {
    time?: string[];
    price?: string[];
    special?: string[];
    [key: string]: string[] | undefined;
}

/** 걸린 시간·가격·인원·조건을 **모두** 통과하면 true. */
export function matchesGolfFilters(filters: GolfFilterState, item: GolfListingFacts): boolean {
    // 시간 — 축 안 OR. 'all' 은 훅의 기본값(= 안 건 상태)이라 거르지 않는다.
    const times = filters.time ?? [];
    if (times.length > 0 && !times.includes('all')) {
        if (!times.includes(golfTimeSpan(item.hour))) return false;
    }

    // 가격 — 축 안 OR. sort_* 는 정렬이라 같은 배열에 살지만 판정에선 뺀다.
    const prices = (filters.price ?? []).filter(p => !p.startsWith('sort_'));
    if (prices.length > 0 && !prices.some(p => matchesGreenFee(item.greenFee, p))) return false;

    // 인원 OR · 조건 AND. 어느 id 가 어느 축인지는 constants/booking.ts 한 곳에서만 정한다.
    const special = filters.special ?? [];
    if (special.length > 0) {
        const options = item.options ?? [];
        const party = special.filter(isPartyOption);
        const conditions = special.filter(f => !isPartyOption(f));
        if (party.length > 0 && !party.some(f => options.includes(f))) return false;
        if (!conditions.every(f => options.includes(f))) return false;
    }

    return true;
}
