/**
 * 어드민 · 건의함(2026-09-26 정리).
 *  - 거르기: 안 읽음 · 답장 안 함 · 전체, 종류(버그·기능·제휴·기타), 검색
 *  - 카드: 보낸 사람(로그인 회원이면 이름) · 연락처 · 내용 · 보낸 답장 · 앱으로 답장
 *  - 답장하면 서버가 읽음으로 바꾼다. 모두 읽음은 안 읽은 게 있을 때만.
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { LucideCheckCircle, LucideMail } from "@/lib/icons";
import { FilterChips, SearchBox, EmptyState, Panel, Pill, kstDateTime, agoLabel } from "./adminUtils";

export type Suggestion = {
    id: string; type: string; content: string; contact: string | null; createdAt: string; isRead: boolean;
    submitterName?: string | null;
    /** 로그인 회원이 보낸 건의만 있다 — 없으면 앱 답장 불가(연락처로만) */
    userId?: string | null;
    /** 보낸 답장 — 오래된 것부터(서버 admin.repo getSuggestions) */
    replies: { id: string; message: string; createdAt: string }[];
};
export const SUGGESTIONS_KEY = ["/api/hiq/admin/suggestions"] as const;

const TYPE_LABEL: Record<string, { label: string; tone: "alert" | "brand" | "info" | "neutral" }> = {
    BUG: { label: "버그", tone: "alert" },
    FEATURE: { label: "기능 제안", tone: "info" },
    PARTNERSHIP: { label: "제휴", tone: "brand" },
    ETC: { label: "기타", tone: "neutral" },
};

export default function SuggestionsView() {
    const { toast } = useToast();
    const qc = useQueryClient();
    const { data: suggestions = [], isLoading } = useQuery<Suggestion[]>({ queryKey: SUGGESTIONS_KEY });
    const [filter, setFilter] = useState<"unread" | "unreplied" | "all">("unread");
    const [type, setType] = useState<string>("all");
    const [q, setQ] = useState("");
    const [replyingId, setReplyingId] = useState<string | null>(null);
    const [replyText, setReplyText] = useState("");

    const readAll = useMutation({
        mutationFn: async () => apiRequest("/api/hiq/admin/suggestions/read-all", { method: "PATCH" }),
        onSuccess: (r: any) => { qc.invalidateQueries({ queryKey: SUGGESTIONS_KEY }); toast({ title: `${r?.count ?? 0}건 읽음 처리` }); },
        onError: (e: any) => toast({ title: e?.message || "처리 실패", variant: "destructive" }),
    });
    const toggleRead = useMutation({
        mutationFn: async ({ id, isRead }: { id: string; isRead: boolean }) => apiRequest(`/api/hiq/admin/suggestions/${id}`, { method: "PATCH", body: { isRead } }),
        onMutate: async ({ id, isRead }) => {
            await qc.cancelQueries({ queryKey: SUGGESTIONS_KEY });
            const previous = qc.getQueryData<Suggestion[]>(SUGGESTIONS_KEY);
            qc.setQueryData<Suggestion[]>(SUGGESTIONS_KEY, (old) => (old ?? []).map((s) => (s.id === id ? { ...s, isRead } : s)));
            return { previous };
        },
        onError: (_e, _v, ctx) => {
            if (ctx?.previous) qc.setQueryData(SUGGESTIONS_KEY, ctx.previous);
            toast({ title: "처리에 실패했습니다", variant: "destructive" });
        },
        onSettled: () => qc.invalidateQueries({ queryKey: SUGGESTIONS_KEY }),
    });
    // 건의 답장 — 전화 말고 앱 알림으로 회신한다(오너 요청 2026-08-19).
    const reply = useMutation({
        mutationFn: async ({ id, message }: { id: string; message: string }) => apiRequest(`/api/hiq/admin/suggestions/${id}/reply`, { method: "POST", body: { message } }),
        onSuccess: (r: any) => {
            toast({
                title: `${r?.memberName ?? "회원"}님에게 답장을 보냈습니다`,
                // 답장은 갔는데 기록만 실패한 경우(서버 recorded:false) — 다시 보내면 회원이 두 번 받는다.
                description: r?.recorded === false ? "'보낸 답장' 기록에는 실패했습니다. 다시 보내지 마세요." : undefined,
            });
            setReplyingId(null);
            setReplyText("");
            qc.invalidateQueries({ queryKey: SUGGESTIONS_KEY });
        },
        onError: (e: any) => toast({ title: e?.message || "답장 전송 실패", variant: "destructive" }),
    });

    const unread = suggestions.filter((s) => !s.isRead).length;
    const unreplied = suggestions.filter((s) => !s.replies?.length).length;
    const types = useMemo(() => [...new Set(suggestions.map((s) => s.type))], [suggestions]);
    const rows = useMemo(() => {
        const s = q.trim();
        return suggestions
            .filter((x) => filter === "all" || (filter === "unread" ? !x.isRead : !x.replies?.length))
            .filter((x) => type === "all" || x.type === type)
            .filter((x) => !s || [x.content, x.contact, x.submitterName].some((v) => v?.includes(s)));
    }, [suggestions, filter, type, q]);

    return (
        <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <FilterChips value={filter} onChange={setFilter} options={[
                    { id: "unread", label: "안 읽음", count: unread, alert: true },
                    { id: "unreplied", label: "답장 안 함", count: unreplied },
                    { id: "all", label: "전체", count: suggestions.length },
                ]} />
                <div className="flex gap-2 sm:ml-auto">
                    <select value={type} onChange={(e) => setType(e.target.value)} aria-label="종류"
                        className="h-10 px-2 rounded-xl bg-white border border-black/10 text-[13px] font-bold text-black/65 outline-none">
                        <option value="all">모든 종류</option>
                        {types.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]?.label ?? t}</option>)}
                    </select>
                    <SearchBox value={q} onChange={setQ} placeholder="내용·보낸 사람·연락처" className="flex-1 sm:w-56" />
                </div>
            </div>
            {unread > 0 && (
                <div className="flex items-center justify-between bg-white px-4 py-2.5 rounded-2xl border border-black/[0.07]">
                    <span className="text-[13px] text-black/60">안 읽은 건의 <b className="text-[rgba(0,0,0,0.87)] tabular-nums">{unread}</b>건</span>
                    <Button size="sm" variant="outline" className="h-8 text-xs" disabled={readAll.isPending} onClick={() => readAll.mutate()}>
                        <LucideCheckCircle className="w-3 h-3 mr-1" /> 모두 읽음
                    </Button>
                </div>
            )}

            {isLoading ? <EmptyState>불러오는 중…</EmptyState> : rows.length === 0 ? (
                <EmptyState>{filter === "unread" ? "안 읽은 건의가 없습니다. 👍" : "해당하는 건의가 없습니다."}</EmptyState>
            ) : rows.map((s) => {
                const t = TYPE_LABEL[s.type] ?? { label: s.type, tone: "neutral" as const };
                return (
                    <Panel key={s.id} className={`p-4 space-y-2.5 ${!s.isRead ? "border-l-4 border-l-red-400" : ""}`}>
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <Pill tone={t.tone}>{t.label}</Pill>
                            {s.replies?.length > 0 && <Pill tone="brand">답장 {s.replies.length}</Pill>}
                            {s.isRead && !s.replies?.length && <Pill>읽음</Pill>}
                            <span className="text-[12.5px] font-bold text-black/65">{s.submitterName || "비회원"}</span>
                            <span className="ml-auto text-[12px] text-black/40 tabular-nums" title={kstDateTime(s.createdAt)}>{agoLabel(s.createdAt)}</span>
                        </div>
                        <p className={`text-[14px] text-black/80 whitespace-pre-wrap leading-relaxed ${s.isRead ? "opacity-70" : ""}`}>{s.content}</p>
                        {s.contact && <p className="text-[12.5px] text-black/50">연락처: <span className="tabular-nums">{s.contact}</span></p>}

                        {/* 보낸 답장 — 무엇을 답했는지 다시 보려고(오너 요청 2026-09-11). 오래된 것부터. */}
                        {s.replies?.length > 0 && (
                            <div className="space-y-1.5">
                                {s.replies.map((r) => (
                                    <div key={r.id} className="rounded-xl bg-brand/5 px-3 py-2">
                                        <p className="text-[13px] text-black/70 whitespace-pre-wrap">↳ {r.message}</p>
                                        <p className="mt-0.5 text-[11.5px] text-black/45 tabular-nums">{kstDateTime(r.createdAt)}</p>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="flex gap-1.5 flex-wrap">
                            {s.contact && (
                                <a href={s.contact.includes("@") ? `mailto:${s.contact}` : `tel:${s.contact}`}
                                    className="h-8 px-3 rounded-lg border border-black/10 inline-flex items-center text-[12.5px] font-bold text-black/60">
                                    {s.contact.includes("@") ? "메일" : "전화"}
                                </a>
                            )}
                            <Button size="sm" variant="ghost" className="h-8 text-xs text-black/55" disabled={toggleRead.isPending}
                                onClick={() => toggleRead.mutate({ id: s.id, isRead: !s.isRead })}>
                                {s.isRead ? "안 읽음으로" : "읽음 처리"}
                            </Button>
                            {s.userId ? (
                                <Button size="sm" variant="outline" className="h-8 text-xs ml-auto"
                                    onClick={() => { setReplyingId(replyingId === s.id ? null : s.id); setReplyText(""); }}>
                                    <LucideMail className="w-3 h-3 mr-1" /> 앱으로 답장
                                </Button>
                            ) : (
                                <span className="ml-auto self-center text-[11.5px] text-black/40">비회원 건의 — 연락처로 답해 주세요</span>
                            )}
                        </div>

                        {replyingId === s.id && (
                            <div className="rounded-xl bg-black/[0.03] p-3 space-y-2">
                                <p className="text-[12px] text-black/50">건의한 회원의 알림함으로 전송됩니다. 푸시 토큰이 있으면 기기 알림도 함께 갑니다.</p>
                                <Textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} maxLength={500} placeholder="답장 내용 (500자 이내)" className="bg-white h-24 text-sm" />
                                <div className="flex justify-end gap-2">
                                    <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setReplyingId(null)}>취소</Button>
                                    <Button size="sm" className="h-8 text-xs bg-brand hover:bg-brand-strong text-white" disabled={!replyText.trim() || reply.isPending}
                                        onClick={() => reply.mutate({ id: s.id, message: replyText.trim() })}>
                                        {reply.isPending ? "보내는 중..." : "답장 보내기"}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </Panel>
                );
            })}
        </div>
    );
}
