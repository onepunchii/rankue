/**
 * 손님 관리 도구(2026-11-06 — shared/storeNews).
 *  · MemberGames: 손님 카드 안 — 우리 매장에서 친 최근 경기 · 자주 오는 요일(90일)
 *  · StoreNewsCard: 매장 소식 보내기 — 우리 매장 회원 중 마케팅 수신 동의한 사람에게만 앱 알림(광고 표시 · 밤엔 알림함에만 · 7일에 한 번)
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { appConfirm } from "@/components/AppDialog";
import { STORE_NEWS_MAX, storeNewsNotice } from "@shared/storeNews";

const KST_MD = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" });

export function MemberGames({ memberId }: { memberId: string }) {
    const { data } = useQuery<{ recent: { id: string; gameType: string; mode: string; playedAt: string; score: number | null; opponent: string | null; table: number | null }[]; total90: number; topDays: string[] }>({
        queryKey: [`/api/hiq/partner/members/${memberId}/games`],
    });
    if (!data) return null;
    return (
        <div data-testid="partner-member-games">
            <p className="text-[12.5px] font-bold text-black/55 mb-1.5">우리 매장에서 친 경기 <span className="font-medium text-black/35">(90일 {data.total90}판{data.topDays.length ? ` · 자주 오는 요일 ${data.topDays.join(" · ")}` : ""})</span></p>
            {data.recent.length === 0 ? <p className="text-[13px] text-black/45">아직 우리 매장에서 친 경기가 없어요.</p> : (
                <ul className="divide-y divide-black/[0.06] rounded-xl border border-black/[0.06]">
                    {data.recent.map((g) => (
                        <li key={g.id} className="flex items-center justify-between px-3 py-2 text-[13px]">
                            <span className="font-semibold">{KST_MD.format(new Date(g.playedAt))} · {g.gameType === "3c" ? "3쿠션" : "4구"}{g.mode === "practice" ? " 연습" : ""}{g.table ? ` · ${g.table}번` : ""}</span>
                            <span className="text-black/50 tabular-nums">{g.opponent ? `vs ${g.opponent} · ` : ""}{g.score ?? "-"}점</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export function StoreNewsCard({ storeName, agreeAll, agreeDormant }: { storeName: string; agreeAll: number; agreeDormant: number }) {
    const qc = useQueryClient();
    const { toast } = useToast();
    const [text, setText] = useState("");
    const [target, setTarget] = useState<"all" | "dormant">("all");
    const { data: state } = useQuery<{ lastAt: string | null; nextAt: string | null }>({ queryKey: ["/api/hiq/partner/news"] });
    const send = useMutation({
        mutationFn: () => apiRequest("/api/hiq/partner/news", { method: "POST", body: { message: text, target } }) as Promise<{ recipients: number; pushed: number; inbox: number; night: boolean }>,
        onSuccess: (r) => {
            toast({ title: `${r.recipients}명에게 보냈어요`, description: r.night ? "밤이라 폰을 울리지 않고 알림함에 넣었어요." : `폰 알림 ${r.pushed}명 · 알림함에만 ${r.inbox}명` });
            setText("");
            void qc.invalidateQueries({ queryKey: ["/api/hiq/partner/news"] });
        },
        onError: (e: any) => toast({ title: e?.message || "보내지 못했어요", variant: "destructive" }),
    });
    const count = target === "all" ? agreeAll : agreeDormant;
    const next = state?.nextAt ? KST_MD.format(new Date(state.nextAt)) : null;
    const preview = storeNewsNotice(storeName, text.trim() || "예: 이번 주 토요일 3쿠션 매장 대회 접수 중!");
    return (
        <div className="rounded-2xl border border-black/[0.06] bg-white p-5" data-testid="partner-store-news">
            <h3 className="text-[16px] font-bold">매장 소식 보내기 <span className="text-[12px] font-semibold text-black/40">앱 알림</span></h3>
            <p className="mt-1 text-[12.5px] leading-relaxed text-black/55 break-keep">우리 매장 회원 중 <b>마케팅 수신에 동의한 손님에게만</b> 가요. 광고라 제목에 '(광고)'가 붙고, 밤(21시~8시)에는 폰을 울리지 않고 알림함에 넣어요. 7일에 한 번 보낼 수 있어요.</p>
            <div className="mt-3 flex gap-2">
                {([["all", `수신 동의 전체 ${agreeAll}명`], ["dormant", `30일+ 미접속 ${agreeDormant}명`]] as const).map(([k, label]) => (
                    <button key={k} type="button" onClick={() => setTarget(k)} className={`h-9 flex-1 rounded-lg text-[12.5px] font-bold ${target === k ? "bg-brand text-white" : "bg-black/[0.05] text-black/60"}`}>{label}</button>
                ))}
            </div>
            <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={STORE_NEWS_MAX} rows={3}
                placeholder="예: 이번 주 토요일 3쿠션 매장 대회 접수 중!" className="mt-3 w-full rounded-xl border border-black/10 bg-black/[0.03] px-3 py-2.5 text-[14px] outline-none focus:bg-white" />
            <div className="mt-2 rounded-xl bg-black/[0.035] px-3 py-2.5 text-[12.5px]">
                <p className="font-bold">{preview.title}</p>
                <p className="mt-0.5 whitespace-pre-line text-black/60">{preview.body}</p>
            </div>
            <button type="button" disabled={text.trim().length < 2 || count === 0 || !!next || send.isPending} data-testid="partner-store-news-send"
                onClick={async () => { if (await appConfirm({ title: `${count}명에게 보낼까요?`, message: "광고 알림이라 보내면 되돌릴 수 없어요. 7일 뒤에 다시 보낼 수 있어요.", confirmText: "보내기" })) send.mutate(); }}
                className="mt-3 h-12 w-full rounded-xl bg-brand text-[15px] font-bold text-white disabled:opacity-40">
                {next ? `${next}부터 다시 보낼 수 있어요` : count === 0 ? "받을 수 있는 손님이 아직 없어요" : `${count}명에게 보내기`}
            </button>
        </div>
    );
}
