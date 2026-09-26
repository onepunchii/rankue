import { memo } from "react";
import { LucideChevronRight, LucideMapPin, LucideUsers } from "@/lib/icons";
import { CREW_CARD, CrewRoleBadge } from "@/components/hiq/crew-ui";
import { crewImageSrc, crewRowStatus } from "@shared/crewManage";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * 크루 한 줄 — '내 크루'와 '둘러보기'가 같은 모양을 쓴다(2026-09-26 크루 디자인 정리).
 *
 * 예전엔 두 목록이 서로 다른 카드였다: 내 크루는 썸네일이 없고 인원 칸이 카드 안의 중첩 버튼(role=button 안의 button,
 * 높이 24px)이었고, 둘러보기는 종목을 FIELD/SCREEN 같은 원문 코드로 찍었다. 이제
 *  - 썸네일: 엠블럼 → 커버 → 이름 첫 글자(옛 크루의 이모지 엠블럼은 이미지로 쓰지 않는다)
 *  - 이름 + 내 역할 배지(크루장·운영진·승인 대기) → 지역·거리·인원·가입 방식·정원 마감·가입됨
 *  - 카드 전체가 진짜 <button>(키보드·스크린리더). 인원 칸은 '멤버 보기'가 따로 필요할 때만 옆에 나란히 둔다(중첩 금지).
 */

export interface CrewRowData {
    id: string;
    name: string;
    emblem?: string | null;
    coverImage?: string | null;
    region?: string | null;
    shortIntro?: string | null;
    description?: string | null;
    memberCount?: number | null;
    maxMembers?: number | null;
    joinType?: string | null;
    gameType?: string | null;
    distance?: number;
}

/** 활동 종목 코드 → 사전 키. 'any'(상관없음)는 줄에 찍지 않는다 — 모든 크루에 붙어 정보가 없다. */
export const GAME_TYPE_LABEL: Record<string, string> = {
    "3c": "createClub.game3c",
    "4c": "createClub.game4c",
    pocket: "createClub.gamePocket",
    field: "createClub.gameField",
    screen: "createClub.gameScreen",
    range: "createClub.gameRange",
};

interface CrewRowProps {
    crew: CrewRowData;
    /** 내 역할 — 크루장·운영진·승인 대기만 배지로 보인다. */
    role?: string | null;
    /** 둘러보기: 한 줄 소개·가입 방식 칩·가입됨 배지를 보인다. 내 크루: 인원 칸을 따로 둔다. */
    variant?: "mine" | "discover";
    /** 둘러보기에서 이미 가입한 크루인가(내 크루 목록과 맞춰 본다). */
    joined?: boolean;
    onClick: () => void;
    /** 있으면 인원 칸이 별도 버튼(멤버 목록으로)이 된다. */
    onMembers?: () => void;
}

export const CrewRow = memo(({ crew, role, variant = "discover", joined, onClick, onMembers }: CrewRowProps) => {
    const { t } = useT();
    const status = crewRowStatus(crew);
    const thumb = crewImageSrc(crew.emblem) ?? crewImageSrc(crew.coverImage);
    const initial = crew.name?.trim().charAt(0).toUpperCase() || "?";
    const intro = variant === "discover" ? (crew.shortIntro || crew.description || "").trim() : "";
    const gameKey = crew.gameType ? GAME_TYPE_LABEL[crew.gameType] : undefined;
    const isPending = role === "pending";

    return (
        <div className={cn(CREW_CARD, "p-0 flex items-stretch overflow-hidden")}>
            <button
                type="button"
                onClick={onClick}
                className="flex-1 min-w-0 flex items-center gap-3 p-4 text-left active:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
            >
                {thumb ? (
                    <img src={thumb} alt="" loading="lazy" className="w-12 h-12 shrink-0 rounded-tile object-cover bg-surface-3" />
                ) : (
                    <span aria-hidden="true" className="w-12 h-12 shrink-0 rounded-tile bg-brand/10 text-brand text-[17px] font-semibold inline-flex items-center justify-center">
                        {initial}
                    </span>
                )}

                <span className="min-w-0 flex-1 flex flex-col gap-1">
                    <span className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[15px] font-semibold text-ink-1 truncate">{crew.name}</span>
                        <CrewRoleBadge role={role} />
                    </span>
                    {intro && <span className="text-[13px] font-medium text-ink-3 truncate">{intro}</span>}
                    <span className="flex items-center flex-wrap gap-x-2 gap-y-1 text-[12px] font-medium text-ink-3">
                        <span className={cn("inline-flex items-center gap-1 min-w-0 max-w-full", !crew.region && "text-ink-4")}>
                            <LucideMapPin className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{crew.region || t("crewDiscoveryCard.noRegion")}</span>
                        </span>
                        {crew.distance !== undefined && <span className="rk-num text-brand">{crew.distance.toFixed(1)}km</span>}
                        {!onMembers && (
                            <span className="inline-flex items-center gap-1 rk-num" aria-label={t("crewMgmt.memberCountAria").replace("{n}", status.countLabel)}>
                                <LucideUsers className="w-3.5 h-3.5" />
                                {status.countLabel}
                            </span>
                        )}
                        {gameKey && <span className="rk-chip bg-surface-3 text-ink-2">{t(gameKey)}</span>}
                        {variant === "discover" && (
                            <span className="rk-chip bg-surface-3 text-ink-2">
                                {crew.joinType === "approval" ? t("crewMgmt.joinApproval") : t("crewMgmt.joinOpen")}
                            </span>
                        )}
                        {status.full && !joined && !isPending && <span className="rk-chip bg-surface-3 text-destructive">{t("crewMgmt.full")}</span>}
                        {joined && !isPending && <span className="rk-chip bg-brand/10 text-brand">{t("crewMgmt.joined")}</span>}
                    </span>
                </span>
                {!onMembers && <LucideChevronRight className="w-[18px] h-[18px] shrink-0 text-ink-4" />}
            </button>

            {/* 인원 칸 — 누르면 그 크루의 멤버 목록(2026-09-23 오너: "인원수를 버튼식으로, 중요한 부분이라").
                카드 버튼 안에 넣으면 버튼 속 버튼이 되므로 옆에 형제로 둔다. */}
            {onMembers && (
                <button
                    type="button"
                    onClick={onMembers}
                    aria-label={`${t("myCrewCard.seeMembers")} ${status.countLabel}`}
                    className={cn(
                        "shrink-0 w-16 flex flex-col items-center justify-center gap-0.5 border-l border-surface-line active:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand",
                        status.nearlyFull || status.full ? "text-brand" : "text-ink-2",
                    )}
                >
                    <LucideUsers className="w-[18px] h-[18px]" />
                    <span className="rk-num text-[13px] font-semibold">{status.countLabel}</span>
                </button>
            )}
        </div>
    );
});

CrewRow.displayName = "CrewRow";
