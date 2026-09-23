/**
 * '골프장별 보기' 의 **묶는 일**만 떼어낸 순수 함수. 화면(BookingList)은 이걸 부른다.
 *
 * 왜 떼어냈나: 옆 파일 bookingFilter.ts 와 같은 이유다. "블라인드 글이 섞이면 어디로 가는가",
 * "정렬이 걸리면 묶음 순서가 어떻게 되는가" 는 useMemo 안에 있으면 화면을 열어 봐야만 알 수 있다.
 * 값을 넣어 돌리는 테스트(courseGroups.test.ts)가 그 표를 굳힌다.
 *
 * 여기서 하지 **않는** 일: 거르기·매물 정렬. 그건 이미 filteredTimes 가 끝낸 것이고,
 * 이 함수는 그 **결과를 받아 묶기만** 한다(묶음 안의 순서 = 받은 순서).
 *
 * 시각은 밀리초(number)로 돌려준다 — 'HH:MM' 으로 찍는 건 화면의 몫이다(kstTime).
 * 이 파일이 시간대 포매터를 들고 있으면 순수 함수가 아니고, 테스트도 ICU 판에 묶인다.
 */

/** 묶는 데 필요한 매물의 값만. 나머지 필드는 items 에 그대로 실려 간다. */
export interface CourseGroupFacts {
    courseId?: string | null;
    courseName?: string | null;
    region?: string | null;
    /** '퍼블릭'·'회원제'. 운영 DB 에 거의 안 채워져 있다 — 없으면 region 으로 대체한다. */
    courseType?: string | null;
    datetime: string | number | Date;
    greenFee?: number | null;
    isBlind?: boolean | null;
    blindName?: string | null;
    isHotDeal?: boolean | null;
    isUrgent?: boolean | null;
}

export type CourseGroupSort = 'default' | 'low' | 'discount';

export interface CourseGroup<T> {
    /** 묶음 열쇠. 펼침 상태를 기억하는 데도 쓴다. */
    key: string;
    name: string;
    /** 가장 싼 값 / 가장 비싼 값. 같으면 화면이 하나만 적는다. */
    minFee: number;
    maxFee: number;
    /**
     * 이름 옆 한 칸. courseType('퍼블릭'·'회원제')이 있으면 그것, 없으면 지역.
     * 경쟁 앱은 여기에 늘 퍼블릭/회원제를 적지만 우리 데이터는 course_type 이 거의 비어 있다 —
     * **있는 것만 쓴다**(빈칸을 자리만 잡아 두면 줄이 무너진다).
     */
    subtitle: string;
    /** 가장 이른 / 가장 늦은 티오프(ms). */
    firstTee: number;
    lastTee: number;
    count: number;
    /** 긴급(isUrgent)이나 긴급 핫딜(isHotDeal)을 가진 묶음인가 — '할인율 높은순' 이 이걸 본다. */
    hasDeal: boolean;
    items: T[];
}

export interface CourseGroupResult<T> {
    groups: CourseGroup<T>[];
    /**
     * 묶지 않은 글 — 목록 맨 아래에 낱개 카드로 둔다.
     *
     * 블라인드 글(isBlind)은 골프장 이름이 **일부러 가려져** 있다('OO cc', '수도권 명문'…).
     * 같은 blindName 끼리 묶으면 서로 다른 골프장을 한 줄로 합치게 되고("OO cc 3팀"),
     * 전부 '비공개 골프장' 하나로 합치면 더 나쁘다 — 묶음 줄의 가격·시간 범위가 아무 뜻도 없는
     * 숫자가 된다. 가릴 만해서 가린 것이니 묶지 않는다.
     */
    ungrouped: T[];
}

/** 열쇠는 courseId 우선, 없으면(옛 글) 이름. 접두사를 붙여 둘이 섞이지 않게 한다. */
export function courseGroupKey(item: CourseGroupFacts): string {
    const id = (item.courseId ?? '').trim();
    if (id) return `id:${id}`;
    return `name:${(item.courseName ?? '').trim()}`;
}

const ms = (v: string | number | Date): number => {
    const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
    return Number.isNaN(t) ? 0 : t;
};

/**
 * 거르고 정렬까지 끝난 목록을 골프장별로 묶는다.
 *
 * 묶음의 순서(오너 2026-09-23):
 *   low      가격 낮은순   → 묶음의 **최저가** 오름차순
 *   discount 할인율 높은순 → 긴급·특가를 가진 묶음이 먼저, 그다음 최저가 오름차순
 *   default  (시간순)      → 가장 이른 티오프 순
 * 어느 쪽이든 같은 값이면 받은 순서를 지킨다(Array.sort 는 안정 정렬이다).
 */
export function groupByCourse<T extends CourseGroupFacts>(
    items: readonly T[],
    sort: CourseGroupSort = 'default',
): CourseGroupResult<T> {
    const groups: CourseGroup<T>[] = [];
    const byKey = new Map<string, CourseGroup<T>>();
    const ungrouped: T[] = [];

    for (const item of items) {
        if (item.isBlind) { ungrouped.push(item); continue; }

        const key = courseGroupKey(item);
        const fee = Number(item.greenFee ?? 0);
        const tee = ms(item.datetime);
        const deal = !!(item.isUrgent || item.isHotDeal);
        const found = byKey.get(key);

        if (found) {
            found.items.push(item);
            found.count += 1;
            if (fee < found.minFee) found.minFee = fee;
            if (fee > found.maxFee) found.maxFee = fee;
            if (tee < found.firstTee) found.firstTee = tee;
            if (tee > found.lastTee) found.lastTee = tee;
            found.hasDeal = found.hasDeal || deal;
            // subtitle 은 먼저 온 글이 비어 있을 때만 뒤 글이 채운다 — 같은 골프장인데 한 글만
            // courseType 을 달고 온 경우가 있다.
            if (!found.subtitle) found.subtitle = subtitleOf(item);
            continue;
        }

        const group: CourseGroup<T> = {
            key,
            name: (item.courseName ?? '').trim() || '골프장',
            minFee: fee,
            maxFee: fee,
            subtitle: subtitleOf(item),
            firstTee: tee,
            lastTee: tee,
            count: 1,
            hasDeal: deal,
            items: [item],
        };
        byKey.set(key, group);
        groups.push(group);
    }

    if (sort === 'low') {
        groups.sort((a, b) => a.minFee - b.minFee);
    } else if (sort === 'discount') {
        groups.sort((a, b) => (a.hasDeal === b.hasDeal ? a.minFee - b.minFee : a.hasDeal ? -1 : 1));
    } else {
        groups.sort((a, b) => a.firstTee - b.firstTee);
    }

    return { groups, ungrouped };
}

function subtitleOf(item: CourseGroupFacts): string {
    return (item.courseType ?? '').trim() || (item.region ?? '').trim();
}

/** 지금 걸린 정렬(price 배열의 sort_*)을 묶음 정렬로 옮긴다. 목록이 쓰는 값과 같은 곳에서 읽는다. */
export function groupSortOf(priceFilters: readonly string[] | undefined): CourseGroupSort {
    const f = priceFilters ?? [];
    if (f.includes('sort_low')) return 'low';
    if (f.includes('sort_discount')) return 'discount';
    return 'default';
}

/** '120,000 ~ 190,000원' · 하나뿐이면 '120,000원'. */
export function feeRangeLabel(minFee: number, maxFee: number): string {
    return minFee === maxFee
        ? `${minFee.toLocaleString()}원`
        : `${minFee.toLocaleString()} ~ ${maxFee.toLocaleString()}원`;
}
