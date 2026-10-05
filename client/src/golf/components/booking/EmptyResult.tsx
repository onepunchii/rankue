import { useMemo } from 'react';
import { LucideX } from 'lucide-react';
import type { MapDot } from '@shared/golfDotMap';
import { HERE_ASPECT, HERE_BOX } from '@shared/golfHereMap';
import { useCourseList } from '../../lib/courseApi';
import { CourseDotMap } from '../course/list/CourseDotMap';
import { KoreaOutline } from '../course/list/KoreaOutline';

/**
 * 0건 화면. **범인을 말한다.**
 *
 * 예전엔 "조건에 맞는 티타임이 없습니다" 한 줄과 `clearFilter('region')` 버튼 하나뿐이었다.
 * 지역이 아니라 1부·노캐디 때문에 비었을 때는 그 버튼을 눌러도 아무 일이 일어나지 않았다(2026-09-23).
 *
 * 이제 두 갈래다.
 *  - 걸린 게 있으면: 걸린 것의 **실제 이름**을 칩으로 늘어놓고, 눌러서 하나씩 뗀다. 둘 이상이면 전부 끄기.
 *  - 걸린 게 없으면: 필터 탓이 아니다 — 그 날짜에 매물이 없는 것이니 날짜를 바꾸라고 말한다
 *    (날짜 띠는 바로 위에 붙어 있다).
 *
 * 돋보기 그림 자리에 **전국 점 지도**(2026-10-05 오너: "이 점들이 우리만의 시그니처" → "응 순서대로" 6번).
 * 빈 화면이 막다른 길로 보이지 않게, 지금 글이 올라와 있는 골프장을 그 색으로 켠다(허브 지도와 같은 뜻 — 조인 주황·부킹 라임·긴급 빨강).
 * 켜진 곳이 하나도 없으면 설명 줄도 없다(없는 것을 있는 것처럼 말하지 않는다). 골프장 목록은 골프 홈이 이미 받아 둔 캐시.
 *
 * ⚠️ 골프 테마가 `.bg-*`/`.text-*` 유틸리티를 바꿔 끼우므로 브랜드색은 인라인 style 의 리터럴 hex 로.
 */
export interface ActiveFilter {
    key: string;
    label: string;
    remove: () => void;
}

export function EmptyResult({ activeFilters, onClearAll, viewType, dateLabel }: {
    activeFilters: ActiveFilter[];
    onClearAll: () => void;
    viewType: 'ALL' | 'BOOKING' | 'JOIN';
    dateLabel: string;
}) {
    const isJoin = viewType === 'JOIN';
    const accent = isJoin ? '#FF6B00' : '#64DD17';
    const onAccent = isJoin ? '#FFFFFF' : '#051907';

    // 전국 점 지도 — 이 탭이 보는 종류의 글이 올라온 골프장만 켠다
    const courses = useCourseList({});
    const { dots, lit } = useMemo(() => {
        let lit = 0;
        const dots: MapDot[] = (courses.data ?? []).filter((c) => c.lat != null && c.lng != null).map((c) => {
            const k = c.counts;
            const tone: MapDot['tone'] = viewType === 'JOIN' ? (k.urgent > 0 ? 'urgent' : k.join > 0 ? 'join' : 'on')
                : viewType === 'BOOKING' ? (k.booking > 0 ? 'booking' : 'on')
                : k.urgent > 0 ? 'urgent' : k.join > 0 ? 'join' : k.booking > 0 ? 'booking' : 'on';
            if (tone !== 'on') lit += 1;
            return { key: c.slug, lat: c.lat as number, lng: c.lng as number, tone };
        });
        return { dots, lit };
    }, [courses.data, viewType]);

    return (
        <div className="flex flex-col items-center justify-center py-8 gap-4 text-center">
            {/* 지도와 그 설명은 한 덩어리 — 설명을 맨 아래 두면 화면 아래 '만들기' 단추에 가린다(2026-10-05 화면 확인) */}
            <div className="flex flex-col items-center">
                <div aria-hidden="true" className="relative w-[100px]" style={{ aspectRatio: String(HERE_ASPECT) }}>
                    <CourseDotMap
                        dots={dots} focus={null} box={HERE_BOX} aspect={HERE_ASPECT} cols={16} bg="#0A0A0A" muted pulse className="absolute inset-0 w-full h-full"
                        under={<KoreaOutline stroke="#FFFFFF1F" width={0.6} />}
                    />
                </div>
                {lit > 0 && (
                    <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: '#FFFFFF73' }}>
                        {viewType !== 'ALL' && <span aria-hidden="true" className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ backgroundColor: accent }} />}
                        색이 켜진 곳엔 지금 {viewType === 'ALL' ? '글' : isJoin ? '조인' : '티타임'}이 올라와 있어요
                    </p>
                )}
            </div>

            {activeFilters.length > 0 ? (
                <>
                    <div>
                        <p className="text-[15px] font-bold text-white/80">
                            걸어 둔 필터에 맞는 {isJoin ? '조인' : '티타임'}이 없어요
                        </p>
                        <p className="mt-1.5 text-[13px] text-white/40">
                            {activeFilters.length === 1 ? '이걸 떼면 다시 볼 수 있어요' : '하나씩 떼어 보세요'}
                        </p>
                    </div>

                    {/* 무엇이 걸려 있는지 읽는 자리와 푸는 자리가 같다 */}
                    <div className="flex flex-wrap justify-center gap-2 max-w-[300px]">
                        {activeFilters.map(f => (
                            <button
                                key={f.key}
                                onClick={f.remove}
                                title={`'${f.label}' 떼기`}
                                className="h-9 max-w-full pl-3.5 pr-2.5 rounded-full border border-white/[0.14] bg-white/[0.05] text-[13px] font-medium text-white/80 flex items-center gap-1.5 active:bg-white/10 transition-colors"
                            >
                                <span className="truncate">{f.label}</span>
                                <LucideX className="w-3.5 h-3.5 text-white/45 shrink-0" />
                            </button>
                        ))}
                    </div>

                    {activeFilters.length >= 2 && (
                        <button
                            onClick={onClearAll}
                            className="h-10 px-5 rounded-full text-[13.5px] font-bold transition-transform active:scale-[0.97]"
                            style={{ backgroundColor: accent, color: onAccent }}
                        >
                            필터 {activeFilters.length}개 전부 끄기
                        </button>
                    )}
                </>
            ) : (
                <div>
                    <p className="text-[15px] font-bold text-white/80">
                        이 날짜엔 아직 {isJoin ? '조인이' : '매물이'} 없어요
                    </p>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-white/40">
                        {dateLabel}에 올라온 게 없어요.<br />
                        ↑ 위 날짜 띠에서 다른 날을 눌러 보세요.
                    </p>
                </div>
            )}
        </div>
    );
}
