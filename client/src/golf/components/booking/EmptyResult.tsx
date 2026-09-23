import { LucideSearch, LucideX } from 'lucide-react';

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

    return (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center">
                <LucideSearch className="w-6 h-6 text-white/15" />
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
