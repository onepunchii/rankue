import { describe, it, expect } from 'vitest';
import { matchesGolfFilters, matchesGreenFee, golfTimeSpan, type GolfListingFacts } from './bookingFilter';

/**
 * 오너가 정한 조합 규칙(2026-09-23)을 **값을 넣어** 굳힌다.
 *   시간 OR · 가격 OR · 인원 OR · 조건 AND · 축 사이 AND.
 * 이 표가 깨지면 "노캐디를 골랐는데 캐디 있는 매물이 식사 준다고 끼어드는" 일이 돌아온다.
 */

/** 가짜 매물. 이름은 결과를 읽을 때 무엇이 걸렸는지 알아보려고 붙인다. */
const listing = (name: string, hour: number, greenFee: number, options: string[] = []) =>
    ({ name, hour, greenFee, options } as GolfListingFacts & { name: string });

const 레이크 = listing('레이크사이드 07:00 9만 노캐디+식사', 7, 90000, ['no_caddie', 'meal_inc']);
const 남서울 = listing('남서울 13:00 12만 노캐디', 13, 120000, ['no_caddie']);
const 스카이 = listing('스카이72 19:00 17만 2인+식사', 19, 170000, ['couple_2', 'meal_inc']);
const 베어스 = listing('베어스타운 10:00 22만 3인', 10, 220000, ['player_3']);
const 민둥산 = listing('민둥산 15:00 14만 옵션없음', 15, 140000, []);

const ALL = [레이크, 남서울, 스카이, 베어스, 민둥산];
const hit = (filters: any, pool = ALL) => pool.filter(i => matchesGolfFilters(filters, i)).map(i => i.name);

describe('골프 목록 필터 — 축 안 OR, 축 사이 AND', () => {
    it('아무것도 안 걸면 그 날짜 전부 (time: ["all"] 은 훅의 기본값이라 거르지 않는다)', () => {
        expect(hit({})).toHaveLength(5);
        expect(hit({ time: ['all'], price: [], special: [] })).toHaveLength(5);
        // 정렬만 걸린 것도 거르지 않는다 — sort_* 는 price 배열에 같이 사는 값이다
        expect(hit({ time: ['all'], price: ['sort_low', 'sort_discount'], special: [] })).toHaveLength(5);
    });

    it('조건 축은 AND — 하나만 가진 매물은 안 걸린다', () => {
        // no_caddie 만 가진 남서울은 빠지고, 둘 다 가진 레이크사이드만 남는다
        expect(hit({ special: ['no_caddie', 'meal_inc'] })).toEqual([레이크.name]);
        // OR 이던 시절이면 남서울도 같이 나왔다
        expect(hit({ special: ['no_caddie'] })).toEqual([레이크.name, 남서울.name]);
    });

    it('인원 축은 OR — 둘 중 하나만 맞아도 걸린다', () => {
        expect(hit({ special: ['couple_2', 'player_3'] })).toEqual([스카이.name, 베어스.name]);
        expect(hit({ special: ['couple_2'] })).toEqual([스카이.name]);
    });

    it('축 사이는 AND — 인원 하나 + 조건 하나는 둘 다 만족해야 한다', () => {
        expect(hit({ special: ['couple_2', 'no_caddie'] })).toEqual([]);           // 2인이면서 노캐디인 매물은 없다
        expect(hit({ special: ['couple_2', 'meal_inc'] })).toEqual([스카이.name]); // 2인이면서 식사 제공
        // 인원 OR 은 살아 있고 조건 AND 는 따로 걸린다
        expect(hit({ special: ['couple_2', 'player_3', 'meal_inc'] })).toEqual([스카이.name]);
    });

    it('조인 옵션도 같은 표를 따른다 — solo_ok·three_ok 는 인원(OR), 나머지는 조건(AND)', () => {
        const 혼자 = listing('조인A 1인가능', 9, 80000, ['solo_ok', 'beginner_ok']);
        const 셋 = listing('조인B 3인진행', 9, 80000, ['three_ok']);
        const 초보 = listing('조인C 초보환영', 9, 80000, ['beginner_ok']);
        const pool = [혼자, 셋, 초보];
        expect(hit({ special: ['solo_ok', 'three_ok'] }, pool)).toEqual([혼자.name, 셋.name]);          // OR
        expect(hit({ special: ['beginner_ok', 'caddie_prepaid'] }, pool)).toEqual([]);                  // AND
        expect(hit({ special: ['solo_ok', 'beginner_ok'] }, pool)).toEqual([혼자.name]);                // 축 사이 AND
    });

    it('시간 축은 OR — 고른 구간만 나온다', () => {
        // 경계 11시·15시라 민둥산 15:00 은 3부다(옛 경계 17시에서는 2부였다).
        expect(hit({ time: ['morning', 'night'] })).toEqual([레이크.name, 스카이.name, 베어스.name, 민둥산.name]); // 2부(남서울) 빠짐
        expect(hit({ time: ['afternoon'] })).toEqual([남서울.name]);
    });

    it('가격 축은 OR — 양 끝만 고르면 가운데가 빠진다', () => {
        expect(hit({ price: ['under_10', 'over_20'] })).toEqual([레이크.name, 베어스.name]);
        // 정렬이 섞여 있어도 판정은 구간만 본다
        expect(hit({ price: ['under_10', 'over_20', 'sort_low'] })).toEqual([레이크.name, 베어스.name]);
    });

    it('시간 + 가격 + 옵션을 한꺼번에 — 축 사이는 AND', () => {
        expect(hit({ time: ['morning'], price: ['under_10'], special: ['no_caddie'] })).toEqual([레이크.name]);
        expect(hit({ time: ['afternoon'], price: ['under_10'], special: ['no_caddie'] })).toEqual([]); // 시간이 안 맞는다
    });
});

describe('경계값', () => {
    it('그린피: 위쪽 끝이 그 칸에 든다 — 칸끼리 겹치지도, 빠지는 값도 없다', () => {
        const bucketOf = (fee: number) =>
            ['under_10', 'range_10_15', 'range_15_20', 'over_20'].filter(b => matchesGreenFee(fee, b));
        expect(bucketOf(99999)).toEqual(['under_10']);
        expect(bucketOf(100000)).toEqual(['under_10']);      // 정확히 10만원 → '10만원 이하'
        expect(bucketOf(100001)).toEqual(['range_10_15']);
        expect(bucketOf(150000)).toEqual(['range_10_15']);   // 정확히 15만원 → '10 ~ 15만원'
        expect(bucketOf(150001)).toEqual(['range_15_20']);
        expect(bucketOf(200000)).toEqual(['range_15_20']);   // 정확히 20만원 → '15 ~ 20만원'
        expect(bucketOf(200001)).toEqual(['over_20']);
        expect(bucketOf(0)).toEqual(['under_10']);           // 스크린 조인의 0원(비용 1/N)도 어딘가엔 든다
    });

    it('시간: 12:00 은 2부, 17:00 은 3부', () => {
        // 경계 11시·15시(2026-09-23 오너). 정각은 **다음 부**에 든다.
        expect(golfTimeSpan(10)).toBe('morning');   // 10:59 까지 1부
        expect(golfTimeSpan(11)).toBe('afternoon'); // 11:00 부터 2부
        expect(golfTimeSpan(14)).toBe('afternoon'); // 14:59 까지 2부
        expect(golfTimeSpan(15)).toBe('night');     // 15:00 부터 3부
        expect(golfTimeSpan(5)).toBe('morning');    // 여름 첫 티 05:30 도 1부다
        expect(golfTimeSpan(23)).toBe('night');
    });

    it('분은 시간대를 가르지 않는다 — 10:59 와 11:00 만 갈린다', () => {
        const 열시오십구 = listing('10:59', 10, 100000);
        const 열한시 = listing('11:00', 11, 100000);
        expect(hit({ time: ['morning'] }, [열시오십구, 열한시])).toEqual(['10:59']);
        expect(hit({ time: ['afternoon'] }, [열시오십구, 열한시])).toEqual(['11:00']);
        // 2부↔3부 경계도 같은 규칙 — 정각은 다음 부에 든다.
        const 열네시 = listing('14:00', 14, 100000);
        const 열다섯시 = listing('15:00', 15, 100000);
        expect(hit({ time: ['afternoon'] }, [열네시, 열다섯시])).toEqual(['14:00']);
        expect(hit({ time: ['night'] }, [열네시, 열다섯시])).toEqual(['15:00']);
    });
});
