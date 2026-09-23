import { useMemo } from 'react';
import {
    LucideSunHorizon, LucideSun, LucideMoonStars,
    LucideCurrencyKrw, LucideUsers, LucideUser, LucideUserMinus,
    LucideFilter, LucideChevronDown, LucideX, LucideCheck,
} from '@/lib/icons';
import { cn } from '@/lib/utils';
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetClose } from '@/components/ui/sheet';
import { JOIN_OPTIONS } from '@shared/golfJoin';
import { REGION_OPTIONS, PRICE_OPTIONS, PARTY_OPTIONS, CONDITION_OPTIONS, isPartyOption } from '../../constants/booking';

/**
 * "값을 바깥으로" (2026-09-23 오너: A안 채택 — "가격 부분이 중요해서").
 *
 * 예전 줄은 알약 넷이 전부 **문**이었다. 무엇을 누르든 시트가 열리고, 고르고, '적용'을 눌러야 닫힌다.
 * '1부만 보기' 하나 거는 데 세 번(시간 → 1부 → 적용). 여기서는 가장 자주 거는 값 — 특히 **가격** — 을
 * 바닥 시트 밖으로 꺼내 **한 번**에 걸리게 하고, 나머지(지역·가격 구간·옵션)는 시트 **하나**에 모았다.
 *
 * 줄 구성
 *   1) 제어 줄  [▽ 상세필터] [최신순 ▽] [골프장별 ◯] — 테두리만 있는 납작한 알약
 *   2) 빠른 칩  1부 2부 3부 10만↓ 2인 노캐디       — 아이콘 위·라벨 아래, 누르면 그 자리에서 걸린다
 *
 * ⚠️ 상태는 useBookingFilters 의 모양을 **그대로** 쓴다(price 배열 안에 sort_ 접두사가 섞여 사는 것까지).
 *    정렬은 화면에서만 갈라 보여 준다.
 * ⚠️ 골프 테마가 `.bg-*`/`.text-*` 유틸리티를 바꿔 끼우므로, 브랜드색은 전부 인라인 style 의 리터럴 hex 로 쓴다.
 */

interface FilterBarProps {
    selectedFilters: Record<string, string[]>;
    toggleFilter: (category: string, id: string) => void;
    clearFilter: (category: string) => void;
    viewType: 'ALL' | 'BOOKING' | 'JOIN';
    /**
     * '골프장별 보기' 스위치. **상태는 BookingList 가 갖는다** — 묶는 것도 거기고,
     * 기억(localStorage)도 거기다. 여기는 켜졌는지 보여 주고 누른 것을 알릴 뿐이다.
     * 둘 다 안 주면 스위치를 아예 안 그린다(조인 탭 — 이유는 BookingList 에).
     */
    groupByCourse?: boolean;
    onToggleGroup?: () => void;
}

/** 정렬은 가격 시트에서 떼어내 제 버튼을 준다. 값은 여전히 price 배열에 sort_ 로 들어간다. */
const SORT_IDS = ['sort_low', 'sort_discount'] as const;
const SORT_LABEL: Record<string, string> = {
    sort_low: '가격 낮은순',
    sort_discount: '할인율 높은순',
};

type QuickChip = { category: 'time' | 'price' | 'special'; id: string; label: string; icon: any };

/** 시간·가격은 어느 탭에서나 같은 뜻이다. */
const COMMON_CHIPS: QuickChip[] = [
    { category: 'time', id: 'morning', label: '1부', icon: LucideSunHorizon },
    { category: 'time', id: 'afternoon', label: '2부', icon: LucideSun },
    { category: 'time', id: 'night', label: '3부', icon: LucideMoonStars },
    { category: 'price', id: 'under_10', label: '10만↓', icon: LucideCurrencyKrw },
];

/**
 * 바깥에 꺼낸 것. 고른 기준은 "이게 아니면 애초에 못 치는 것" 이다.
 *  - 1·2·3부: 사람의 일정은 고정이다. 시간대는 매물을 고르는 게 아니라 **칠 수 있나 없나**를 가른다.
 *    셋이면 TIME_OPTIONS 가 통째로 밖으로 나온다('전체 시간' = 아무것도 안 누른 상태).
 *  - 10만↓: 가격은 시간 다음으로 센 축이고, 구간 중 첫 칸 하나만 꺼내면 '싼 거부터' 한 번에 걸린다.
 *  - 2인 플레이: 둘이 왔으면 4인 티타임은 아예 못 쓴다. 이것도 취향이 아니라 가능·불가능이다.
 *  - 노캐디: 캐디피는 1인 4~5만원이다. 돈이 갈리는 칸이라 사람들이 실제로 먼저 거른다.
 * 꺼내지 않은 것: 지역(아홉 개짜리 목록이라 한 줄에 못 산다), 나머지 가격 구간·옵션(취향).
 */
const BOOKING_CHIPS: QuickChip[] = [
    ...COMMON_CHIPS,
    { category: 'special', id: 'couple_2', label: '2인', icon: LucideUsers },
    { category: 'special', id: 'no_caddie', label: '노캐디', icon: LucideUserMinus },
];

/**
 * 조인은 다섯이다. 부킹의 옵션 여섯(couple_2·player_3·marshal·meal_inc·cart_free…)은 **조인 글에 아예
 * 들어가지 않는다** — JoinCreateSheet 는 JOIN_OPTIONS(solo_ok·three_ok·beginner_ok·caddie_prepaid·no_caddie)
 * 만 저장한다. 그래서 조인에서 '2인' 칩은 어떤 매물도 맞힐 수 없는 **항상 0건 버튼**이다. 뺀다.
 * 대신 조인에서 제일 먼저 묻는 것 — "혼자 가도 받아 주나" — 를 꺼냈다.
 * 노캐디도 뺐다: JOIN_OPTIONS 에서 FIELD 전용이라, 바로 아래 종류 스위치(전체/필드/스크린/파크) 중
 * 셋에서는 뜻이 없는 칩이 자리만 차지한다. 상세필터 시트에는 그대로 있다.
 * 하나 줄인 만큼 종류 스위치 + 📍내 주변 줄이 더해지는 조인 화면의 가로 여유도 늘었다.
 */
const JOIN_CHIPS: QuickChip[] = [
    ...COMMON_CHIPS,
    { category: 'special', id: 'solo_ok', label: '1인', icon: LucideUser },
];

export const FilterBar = ({ selectedFilters, toggleFilter, clearFilter, viewType, groupByCourse, onToggleGroup }: FilterBarProps) => {
    const isJoin = viewType === 'JOIN';
    const accent = isJoin ? '#FF6B00' : '#64DD17';
    const onAccent = isJoin ? '#FFFFFF' : '#051907';

    const chips = isJoin ? JOIN_CHIPS : BOOKING_CHIPS;
    const quickIds = useMemo(() => new Set(chips.map(c => c.id)), [chips]);

    const activeSort = selectedFilters.price.find(p => p.startsWith('sort_'));

    /**
     * 상세필터 배지 = **시트를 열어야만 보이는** 조건의 수.
     * 빠른 칩으로 이미 눈에 보이는 값과 정렬은 세지 않는다. 옛 줄의 "가격 ②" 는 구간 하나 + 정렬 하나를
     * 같이 세서, 열어 보기 전엔 그 2가 무엇인지 알 수 없었다.
     * 시간의 'all' 도 세지 않는다 — 훅의 기본값이라 아무것도 안 건 첫 화면부터 "시간 ①" 이 켜져 있었다.
     */
    const hiddenCount = useMemo(() => {
        const region = selectedFilters.region.length;
        const price = selectedFilters.price.filter(p => !p.startsWith('sort_') && !quickIds.has(p)).length;
        const time = selectedFilters.time.filter(t => t !== 'all' && !quickIds.has(t)).length;
        const special = selectedFilters.special.filter(s => !quickIds.has(s)).length;
        return region + price + time + special;
    }, [selectedFilters, quickIds]);

    /**
     * 정렬은 하나만 — 고르면 다른 정렬은 끈다. 기본(시간순)으로 돌아가려면 시트의 '최신순' 을 고른다.
     * toggleFilter 는 함수형 setState 라 연달아 불러도 서로 덮지 않는다.
     */
    const pickSort = (id: string | null) => {
        SORT_IDS.forEach(s => {
            const on = selectedFilters.price.includes(s);
            if (on && s !== id) toggleFilter('price', s);
        });
        if (id && !selectedFilters.price.includes(id)) toggleFilter('price', id);
    };

    /**
     * 초기화 — **결과를 줄이는 것만** 끈다. 정렬(sort_)은 남긴다.
     * clearFilter('price') 는 같은 배열에 사는 sort_ 까지 쓸어 가는데, 정렬은 순서만 바꿀 뿐
     * 결과를 줄이지 않는다. 다른 메뉴에서 고른 '가격 낮은순' 이 여기 버튼에 딸려 사라지면
     * 사용자는 왜 순서가 돌아갔는지 알 수 없다(0건 화면의 '전부 끄기' 도 같은 규칙이다).
     */
    const resetAll = () => {
        clearFilter('region');
        clearFilter('special');
        clearFilter('time');
        selectedFilters.price.filter(p => !p.startsWith('sort_')).forEach(p => toggleFilter('price', p));
    };

    return (
        <div className="px-5 pb-2.5">
            {/*
              * 1) 제어 줄 — 문 둘 + 스위치 하나. 스위치는 세 번째 자리(경쟁 앱과 같다).
              *
              * 320px 실측: 상세필터 87 + 최신순 74 + 골프장별 93 + 간격 12 = 266 / 288 이라 그냥 들어간다.
              * 그런데 정렬을 '가격 낮은순' 으로 바꾸면 그 알약이 40px 넘게 길어지고 상세필터에 배지까지
              * 붙으면 넘친다. 그때 **잘리면 안 되는 건 스위치**다 — 시트를 여는 문 둘은 조금 밀려도
              * 밀어서 볼 수 있지만, 스위치는 보이지 않으면 '골프장별 보기' 가 있다는 것 자체를 모른다.
              * 그래서 문 둘만 스크롤 칸에 넣고 스위치는 오른쪽에 못 박았다(스크롤바는 감춘다).
              */}
            <div className="flex items-center gap-1.5 mb-2">
                <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
                    <DetailSheet
                        selectedFilters={selectedFilters}
                        toggleFilter={toggleFilter}
                        onReset={resetAll}
                        accent={accent}
                        onAccent={onAccent}
                        badge={hiddenCount}
                        isJoin={isJoin}
                    />
                    <SortMenu
                        activeSort={activeSort}
                        onPick={pickSort}
                        accent={accent}
                    />
                </div>
                {onToggleGroup && (
                    <GroupToggle on={!!groupByCourse} onToggle={onToggleGroup} accent={accent} onAccent={onAccent} />
                )}
            </div>

            {/* 2) 빠른 칩 줄 — 한 덩어리 안에, 누르면 그 자리에서 걸린다 */}
            <div className="flex gap-0.5 p-1 rounded-2xl bg-white/[0.035] border border-white/[0.05]">
                {chips.map(chip => {
                    const on = selectedFilters[chip.category]?.includes(chip.id) ?? false;
                    const Icon = chip.icon;
                    return (
                        <button
                            key={chip.id}
                            onClick={() => toggleFilter(chip.category, chip.id)}
                            aria-pressed={on}
                            className={cn(
                                'flex-1 min-w-0 h-[52px] rounded-xl flex flex-col items-center justify-center gap-[3px]',
                                'transition-colors active:scale-[0.97]',
                            )}
                            /**
                             * 켜진 칩은 **꽉 찬** 브랜드색이다. 예전엔 accent 15% 틴트였는데, 라임(#64DD17)은
                             * 밝아서 그만해도 튀지만 조인 주황(#FF6B00)은 검정 위 15% 가 **갈색 슬래브**로
                             * 가라앉아 "눌린 건가?" 가 됐다(2026-09-23 확인). 두 색이 같은 세기로 읽히려면
                             * 틴트 농도를 색마다 다르게 손보는 것보다 채움이 확실하다 —
                             * 상세필터 시트의 선택 칩과도 같은 모양이 된다.
                             */
                            style={on
                                ? { backgroundColor: accent, color: onAccent }
                                : { color: 'rgba(255,255,255,0.5)' }}
                        >
                            {/* 단색·얇게. fill 은 쓰지 않는다 — ₩(CurrencyKrw) 가 17px 에서 글자 없는 검은 동전이 된다. */}
                            <Icon className="w-[17px] h-[17px] shrink-0" weight={on ? 'bold' : 'regular'} />
                            <span className={cn('text-[10.5px] leading-none whitespace-nowrap', on ? 'font-bold' : 'font-medium')}>
                                {chip.label}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

/* ------------------------------------------------------------------ */

function ControlPill({ children, active, accent }: { children: React.ReactNode; active?: boolean; accent: string }) {
    return (
        <span
            className={cn(
                'h-8 inline-flex items-center gap-1 px-3 rounded-full border text-[12.5px] font-medium whitespace-nowrap transition-colors',
                active ? 'bg-transparent' : 'bg-transparent border-white/[0.14] text-white/60',
            )}
            style={active ? { borderColor: accent, color: accent } : undefined}
        >
            {children}
        </span>
    );
}

/**
 * '골프장별 보기' — **스위치**다. 옆의 둘은 누르면 시트가 열리는 **문**이라 같은 알약 모양이어도
 * 하는 일이 다르다. 손잡이가 움직이는 스위치를 달면 "이건 켜고 끄는 것" 이 눌러 보기 전에 읽힌다.
 * 라벨은 '골프장별' 넉 자 — 제어 줄에 이미 둘이 있고 화면은 320px 까지 내려간다.
 */
function GroupToggle({ on, onToggle, accent, onAccent }: {
    on: boolean;
    onToggle: () => void;
    accent: string;
    onAccent: string;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label="골프장별로 묶어 보기"
            onClick={onToggle}
            className="shrink-0 h-8 inline-flex items-center gap-1.5 pl-2.5 pr-1.5 rounded-full border text-[12.5px] font-medium whitespace-nowrap transition-colors"
            style={on
                ? { borderColor: accent, color: accent }
                : { borderColor: 'rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.6)' }}
        >
            골프장별
            <span
                className="relative w-[26px] h-[15px] rounded-full shrink-0 transition-colors"
                style={{ backgroundColor: on ? accent : 'rgba(255,255,255,0.18)' }}
            >
                <span
                    className="absolute top-[2px] w-[11px] h-[11px] rounded-full transition-all duration-150"
                    style={{ left: on ? '13px' : '2px', backgroundColor: on ? onAccent : '#FFFFFF' }}
                />
            </span>
        </button>
    );
}

/** 정렬 — 제 버튼, 값은 여전히 price 배열의 sort_ 로 들어간다. */
function SortMenu({ activeSort, onPick, accent }: {
    activeSort?: string;
    onPick: (id: string | null) => void;
    accent: string;
}) {
    return (
        <Sheet>
            <SheetTrigger asChild>
                <button className="shrink-0">
                    <ControlPill active={!!activeSort} accent={accent}>
                        {activeSort ? SORT_LABEL[activeSort] : '최신순'}
                        <LucideChevronDown className="w-3 h-3" weight="bold" />
                    </ControlPill>
                </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="z-[70] bg-[#1A1A1A] border-t border-white/5 rounded-t-2xl focus:outline-none [&>button]:hidden">
                <SheetHeader className="px-5 pt-5 pb-3">
                    <SheetTitle className="text-[17px] font-semibold text-white">정렬</SheetTitle>
                </SheetHeader>
                <div className="px-3 pb-5">
                    {[{ id: null, label: '최신순 (시간 빠른 순)' }, { id: 'sort_low', label: SORT_LABEL.sort_low }, { id: 'sort_discount', label: SORT_LABEL.sort_discount }].map(o => {
                        const on = (o.id ?? undefined) === activeSort;
                        return (
                            <SheetClose asChild key={o.id ?? 'default'}>
                                <button
                                    onClick={() => onPick(o.id)}
                                    className="w-full h-12 px-3 rounded-xl flex items-center justify-between text-[15px] active:bg-white/[0.06]"
                                    style={{ color: on ? accent : 'rgba(255,255,255,0.72)' }}
                                >
                                    <span className={on ? 'font-semibold' : 'font-medium'}>{o.label}</span>
                                    {on && <LucideCheck className="w-4 h-4" weight="bold" />}
                                </button>
                            </SheetClose>
                        );
                    })}
                </div>
            </SheetContent>
        </Sheet>
    );
}

/** 상세필터 — 넷이던 시트를 하나로. 섹션 제목 + 칩 격자 + [초기화][적용]. */
function DetailSheet({ selectedFilters, toggleFilter, onReset, accent, onAccent, badge, isJoin }: {
    selectedFilters: Record<string, string[]>;
    toggleFilter: (category: string, id: string) => void;
    onReset: () => void;
    accent: string;
    onAccent: string;
    badge: number;
    isJoin: boolean;
}) {
    /**
     * 인원과 조건을 **섹션으로 갈라** 보여 준다. 같은 칸에 섞여 있으면 "노캐디 + 식사 제공" 이
     * 둘 다인지 둘 중 하나인지 읽을 수가 없다 — 판정은 constants/booking.ts 의 같은 표를 본다.
     * 조인 탭에서는 부킹 옵션 대신 JOIN_OPTIONS 를 보인다(조인 글에는 부킹 옵션이 저장되지 않는다).
     */
    const joinOptions = JOIN_OPTIONS.map(o => ({ id: o.id, label: o.label }));
    const joinParty = joinOptions.filter(o => isPartyOption(o.id));
    const joinConditions = joinOptions.filter(o => !isPartyOption(o.id));

    const sections: { key: string; title: string; hint?: string; options: { id: string; label: string }[] }[] = [
        { key: 'region', title: '지역', hint: '고른 것 중 하나', options: REGION_OPTIONS as any },
        // 정렬(sort_)은 여기서 뺀다 — 제 버튼으로 갔다.
        { key: 'price', title: '그린피', hint: '고른 것 중 하나', options: PRICE_OPTIONS.filter(o => !o.id.startsWith('sort_')) },
        { key: 'special', title: '인원', hint: '고른 것 중 하나', options: isJoin ? joinParty : PARTY_OPTIONS },
        { key: 'special', title: '조건', hint: '고른 것을 모두 갖춘 글', options: isJoin ? joinConditions : CONDITION_OPTIONS },
    ];

    return (
        <Sheet>
            <SheetTrigger asChild>
                <button className="shrink-0">
                    <ControlPill active={badge > 0} accent={accent}>
                        <LucideFilter className="w-3.5 h-3.5" weight="regular" />
                        상세필터
                        {badge > 0 && (
                            <span
                                className="min-w-[15px] h-[15px] px-1 ml-0.5 rounded-full text-[9.5px] font-bold flex items-center justify-center"
                                style={{ backgroundColor: accent, color: onAccent }}
                            >
                                {badge}
                            </span>
                        )}
                    </ControlPill>
                </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="z-[70] bg-[#1A1A1A] border-t border-white/5 rounded-t-2xl max-h-[80vh] flex flex-col focus:outline-none [&>button]:hidden">
                <div className="absolute right-4 top-4 z-50">
                    <SheetClose asChild>
                        <button className="p-2 rounded-full bg-white/5 text-white/50 active:bg-white/10" title="닫기">
                            <LucideX className="w-5 h-5" />
                        </button>
                    </SheetClose>
                </div>
                <SheetHeader className="px-5 pt-5 pr-14 pb-2 shrink-0">
                    <SheetTitle className="text-[17px] font-semibold text-white">상세필터</SheetTitle>
                </SheetHeader>
                <div className="flex-1 overflow-y-auto px-5">
                    {sections.map(sec => (
                        <div key={`${sec.key}-${sec.title}`} className="pt-4">
                            <p className="text-[12px] font-semibold text-white/40 mb-2">
                                {sec.title}
                                {sec.hint && <span className="ml-1.5 font-medium text-white/25">{sec.hint}</span>}
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                                {sec.options.map(option => {
                                    const isSelected = selectedFilters[sec.key]?.includes(option.id) ?? false;
                                    return (
                                        <button
                                            key={option.id}
                                            onClick={() => toggleFilter(sec.key, option.id)}
                                            className={cn(
                                                'h-11 px-3 border rounded-xl text-[13.5px] font-medium transition-colors flex items-center justify-center text-center',
                                                !isSelected && 'bg-white/[0.04] border-white/[0.08] text-white/70',
                                            )}
                                            style={isSelected
                                                ? { backgroundColor: accent, borderColor: accent, color: onAccent }
                                                : undefined}
                                        >
                                            {option.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                    <div className="h-4" />
                </div>
                <div className="px-5 pb-5 flex gap-2 shrink-0 border-t border-white/5 pt-4">
                    <button onClick={onReset} className="h-12 px-5 rounded-xl bg-white/[0.06] text-[14px] font-medium text-white/70 active:bg-white/10">초기화</button>
                    <SheetClose asChild>
                        <button className="flex-1 h-12 rounded-xl text-[15px] font-semibold" style={{ backgroundColor: accent, color: onAccent }}>적용</button>
                    </SheetClose>
                </div>
            </SheetContent>
        </Sheet>
    );
}
