import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CREW_TEXT, CrewAvatar, CrewEmpty, CrewError, CrewSkeleton, IconButton } from "@/components/hiq/crew-ui";
import { LucideLock, LucideX } from "@/lib/icons";
import { useT } from "@/lib/i18n";
import type { PollOption } from "./types";

// 선택지를 고른 사람 목록 — 표 수를 누르면 열린다.
// 서버 GET /polls/options/:optionId/votes 는 원래 있었는데 화면이 한 번도 부르지 않았다(2026-09-26 검토 P1).
// 익명 투표는 서버도 이름을 주지 않는다({anonymous, count}) — 여기서도 부르지 않고 숫자만 보여 준다.

type Voter = { id: string; name: string | null; profileImageUrl: string | null };

export function PollVotersSheet({ crewId, option, anonymous, onOpenChange }: {
    crewId: string;
    option: PollOption | null;
    anonymous: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const { t } = useT();
    const url = option ? `/api/hiq/crews/${crewId}/polls/options/${option.id}/votes` : "";
    const { data, isLoading, isError, refetch } = useQuery<Voter[] | { anonymous: true; count: number }>({
        queryKey: [url],
        enabled: !!option && !anonymous,
        // 누가 방금 투표했는지 보러 여는 창이라 캐시를 믿지 않는다.
        staleTime: 0,
    });
    const voters = Array.isArray(data) ? data : [];

    return (
        <Sheet open={!!option} onOpenChange={onOpenChange}>
            <SheetContent side="bottom" hideClose className="bg-surface-1 text-ink-1 border-surface-line rounded-t-card p-0 max-h-[80dvh] flex flex-col pb-[env(safe-area-inset-bottom)]">
                {/* 기본 닫기(16px 아이콘)는 누르기 어려워 44px 버튼으로 바꿨다. */}
                <IconButton label={t("crewPoll.close")} onClick={() => onOpenChange(false)} className="absolute right-2 top-2">
                    <LucideX />
                </IconButton>
                <SheetHeader className="px-4 pt-5 pb-3 text-left pr-14">
                    <SheetTitle className={CREW_TEXT.section}>{option?.text}</SheetTitle>
                    <SheetDescription className={CREW_TEXT.sub}>
                        {t("crewPoll.votesN").replace("{n}", String(option?.voteCount ?? 0))}
                    </SheetDescription>
                </SheetHeader>
                <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-5">
                    {anonymous ? (
                        <CrewEmpty icon={<LucideLock />} title={t("crewPoll.anonymousVoters")} desc={t("crewPoll.anonymousVotersDesc")} />
                    ) : isLoading ? (
                        <CrewSkeleton rows={3} height={52} />
                    ) : isError ? (
                        <CrewError onRetry={() => refetch()} />
                    ) : voters.length === 0 ? (
                        <CrewEmpty title={t("crewPoll.noVoters")} />
                    ) : (
                        <ul className="flex flex-col">
                            {voters.map((v, i) => (
                                <li key={v.id} className={i > 0 ? "border-t border-surface-line" : undefined}>
                                    <div className="flex items-center gap-3 min-h-12 py-1.5">
                                        <CrewAvatar src={v.profileImageUrl} name={v.name} size={36} />
                                        <span className="min-w-0 truncate text-[15px] font-medium text-ink-1">{v.name}</span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}
