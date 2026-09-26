import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { LucidePlus, LucideVote } from "@/lib/icons";
import { CREW_BTN, CREW_TEXT, ConfirmDialog, CrewEmpty, CrewError, CrewSection, CrewSkeleton } from "@/components/hiq/crew-ui";
import { CreatePollDialog } from "@/components/hiq/CreatePollDialog";
import { PollCard } from "@/components/hiq/poll/PollCard";
import { PollVotersSheet } from "@/components/hiq/poll/PollVotersSheet";
import { useNow } from "@/components/hiq/poll/crewTimeFormat";
import type { CrewPoll, PollOption } from "@/components/hiq/poll/types";
import { isPollClosed } from "@shared/crewPoll";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/lib/i18n";

// 크루 투표 탭(2026-09-26 크루 정비).
//  - '더보기'로 3개씩 자르던 목록을 **진행 중 / 마감됨** 두 묶음으로 나눴다. 지금 할 일(진행 중)이 늘 위에 있다.
//  - 마감은 endTime 기준으로 화면에서도 30초마다 다시 판정한다(useNow). 켜 둔 채 마감을 넘기면 카드가 알아서 잠긴다.
//  - 다른 사람 표가 보이도록, 진행 중 투표가 있으면 30초마다 다시 불러온다(전역 기본값은 5분 캐시 + 포커스 새로고침 없음).
//  - 투표는 선택지별로 '누르는 중'을 따로 들고 화면을 먼저 바꾼다(낙관적 갱신). 예전엔 아무 투표나 처리 중이면
//    다른 선택지 탭이 소리 없이 버려졌다.

interface CrewPollTabProps {
    crewId: string;
    isAdmin: boolean;
    isMember: boolean;
}

const CLOSED_PREVIEW = 3;

export function CrewPollTab({ crewId, isAdmin, isMember }: CrewPollTabProps) {
    const { toast } = useToast();
    const { t, locale } = useT();
    const { member: me } = useAuth();
    const queryClient = useQueryClient();
    const key = `/api/hiq/crews/${crewId}/polls`;
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [showAllClosed, setShowAllClosed] = useState(false);
    const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
    const [votersOf, setVotersOf] = useState<{ option: PollOption; anonymous: boolean } | null>(null);
    const [confirm, setConfirm] = useState<{ kind: "delete" | "close"; poll: CrewPoll } | null>(null);
    const now = useNow(30_000);

    const { data: polls, isLoading, isError, refetch } = useQuery<CrewPoll[]>({
        queryKey: [key],
        enabled: !!crewId,
        // 탭에 들어올 때마다 새로 — 알림을 눌러 들어온 사람이 5분 묵은 결과를 보면 안 된다.
        refetchOnMount: "always",
        refetchInterval: (q) => {
            const list = q.state.data as CrewPoll[] | undefined;
            return list?.some((p) => !isPollClosed(p)) ? 30_000 : false;
        },
    });

    const { open, closed } = useMemo(() => {
        const o: CrewPoll[] = [];
        const c: CrewPoll[] = [];
        for (const p of polls ?? []) (p.isClosed === true || isPollClosed(p, now) ? c : o).push(p);
        // 진행 중은 마감이 가까운 것부터 — 급한 것이 위에 있어야 한다. 마감 없는 것은 맨 아래.
        o.sort((a, b) => (a.endTime ? Date.parse(a.endTime) : Infinity) - (b.endTime ? Date.parse(b.endTime) : Infinity));
        return { open: o, closed: c };
    }, [polls, now]);

    // ── 투표(토글) — 낙관적 갱신 ─────────────────────────────
    const applyVote = (list: CrewPoll[] | undefined, pollId: string, optionId: string): CrewPoll[] | undefined =>
        list?.map((p) => {
            if (p.id !== pollId) return p;
            const had = p.myVoteIds.includes(optionId);
            // 서버 규칙 그대로: 내 표를 다시 누르면 취소, 단일 선택은 다른 표를 지우고 하나만.
            const mine = had ? p.myVoteIds.filter((id) => id !== optionId) : p.allowMultiple ? [...p.myVoteIds, optionId] : [optionId];
            const options = p.options.map((o) => {
                const was = p.myVoteIds.includes(o.id);
                const is = mine.includes(o.id);
                return was === is ? o : { ...o, voteCount: Math.max(0, o.voteCount + (is ? 1 : -1)) };
            });
            const beforeVoted = p.myVoteIds.length > 0;
            const afterVoted = mine.length > 0;
            const voterCount = (p.voterCount ?? p.totalVotes ?? 0) + (afterVoted === beforeVoted ? 0 : afterVoted ? 1 : -1);
            return { ...p, myVoteIds: mine, options, voterCount: Math.max(0, voterCount), totalVotes: options.reduce((s, o) => s + o.voteCount, 0) };
        });

    const voteMutation = useMutation({
        mutationFn: ({ pollId, optionId }: { pollId: string; optionId: string }) =>
            apiRequest(`${key}/${pollId}/vote`, { method: "POST", body: JSON.stringify({ optionId }) }),
        onMutate: async ({ pollId, optionId }) => {
            setPending((s) => new Set(s).add(optionId));
            await queryClient.cancelQueries({ queryKey: [key] });
            const prev = queryClient.getQueryData<CrewPoll[]>([key]);
            queryClient.setQueryData<CrewPoll[] | undefined>([key], (list) => applyVote(list, pollId, optionId));
            return { prev };
        },
        onSuccess: (res: any) => {
            // 같은 선택지를 다시 눌러 취소된 경우를 말로 알려 준다 — 예전엔 조용히 꺼져서 '안 눌렸다'고 여겼다.
            if (res && res.voted === false) toast({ title: t("crewPoll.voteCanceled") });
        },
        onError: (err: any, _v, ctx) => {
            if (ctx?.prev) queryClient.setQueryData([key], ctx.prev);
            toast({ title: t("crewPollTab.voteFailTitle"), description: err?.message, variant: "destructive" });
        },
        onSettled: (_d, _e, { optionId }) => {
            setPending((s) => { const n = new Set(s); n.delete(optionId); return n; });
            queryClient.invalidateQueries({ queryKey: [key] });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (pollId: string) => apiRequest(`${key}/${pollId}`, { method: "DELETE" }),
        onSuccess: () => {
            toast({ title: t("crewPollTab.deleteSuccess") });
            setConfirm(null);
            queryClient.invalidateQueries({ queryKey: [key] });
        },
        onError: (err: any) => toast({ title: t("crewPollTab.deleteFailTitle"), description: err?.message, variant: "destructive" }),
    });

    const closeMutation = useMutation({
        mutationFn: (pollId: string) => apiRequest(`${key}/${pollId}`, { method: "PATCH", body: JSON.stringify({ status: "closed" }) }),
        onSuccess: () => {
            toast({ title: t("crewPoll.closedDone") });
            setConfirm(null);
            queryClient.invalidateQueries({ queryKey: [key] });
        },
        onError: (err: any) => toast({ title: t("crewPoll.actionFail"), description: err?.message, variant: "destructive" }),
    });

    const remindMutation = useMutation({
        mutationFn: (pollId: string) => apiRequest(`${key}/${pollId}/remind`, { method: "POST" }),
        onSuccess: (res: any) => {
            const sent = Number(res?.sent ?? 0);
            toast({ title: sent > 0 ? t("crewPoll.remindSent").replace("{n}", String(sent)) : t("crewPoll.remindNobody") });
        },
        onError: (err: any) => toast({ title: t("crewPoll.actionFail"), description: err?.message, variant: "destructive" }),
    });

    const renderCard = (poll: CrewPoll) => (
        <PollCard
            key={poll.id}
            poll={poll}
            now={now}
            locale={locale}
            isMember={isMember}
            canManage={isAdmin || (!!me?.id && poll.authorId === me.id)}
            pendingOptionIds={pending}
            onVote={(o) => {
                // 같은 선택지를 처리 중이면만 막는다(두 번 눌러 켜졌다 꺼지는 것 방지). 다른 선택지는 바로 받는다.
                if (pending.has(o.id)) return;
                voteMutation.mutate({ pollId: poll.id, optionId: o.id });
            }}
            onCancelMine={() => {
                const mine = poll.myVoteIds[0];
                if (mine && !pending.has(mine)) voteMutation.mutate({ pollId: poll.id, optionId: mine });
            }}
            onOpenVoters={(o) => setVotersOf({ option: o, anonymous: poll.isAnonymous })}
            onRemind={() => { if (!remindMutation.isPending) remindMutation.mutate(poll.id); }}
            onCloseEarly={() => setConfirm({ kind: "close", poll })}
            onDelete={() => setConfirm({ kind: "delete", poll })}
        />
    );

    const closedShown = showAllClosed ? closed : closed.slice(0, CLOSED_PREVIEW);

    return (
        <div className="px-4 pt-5 pb-20 flex flex-col gap-6">
            {/* 화면 제목 + 만들기 */}
            <header className="flex items-center justify-between gap-3">
                <h2 className={CREW_TEXT.title}>{t("crewPollTab.title")}</h2>
                {isMember && (
                    <button type="button" onClick={() => setIsCreateOpen(true)} className={CREW_BTN.primary}>
                        <LucidePlus className="w-4 h-4" />
                        {t("crewPollTab.createButton")}
                    </button>
                )}
            </header>

            {isLoading ? (
                <CrewSkeleton rows={2} height={260} />
            ) : isError ? (
                // 실패를 "투표가 없어요"로 보여 주지 않는다.
                <CrewError onRetry={() => refetch()} />
            ) : (polls?.length ?? 0) === 0 ? (
                <CrewEmpty
                    icon={<LucideVote />}
                    title={t("crewPoll.emptyTitle")}
                    desc={t("crewPollTab.emptyDesc")}
                    action={isMember ? { label: t("crewPollTab.createButton"), onClick: () => setIsCreateOpen(true) } : undefined}
                />
            ) : (
                <>
                    <CrewSection title={t("crewPollTab.ongoing")} count={open.length}>
                        {open.length === 0
                            ? <CrewEmpty title={t("crewPoll.noOpenTitle")} desc={isMember ? t("crewPoll.noOpenDesc") : undefined} />
                            : <div className="flex flex-col gap-3">{open.map(renderCard)}</div>}
                    </CrewSection>

                    {closed.length > 0 && (
                        <CrewSection
                            title={t("crewPollTab.closed")}
                            count={closed.length}
                            action={closed.length > CLOSED_PREVIEW
                                ? { label: showAllClosed ? t("crewPoll.fold") : t("crewPoll.seeAll"), onClick: () => setShowAllClosed((v) => !v) }
                                : undefined}
                        >
                            <div className="flex flex-col gap-3">{closedShown.map(renderCard)}</div>
                        </CrewSection>
                    )}
                </>
            )}

            <CreatePollDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} crewId={crewId} />

            <PollVotersSheet
                crewId={crewId}
                option={votersOf?.option ?? null}
                anonymous={!!votersOf?.anonymous}
                onOpenChange={(o) => { if (!o) setVotersOf(null); }}
            />

            <ConfirmDialog
                open={!!confirm}
                onOpenChange={(o) => { if (!o) setConfirm(null); }}
                title={confirm?.kind === "close" ? t("crewPoll.closeConfirmTitle") : t("crewPoll.deleteConfirmTitle")}
                desc={confirm?.kind === "close" ? t("crewPoll.closeConfirmDesc") : t("crewPoll.deleteConfirmDesc")}
                confirmLabel={confirm?.kind === "close" ? t("crewPoll.closeEarly") : t("crewPollTab.deletePollTitle")}
                danger={confirm?.kind !== "close"}
                busy={deleteMutation.isPending || closeMutation.isPending}
                onConfirm={() => {
                    if (!confirm) return;
                    if (confirm.kind === "close") closeMutation.mutate(confirm.poll.id);
                    else deleteMutation.mutate(confirm.poll.id);
                }}
            />
        </div>
    );
}
