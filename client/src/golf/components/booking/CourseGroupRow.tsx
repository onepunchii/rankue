import { useId } from 'react';
import { LucideChevronDown } from '@/lib/icons';
import { cn } from '@/lib/utils';
import { kstTime } from '@/lib/kst';
import { feeRangeLabel, type CourseGroup } from '../../lib/courseGroups';

/**
 * '골프장별 보기' 의 묶음 한 줄(2026-09-23 오너: "골프장별 보기 토글도 부탁해").
 *
 * 경쟁 앱은 한 줄에 `신라cc | 120,000 ~ 190,000원 | 퍼블릭 07:04 ~ 14:19 | 146팀 | ⌄` 를 다 넣는다.
 * 375px 에서 그대로 하면 이름이나 가격 중 하나가 말줄임으로 잘린다 — **잘리면 안 되는 건 가격**이라
 * (오너 2026-09-23: "가격 부분이 중요해서") 두 줄로 나눴다.
 *   1줄  골프장 이름 · N팀 · ⌄
 *   2줄  가격 범위(브랜드색) · 지역 또는 퍼블릭/회원제 · 가장 이른~가장 늦은 티오프
 *
 * 경쟁 앱의 '퍼블릭/회원제' 자리에는 **지역**이 들어간다. 우리 운영 DB 의 course_type 은 거의 비어
 * 있어서(실측 0/4) 그 자리를 잡아 두면 빈칸만 남는다 — courseType 이 있는 글이면 그걸 쓰고,
 * 없으면 지역으로 채운다(courseGroups.ts 의 subtitle).
 *
 * ⚠️ 골프 테마가 `.bg-white`·`.text-black/*` 유틸리티를 바꿔 끼우므로 브랜드색은 인라인 style 의 리터럴 hex 로.
 */
export function CourseGroupRow({ group, open, onToggle, accent, children }: {
    group: CourseGroup<any>;
    open: boolean;
    onToggle: () => void;
    accent: string;
    children: React.ReactNode;
}) {
    /*
     * 열쇠로 id 를 만들면 안 된다: 열쇠는 courseId 가 없을 때 `name:<한글 상호>` 가 되는데,
     * id 에 쓰려고 안전하지 않은 글자를 '_' 로 바꾸면 '남서울' 과 '레이크' 가 똑같은
     * `course-group-name_____` 이 된다 — 같은 화면에 중복 id 가 생기고 aria-controls 가
     * 엉뚱한 패널을 가리킨다. useId 는 React 가 인스턴스마다 다르게 준다.
     */
    const panelId = useId();
    const timeRange = group.firstTee === group.lastTee
        ? kstTime(group.firstTee)
        : `${kstTime(group.firstTee)} ~ ${kstTime(group.lastTee)}`;

    return (
        <div className="mb-3">
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={open}
                aria-controls={panelId}
                className={cn(
                    'w-full text-left rounded-2xl border bg-[#1A1A1A] px-4 py-3 flex items-center gap-3',
                    'transition-colors active:bg-white/[0.03]',
                )}
                style={{ borderColor: open ? `${accent}55` : 'rgba(255,255,255,0.08)' }}
            >
                <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5 min-w-0">
                        <span className="text-[15px] font-semibold text-white truncate" title={group.name}>{group.name}</span>
                        {group.subtitle && <span className="shrink-0 text-[11.5px] text-white/40">{group.subtitle}</span>}
                        {/* 팀 수 — "이 골프장에 몇 개나 있나" 는 펼치기 전에 답해야 하는 유일한 질문이다 */}
                        <span
                            className="shrink-0 h-[19px] px-1.5 rounded-full text-[11px] font-semibold flex items-center self-center"
                            style={{ backgroundColor: `${accent}1F`, color: accent }}
                        >
                            {group.count}팀
                        </span>
                    </div>
                    {/*
                      * 가격과 시간 범위는 한 줄. 320px 에서 지역까지 여기 넣으면 시간 범위가 잘린다 —
                      * 잘리면 안 되는 건 가격이라 지역은 위 줄(이름 옆)로 올렸다.
                      */}
                    <div className="mt-1 flex items-center gap-1.5 min-w-0 text-[12px]">
                        <span className="rk-num font-semibold shrink-0" style={{ color: accent }}>
                            {feeRangeLabel(group.minFee, group.maxFee)}
                        </span>
                        <span className="rk-num text-white/45 truncate">{timeRange}</span>
                    </div>
                </div>

                <LucideChevronDown
                    className={cn('w-4 h-4 shrink-0 text-white/40 transition-transform', open && 'rotate-180')}
                    weight="bold"
                />
            </button>

            {/*
              * 펼쳐진 티타임. 접혀 있으면 카드를 **아예 만들지 않는다** — 골프장 수십 곳이 걸린 날에
              * 보이지도 않는 카드를 다 그릴 이유가 없다.
              * 다만 패널 상자 자체는 남긴다(접히면 hidden). 위 버튼의 aria-controls 가 가리키는 곳이라,
              * 통째로 지우면 접힌 동안 존재하지 않는 id 를 가리키게 된다.
              */}
            <div id={panelId} className={open ? 'pt-2.5' : 'hidden'}>
                {open && children}
            </div>
        </div>
    );
}
