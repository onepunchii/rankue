import { memo } from "react";
import { CrewCover, CrewEmblem } from "@/components/hiq/crew-ui/brand";
import { CREW_TEXT } from "@/components/hiq/crew-ui";
import { crewRowStatus } from "@shared/crewManage";
import type { CrewPulseLite } from "@shared/crewBrand";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * "내 주변 인기 크루" 가로 넘김 줄(2026-09-26 크루 디자인 A안, 오너 승인 시안). 처음 온 사람이 가입할 크루를 고르는 자리다.
 * 카드: 미니 커버(자동 그림) + 걸친 엠블럼 + 이름 + 거리·인원 + '모집 중 n자리'·'이번 주 정모' 배지.
 * 고르는 기준(인기 점수·정원 마감 제외)은 AllCrewList 가 정해 넘긴다.
 */
export interface PopularCrew {
    id: string;
    name: string;
    sportCategory?: string | null;
    emblem?: string | null;
    coverImage?: string | null;
    memberCount?: number | null;
    maxMembers?: number | null;
    distance?: number;
    pulse?: CrewPulseLite | null;
}

export const PopularCrews = memo(function PopularCrews({ crews, nearby, onOpen }: { crews: readonly PopularCrew[]; nearby: boolean; onOpen: (id: string) => void }) {
    const { t } = useT();
    if (crews.length === 0) return null;
    return (
        <section className="flex flex-col gap-2.5" aria-label={nearby ? t("crewList.popularNearby") : t("crewList.popular")}>
            <h3 className={CREW_TEXT.section}>{nearby ? t("crewList.popularNearby") : t("crewList.popular")}</h3>
            {/* 좌우 여백까지 밀어 쓰는 가로 줄 — 탭 스와이프가 없는 화면이라 칩 줄 멈춤은 필요 없다 */}
            <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-1 scrollbar-hide snap-x snap-mandatory">
                {crews.map((c) => {
                    const st = crewRowStatus(c);
                    const slots = st.max ? Math.max(0, st.max - st.count) : null;
                    return (
                        <button
                            key={c.id} type="button" onClick={() => onOpen(c.id)}
                            className="w-[220px] shrink-0 snap-start rk-card overflow-hidden text-left active:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        >
                            <CrewCover crew={c} height={96} />
                            <span className="relative block px-3 pb-3 pt-2">
                                <CrewEmblem crew={c} size={40} ring="var(--surface-1)" className="absolute -top-6 left-3" />
                                <span className="block mt-4 text-[15px] font-semibold text-ink-1 truncate">{c.name}</span>
                                <span className="block mt-0.5 text-[12px] font-medium text-ink-3 rk-num truncate">
                                    {c.distance !== undefined ? `${c.distance.toFixed(1)}km · ` : ""}{t("crewList.members").replace("{n}", st.countLabel)}
                                </span>
                                <span className="flex flex-wrap gap-1 mt-2 min-h-6">
                                    {slots !== null && slots > 0 && <span className="rk-chip bg-brand/10 text-brand">{t("crewRow.openSlots").replace("{n}", String(slots))}</span>}
                                    {c.pulse?.upcomingWeek && <span className={cn("rk-chip bg-surface-3 text-ink-2")}>{t("crewRow.meetupThisWeek")}</span>}
                                </span>
                            </span>
                        </button>
                    );
                })}
            </div>
        </section>
    );
});
