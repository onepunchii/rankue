import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { CHAT_END_CODES } from "@shared/sim/chat";
import { matchApi, type ChatLine } from "../matchApi";

/**
 * 끝난 대전 화면에 붙는 "상대가 누구였나" 묶음(2026-09-15 오너: "라포를 느낄 방안").
 *
 * 왜 여기가 구멍이었나: 멀티방에서 만난 사람은 대전이 끝나면 그냥 사라졌다. 결과 화면에 상대를 다시 만날 길이
 * 하나도 없었고(친구 추가 동선 없음), 이미 있는 상대전적·라이벌 기능은 실전 경기에만 붙어 있었다.
 * 당구장에서 관계는 "한 판 더"에서 시작한다 — 같은 사람과 세 판 치면 이름을 기억하게 된다.
 *
 * 화면이 하는 일 셋:
 *   1) 상대전적 한 줄 — "3승 2패 · 6번째 대결". 상대가 기록이 있는 사람이 된다.
 *   2) 한 판 더 — 양쪽이 누르면 서버가 자리를 바꿔 같은 설정으로 새 방을 연다.
 *   3) 라이벌 등록 — 실전과 같은 관계(친구)를 쓴다. 등록해 두면 그 사람이 방을 열 때 알림을 받는다.
 *
 * 폴링을 왜 여기서 따로 하나: 대전 컨트롤러는 status 가 playing 이 아니면 폴링을 멈춘다(끝난 판을 계속 두드릴 이유가 없다).
 * 재경기는 상대가 누르는 걸 봐야 해서, 이 화면이 열려 있는 동안만 가볍게(3초) 본다. 새 방이 생기면 바로 멈춘다.
 */
const REMATCH_POLL_MS = 3000;

interface RapportInfo {
    opponentId: string | null;
    opponentName: string | null;
    headToHead: { wins: number; losses: number; total: number } | null;
    isRival: boolean;
}
interface RematchState {
    rematch: { mine: boolean; theirs: boolean; matchId: string | null } | null;
}

export function MatchEndRapport({ matchId, myIndex, onRematch }: { matchId: string; myIndex: number; onRematch: (newMatchId: string) => void }) {
    const { t } = useT();
    const { toast } = useToast();
    const [added, setAdded] = useState(false);

    // 마무리 인사(2026-09-18 오너: "끝나면 바로 결과 창이 나와서 인사할 시간이 없네"). 서버는 끝난 뒤 30분까지 받는다.
    // 대전 컨트롤러는 끝나면 폴링을 멈추므로 재경기처럼 여기서 가볍게 본다. 새 방이 정해지면 같이 멈춘다.
    const { data: chat, refetch: refetchChat } = useQuery<readonly ChatLine[]>({
        queryKey: [`/api/hiq/sim/matches/${matchId}/chats`, "end"],
        queryFn: async () => (await matchApi.getChats?.(matchId, 0)) ?? [],
        refetchInterval: REMATCH_POLL_MS,
    });
    const greet = useMutation({
        mutationFn: async (code: string) => matchApi.sendChat?.(matchId, { code, clientKey: `end-${code}-${Date.now()}` }),
        onSuccess: () => { void refetchChat(); },
        onError: () => toast({ title: t("sim.emoji.limit") }),
    });
    const recent = (chat ?? []).slice(-3);

    const { data: info } = useQuery<RapportInfo>({
        queryKey: [`/api/hiq/sim/matches/${matchId}/rapport`],
        queryFn: async () => apiRequest(`/api/hiq/sim/matches/${matchId}/rapport`),
        staleTime: 60_000,
    });

    // 재경기 상태만 가볍게 본다. 새 방이 정해지면(matchId) 폴링을 멈춘다.
    const { data: live } = useQuery<RematchState>({
        queryKey: [`/api/hiq/sim/matches/${matchId}`, "rematch"],
        queryFn: async () => apiRequest(`/api/hiq/sim/matches/${matchId}`),
        refetchInterval: (q) => (q.state.data?.rematch?.matchId ? false : REMATCH_POLL_MS),
    });

    const rematch = live?.rematch ?? null;

    // 양쪽이 눌러 새 방이 생겼다 — 이 화면을 연 사람도 그리로 옮겨 간다.
    useEffect(() => {
        if (rematch?.matchId) onRematch(rematch.matchId);
    }, [rematch?.matchId, onRematch]);

    const ask = useMutation({
        mutationFn: async () => apiRequest(`/api/hiq/sim/matches/${matchId}/rematch`, { method: "POST" }) as Promise<{ matchId: string | null; waiting: boolean }>,
        onSuccess: (r) => {
            if (r.matchId) onRematch(r.matchId);
            else toast({ title: t("sim.rematch.asked"), description: t("sim.rematch.askedDesc") });
        },
        onError: () => toast({ title: t("sim.rematch.failed"), variant: "destructive" }),
    });

    const addRival = useMutation({
        mutationFn: async (id: string) => apiRequest("/api/hiq/friends", { method: "POST", body: { receiverId: id, sport: "BILLIARDS" } }),
        onSuccess: () => { setAdded(true); toast({ title: t("friends.rivalAdded"), description: t("friends.rivalAddedDesc") }); },
        onError: () => toast({ title: t("sim.rematch.rivalFailed"), variant: "destructive" }),
    });

    const h = info?.headToHead ?? null;
    const name = info?.opponentName ?? t("sim.watch.guest");
    const isRival = info?.isRival === true || added;
    // 상대가 먼저 눌렀으면 버튼 문구가 바뀐다 — 내가 누르면 바로 시작한다는 뜻이라 망설임이 줄어든다.
    const theirsFirst = rematch?.theirs === true && rematch?.mine !== true;
    const waiting = rematch?.mine === true && rematch?.theirs !== true;

    if (!info?.opponentId) return null;

    return (
        <div className="rounded-tile border border-surface-line px-4 py-3">
            <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-semibold text-ink-1 truncate">{name}</span>
                {h && h.total > 0 && (
                    <span className="rk-num text-[12px] font-medium text-ink-3 shrink-0">
                        {t("sim.rematch.record").replace("{w}", String(h.wins)).replace("{l}", String(h.losses))}
                        {" · "}
                        {t("sim.rematch.nth").replace("{n}", String(h.total))}
                    </span>
                )}
            </div>
            {theirsFirst && <p className="mt-1.5 text-[12px] font-semibold text-brand">{t("sim.rematch.theyWant")}</p>}
            <div className="mt-2.5 flex gap-2">
                <button
                    type="button" disabled={ask.isPending || waiting}
                    onClick={() => ask.mutate()}
                    className={cn(
                        "flex-1 h-10 rounded-pill text-[13px] font-bold transition-colors disabled:opacity-60",
                        theirsFirst ? "bg-brand text-brand-fg" : "bg-black/[0.05] text-ink-1 hover:bg-black/[0.08]",
                    )}
                >
                    {waiting ? t("sim.rematch.waiting") : theirsFirst ? t("sim.rematch.accept") : t("sim.rematch.ask")}
                </button>
                <button
                    type="button" disabled={isRival || addRival.isPending}
                    onClick={() => addRival.mutate(info.opponentId!)}
                    className="h-10 px-3.5 rounded-pill bg-black/[0.05] text-ink-1 text-[13px] font-bold hover:bg-black/[0.08] transition-colors disabled:opacity-60"
                >
                    {isRival ? t("sim.rematch.rivalAlready") : t("sim.rematch.addRival")}
                </button>
            </div>
            {recent.length > 0 && (
                <ul className="mt-2.5 space-y-1">
                    {recent.map((l) => (
                        <li key={l.id} className={cn("flex", l.from === myIndex ? "justify-end" : "justify-start")}>
                            <span className={cn(
                                "max-w-[85%] truncate rounded-pill px-2.5 py-1 text-[12px] font-semibold",
                                l.from === myIndex ? "bg-brand/15 text-ink-1" : "bg-black/[0.05] text-ink-1",
                            )}>
                                {l.from !== myIndex && <span className="text-ink-3">{name} · </span>}
                                {l.kind === "code" ? t(`sim.emoji.${l.text}`) : l.text}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
            <div className="mt-2 flex gap-1.5">
                {CHAT_END_CODES.map((code) => (
                    <button
                        key={code} type="button" disabled={greet.isPending}
                        onClick={() => greet.mutate(code)}
                        className="flex-1 min-w-0 h-9 px-2 rounded-pill border border-surface-line text-[12px] font-semibold text-ink-2 truncate active:bg-surface-3 disabled:opacity-60"
                    >
                        {t(`sim.emoji.${code}`)}
                    </button>
                ))}
            </div>
        </div>
    );
}
