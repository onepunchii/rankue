/**
 * 어드민 · 공지사항(2026-09-26 정리).
 *  - 새로 쓰기와 **고치기**를 같은 시트에서(예전엔 고칠 방법이 없어 지우고 다시 썼다 — PATCH 가 hidden 만 받았다).
 *  - 거르기: 보이는 중 · 가림 · 전체 / 대상(전체 사용자·사장님 전용)
 *  - 가리기·삭제는 카드에서 바로. 삭제는 한 번 묻는다.
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { LucidePlus } from "@/lib/icons";
import { FilterChips, EmptyState, Panel, Pill, kstDateTime } from "./adminUtils";

type Notice = { id: string; title: string; content: string; target: "all" | "owners"; hidden: boolean; createdAt: string };
const NOTICES_KEY = ["/api/hiq/admin/notices"] as const;
type Draft = { id: string | null; title: string; content: string; target: "all" | "owners" };
const EMPTY_DRAFT: Draft = { id: null, title: "", content: "", target: "all" };

export default function NoticesView() {
    const { toast } = useToast();
    const qc = useQueryClient();
    const { data: notices = [], isLoading } = useQuery<Notice[]>({ queryKey: NOTICES_KEY });
    const [filter, setFilter] = useState<"visible" | "hidden" | "all">("visible");
    const [target, setTarget] = useState<"any" | "all" | "owners">("any");
    const [draft, setDraft] = useState<Draft | null>(null);

    const refresh = () => qc.invalidateQueries({ queryKey: NOTICES_KEY });
    const save = useMutation({
        mutationFn: async (d: Draft) => d.id
            ? apiRequest(`/api/hiq/admin/notices/${d.id}`, { method: "PATCH", body: { title: d.title, content: d.content, target: d.target } })
            : apiRequest("/api/hiq/admin/notices", { method: "POST", body: { title: d.title, content: d.content, target: d.target } }),
        onSuccess: (_r, d) => { toast({ title: d.id ? "공지를 고쳤습니다" : "공지를 올렸습니다" }); setDraft(null); refresh(); },
        onError: (e: any) => toast({ title: e?.message || "저장 실패", variant: "destructive" }),
    });
    const toggle = useMutation({
        mutationFn: async ({ id, hidden }: { id: string; hidden: boolean }) => apiRequest(`/api/hiq/admin/notices/${id}`, { method: "PATCH", body: { hidden } }),
        onSuccess: (_r, v) => { toast({ title: v.hidden ? "가렸습니다" : "다시 보이게 했습니다" }); refresh(); },
        onError: (e: any) => toast({ title: e?.message || "처리 실패", variant: "destructive" }),
    });
    const remove = useMutation({
        mutationFn: async (id: string) => apiRequest(`/api/hiq/admin/notices/${id}`, { method: "DELETE" }),
        onSuccess: () => { toast({ title: "삭제했습니다" }); refresh(); },
        onError: (e: any) => toast({ title: e?.message || "삭제 실패", variant: "destructive" }),
    });

    const visibleN = notices.filter((n) => !n.hidden).length;
    const rows = useMemo(() => notices
        .filter((n) => filter === "all" || (filter === "hidden" ? n.hidden : !n.hidden))
        .filter((n) => target === "any" || n.target === target), [notices, filter, target]);

    return (
        <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <FilterChips value={filter} onChange={setFilter} options={[
                    { id: "visible", label: "보이는 중", count: visibleN },
                    { id: "hidden", label: "가림", count: notices.length - visibleN },
                    { id: "all", label: "전체", count: notices.length },
                ]} />
                <FilterChips value={target} onChange={setTarget} options={[
                    { id: "any", label: "모든 대상" }, { id: "all", label: "전체 사용자" }, { id: "owners", label: "사장님 전용" },
                ]} />
                <Button onClick={() => setDraft(EMPTY_DRAFT)} className="sm:ml-auto h-10 bg-brand hover:bg-brand-strong text-white font-bold">
                    <LucidePlus className="w-4 h-4 mr-1" /> 새 공지
                </Button>
            </div>

            {isLoading ? <EmptyState>불러오는 중…</EmptyState> : rows.length === 0 ? <EmptyState>해당하는 공지가 없습니다.</EmptyState> : rows.map((n) => (
                <Panel key={n.id} className={`p-4 ${n.hidden ? "opacity-60" : ""}`}>
                    <div className="flex items-center gap-1.5 mb-1">
                        <Pill tone={n.target === "owners" ? "info" : "neutral"}>{n.target === "owners" ? "사장님 전용" : "전체 사용자"}</Pill>
                        {n.hidden && <Pill tone="warn">가림</Pill>}
                        <span className="ml-auto text-[12px] text-black/40 tabular-nums">{kstDateTime(n.createdAt)}</span>
                    </div>
                    <h3 className="font-bold text-[16px]">{n.title}</h3>
                    <p className="mt-1 text-black/65 text-[13.5px] whitespace-pre-wrap line-clamp-6">{n.content}</p>
                    <div className="mt-3 flex gap-1.5 justify-end">
                        <Button size="sm" variant="outline" className="h-8" onClick={() => setDraft({ id: n.id, title: n.title, content: n.content, target: n.target })}>고치기</Button>
                        <Button size="sm" variant="outline" className="h-8" disabled={toggle.isPending} onClick={() => toggle.mutate({ id: n.id, hidden: !n.hidden })}>
                            {n.hidden ? "보이기" : "가리기"}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 text-red-500" disabled={remove.isPending}
                            onClick={() => { if (window.confirm(`'${n.title}' 공지를 삭제할까요? 되돌릴 수 없습니다. 잠시 내리려면 '가리기'를 쓰세요.`)) remove.mutate(n.id); }}>
                            삭제
                        </Button>
                    </div>
                </Panel>
            ))}

            <Sheet open={!!draft} onOpenChange={(o) => { if (!o) setDraft(null); }}>
                <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col gap-0 p-0">
                    {draft && (
                        <>
                            <div className="px-5 pt-6 pb-3 border-b border-black/[0.06]">
                                <SheetTitle className="text-[18px] font-black">{draft.id ? "공지 고치기" : "새 공지"}</SheetTitle>
                                <SheetDescription className="text-[13px] text-black/50">앱 공지 목록에 바로 보입니다.</SheetDescription>
                            </div>
                            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                                <div>
                                    <p className="text-[12px] font-bold text-black/50 mb-1.5">대상</p>
                                    <div className="grid grid-cols-2 gap-1.5">
                                        {([["all", "전체 사용자"], ["owners", "사장님 전용"]] as const).map(([v, label]) => (
                                            <button key={v} onClick={() => setDraft({ ...draft, target: v })}
                                                className={`h-10 rounded-lg text-[13px] font-bold ${draft.target === v ? "bg-brand text-white" : "bg-black/[0.05] text-black/55"}`}>{label}</button>
                                        ))}
                                    </div>
                                </div>
                                <label className="block">
                                    <span className="text-[12px] font-bold text-black/50">제목</span>
                                    <Input value={draft.title} maxLength={100} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="mt-1 h-11" />
                                </label>
                                <label className="block">
                                    <span className="text-[12px] font-bold text-black/50">내용</span>
                                    <Textarea value={draft.content} maxLength={5000} onChange={(e) => setDraft({ ...draft, content: e.target.value })} className="mt-1 min-h-[260px] text-[14px] leading-relaxed" />
                                    <span className="block mt-1 text-right text-[11px] text-black/35 tabular-nums">{draft.content.length}/5000</span>
                                </label>
                            </div>
                            <div className="px-5 py-3 border-t border-black/[0.06] flex gap-2" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
                                <Button variant="ghost" className="flex-1 h-11" onClick={() => setDraft(null)}>취소</Button>
                                <Button className="flex-1 h-11 bg-brand hover:bg-brand-strong text-white font-bold"
                                    disabled={!draft.title.trim() || !draft.content.trim() || save.isPending} onClick={() => save.mutate(draft)}>
                                    {save.isPending ? "저장 중…" : draft.id ? "고친 내용 저장" : "올리기"}
                                </Button>
                            </div>
                        </>
                    )}
                </SheetContent>
            </Sheet>
        </div>
    );
}
