/**
 * 크루 방 카드(2026-09-26 크루 채팅 1단계, 오너 승인 시안) — 정모·투표·공지.
 *
 * 카드 metadata 는 무엇을 가리키는지(정모·투표 id)와 옛 앱용 제목만 싣는다. 참석 수·표 수·내 참석 여부는
 * **크루 API 를 그대로 읽어** 살아 있게 그리고, [참석하기]·투표도 크루 라우트를 그대로 부른다 —
 * 크루 홈·투표 탭과 같은 쿼리 키라 한쪽에서 누르면 다른 쪽도 같이 바뀐다.
 * 방에 카드가 여럿이어도 쿼리는 크루당 하나(정모 목록·투표 목록)다.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useT, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { LucideCheck, LucideClock, LucideLoader2, LucideMapPin } from "@/lib/icons";
import { CrewAvatar } from "@/components/hiq/crew-ui";
import { meetupRsvp } from "@shared/crewChat";
import { isPollClosed, voterPercent } from "@shared/crewPoll";
import { INTL_TAG } from "../ChatRoom";

/** 채팅이 열려 있는 동안 크루 정모·투표를 다시 읽는 간격 — 채팅 폴링(2.5초)보다 훨씬 느리게. */
const REFRESH_MS = 20_000;

export const crewActivitiesKey = (crewId: string) => `/api/hiq/crews/${crewId}/activities`;
export const crewPollsKey = (crewId: string) => `/api/hiq/crews/${crewId}/polls`;

export function useCrewActivities(crewId: string | undefined) {
    return useQuery<any[]>({ queryKey: [crewActivitiesKey(crewId ?? "")], enabled: !!crewId, refetchInterval: REFRESH_MS, staleTime: 10_000 });
}
function useCrewPolls(crewId: string | undefined) {
    return useQuery<any[]>({ queryKey: [crewPollsKey(crewId ?? "")], enabled: !!crewId, refetchInterval: REFRESH_MS, staleTime: 10_000 });
}

const fill = (s: string, p: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k) => (p[k] !== undefined ? String(p[k]) : m));
const fmt = (iso: string | undefined | null, locale: Locale, o: Intl.DateTimeFormatOptions) => {
    if (!iso) return "";
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat(INTL_TAG[locale], { ...o, timeZone: "Asia/Seoul" }).format(d);
};
/** 버튼이 카드(눌러서 이동)와 겹치지 않게 — 안쪽 버튼은 이동을 막는다. */
const stop = (e: { stopPropagation: () => void; preventDefault: () => void }) => { e.stopPropagation(); e.preventDefault(); };

/** 왼쪽 날짜 칸(월·일·요일) — 크루 홈 정모 카드와 같은 모양을 작게. 오늘·진행 중이면 진하게. */
export function MeetupDateBlock({ iso, strong, locale }: { iso: string; strong: boolean; locale: Locale }) {
    return (
        <span className={cn("w-12 shrink-0 rounded-[10px] flex flex-col items-center justify-center py-1.5", strong ? "bg-brand text-brand-fg" : "bg-brand/10 text-brand")}>
            <span className="text-[10.5px] font-semibold leading-tight">{fmt(iso, locale, { month: "short" })}</span>
            <span className="rk-num text-[20px] font-bold leading-tight">{fmt(iso, locale, { day: "numeric" }).replace(/\D/g, "")}</span>
            <span className="text-[10.5px] font-semibold leading-tight">{fmt(iso, locale, { weekday: "short" })}</span>
        </span>
    );
}

/** 📅 정모 카드 본문 — [참석하기] / 참석 중 + [취소] / 정원 마감 / 지난·취소된 정모. */
export function CrewMeetupBody({ md, meId }: { md: any; meId?: string }) {
    const { t, locale } = useT();
    const { toast } = useToast();
    const qc = useQueryClient();
    const crewId = String(md.crewId ?? "");
    const list = useCrewActivities(crewId || undefined);
    const live = list.data?.find((a) => a.id === md.activityId);
    // 목록에 없으면 지났거나(진행 중 창도 지남) 지워진 정모 — 카드에 적힌 값으로만 그린다.
    const a = live ?? { id: md.activityId, title: md.title, activityDate: md.activityDate, locationName: md.locationName, maxParticipants: md.maxParticipants, participants: [] };
    const r = meetupRsvp(a, meId);
    const gone = !live && list.isSuccess;
    const ended = gone && r.phase === "past";

    const key = [crewActivitiesKey(crewId)];
    const join = useMutation({
        mutationFn: () => apiRequest(`${crewActivitiesKey(crewId)}/${md.activityId}/join`, { method: "POST" }),
        onSuccess: () => { void qc.invalidateQueries({ queryKey: key }); toast({ title: t("chat.card.meetupJoinedToast") }); },
        onError: (e: any) => toast({ title: e?.message || t("chat.actionFailed"), variant: "destructive" }),
    });
    const leave = useMutation({
        mutationFn: () => apiRequest(`${crewActivitiesKey(crewId)}/${md.activityId}/join`, { method: "DELETE" }),
        onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
        onError: (e: any) => toast({ title: e?.message || t("chat.actionFailed"), variant: "destructive" }),
    });
    const busy = join.isPending || leave.isPending;
    const people: any[] = (live?.participants ?? []).filter((p: any) => (p.status ?? "joined") === "joined");
    const pct = r.cap ? Math.min(100, Math.round((r.count / r.cap) * 100)) : 0;

    return (
        <>
            <span className="flex gap-2.5 items-stretch">
                <MeetupDateBlock iso={String(a.activityDate)} strong={!gone && r.phase !== "upcoming"} locale={locale} />
                <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-ink-1 leading-snug break-words">{a.title}</span>
                    <span className="flex items-center gap-1 mt-0.5 text-[12.5px] text-ink-3 rk-num">
                        <LucideClock className="w-3.5 h-3.5 shrink-0" />{fmt(String(a.activityDate), locale, { hour: "numeric", minute: "2-digit" })}
                        {!gone && r.phase === "ongoing" && <span className="ml-1 text-brand font-semibold">{t("chat.card.meetupOngoing")}</span>}
                    </span>
                    {a.locationName && (
                        <span className="flex items-center gap-1 text-[12.5px] text-ink-3 min-w-0">
                            <LucideMapPin className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{a.locationName}</span>
                        </span>
                    )}
                </span>
            </span>

            {gone ? (
                <span className="block mt-2 text-[12.5px] font-medium text-ink-4">{ended ? t("chat.card.meetupPast") : t("chat.card.meetupGone")}</span>
            ) : (
                <>
                    <span className="flex items-center gap-2 mt-2.5">
                        {people.length > 0 && (
                            <span className="flex -space-x-1.5 shrink-0">
                                {people.slice(0, 4).map((p: any) => <CrewAvatar key={p.memberId} src={p.member?.profileImageUrl} name={p.member?.name} size={22} className="ring-2 ring-surface-1" />)}
                            </span>
                        )}
                        {r.cap ? (
                            <span className="flex-1 h-1.5 rounded-full bg-surface-3 overflow-hidden"><span className="block h-full bg-brand rounded-full" style={{ width: `${pct}%` }} /></span>
                        ) : <span className="flex-1" />}
                        <span className="rk-num text-[12.5px] font-semibold text-ink-2 shrink-0">{r.cap ? `${r.count}/${r.cap}` : fill(t("chat.card.meetupCount"), { n: r.count })}</span>
                    </span>
                    {r.phase !== "past" && (
                        r.joined ? (
                            <span className="flex gap-1.5 mt-2.5">
                                <span className="flex-1 h-10 rounded-[10px] bg-brand/10 text-brand text-[13.5px] font-semibold inline-flex items-center justify-center gap-1">
                                    <LucideCheck className="w-4 h-4" />{t("chat.card.meetupJoined")}
                                </span>
                                <button
                                    type="button" disabled={busy}
                                    onClick={(e) => { stop(e); if (window.confirm(t("chat.card.meetupLeaveConfirm"))) leave.mutate(); }}
                                    className="h-10 px-3.5 rounded-[10px] border border-surface-line-strong text-[13px] font-semibold text-ink-2 disabled:opacity-50"
                                >
                                    {t("chat.card.meetupLeave")}
                                </button>
                            </span>
                        ) : r.full ? (
                            <span className="block mt-2.5 h-10 rounded-[10px] bg-surface-2 text-[13px] font-semibold text-ink-3 leading-10 text-center">{t("chat.card.meetupFull")}</span>
                        ) : (
                            <button
                                type="button" disabled={busy || !live}
                                onClick={(e) => { stop(e); join.mutate(); }}
                                className="mt-2.5 w-full h-10 rounded-[10px] bg-brand text-brand-fg text-[13.5px] font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                            >
                                {join.isPending && <LucideLoader2 className="w-4 h-4 animate-spin" />}
                                {t("chat.card.meetupJoin")}
                            </button>
                        )
                    )}
                </>
            )}
        </>
    );
}

/** 🗳 투표 카드 본문 — 선택지를 누르면 바로 투표(다시 누르면 취소), 막대는 투표한 사람 수 기준. */
export function CrewPollBody({ md }: { md: any }) {
    const { t, locale } = useT();
    const { toast } = useToast();
    const qc = useQueryClient();
    const crewId = String(md.crewId ?? "");
    const list = useCrewPolls(crewId || undefined);
    const live = list.data?.find((p) => p.id === md.pollId);
    const gone = !live && list.isSuccess;
    const closed = live ? isPollClosed({ status: live.isClosed ? "closed" : live.status, endTime: live.endTime }) : true;
    const options: { id: string; text: string; voteCount?: number }[] = live?.options ?? (Array.isArray(md.options) ? md.options : []);
    const mine = new Set<string>(live?.myVoteIds ?? []);
    const voters: number = live?.voterCount ?? 0;
    const top = Math.max(0, ...options.map((o) => o.voteCount ?? 0));

    const vote = useMutation({
        mutationFn: (optionId: string) => apiRequest(`${crewPollsKey(crewId)}/${md.pollId}/vote`, { method: "POST", body: { optionId } }),
        onSuccess: () => void qc.invalidateQueries({ queryKey: [crewPollsKey(crewId)] }),
        onError: (e: any) => toast({ title: e?.message || t("chat.actionFailed"), variant: "destructive" }),
    });
    const canVote = !!live && !closed && !vote.isPending;
    const endTime = live?.endTime ?? md.endTime;

    return (
        <>
            <span className="block text-[15px] font-semibold text-ink-1 leading-snug break-words">{live?.title ?? md.title}</span>
            <span className="block text-[12px] text-ink-3 mt-0.5 rk-num">
                {[
                    (live?.allowMultiple ?? md.allowMultiple) ? t("chat.card.pollMulti") : null,
                    (live?.isAnonymous ?? md.isAnonymous) ? t("chat.card.pollAnon") : null,
                    live ? fill(t("chat.card.pollVoters"), { n: voters }) : null,
                    gone ? null : closed ? t("chat.card.pollClosed") : endTime ? fill(t("chat.card.pollEnds"), { when: fmt(endTime, locale, { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }) }) : null,
                ].filter(Boolean).join(" · ")}
            </span>
            {gone ? (
                <span className="block mt-2 text-[12.5px] font-medium text-ink-4">{t("chat.card.pollGone")}</span>
            ) : (
                <span className="block mt-1">
                    {options.map((o) => {
                        const n = o.voteCount ?? 0;
                        const on = mine.has(o.id);
                        const lead = !!live && n > 0 && n === top;
                        return (
                            <button
                                key={o.id} type="button" disabled={!canVote} aria-pressed={on}
                                onClick={(e) => { stop(e); if (canVote) vote.mutate(o.id); }}
                                className={cn(
                                    "relative mt-1.5 w-full min-h-10 rounded-[10px] border overflow-hidden text-left disabled:cursor-default",
                                    on ? "border-brand" : "border-surface-line-strong",
                                )}
                            >
                                {live && <span className={cn("absolute inset-y-0 left-0", lead ? "bg-brand/20" : "bg-brand/10")} style={{ width: `${voterPercent(n, voters)}%` }} />}
                                <span className="relative flex items-center gap-2 px-2.5 py-2">
                                    <span className={cn("w-[18px] h-[18px] shrink-0 inline-flex items-center justify-center", live?.allowMultiple ? "rounded-[5px]" : "rounded-full", on ? "bg-brand text-brand-fg" : "border-[1.5px] border-surface-line-strong")}>
                                        {on && <LucideCheck className="w-3 h-3" />}
                                    </span>
                                    <span className={cn("flex-1 min-w-0 text-[13.5px] break-words", lead ? "font-semibold text-ink-1" : "font-medium text-ink-1")}>{o.text}</span>
                                    {live && <span className={cn("rk-num text-[13px] font-semibold shrink-0", lead ? "text-brand" : "text-ink-3")}>{n}</span>}
                                </span>
                            </button>
                        );
                    })}
                </span>
            )}
            {canVote && <span className="block text-[11.5px] text-ink-4 mt-2 text-center">{t("chat.card.pollHint")}</span>}
        </>
    );
}

/** 📢 공지 카드 본문 — 제목과 두 줄 미리보기. 누르면 게시판(공지는 맨 위 고정). */
export function CrewNoticeBody({ md }: { md: any }) {
    return (
        <>
            <span className="block text-[15px] font-semibold text-ink-1 leading-snug break-words">{md.title}</span>
            {md.preview && <span className="block text-[13px] text-ink-2 mt-0.5 line-clamp-2 break-words">{md.preview}</span>}
        </>
    );
}
