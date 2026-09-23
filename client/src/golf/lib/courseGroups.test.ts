import { describe, it, expect } from 'vitest';
import { groupByCourse, courseGroupKey, groupSortOf, feeRangeLabel, type CourseGroupFacts } from './courseGroups';

/**
 * 오너가 정한 '골프장별 보기' 규칙(2026-09-23)을 값을 넣어 굳힌다.
 *   열쇠는 courseId(없으면 이름) · 블라인드는 안 묶는다 · 묶음 순서는 걸린 정렬을 따른다 ·
 *   묶음 안의 순서는 받은 순서 그대로.
 */

type Item = CourseGroupFacts & { id: string };

const at = (hhmm: string) => `2026-09-25T${hhmm}:00+09:00`;

const item = (id: string, over: Partial<Item> = {}): Item => ({
    id,
    courseId: 'c1',
    courseName: '신라cc',
    region: '경기',
    datetime: at('07:04'),
    greenFee: 120000,
    ...over,
});

describe('courseGroupKey — courseId 가 먼저, 없으면 이름', () => {
    it('courseId 가 있으면 이름이 달라도 한 묶음', () => {
        expect(courseGroupKey(item('a', { courseId: 'c1', courseName: '신라cc' })))
            .toBe(courseGroupKey(item('b', { courseId: 'c1', courseName: '신라CC' })));
    });

    it('courseId 가 없는 옛 글은 이름으로 묶인다', () => {
        expect(courseGroupKey(item('a', { courseId: null, courseName: '남서울' })))
            .toBe(courseGroupKey(item('b', { courseId: '', courseName: '남서울' })));
        expect(courseGroupKey(item('a', { courseId: null, courseName: '남서울' })))
            .not.toBe(courseGroupKey(item('b', { courseId: null, courseName: '레이크사이드' })));
    });
});

describe('묶음 줄의 요약값', () => {
    const list = [
        item('1', { datetime: at('07:04'), greenFee: 120000 }),
        item('2', { datetime: at('14:19'), greenFee: 190000 }),
        item('3', { datetime: at('09:30'), greenFee: 150000 }),
    ];

    it('가격 범위 · 시간 범위 · N팀', () => {
        const { groups } = groupByCourse(list);
        expect(groups).toHaveLength(1);
        const g = groups[0];
        expect(g.name).toBe('신라cc');
        expect(g.minFee).toBe(120000);
        expect(g.maxFee).toBe(190000);
        expect(g.count).toBe(3);
        expect(g.firstTee).toBe(new Date(at('07:04')).getTime());
        expect(g.lastTee).toBe(new Date(at('14:19')).getTime());
        expect(feeRangeLabel(g.minFee, g.maxFee)).toBe('120,000 ~ 190,000원');
    });

    it('가격이 하나뿐이면 범위가 아니라 값 하나', () => {
        const { groups } = groupByCourse([item('1'), item('2', { datetime: at('09:00') })]);
        expect(feeRangeLabel(groups[0].minFee, groups[0].maxFee)).toBe('120,000원');
    });

    it('subtitle 은 courseType 이 있으면 그것, 없으면 지역 — 빈칸을 만들지 않는다', () => {
        expect(groupByCourse([item('1')]).groups[0].subtitle).toBe('경기');
        expect(groupByCourse([item('1', { courseType: '퍼블릭' })]).groups[0].subtitle).toBe('퍼블릭');
        // 먼저 온 글이 비어 있으면 뒤 글이 채운다
        const mixed = groupByCourse([item('1', { courseType: null, region: '' }), item('2', { courseType: '회원제' })]);
        expect(mixed.groups[0].subtitle).toBe('회원제');
    });

    it('묶음 안의 순서는 받은 순서 그대로 — 여기서 다시 정렬하지 않는다', () => {
        const { groups } = groupByCourse(list);
        expect(groups[0].items.map(i => i.id)).toEqual(['1', '2', '3']);
    });
});

describe('시간 범위', () => {
    it('한 건뿐이면 가장 이른 = 가장 늦은 — 화면이 하나만 적는다', () => {
        const g = groupByCourse([item('1', { datetime: at('07:04') })]).groups[0];
        expect(g.firstTee).toBe(g.lastTee);
    });

    it('자정을 낀 티오프(00:10 · 23:50)가 섞여도 범위가 뒤집히지 않는다', () => {
        // 목록은 **한국 날짜 하루치**만 남기고 넘어온다(BookingList 의 kstDateKey 비교).
        // 그래서 같은 날의 00:10 과 23:50 이고, 밀리초로 재면 00:10 이 먼저다 — 문자열
        // 'HH:MM' 으로 비교했다면 여기서 뒤집혔을 자리다.
        const { groups } = groupByCourse([
            item('1', { datetime: at('23:50') }),
            item('2', { datetime: at('00:10') }),
        ]);
        expect(groups[0].firstTee).toBe(new Date(at('00:10')).getTime());
        expect(groups[0].lastTee).toBe(new Date(at('23:50')).getTime());
        expect(groups[0].firstTee).toBeLessThan(groups[0].lastTee);
    });
});

describe('가격 범위 표기(feeRangeLabel)', () => {
    it('같은 값이면 하나만, 다르면 범위', () => {
        expect(feeRangeLabel(120000, 120000)).toBe('120,000원');
        expect(feeRangeLabel(120000, 190000)).toBe('120,000 ~ 190,000원');
    });

    it('여러 건이라도 전부 같은 값이면 하나만', () => {
        const { groups } = groupByCourse([
            item('1', { greenFee: 88000, datetime: at('07:00') }),
            item('2', { greenFee: 88000, datetime: at('13:30') }),
            item('3', { greenFee: 88000, datetime: at('09:00') }),
        ]);
        expect(feeRangeLabel(groups[0].minFee, groups[0].maxFee)).toBe('88,000원');
    });
});

describe('열쇠가 갈라야 할 것과 합쳐야 할 것', () => {
    it('이름이 같아도 courseId 가 다르면 따로 묶인다 — 합치면 남의 골프장 가격이 섞인다', () => {
        const { groups } = groupByCourse([
            item('1', { courseId: 'c1', courseName: '레이크사이드', greenFee: 120000 }),
            item('2', { courseId: 'c2', courseName: '레이크사이드', greenFee: 300000 }),
        ]);
        expect(groups).toHaveLength(2);
        expect(groups.map(g => g.minFee).sort((a, b) => a - b)).toEqual([120000, 300000]);
    });

    it('courseId 가 있는 글과 없는 글은 이름이 같아도 갈라진다(현재 규칙)', () => {
        // golf_listings.course_id 는 notNull 이라 실제로는 안 생기는 조합이다.
        // 그래도 규칙을 적어 둔다: id 가 있으면 id 로만 묶는다 — 손으로 적힌 이름이
        // 우연히 같다는 이유로 다른 골프장을 합치는 것보다 두 줄로 나오는 쪽이 낫다.
        const { groups } = groupByCourse([
            item('1', { courseId: 'c1', courseName: '남서울' }),
            item('2', { courseId: null, courseName: '남서울' }),
        ]);
        expect(groups).toHaveLength(2);
        expect(groups.every(g => g.name === '남서울')).toBe(true);
    });
});

describe('블라인드 글은 묶지 않는다', () => {
    const blindA = item('b1', { isBlind: true, blindName: 'OO cc', courseId: 'c9', courseName: '가려짐' });
    const blindB = item('b2', { isBlind: true, blindName: 'OO cc', courseId: 'c9', courseName: '가려짐' });

    it('같은 blindName·같은 courseId 라도 낱개로 남는다 (서로 다른 골프장일 수 있다)', () => {
        const { groups, ungrouped } = groupByCourse([item('1'), blindA, blindB]);
        expect(groups).toHaveLength(1);
        expect(groups[0].count).toBe(1);
        expect(ungrouped.map(i => i.id)).toEqual(['b1', 'b2']);
    });

    it('블라인드만 있으면 묶음이 하나도 없다', () => {
        const { groups, ungrouped } = groupByCourse([blindA, blindB]);
        expect(groups).toHaveLength(0);
        expect(ungrouped).toHaveLength(2);
    });
});

describe('묶음 순서는 걸린 정렬을 따른다', () => {
    const 신라 = item('1', { courseId: 'c1', courseName: '신라cc', datetime: at('11:00'), greenFee: 190000 });
    const 남서울 = item('2', { courseId: 'c2', courseName: '남서울', datetime: at('07:00'), greenFee: 150000 });
    const 레이크 = item('3', { courseId: 'c3', courseName: '레이크사이드', datetime: at('09:00'), greenFee: 200000, isHotDeal: true });
    const list = [신라, 남서울, 레이크];

    it('기본은 가장 이른 티오프 순', () => {
        // 남서울 07:00 · 레이크사이드 09:00 · 신라cc 11:00
        expect(groupByCourse(list, 'default').groups.map(g => g.name)).toEqual(['남서울', '레이크사이드', '신라cc']);
    });

    it('가격 낮은순이면 묶음의 최저가 오름차순', () => {
        expect(groupByCourse(list, 'low').groups.map(g => g.name)).toEqual(['남서울', '신라cc', '레이크사이드']);
        const cheap = item('4', { courseId: 'c4', courseName: '민둥산', datetime: at('20:00'), greenFee: 90000 });
        expect(groupByCourse([...list, cheap], 'low').groups.map(g => g.name)[0]).toBe('민둥산');
    });

    it('할인율 높은순이면 긴급·특가를 가진 묶음이 먼저', () => {
        expect(groupByCourse(list, 'discount').groups.map(g => g.name)).toEqual(['레이크사이드', '남서울', '신라cc']);
        // isUrgent 도 같은 자격이다
        const urgent = item('5', { courseId: 'c5', courseName: '베어스타운', datetime: at('06:00'), greenFee: 210000, isUrgent: true });
        expect(groupByCourse([...list, urgent], 'discount').groups.map(g => g.name).slice(0, 2))
            .toEqual(['레이크사이드', '베어스타운']);
    });

    it('한 매물이 특가면 그 묶음 전체가 특가 자격을 갖는다', () => {
        const { groups } = groupByCourse([
            item('1', { courseId: 'c1', greenFee: 190000 }),
            item('2', { courseId: 'c1', greenFee: 100000, isHotDeal: true }),
        ], 'discount');
        expect(groups[0].hasDeal).toBe(true);
        expect(groups[0].minFee).toBe(100000);
    });

    it('groupSortOf 는 price 배열의 sort_* 를 읽는다', () => {
        expect(groupSortOf(undefined)).toBe('default');
        expect(groupSortOf(['under_10'])).toBe('default');
        expect(groupSortOf(['under_10', 'sort_low'])).toBe('low');
        expect(groupSortOf(['sort_discount'])).toBe('discount');
    });
});

describe('빈 목록·망가진 값', () => {
    it('빈 목록은 빈 결과', () => {
        expect(groupByCourse([])).toEqual({ groups: [], ungrouped: [] });
    });

    it('이름이 없으면 줄이 비지 않게 대체 이름을 쓴다', () => {
        expect(groupByCourse([item('1', { courseId: null, courseName: null })]).groups[0].name).toBe('골프장');
    });

    it('묶은 매물 수의 합은 원래 개수와 같다 — 묶기가 글을 잃지 않는다', () => {
        const list = [item('1'), item('2', { courseId: 'c2' }), item('3', { isBlind: true })];
        const { groups, ungrouped } = groupByCourse(list);
        expect(groups.reduce((n, g) => n + g.items.length, 0) + ungrouped.length).toBe(list.length);
    });

    /**
     * 묶기의 유일한 절대 조건: **하나도 빠지지 않고, 하나도 겹치지 않는다.**
     * 개수만 세면 같은 글이 두 묶음에 들어가고 다른 글이 사라진 경우를 못 잡는다 — id 집합으로 본다.
     */
    it.each(['default', 'low', 'discount'] as const)('어떤 정렬(%s)에서도 글이 빠지거나 겹치지 않는다', (sort) => {
        const list: Item[] = [
            item('1', { courseId: 'c1', courseName: '신라cc', greenFee: 120000, datetime: at('07:04') }),
            item('2', { courseId: 'c1', courseName: '신라cc', greenFee: 190000, datetime: at('14:19') }),
            item('3', { courseId: 'c2', courseName: '남서울', greenFee: 99000, datetime: at('06:30'), isHotDeal: true }),
            item('4', { courseId: 'c3', courseName: '레이크사이드', greenFee: 210000, datetime: at('08:00') }),
            item('5', { courseId: 'c3', courseName: '레이크사이드', greenFee: 210000, datetime: at('11:00'), isUrgent: true }),
            item('6', { courseId: null, courseName: '베어스타운', greenFee: 88000, datetime: at('13:30') }),
            item('b1', { isBlind: true, blindName: 'OO cc', datetime: at('09:00') }),
            item('b2', { isBlind: true, blindName: '수도권 명문', datetime: at('10:00') }),
        ];
        const { groups, ungrouped } = groupByCourse(list, sort);

        const seen = [...groups.flatMap(g => g.items.map(i => i.id)), ...ungrouped.map(i => i.id)];
        expect(seen).toHaveLength(list.length);              // 겹치지 않는다
        expect(new Set(seen).size).toBe(list.length);        // 중복이 없다
        expect([...seen].sort()).toEqual(list.map(i => i.id).sort()); // 빠진 글이 없다
        expect(ungrouped.map(i => i.id)).toEqual(['b1', 'b2']);       // 블라인드는 늘 낱개

        // N팀 = 그 묶음의 글 수와 정확히 같다
        groups.forEach(g => expect(g.count).toBe(g.items.length));
        // 요약값이 실제 items 에서 나온 값과 어긋나지 않는다
        groups.forEach(g => {
            const fees = g.items.map(i => Number(i.greenFee));
            const tees = g.items.map(i => new Date(i.datetime as string).getTime());
            expect(g.minFee).toBe(Math.min(...fees));
            expect(g.maxFee).toBe(Math.max(...fees));
            expect(g.firstTee).toBe(Math.min(...tees));
            expect(g.lastTee).toBe(Math.max(...tees));
            expect(g.hasDeal).toBe(g.items.some(i => i.isHotDeal || i.isUrgent));
        });
    });
});
