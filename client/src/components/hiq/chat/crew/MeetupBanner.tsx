/**
 * 크루 방 윗줄 정모 띠(2026-09-26 크루 채팅 1단계, 오너 승인 시안).
 * 예전엔 "크루 대화방 · n명 / 크루 홈" 한 줄이었다 — 다가오는 정모가 있으면 그 자리에 D-day·제목·시각·참석 수와 [참석]을 둔다.
 * 띠를 누르면 크루 홈(정모 목록). 다가오는 정모가 없으면 fallback(예전 한 줄)을 그린다.
 * 정모 목록 쿼리는 크루 홈·정모 카드와 같은 키라 참석하면 셋이 같이 바뀐다.
 */
import type { ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { LucideCheck, LucideChevronRight, LucideLoader2 } from "@/lib/icons";
import { meetupDday, meetupRsvp, nextMeetup } from "@shared/crewChat";
import { INTL_TAG } from "../ChatRoom";
import { crewActivitiesKey, useCrewActivities } from "./CrewChatCards";

export function MeetupBanner({ crewId, meId, onOpen, fallback }: { crewId: string; meId?: string; onOpen: () => void; fallback: ReactNode }) {
    const { t, locale } = useT();
    const { toast } = useToast();
    const qc = useQueryClient();
    const list = useCrewActivities(crewId);
    const a = nextMeetup(list.data);
    const join = useMutation({
        mutationFn: (id: string) => apiRequest(`${crewActivitiesKey(crewId)}/${id}/join`, { method: "POST" }),
        onSuccess: () => { void qc.invalidateQueries({ queryKey: [crewActivitiesKey(crewId)] }); toast({ title: t("chat.card.meetupJoinedToast") }); },
        onError: (e: any) => toast({ title: e?.message || t("chat.actionFailed"), variant: "destructive" }),
    });
    if (!a) return <>{fallback}</>;

    const r = meetupRsvp(a, meId);
    const dd = meetupDday(a.activityDate);
    const today = dd?.kind === "today";
    const when = new Intl.DateTimeFormat(INTL_TAG[locale], { month: "numeric", day: "numeric", weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Seoul" }).format(new Date(a.activityDate));
    const count = r.cap ? `${r.count}/${r.cap}` : String(r.count);

    return (
        <div className="shrink-0 border-b border-surface-line bg-surface-1 flex items-center min-h-14">
            <button type="button" onClick={onOpen} className="flex-1 min-w-0 flex items-center gap-2.5 pl-4 pr-2 py-2 text-left active:bg-surface-2">
                <span className={cn("shrink-0 h-6 px-2 rounded-full rk-num text-[12px] font-bold inline-flex items-center", today ? "bg-brand text-brand-fg" : "bg-brand/10 text-brand")}>
                    {today ? t("chat.meetup.today") : dd ? fill(t("chat.meetup.dday"), { n: dd.n }) : ""}
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-semibold text-ink-1 truncate">{t("chat.meetup.next")} · {a.title}</span>
                    <span className="block text-[11.5px] font-medium text-ink-3 truncate rk-num">{when} · {fill(t("chat.meetup.count"), { n: count })}</span>
                </span>
            </button>
            {r.joined ? (
                <span className="shrink-0 h-8 px-2.5 rounded-full bg-brand/10 text-brand text-[12.5px] font-semibold inline-flex items-center gap-1">
                    <LucideCheck className="w-3.5 h-3.5" />{t("chat.meetup.joined")}
                </span>
            ) : !r.full && (
                <button
                    type="button" disabled={join.isPending} onClick={() => join.mutate(a.id)}
                    className="shrink-0 h-8 px-3.5 rounded-full bg-brand text-brand-fg text-[12.5px] font-semibold inline-flex items-center gap-1 disabled:opacity-50"
                >
                    {join.isPending && <LucideLoader2 className="w-3.5 h-3.5 animate-spin" />}{t("chat.meetup.join")}
                </button>
            )}
            <button type="button" onClick={onOpen} aria-label={t("chat.goCrewHome")} className="shrink-0 w-10 h-11 flex items-center justify-center text-ink-4">
                <LucideChevronRight className="w-4 h-4" />
            </button>
        </div>
    );
}

const fill = (s: string, p: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k) => (p[k] !== undefined ? String(p[k]) : m));
