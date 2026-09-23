import { memo } from "react";
import { LucideChevronRight } from "@/lib/icons";
import { HiqCrew } from "@shared/schema";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

/**
 * 내 크루 한 줄(2026-09-23 재작성 — 오너: "내 크루 디자인이 별로. 인원 부분도, 리더 왕관도, 다 별로").
 *
 * 무엇을 바꿨나:
 *  - **왕관을 없앴다.** 바로 옆에 '리더'라고 적혀 있어서 같은 말을 두 번 하고 있었다.
 *  - **역할 뱃지를 이름 옆으로** 옮겼다. 예전엔 뱃지가 첫 줄을 통째로 차지해 크루 이름이 둘째 줄로 밀렸다 —
 *    이 카드에서 제일 먼저 읽혀야 하는 건 크루 이름이다.
 *  - **인원을 "4 / 20" 에서 "4/20" 한 덩어리**로. 아이콘과 공백을 빼고 숫자만 남겼다.
 *  - 지역을 인원보다 앞에 뒀다. 크루를 고를 때 먼저 보는 건 어디냐다.
 *  - 오른쪽 원형 버튼을 없애고 화살표만 남겼다. 카드 전체가 이미 누를 수 있다.
 *  - 색을 토큰으로 바꿨다(black/xx → ink·surface).
 */

interface MyCrewCardProps {
    crew: HiqCrew & { memberCount?: number };
    role: string;
    onClick: () => void;
}

export const MyCrewCard = memo(({ crew, role, onClick }: MyCrewCardProps) => {
    const { t } = useT();
    const isLeader = role === "leader";
    const count = crew.memberCount || 1;
    // maxMembers null/0 = 무제한(서버 기준) — "N / 50" 으로 찍으면 거짓 정보다.
    const people = crew.maxMembers ? `${count}/${crew.maxMembers}` : `${count}`;
    // 자리가 얼마 안 남았을 때만 눈에 띄게 — 평소엔 그냥 숫자다.
    const nearlyFull = !!crew.maxMembers && count >= crew.maxMembers * 0.9;

    return (
        <div
            className="rk-card group cursor-pointer px-4 py-3.5 flex items-center gap-3 transition-transform active:scale-[0.98]"
            onClick={onClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
        >
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                    <h3 className="font-semibold text-[16.5px] text-ink-1 tracking-tight truncate">{crew.name}</h3>
                    <span className={cn(
                        "shrink-0 px-1.5 py-0.5 rounded-md text-[11px] font-bold",
                        isLeader ? "bg-brand/10 text-brand" : "bg-surface-2 text-ink-3",
                    )}>
                        {isLeader ? t("myCrewCard.leader") : t("myCrewCard.member")}
                    </span>
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-[12.5px] font-medium text-ink-3 min-w-0">
                    <span className={cn("truncate", !crew.region && "text-ink-4")}>{crew.region || t("myCrewCard.noRegion")}</span>
                    <span className="w-0.5 h-0.5 rounded-full bg-ink-4 shrink-0" />
                    <span className={cn("rk-num shrink-0", nearlyFull && "font-semibold text-ink-2")}>{people}</span>
                </div>
            </div>
            <LucideChevronRight className="w-[18px] h-[18px] text-ink-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
        </div>
    );
});

MyCrewCard.displayName = "MyCrewCard";
