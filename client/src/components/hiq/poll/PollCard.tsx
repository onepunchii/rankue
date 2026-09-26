import { LucideBellRing, LucideCheck, LucideClock, LucideLoader2, LucideLock, LucideMoreVertical, LucideTrash2, LucideUsers } from "@/lib/icons";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CREW_CARD, CREW_TEXT, CrewAvatar } from "@/components/hiq/crew-ui";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { isPollClosed, uniqueLeaderId, voterPercent } from "@shared/crewPoll";
import { countdownLabel, formatKst } from "./crewTimeFormat";
import { voterCountOf, type CrewPoll, type PollOption } from "./types";

// 투표 카드 한 장. 규칙(2026-09-26 크루 정비):
//  - 단일 선택은 동그라미(radio), 복수 선택은 네모(checkbox) — 누르기 전에 몇 개 고를 수 있는지 보인다.
//  - 비율의 분모는 투표한 사람 수(voterCount). 표 수로 나누면 복수 선택에서 모두가 고른 선택지가 50%로 보였다.
//  - 마감 판정은 now 로 화면에서 다시 한다 — 서버 isClosed 는 불러온 순간의 값이라, 카드를 켜 둔 채 마감을 넘기면
//    계속 투표를 받는 것처럼 보였다. now 는 부모가 30초마다 넘긴다.
//  - 채움 막대는 bg-brand/15(내 선택 bg-brand/25) — 예전 bg-black opacity-5 는 골프(어두운 테마)에서 안 보였다.
//  - 옵션 줄 안에 버튼 두 개(투표 / 표 수→누가 골랐나)를 나란히 둔다. 버튼 안에 버튼은 HTML 이 허용하지 않는다.

interface Props {
    poll: CrewPoll;
    now: number;
    isMember: boolean;
    canManage: boolean;
    pendingOptionIds: ReadonlySet<string>;
    onVote: (option: PollOption) => void;
    onCancelMine: () => void;
    onOpenVoters: (option: PollOption) => void;
    onRemind: () => void;
    onCloseEarly: () => void;
    onDelete: () => void;
    locale: Parameters<typeof formatKst>[1];
}

export function PollCard({ poll, now, isMember, canManage, pendingOptionIds, onVote, onCancelMine, onOpenVoters, onRemind, onCloseEarly, onDelete, locale }: Props) {
    const { t } = useT();
    const closed = poll.isClosed === true || isPollClosed(poll, now);
    const voters = voterCountOf(poll);
    const leaderId = uniqueLeaderId(poll.options);
    const iVoted = poll.myVoteIds.length > 0;
    const left = closed ? null : countdownLabel(t, poll.endTime, now);
    const canVote = isMember && !closed;

    return (
        <article className={cn(CREW_CARD, "flex flex-col gap-3")} aria-label={poll.title}>
            {/* 머리: 상태·방식 칩 + 관리 메뉴 */}
            <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0 flex flex-wrap items-center gap-1.5 pt-2.5">
                    <span className={cn("rk-chip text-[12px]", closed ? "bg-surface-3 text-ink-3" : "bg-brand/10 text-brand")}>
                        {closed ? t("crewPollTab.closed") : t("crewPollTab.ongoing")}
                    </span>
                    <span className="rk-chip text-[12px] bg-surface-3 text-ink-2">
                        {poll.allowMultiple ? t("crewPollTab.multipleChoice") : t("crewPoll.singleChoice")}
                    </span>
                    {poll.isAnonymous && (
                        <span className="rk-chip text-[12px] bg-surface-3 text-ink-2 inline-flex items-center gap-1">
                            <LucideLock className="w-3 h-3" />{t("crewPollTab.anonymous")}
                        </span>
                    )}
                </div>
                {canManage && (
                    <DropdownMenu>
                        {/* 모양은 IconButton(44px 원형)과 같다. IconButton 은 ref·나머지 속성을 넘기지 않아
                            Radix 트리거(asChild)가 여닫기 이벤트를 못 붙이므로 트리거 자체에 같은 클래스를 준다. */}
                        <DropdownMenuTrigger
                            aria-label={t("crewPoll.manage")} title={t("crewPoll.manage")}
                            className="w-11 h-11 -mr-2 -mt-1 shrink-0 rounded-full inline-flex items-center justify-center text-ink-2 active:bg-surface-3 [&_svg]:w-5 [&_svg]:h-5"
                        >
                            <LucideMoreVertical />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-[180px] bg-surface-1 border-surface-line">
                            {!closed && (
                                <DropdownMenuItem onSelect={onRemind} className="min-h-11 gap-2 text-[15px] text-ink-1">
                                    <LucideBellRing className="w-4 h-4 text-ink-3" />{t("crewPoll.remind")}
                                </DropdownMenuItem>
                            )}
                            {!closed && (
                                <DropdownMenuItem onSelect={onCloseEarly} className="min-h-11 gap-2 text-[15px] text-ink-1">
                                    <LucideLock className="w-4 h-4 text-ink-3" />{t("crewPoll.closeEarly")}
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onSelect={onDelete} className="min-h-11 gap-2 text-[15px] text-destructive focus:text-destructive">
                                <LucideTrash2 className="w-4 h-4" />{t("crewPollTab.deletePollTitle")}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </div>

            <div className="space-y-1">
                <h3 className="text-[17px] font-semibold text-ink-1 leading-snug break-words">{poll.title}</h3>
                {poll.description && (
                    <p className={cn(CREW_TEXT.sub, "leading-relaxed whitespace-pre-line break-words")}>{poll.description}</p>
                )}
            </div>

            {/* 마감 — 절대 시각(KST) + 남은 시간. 남은 시간만 쓰면 "언제"인지, 절대 시각만 쓰면 "얼마나 남았는지"를 셈해야 한다. */}
            {poll.endTime && (
                <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink-3 rk-num">
                    <LucideClock className="w-3.5 h-3.5 shrink-0" />
                    <span className="min-w-0">
                        {t("crewPoll.deadlineAt").replace("{time}", formatKst(poll.endTime, locale, { weekday: true }))}
                        {left && <span className="text-brand font-semibold"> · {left}</span>}
                    </span>
                </p>
            )}

            {/* 선택지 */}
            <div role={poll.allowMultiple ? "group" : "radiogroup"} aria-label={poll.title} className="flex flex-col gap-2">
                {poll.options.map((o) => {
                    const mine = poll.myVoteIds.includes(o.id);
                    const pct = voterPercent(o.voteCount, voters);
                    const pending = pendingOptionIds.has(o.id);
                    const winner = closed && leaderId === o.id;
                    return (
                        <div
                            key={o.id}
                            className={cn(
                                "relative flex items-stretch rounded-tile overflow-hidden border min-h-12",
                                mine ? "border-brand/50" : "border-surface-line",
                                winner && "border-gold",
                            )}
                        >
                            {/* 채움 막대 — 폭만 바뀌어 막대그래프처럼 읽힌다 */}
                            <span
                                aria-hidden="true"
                                className={cn("absolute inset-y-0 left-0 transition-[width] duration-500 ease-out", mine ? "bg-brand/25" : "bg-brand/15")}
                                style={{ width: `${pct}%` }}
                            />
                            <button
                                type="button"
                                role={poll.allowMultiple ? "checkbox" : "radio"}
                                aria-checked={mine}
                                disabled={!canVote || pending}
                                onClick={() => onVote(o)}
                                className="relative flex-1 min-w-0 flex items-center gap-3 pl-3.5 pr-2 py-2.5 text-left disabled:cursor-default active:opacity-70"
                            >
                                <span
                                    aria-hidden="true"
                                    className={cn(
                                        "w-5 h-5 shrink-0 border-2 flex items-center justify-center",
                                        poll.allowMultiple ? "rounded-[6px]" : "rounded-full",
                                        mine ? "border-brand bg-brand text-brand-fg" : "border-[var(--surface-line-strong)]",
                                        !canVote && !mine && "opacity-50",
                                    )}
                                >
                                    {pending
                                        ? <LucideLoader2 className="w-3 h-3 animate-spin" />
                                        : mine && <LucideCheck className="w-3 h-3" />}
                                </span>
                                <span className={cn("min-w-0 break-words text-[15px] leading-snug", mine ? "font-semibold text-ink-1" : "font-medium text-ink-1")}>
                                    {o.text}
                                </span>
                                {winner && (
                                    <span className="rk-chip shrink-0 text-[12px] bg-[var(--gold-soft)] text-gold">{t("crewPoll.first")}</span>
                                )}
                            </button>
                            {/* 표 수·비율 — 누르면 누가 골랐는지(익명이면 숫자만) */}
                            <button
                                type="button"
                                onClick={() => onOpenVoters(o)}
                                aria-label={t("crewPoll.votersOf").replace("{option}", o.text)}
                                className="relative shrink-0 min-w-[56px] px-3 flex flex-col items-end justify-center rk-num active:opacity-70"
                            >
                                <span className={cn("text-[15px] font-semibold", mine ? "text-brand" : "text-ink-1")}>{pct}%</span>
                                <span className="text-[12px] font-medium text-ink-3">{t("crewPoll.votesN").replace("{n}", String(o.voteCount))}</span>
                            </button>
                        </div>
                    );
                })}
            </div>

            {/* 내 투표 취소 — 같은 선택지를 다시 누르면 취소되는 규칙을 말로도 보여 준다 */}
            {canVote && iVoted && (
                <div className="flex items-center justify-between gap-2 -mt-1">
                    <p className={CREW_TEXT.caption}>
                        {poll.allowMultiple ? t("crewPoll.hintMulti") : t("crewPoll.hintSingle")}
                    </p>
                    {!poll.allowMultiple && (
                        <button type="button" onClick={onCancelMine} className="h-11 -mr-2 px-2 text-[13px] font-semibold text-ink-2 active:text-ink-1">
                            {t("crewPoll.cancelVote")}
                        </button>
                    )}
                </div>
            )}

            {/* 바닥: 만든 사람 · 만든 때 | 참여 인원 */}
            <div className="flex items-center justify-between gap-3 pt-3 border-t border-surface-line">
                <div className="flex items-center gap-2 min-w-0">
                    <CrewAvatar src={poll.author?.profileImageUrl} name={poll.author?.name} size={24} />
                    <span className="min-w-0 truncate text-[13px] font-medium text-ink-2">{poll.author?.name}</span>
                    <span className="shrink-0 text-[12px] font-medium text-ink-4 rk-num">{formatKst(poll.createdAt, locale)}</span>
                </div>
                <span className="shrink-0 inline-flex items-center gap-1 text-[13px] font-semibold text-ink-2 rk-num">
                    <LucideUsers className="w-3.5 h-3.5 text-ink-3" />
                    {t("crewPoll.votersN").replace("{n}", String(voters))}
                </span>
            </div>
        </article>
    );
}
